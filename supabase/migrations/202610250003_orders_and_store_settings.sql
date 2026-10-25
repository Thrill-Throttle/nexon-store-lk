create sequence if not exists public.store_order_reference_seq;

create table if not exists public.store_settings (
  id boolean primary key default true check (id),
  delivery_fee_lkr bigint not null default 0 check (delivery_fee_lkr >= 0),
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id, delivery_fee_lkr)
values (true, 0)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;
revoke all on public.store_settings from public;
grant select on public.store_settings to anon, authenticated;

drop policy if exists "Public can read delivery settings" on public.store_settings;
create policy "Public can read delivery settings"
  on public.store_settings for select to anon, authenticated
  using (true);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references auth.users(id) on delete restrict,
  customer_name text not null check (char_length(customer_name) between 1 and 100),
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  customer_phone text not null check (char_length(customer_phone) between 5 and 32),
  delivery_address text not null check (char_length(delivery_address) between 1 and 300),
  delivery_city text not null check (char_length(delivery_city) between 1 and 100),
  delivery_district text not null check (char_length(delivery_district) between 1 and 100),
  delivery_instructions text not null default '' check (char_length(delivery_instructions) <= 500),
  subtotal_lkr bigint not null check (subtotal_lkr > 0),
  delivery_fee_lkr bigint not null check (delivery_fee_lkr >= 0),
  total_lkr bigint not null check (total_lkr = subtotal_lkr + delivery_fee_lkr),
  payment_status text not null default 'awaiting_payment'
    check (payment_status in ('awaiting_payment', 'awaiting_approval', 'approved', 'rejected')),
  delivery_status text
    check (delivery_status is null or delivery_status in (
      'product_packed',
      'waiting_for_shipment',
      'handed_to_delivery',
      'out_for_delivery',
      'delivered'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_orders_customer_created_idx
  on public.store_orders (customer_id, created_at desc);
create index if not exists store_orders_created_idx
  on public.store_orders (created_at desc);
create index if not exists store_orders_payment_status_idx
  on public.store_orders (payment_status, created_at desc);
create unique index if not exists store_orders_one_open_per_customer_idx
  on public.store_orders (customer_id)
  where payment_status in ('awaiting_payment', 'awaiting_approval');

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid references public.store_products(id) on delete set null,
  product_name text not null check (char_length(product_name) between 1 and 70),
  product_image text not null,
  quantity integer not null check (quantity > 0),
  unit_price_lkr bigint not null check (unit_price_lkr > 0),
  line_total_lkr bigint not null check (line_total_lkr = quantity * unit_price_lkr),
  created_at timestamptz not null default now()
);

create index if not exists store_order_items_order_id_idx
  on public.store_order_items (order_id);

alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
revoke all on public.store_orders, public.store_order_items from public, anon;
grant select on public.store_orders, public.store_order_items to authenticated;

drop policy if exists "Customers and admins can read store orders" on public.store_orders;
create policy "Customers and admins can read store orders"
  on public.store_orders for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_store_admin()));

drop policy if exists "Customers and admins can read store order items" on public.store_order_items;
create policy "Customers and admins can read store order items"
  on public.store_order_items for select to authenticated
  using (
    exists (
      select 1
      from public.store_orders as store_order
      where store_order.id = store_order_items.order_id
        and (
          store_order.customer_id = (select auth.uid())
          or (select private.is_store_admin())
        )
    )
  );

