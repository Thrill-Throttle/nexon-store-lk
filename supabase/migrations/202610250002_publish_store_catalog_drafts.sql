create or replace function public.admin_publish_store_catalog(
  expected_categories jsonb,
  expected_products jsonb,
  target_categories jsonb,
  target_products jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actual_categories jsonb;
  actual_products jsonb;
  row_count bigint;
begin
  if not private.is_store_admin() then
    raise exception 'Administrator access is required';
  end if;
  if jsonb_typeof(expected_categories) is distinct from 'array'
     or jsonb_typeof(expected_products) is distinct from 'array'
     or jsonb_typeof(target_categories) is distinct from 'array'
     or jsonb_typeof(target_products) is distinct from 'array' then
    raise exception 'Catalog snapshots must be JSON arrays';
  end if;
  if jsonb_array_length(target_categories) = 0 then
    raise exception 'The store must keep at least one category';
  end if;
  if jsonb_array_length(target_categories) > 1000
     or jsonb_array_length(target_products) > 10000 then
    raise exception 'The catalog is larger than the supported publish limit';
  end if;

  lock table public.store_categories, public.store_products in exclusive mode;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id),
    '[]'::jsonb
  )
  into actual_categories
  from public.store_categories;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'category_id', category_id,
      'price_lkr', price_lkr,
      'stock_quantity', stock_quantity,
      'badge', badge,
      'featured', featured,
      'image_url', image_url,
      'description', description
    ) order by id),
    '[]'::jsonb
  )
  into actual_products
  from public.store_products;

  if actual_categories is distinct from expected_categories
     or actual_products is distinct from expected_products then
    raise exception 'The live catalog changed since this draft was started. Reload and review it before publishing.';
  end if;

  select count(*) into row_count
  from jsonb_to_recordset(target_categories) as category(id uuid, name text);
  if row_count <> jsonb_array_length(target_categories)
     or exists (
       select 1
       from jsonb_to_recordset(target_categories) as category(id uuid, name text)
       where category.id is null
          or category.name is null
          or category.name <> btrim(category.name)
          or char_length(category.name) not between 1 and 32
     )
     or exists (
       select lower(category.name)
       from jsonb_to_recordset(target_categories) as category(id uuid, name text)
       group by lower(category.name)
       having count(*) > 1
     )
     or exists (
       select category.id
       from jsonb_to_recordset(target_categories) as category(id uuid, name text)
       group by category.id
       having count(*) > 1
     ) then
    raise exception 'The draft contains invalid or duplicate categories';
  end if;

  select count(*) into row_count
  from jsonb_to_recordset(target_products) as product(
    id uuid,
    name text,
    category_id uuid,
    price_lkr bigint,
    stock_quantity integer,
    badge text,
    featured boolean,
    image_url text,
    description text
  );
  if row_count <> jsonb_array_length(target_products)
     or exists (
       select 1
       from jsonb_to_recordset(target_products) as product(
         id uuid,
         name text,
         category_id uuid,
         price_lkr bigint,
         stock_quantity integer,
         badge text,
         featured boolean,
         image_url text,
         description text
       )
       where product.id is null
          or product.name is null
          or product.name <> btrim(product.name)
          or char_length(product.name) not between 1 and 70
          or product.category_id is null
          or product.price_lkr is null
          or product.price_lkr <= 0
          or product.stock_quantity is null
          or product.stock_quantity < 0
          or product.badge is null
          or char_length(product.badge) > 24
          or product.featured is null
          or product.image_url is null
          or product.description is null
          or char_length(product.description) not between 1 and 240
          or not exists (
            select 1
            from jsonb_to_recordset(target_categories) as category(id uuid, name text)
            where category.id = product.category_id
          )
     )
     or exists (
       select product.id
       from jsonb_to_recordset(target_products) as product(
         id uuid,
         name text,
         category_id uuid,
         price_lkr bigint,
         stock_quantity integer,
         badge text,
         featured boolean,
         image_url text,
         description text
       )
       group by product.id
       having count(*) > 1
     ) then
    raise exception 'The draft contains invalid or duplicate products';
  end if;

  delete from public.store_products;
  delete from public.store_categories;

  insert into public.store_categories (id, name)
  select category.id, category.name
  from jsonb_to_recordset(target_categories) as category(id uuid, name text);

  insert into public.store_products (
    id,
    name,
    category_id,
    price_lkr,
    stock_quantity,
    badge,
    featured,
    image_url,
    description
  )
  select
    product.id,
    product.name,
    product.category_id,
    product.price_lkr,
    product.stock_quantity,
    product.badge,
    product.featured,
    product.image_url,
    product.description
  from jsonb_to_recordset(target_products) as product(
    id uuid,
    name text,
    category_id uuid,
    price_lkr bigint,
    stock_quantity integer,
    badge text,
    featured boolean,
    image_url text,
    description text
  );
end;
$$;

revoke all on function public.admin_publish_store_catalog(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.admin_publish_store_catalog(jsonb, jsonb, jsonb, jsonb) to authenticated;
