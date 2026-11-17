create or replace function public.record_popular_search_keyword(p_keyword text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.popular_search_keyword as popular (keyword, search_count, last_searched_at, updated_at)
  values (p_keyword, 1, now(), now())
  on conflict (keyword) do update
    set search_count = popular.search_count + 1,
        last_searched_at = now(),
        updated_at = now();
$$;
revoke all on function public.record_popular_search_keyword(text) from public, anon, authenticated;
grant execute on function public.record_popular_search_keyword(text) to service_role;