create or replace function public.create_store_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_city text,
  p_delivery_district text,
  p_delivery_instructions text,
  p_items jsonb
)
returns table (
  order_id uuid,
  order_reference text,
  subtotal_lkr bigint,
  delivery_fee_lkr bigint,
  total_lkr bigint
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_settings public.store_settings%rowtype;
  item jsonb;
  item_product_id uuid;
  item_quantity integer;
  item_product public.store_products%rowtype;
  subtotal numeric := 0;
  new_order_id uuid;
  new_reference text;
  item_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Sign in before placing an order';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if p_customer_name is null or char_length(btrim(p_customer_name)) not between 1 and 100
     or p_customer_phone is null or char_length(btrim(p_customer_phone)) not between 5 and 32
     or p_delivery_address is null or char_length(btrim(p_delivery_address)) not between 1 and 300
     or p_delivery_city is null or char_length(btrim(p_delivery_city)) not between 1 and 100
     or p_delivery_district is null or char_length(btrim(p_delivery_district)) not between 1 and 100
     or char_length(coalesce(p_delivery_instructions, '')) > 500 then
    raise exception 'Check the customer and delivery details';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Your cart is empty or too large';
  end if;

  select account.email into current_email
  from auth.users as account
  where account.id = current_user_id
    and account.email_confirmed_at is not null
    and (
      account.raw_app_meta_data ->> 'provider' = 'google'
      or coalesce(account.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
    );
  if current_email is null then
    raise exception 'A verified account email is required';
  end if;

  select * into current_settings from public.store_settings where id = true;
  if not found then
    raise exception 'Store delivery settings are not configured';
  end if;

  if exists (
    select 1
    from public.store_orders as existing_order
    where existing_order.customer_id = current_user_id
      and existing_order.payment_status in ('awaiting_payment', 'awaiting_approval')
  ) then
    raise exception 'An order is already awaiting payment. Check your profile before placing another';
  end if;
  if exists (
    select (value ->> 'product_id')::uuid
    from jsonb_array_elements(p_items)
    group by (value ->> 'product_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'Cart contains duplicate products';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_product_id := (item ->> 'product_id')::uuid;
    item_quantity := (item ->> 'quantity')::integer;
    if item_quantity is null or item_quantity not between 1 and 99 then
      raise exception 'Cart quantities must be between 1 and 99';
    end if;
    select * into item_product
    from public.store_products
    where id = item_product_id
    for update;
    if not found then
      raise exception 'A product in your cart is no longer available';
    end if;
    if item_quantity > item_product.stock_quantity then
      raise exception 'Not enough stock for %', item_product.name;
    end if;
    subtotal := subtotal + (item_product.price_lkr::numeric * item_quantity);
    item_count := item_count + 1;
  end loop;

  if item_count <> jsonb_array_length(p_items) then
    raise exception 'Cart contains invalid items';
  end if;
  if subtotal <= 0 or subtotal > 9000000000000000 then
    raise exception 'Order total is outside the supported range';
  end if;

  new_order_id := gen_random_uuid();
  new_reference := 'NX-' || to_char(now(), 'YYMMDD') || '-' ||
    lpad(nextval('public.store_order_reference_seq')::text, 6, '0');

  insert into public.store_orders (
    id, reference, customer_id, customer_name, customer_email, customer_phone,
    delivery_address, delivery_city, delivery_district, delivery_instructions,
    subtotal_lkr, delivery_fee_lkr, total_lkr
  ) values (
    new_order_id, new_reference, current_user_id, btrim(p_customer_name), current_email,
    btrim(p_customer_phone), btrim(p_delivery_address), btrim(p_delivery_city),
    btrim(p_delivery_district), coalesce(btrim(p_delivery_instructions), ''),
    subtotal::bigint, current_settings.delivery_fee_lkr,
    (subtotal + current_settings.delivery_fee_lkr)::bigint
  );

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_product_id := (item ->> 'product_id')::uuid;
    item_quantity := (item ->> 'quantity')::integer;
    select * into item_product from public.store_products where id = item_product_id;
    insert into public.store_order_items (
      order_id, product_id, product_name, product_image, quantity, unit_price_lkr, line_total_lkr
    ) values (
      new_order_id, item_product.id, item_product.name, item_product.image_url,
      item_quantity, item_product.price_lkr, item_product.price_lkr * item_quantity
    );
  end loop;

  return query select
    new_order_id, new_reference, subtotal::bigint, current_settings.delivery_fee_lkr,
    (subtotal + current_settings.delivery_fee_lkr)::bigint;
end;
$$;

create or replace function public.customer_mark_payment_sent(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  update public.store_orders
  set payment_status = 'awaiting_approval', updated_at = now()
  where id = p_order_id
    and customer_id = auth.uid()
    and payment_status in ('awaiting_payment', 'rejected');
  if not found then
    raise exception 'This order cannot be marked as paid';
  end if;
end;
$$;

create or replace function public.admin_review_store_payment(
  p_order_id uuid,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  item record;
begin
  if not private.is_store_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_approved is null then
    raise exception 'Choose whether to approve or reject the payment';
  end if;
  perform 1 from public.store_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order could not be found';
  end if;
  if p_approved then
    for item in
      select order_item.product_id, order_item.quantity, product.stock_quantity, order_item.product_name
      from public.store_order_items as order_item
      join public.store_products as product on product.id = order_item.product_id
      where order_item.order_id = p_order_id
      order by product.id
      for update of product
    loop
      if item.quantity > item.stock_quantity then
        raise exception 'Not enough remaining stock for %', item.product_name;
      end if;
      update public.store_products
      set stock_quantity = stock_quantity - item.quantity
      where id = item.product_id;
    end loop;
  end if;
  update public.store_orders
  set payment_status = case when p_approved then 'approved' else 'rejected' end,
      delivery_status = case when p_approved then 'product_packed' else null end,
      updated_at = now()
  where id = p_order_id
    and payment_status = 'awaiting_approval';
  if not found then
    raise exception 'This order is not waiting for payment approval';
  end if;
end;
$$;

create or replace function public.admin_update_store_delivery_status(
  p_order_id uuid,
  p_delivery_status text
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  item record;
  current_status text;
  allowed_next text;
begin
  if not private.is_store_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_delivery_status is null or p_delivery_status not in (
    'product_packed',
    'waiting_for_shipment',
    'handed_to_delivery',
    'out_for_delivery',
    'delivered'
  ) then
    raise exception 'Choose a valid delivery status';
  end if;
  select delivery_status into current_status
  from public.store_orders
  where id = p_order_id and payment_status = 'approved'
  for update;
  if not found then
    raise exception 'Approve payment before updating delivery';
  end if;
  allowed_next := case current_status
    when 'product_packed' then 'waiting_for_shipment'
    when 'waiting_for_shipment' then 'handed_to_delivery'
    when 'handed_to_delivery' then 'out_for_delivery'
    when 'out_for_delivery' then 'delivered'
    else null
  end;
  if p_delivery_status <> current_status and p_delivery_status is distinct from allowed_next then
    raise exception 'Delivery status must move one step at a time';
  end if;
  update public.store_orders
  set delivery_status = p_delivery_status, updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.admin_update_store_settings(p_delivery_fee_lkr bigint)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not private.is_store_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_delivery_fee_lkr is null or p_delivery_fee_lkr not between 0 and 1000000 then
    raise exception 'Delivery fee must be between LKR 0 and LKR 1,000,000';
  end if;
  insert into public.store_settings (id, delivery_fee_lkr, updated_at)
  values (true, p_delivery_fee_lkr, now())
  on conflict (id) do update
  set delivery_fee_lkr = excluded.delivery_fee_lkr, updated_at = now();
end;
$$;

revoke all on function public.create_store_order(text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_store_order(text, text, text, text, text, text, jsonb) to authenticated;
revoke all on function public.customer_mark_payment_sent(uuid) from public, anon;
grant execute on function public.customer_mark_payment_sent(uuid) to authenticated;
revoke all on function public.admin_review_store_payment(uuid, boolean) from public, anon;
grant execute on function public.admin_review_store_payment(uuid, boolean) to authenticated;
revoke all on function public.admin_update_store_delivery_status(uuid, text) from public, anon;
grant execute on function public.admin_update_store_delivery_status(uuid, text) to authenticated;
revoke all on function public.admin_update_store_settings(bigint) from public, anon;
grant execute on function public.admin_update_store_settings(bigint) to authenticated;
