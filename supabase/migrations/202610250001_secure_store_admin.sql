create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists private.store_admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_name text not null check (role_name = 'admin'),
  created_at timestamptz not null default now()
);

alter table private.store_admin_roles enable row level security;
revoke all on private.store_admin_roles from public, anon, authenticated;

create or replace function private.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from private.store_admin_roles as admin_role
    join auth.users as account on account.id = admin_role.user_id
    where account.id = (select auth.uid())
      and lower(account.email) = 'akileshan2023@gmail.com'
      and account.email_confirmed_at is not null
      and (
        account.raw_app_meta_data ->> 'provider' = 'google'
        or coalesce(account.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
      )
      and admin_role.role_name = 'admin'
  );
$$;

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_store_admin();
$$;

revoke all on function public.is_store_admin() from public, anon;
grant execute on function public.is_store_admin() to authenticated;
revoke all on function private.is_store_admin() from public, anon;
grant execute on function private.is_store_admin() to authenticated;

create or replace function private.sync_configured_store_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if lower(coalesce(new.email, '')) = 'akileshan2023@gmail.com'
     and new.email_confirmed_at is not null
     and (
       new.raw_app_meta_data ->> 'provider' = 'google'
       or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
     ) then
    insert into private.store_admin_roles (user_id, role_name)
    values (new.id, 'admin')
    on conflict (user_id) do update set role_name = excluded.role_name;
  else
    delete from private.store_admin_roles
    where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_configured_store_admin() from public, anon, authenticated;

drop trigger if exists sync_configured_store_admin on auth.users;
create trigger sync_configured_store_admin
after insert or update of email, email_confirmed_at, raw_app_meta_data on auth.users
for each row execute function private.sync_configured_store_admin();

insert into private.store_admin_roles (user_id, role_name)
select id, 'admin'
from auth.users
where lower(email) = 'akileshan2023@gmail.com'
  and email_confirmed_at is not null
  and (
    raw_app_meta_data ->> 'provider' = 'google'
    or coalesce(raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
  )
on conflict (user_id) do update set role_name = excluded.role_name;

create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 32),
  created_at timestamptz not null default now()
);

create unique index if not exists store_categories_name_lower_uidx
  on public.store_categories (lower(name));

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 70),
  category_id uuid not null references public.store_categories(id) on delete restrict,
  price_lkr bigint not null check (price_lkr > 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  badge text not null default '' check (char_length(badge) <= 24),
  featured boolean not null default false,
  image_url text not null default 'assets/home-storage-basket.svg'
    check (image_url ~* '^(assets/[a-z0-9_.-]+\.svg|https://[^[:space:]"<>]+)$'),
  description text not null check (char_length(description) between 1 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_products_category_id_idx
  on public.store_products (category_id);
create index if not exists store_products_featured_idx
  on public.store_products (featured) where featured;

alter table public.store_categories enable row level security;
alter table public.store_products enable row level security;

revoke all on public.store_categories, public.store_products from public;
grant select on public.store_categories, public.store_products to anon, authenticated;
grant insert, update, delete on public.store_categories, public.store_products to authenticated;

drop policy if exists "Public can read store categories" on public.store_categories;
create policy "Public can read store categories"
  on public.store_categories for select to anon, authenticated
  using (true);

drop policy if exists "Only the store admin can insert categories" on public.store_categories;
create policy "Only the store admin can insert categories"
  on public.store_categories for insert to authenticated
  with check ((select private.is_store_admin()));

drop policy if exists "Only the store admin can rename categories" on public.store_categories;
create policy "Only the store admin can rename categories"
  on public.store_categories for update to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));

drop policy if exists "Only the store admin can remove unused categories" on public.store_categories;
create policy "Only the store admin can remove unused categories"
  on public.store_categories for delete to authenticated
  using (
    (select private.is_store_admin())
    and (select count(*) from public.store_categories) > 1
  );

drop policy if exists "Public can read store products" on public.store_products;
create policy "Public can read store products"
  on public.store_products for select to anon, authenticated
  using (true);

drop policy if exists "Only the store admin can add products" on public.store_products;
create policy "Only the store admin can add products"
  on public.store_products for insert to authenticated
  with check ((select private.is_store_admin()));

drop policy if exists "Only the store admin can edit products" on public.store_products;
create policy "Only the store admin can edit products"
  on public.store_products for update to authenticated
  using ((select private.is_store_admin()))
  with check ((select private.is_store_admin()));

