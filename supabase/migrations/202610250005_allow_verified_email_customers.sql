do $$
declare
  function_definition text;
  google_provider_check text := $check$
    and (
      account.raw_app_meta_data ->> 'provider' = 'google'
      or coalesce(account.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
    )
$check$;
begin
  function_definition := pg_get_functiondef(
    'public.create_store_order(text,text,text,text,text,text,jsonb)'::regprocedure
  );

  if strpos(function_definition, google_provider_check) > 0 then
    function_definition := replace(function_definition, google_provider_check, '');
    execute function_definition;
  elsif strpos(function_definition, 'account.email_confirmed_at is not null') = 0 then
    raise exception 'create_store_order does not enforce a verified customer email';
  end if;
end
$$;
