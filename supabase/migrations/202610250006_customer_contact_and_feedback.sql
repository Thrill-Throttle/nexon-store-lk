create table if not exists public.store_customer_messages (
  id uuid primary key default gen_random_uuid(),
  message_type text not null check (message_type in ('contact', 'order_feedback')),
  customer_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.store_orders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  notes text not null check (char_length(notes) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (
    (message_type = 'contact' and order_id is null)
    or (message_type = 'order_feedback' and order_id is not null)
  )
);

create index if not exists store_customer_messages_created_idx
  on public.store_customer_messages (created_at desc);
create unique index if not exists store_customer_messages_order_feedback_idx
  on public.store_customer_messages (order_id)
  where message_type = 'order_feedback';

alter table public.store_customer_messages enable row level security;
revoke all on public.store_customer_messages from public, anon, authenticated;
grant select on public.store_customer_messages to authenticated;

drop policy if exists "Store admins can read all customer messages" on public.store_customer_messages;
create policy "Store admins can read all customer messages"
  on public.store_customer_messages for select to authenticated
  using ((select private.is_store_admin()));

drop policy if exists "Customers can read their own order feedback" on public.store_customer_messages;
create policy "Customers can read their own order feedback"
  on public.store_customer_messages for select to authenticated
  using (
    message_type = 'order_feedback'
    and customer_id = (select auth.uid())
  );

create or replace function public.submit_store_contact_message(
  p_name text,
  p_email text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  message_id uuid;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100
     or p_email is null or char_length(btrim(p_email)) not between 3 and 254
     or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_notes is null or char_length(btrim(p_notes)) not between 1 and 2000 then
    raise exception 'Enter a valid name, email address, and message';
  end if;

  insert into public.store_customer_messages (message_type, customer_id, name, email, notes)
  values (
    'contact',
    auth.uid(),
    btrim(p_name),
    lower(btrim(p_email)),
    btrim(p_notes)
  )
  returning id into message_id;

  return message_id;
end;
$$;

revoke all on function public.submit_store_contact_message(text, text, text) from public;
grant execute on function public.submit_store_contact_message(text, text, text) to anon, authenticated;

create or replace function public.submit_store_order_feedback(
  p_order_id uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  order_record public.store_orders%rowtype;
  message_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before sending order feedback';
  end if;
  if p_notes is null or char_length(btrim(p_notes)) not between 1 and 2000 then
    raise exception 'Enter feedback before submitting';
  end if;

  select * into order_record
  from public.store_orders
  where id = p_order_id
    and customer_id = current_user_id
    and delivery_status = 'delivered';
  if not found then
    raise exception 'Feedback is available only for your delivered orders';
  end if;

  insert into public.store_customer_messages (
    message_type, customer_id, order_id, name, email, notes
  )
  values (
    'order_feedback',
    current_user_id,
    order_record.id,
    order_record.customer_name,
    order_record.customer_email,
    btrim(p_notes)
  )
  on conflict (order_id) where message_type = 'order_feedback' do nothing
  returning id into message_id;

  if message_id is null then
    raise exception 'Feedback has already been sent for this order';
  end if;

  return message_id;
end;
$$;

revoke all on function public.submit_store_order_feedback(uuid, text) from public, anon;
grant execute on function public.submit_store_order_feedback(uuid, text) to authenticated;
