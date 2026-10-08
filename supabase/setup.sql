-- Run once in your NEW project's SQL Editor. No existing project is required.
-- Only authenticated owners can read or save their own document.
begin;
create table if not exists public.daily_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint daily_plan_shape check (
    jsonb_typeof(document) = 'object'
    and document @> '{"version":1}'::jsonb
    and jsonb_typeof(document->'tasks') = 'array'
    and jsonb_typeof(document->'habits') = 'array'
    and jsonb_typeof(document->'completions') = 'object'
    and document ?& array['version','tasks','habits','completions']
    and octet_length(document::text) <= 8388608
  )
);
alter table public.daily_plans enable row level security;
revoke all on public.daily_plans from anon, authenticated;
grant select, insert, update on public.daily_plans to authenticated;
drop policy if exists daily_owner_read on public.daily_plans;
create policy daily_owner_read on public.daily_plans for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists daily_owner_insert on public.daily_plans;
create policy daily_owner_insert on public.daily_plans for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists daily_owner_update on public.daily_plans;
create policy daily_owner_update on public.daily_plans for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Zero rows means another device saved first. The app asks which copy to keep.
create or replace function public.save_daily_plan(
  p_user_id uuid, p_document jsonb, p_expected_revision bigint
) returns table(document jsonb, revision bigint, updated_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Account does not match signed-in user' using errcode = '42501';
  end if;
  if p_expected_revision = 0 then
    return query insert into public.daily_plans as plans(user_id,document)
      values(p_user_id,p_document) on conflict(user_id) do nothing
      returning plans.document, plans.revision, plans.updated_at;
  else
    return query update public.daily_plans as plans
      set document = p_document, revision = plans.revision + 1, updated_at = now()
      where plans.user_id = p_user_id and plans.revision = p_expected_revision
      returning plans.document, plans.revision, plans.updated_at;
  end if;
end;
$$;
revoke all on function public.save_daily_plan(uuid,jsonb,bigint) from public, anon;
grant execute on function public.save_daily_plan(uuid,jsonb,bigint) to authenticated;
commit;
