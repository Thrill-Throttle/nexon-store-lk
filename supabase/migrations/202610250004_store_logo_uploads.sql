alter table public.store_settings
  add column if not exists logo_path text,
  add column if not exists logo_updated_at timestamptz;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'nexon-store-branding',
  'nexon-store-branding',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read the store logo" on storage.objects;
create policy "Public can read the store logo"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'nexon-store-branding' and name like 'store-logo/%');

drop policy if exists "Only the store admin can upload the store logo" on storage.objects;
create policy "Only the store admin can upload the store logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'nexon-store-branding'
    and name like 'store-logo/%'
    and (select private.is_store_admin())
  );

drop policy if exists "Only the store admin can replace the store logo" on storage.objects;
create policy "Only the store admin can replace the store logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'nexon-store-branding'
    and name like 'store-logo/%'
    and (select private.is_store_admin())
  )
  with check (
    bucket_id = 'nexon-store-branding'
    and name like 'store-logo/%'
    and (select private.is_store_admin())
  );

create or replace function public.admin_update_store_logo(p_logo_path text)
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
  if p_logo_path is null or p_logo_path !~ '^store-logo/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Choose a valid store logo';
  end if;
  update public.store_settings
  set logo_path = p_logo_path,
      logo_updated_at = now(),
      updated_at = now()
  where id = true;
  if not found then
    raise exception 'Store settings are not configured';
  end if;
end;
$$;

revoke all on function public.admin_update_store_logo(text) from public, anon;
grant execute on function public.admin_update_store_logo(text) to authenticated;