drop policy if exists "Only the store admin can delete products" on public.store_products;
create policy "Only the store admin can delete products"
  on public.store_products for delete to authenticated
  using ((select private.is_store_admin()));

create or replace function private.set_store_product_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_store_product_updated_at() from public, anon, authenticated;

drop trigger if exists set_store_product_updated_at on public.store_products;
create trigger set_store_product_updated_at
before update on public.store_products
for each row execute function private.set_store_product_updated_at();

create or replace function public.admin_delete_store_category(
  target_category_id uuid,
  replacement_category_id uuid
)
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
  if target_category_id is null
     or replacement_category_id is null
     or target_category_id = replacement_category_id then
    raise exception 'Choose two different store categories';
  end if;
  if (select count(*) from public.store_categories) <= 1 then
    raise exception 'The store must keep at least one category';
  end if;
  if not exists (select 1 from public.store_categories where id = target_category_id)
     or not exists (select 1 from public.store_categories where id = replacement_category_id) then
    raise exception 'A store category could not be found';
  end if;

  update public.store_products
  set category_id = replacement_category_id
  where category_id = target_category_id;

  delete from public.store_categories
  where id = target_category_id;
end;
$$;

revoke all on function public.admin_delete_store_category(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_store_category(uuid, uuid) to authenticated;

insert into public.store_categories (id, name) values
  ('10000000-0000-4000-8000-000000000001', 'Electronics'),
  ('10000000-0000-4000-8000-000000000002', 'Home & Living'),
  ('10000000-0000-4000-8000-000000000003', 'Fashion'),
  ('10000000-0000-4000-8000-000000000004', 'Accessories'),
  ('10000000-0000-4000-8000-000000000005', 'Outdoor & Sports')
on conflict (id) do nothing;

insert into public.store_products
  (id, name, category_id, price_lkr, stock_quantity, badge, featured, image_url, description)
values
  ('20000000-0000-4000-8000-000000000001', '20W USB-C Fast Charger', '10000000-0000-4000-8000-000000000001', 7490, 18, 'EVERYDAY PICK', true, 'assets/fast-charger.svg', 'A compact fast charger for your everyday devices. Easy to pack and convenient at home or on the go.'),
  ('20000000-0000-4000-8000-000000000002', 'Home Desk Lamp', '10000000-0000-4000-8000-000000000002', 8990, 11, 'HOME FAVOURITE', true, 'assets/home-desk-lamp.svg', 'A clean, modern desk lamp to brighten your reading corner, workspace or bedside table.'),
  ('20000000-0000-4000-8000-000000000003', 'Everyday Canvas Tote', '10000000-0000-4000-8000-000000000003', 5490, 14, 'JUST IN', true, 'assets/everyday-tote.svg', 'A versatile canvas carryall for errands, books and everything else you bring along every day.'),
  ('20000000-0000-4000-8000-000000000004', 'Insulated Steel Water Bottle', '10000000-0000-4000-8000-000000000004', 6290, 20, 'CUSTOMER PICK', true, 'assets/steel-water-bottle.svg', 'A reusable stainless steel bottle for your desk, daily commute and weekend adventures.'),
  ('20000000-0000-4000-8000-000000000005', 'Woven Home Storage Basket', '10000000-0000-4000-8000-000000000002', 7890, 9, 'HOME FAVOURITE', false, 'assets/home-storage-basket.svg', 'Keep everyday essentials together with a simple storage basket for your living space.'),
  ('20000000-0000-4000-8000-000000000006', 'Everyday Canvas Tote', '10000000-0000-4000-8000-000000000005', 5490, 12, 'ON THE GO', false, 'assets/everyday-tote.svg', 'A handy everyday bag for day trips, markets and everything you like to bring along.'),
  ('20000000-0000-4000-8000-000000000007', 'Compact USB-C Wall Charger', '10000000-0000-4000-8000-000000000001', 5290, 16, 'COMPACT', false, 'assets/fast-charger.svg', 'A compact charging essential that fits easily into a work bag or travel pouch.'),
  ('20000000-0000-4000-8000-000000000008', 'Minimal Home Storage Basket', '10000000-0000-4000-8000-000000000004', 6990, 8, 'USEFUL FIND', false, 'assets/home-storage-basket.svg', 'A versatile little basket for keeping bathroom, bedroom or desk essentials in order.')
on conflict (id) do nothing;
