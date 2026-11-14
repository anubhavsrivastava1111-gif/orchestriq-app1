-- Exam Mastery: invite-only, admin-controlled backend.
-- After applying, bootstrap the owner (NOT committed to git):
--   insert into public.invites(email, role) values ('<owner email>', 'owner');

-- ───────── Tables ─────────
create table public.invites (
  email text primary key check (email = lower(email)),
  role text not null default 'member' check (role in ('owner','admin','member')),
  note text,
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
create table public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
-- Append-only records ledger: no update/delete policies exist, so history can't be lost or altered by clients.
create table public.attempts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, exam text, paper text, score int, total int, seconds int,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index attempts_user_idx on public.attempts(user_id, created_at);
create table public.tutor_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text, input_tokens int, output_tokens int,
  created_at timestamptz not null default now()
);
create index tutor_usage_user_idx on public.tutor_usage(user_id, created_at);
create table public.app_config (key text primary key, value jsonb, updated_at timestamptz not null default now());
create table public.audit_log (id bigserial primary key, actor uuid, action text not null, target text, created_at timestamptz not null default now());

insert into public.app_config(key, value) values
  ('tutor_enabled', 'true'), ('tutor_daily_limit', '40'), ('tutor_model', '"claude-opus-5-5"'),
  ('latest_version', '"0.2.0"'), ('apk_url', '""'), ('announcement', '""');

-- ───────── Helper functions ─────────
create function public.is_active() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and status = 'active') $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role in ('owner','admin')) $$;
create function public.is_owner() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role = 'owner') $$;

-- ───────── Invite gate on sign-up ─────────
create function public.gate_signup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from invites where email = lower(new.email)) then
    raise exception 'not invited';
  end if;
  return new;
end $$;
create trigger gate_signup before insert on auth.users for each row execute function public.gate_signup();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, role)
  values (new.id, lower(new.email), coalesce((select role from invites where email = lower(new.email)), 'member'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Only admins change status; only the owner changes roles; nobody can demote/revoke the owner except the owner.
create function public.guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id or new.email <> old.email then raise exception 'immutable'; end if;
  if new.role <> old.role and not is_owner() then raise exception 'only the owner can change roles'; end if;
  if new.status <> old.status and not is_admin() then raise exception 'only admins can change access'; end if;
  if old.role = 'owner' and (new.status <> old.status or new.role <> old.role) and old.id <> auth.uid() then raise exception 'the owner cannot be changed by others'; end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- Only the owner may issue owner/admin invites.
create function public.guard_invite() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('owner','admin') and not is_owner() then raise exception 'only the owner can invite admins'; end if;
  return new;
end $$;
create trigger guard_invite before insert or update on public.invites for each row execute function public.guard_invite();

-- ───────── Row-level security ─────────
alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.user_state enable row level security;
alter table public.attempts enable row level security;
alter table public.tutor_usage enable row level security;
alter table public.app_config enable row level security;
alter table public.audit_log enable row level security;

create policy invites_admin on public.invites for all to authenticated using (is_admin()) with check (is_admin());

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

create policy state_own on public.user_state for all to authenticated using (user_id = auth.uid() and is_active()) with check (user_id = auth.uid() and is_active());
create policy state_admin_read on public.user_state for select to authenticated using (is_admin());

create policy attempts_insert on public.attempts for insert to authenticated with check (user_id = auth.uid() and is_active());
create policy attempts_read on public.attempts for select to authenticated using ((user_id = auth.uid() and is_active()) or is_admin());

create policy usage_read on public.tutor_usage for select to authenticated using (user_id = auth.uid() or is_admin());

create policy config_read on public.app_config for select to authenticated using (is_active());
create policy config_write on public.app_config for all to authenticated using (is_admin()) with check (is_admin());

create policy audit_insert on public.audit_log for insert to authenticated with check (is_admin() and actor = auth.uid());
create policy audit_read on public.audit_log for select to authenticated using (is_admin());

-- ───────── Admin summary view (RLS of the caller applies) ─────────
create view public.admin_user_summary with (security_invoker = true) as
select p.*,
  coalesce((select sum((v->>'seen')::int) from jsonb_each(us.data->'cards') e(k, v)), 0)::int as answers,
  coalesce((select sum((v->>'correct')::int) from jsonb_each(us.data->'cards') e(k, v)), 0)::int as correct,
  (select count(*) from attempts a where a.user_id = p.id)::int as attempts,
  us.updated_at as last_sync
from profiles p left join user_state us on us.user_id = p.id;

revoke all on function public.gate_signup() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Lock down: trigger functions are internal only; role checks callable only by signed-in users (they reveal only the caller's own status).
revoke execute on function public.guard_invite(), public.guard_profile() from public, anon, authenticated;
revoke execute on function public.is_active(), public.is_admin(), public.is_owner() from public, anon;
grant execute on function public.is_active(), public.is_admin(), public.is_owner() to authenticated;
