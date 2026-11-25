-- =====================================================================
-- DuoPlay: esquema do banco (Supabase / Postgres)
-- Como usar: Supabase > SQL Editor > cole tudo > Run.
-- Todo acesso aos dados passa pelo servidor (Netlify Functions, chave service_role).
-- O navegador NUNCA fala direto com as tabelas. RLS fica ligada mesmo assim (defesa em camadas).
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- PERFIS ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  tag           text not null check (tag ~ '^[0-9]{4}$'),
  display_name  text not null default '' check (char_length(display_name) <= 32),
  bio           text not null default '' check (char_length(bio) <= 280),
  phone_enc     text,                         -- telefone criptografado (AES-256-GCM, feito no servidor)
  avatar_path   text,
  banner_path   text,
  show_activity boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (username, tag)
);

-- Cria o perfil e sorteia a tag (#0000) quando uma conta é criada.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text; t text; n int := 0;
begin
  u := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  if u !~ '^[a-z0-9_]{3,20}$' then u := 'jogador'; end if;
  loop
    t := lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.profiles where username = u and tag = t);
    n := n + 1;
    if n > 200 then raise exception 'tags esgotadas para este usuario'; end if;
  end loop;
  insert into public.profiles (id, username, tag, display_name) values (new.id, u, t, u);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- AMIZADES ----------
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references public.profiles(id) on delete cascade,
  addressee  uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

-- ---------- ATIVIDADE (o que o amigo está jogando) ----------
create table if not exists public.activity (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  game_title text not null check (char_length(game_title) between 1 and 80),
  platform   text not null default '' check (char_length(platform) <= 30),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- BETA ----------
create table if not exists public.beta_config (
  id int primary key default 1 check (id = 1),
  slots_total int not null default 1000,
  daily_limit_seconds int not null default 3600        -- Beta: 1 hora por dia (oficial: 600 = 10 min)
);
insert into public.beta_config default values on conflict do nothing;

create table if not exists public.beta_signups (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table if not exists public.play_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,                                -- dia no fuso America/Sao_Paulo (zera à meia-noite)
  seconds int not null default 0 check (seconds >= 0),
  primary key (user_id, day)
);

-- ---------- VÍNCULO COM O APP (fluxo de código de dispositivo) ----------
create table if not exists public.device_codes (
  device_hash text primary key,                         -- SHA-256 do device_code (o app guarda o original)
  user_code   text not null unique,                     -- código curto que a pessoa digita no site
  user_id     uuid references public.profiles(id) on delete cascade,
  approved    boolean not null default false,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create table if not exists public.app_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  token_hash   text not null unique,                    -- só o hash é guardado; o token aparece uma vez para o app
  label        text not null default '',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- ---------- LIMITE DE TAXA ----------
create table if not exists public.rate_limits (
  k text primary key, win_start timestamptz not null, hits int not null
);

-- =====================================================================
-- FUNÇÕES (só o servidor pode chamar: o EXECUTE é revogado no final)
-- =====================================================================
create or replace function public.rl_hit(p_key text, p_lim int, p_win int) returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.rate_limits;
begin
  insert into public.rate_limits as t (k, win_start, hits) values (p_key, now(), 1)
  on conflict (k) do update set
    hits = case when t.win_start < now() - make_interval(secs => p_win) then 1 else t.hits + 1 end,
    win_start = case when t.win_start < now() - make_interval(secs => p_win) then now() else t.win_start end
  returning * into r;
  return r.hits <= p_lim;
end $$;

create or replace function public.request_friend(p_uid uuid, p_username text, p_tag text) returns text
language plpgsql security definer set search_path = public as $$
declare t uuid; f public.friendships;
begin
  select id into t from profiles where username = lower(p_username) and tag = p_tag;
  if t is null then return 'not_found'; end if;
  if t = p_uid then return 'self'; end if;
  select * into f from friendships
   where least(requester, addressee) = least(p_uid, t) and greatest(requester, addressee) = greatest(p_uid, t);
  if found then
    if f.status = 'accepted' then return 'exists'; end if;
    if f.addressee = p_uid then update friendships set status = 'accepted' where id = f.id; return 'accepted'; end if;
    return 'pending';
  end if;
  if (select count(*) from friendships where requester = p_uid and status = 'pending') >= 50 then return 'too_many'; end if;
  insert into friendships (requester, addressee) values (p_uid, t);
  return 'sent';
end $$;

create or replace function public.respond_friend(p_uid uuid, p_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update friendships set status = 'accepted' where id = p_id and addressee = p_uid and status = 'pending';
  else
    delete from friendships where id = p_id and addressee = p_uid and status = 'pending';
  end if;
  if not found then return 'not_found'; end if;
  return 'ok';
end $$;

create or replace function public.remove_friend(p_uid uuid, p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  delete from friendships where id = p_id and p_uid in (requester, addressee);
  if not found then return 'not_found'; end if;
  return 'ok';
end $$;

create or replace function public.friends_overview(p_uid uuid) returns jsonb
language sql security definer set search_path = public as $$
  with r as (
    select f.id fid, f.status, f.requester, f.addressee,
           case when f.requester = p_uid then f.addressee else f.requester end other
    from friendships f where p_uid in (f.requester, f.addressee)
  )
  select jsonb_build_object(
    'friends',  coalesce((select jsonb_agg(jsonb_build_object('id', r.fid, 'username', p.username, 'tag', p.tag,
                  'display_name', p.display_name, 'avatar_path', p.avatar_path) order by p.username)
                  from r join profiles p on p.id = r.other where r.status = 'accepted'), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', r.fid, 'username', p.username, 'tag', p.tag,
                  'display_name', p.display_name, 'avatar_path', p.avatar_path))
                  from r join profiles p on p.id = r.other where r.status = 'pending' and r.addressee = p_uid), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', r.fid, 'username', p.username, 'tag', p.tag,
                  'display_name', p.display_name, 'avatar_path', p.avatar_path))
                  from r join profiles p on p.id = r.other where r.status = 'pending' and r.requester = p_uid), '[]'::jsonb)
  );
$$;

create or replace function public.set_activity(p_uid uuid, p_title text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into activity (user_id, game_title, platform, started_at, updated_at)
  values (p_uid, p_title, p_platform, now(), now())
  on conflict (user_id) do update set
    started_at = case when activity.game_title = excluded.game_title and activity.updated_at > now() - interval '3 minutes'
                      then activity.started_at else now() end,
    game_title = excluded.game_title, platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.friends_activity(p_uid uuid) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'tag', p.tag, 'display_name', p.display_name,
         'avatar_path', p.avatar_path, 'game_title', a.game_title, 'platform', a.platform, 'started_at', a.started_at)
         order by a.started_at desc), '[]'::jsonb)
  from friendships f
  join profiles p on p.id = case when f.requester = p_uid then f.addressee else f.requester end
  join activity a on a.user_id = p.id
  where f.status = 'accepted' and p_uid in (f.requester, f.addressee)
    and p.show_activity and a.updated_at > now() - interval '3 minutes';
$$;

create or replace function public.beta_status(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c beta_config; taken int; used int := 0; joined boolean := false;
        d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into c from beta_config where id = 1;
  select count(*) into taken from beta_signups;
  if p_uid is not null then
    joined := exists (select 1 from beta_signups where user_id = p_uid);
    if joined then used := coalesce((select seconds from play_usage where user_id = p_uid and day = d), 0); end if;
  end if;
  return jsonb_build_object('taken', taken, 'total', c.slots_total, 'joined', joined,
    'limit_seconds', c.daily_limit_seconds, 'used_seconds', used,
    'remaining_seconds', greatest(c.daily_limit_seconds - used, 0));
end $$;

create or replace function public.join_beta(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tot int; cnt int;
begin
  perform pg_advisory_xact_lock(7001);                      -- evita passar de 1000 em cadastros simultâneos
  if exists (select 1 from beta_signups where user_id = p_uid) then return jsonb_build_object('status', 'already'); end if;
  select slots_total into tot from beta_config where id = 1;
  select count(*) into cnt from beta_signups;
  if cnt >= tot then return jsonb_build_object('status', 'full'); end if;
  insert into beta_signups (user_id) values (p_uid);
  return jsonb_build_object('status', 'joined');
end $$;

create or replace function public.usage_add(p_uid uuid, p_seconds int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c beta_config; used int; d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists (select 1 from beta_signups where user_id = p_uid) then return jsonb_build_object('error', 'not_in_beta'); end if;
  select * into c from beta_config where id = 1;
  insert into play_usage (user_id, day, seconds) values (p_uid, d, least(greatest(p_seconds, 0), c.daily_limit_seconds))
  on conflict (user_id, day) do update
    set seconds = least(play_usage.seconds + greatest(p_seconds, 0), c.daily_limit_seconds)
  returning seconds into used;
  return jsonb_build_object('used_seconds', used, 'remaining_seconds', c.daily_limit_seconds - used);
end $$;

create or replace function public.device_approve(p_uid uuid, p_user_code text) returns text
language plpgsql security definer set search_path = public as $$
begin
  update device_codes set user_id = p_uid, approved = true
   where user_code = p_user_code and expires_at > now() and not approved;
  if not found then return 'invalid'; end if;
  return 'ok';
end $$;

create or replace function public.device_poll(p_device_hash text, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d device_codes;
begin
  select * into d from device_codes where device_hash = p_device_hash;
  if not found or d.expires_at < now() then return jsonb_build_object('status', 'expired'); end if;
  if not d.approved then return jsonb_build_object('status', 'pending'); end if;
  delete from app_tokens where id in (select id from app_tokens where user_id = d.user_id order by created_at desc offset 9);
  insert into app_tokens (user_id, token_hash, label) values (d.user_id, p_token_hash, 'app');
  delete from device_codes where device_hash = p_device_hash;
  return jsonb_build_object('status', 'ok');
end $$;

create or replace function public.app_token_user(p_hash text) returns uuid
language sql security definer set search_path = public as $$
  update app_tokens set last_used_at = now() where token_hash = p_hash returning user_id;
$$;

create or replace function public.purge_expired() returns void
language sql security definer set search_path = public as $$
  delete from device_codes where expires_at < now();
  delete from rate_limits where win_start < now() - interval '1 day';
$$;
-- Opcional (pg_cron): select cron.schedule('duoplay-purge', '0 * * * *', 'select public.purge_expired()');

-- =====================================================================
-- RLS: ligada em tudo. Sem política = ninguém (anon/authenticated) acessa.
-- O servidor usa service_role, que ignora RLS. As políticas abaixo só liberam
-- a leitura dos PRÓPRIOS dados, caso um dia o front use o login do Supabase direto.
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.friendships   enable row level security;
alter table public.activity      enable row level security;
alter table public.beta_config   enable row level security;
alter table public.beta_signups  enable row level security;
alter table public.play_usage    enable row level security;
alter table public.device_codes  enable row level security;
alter table public.app_tokens    enable row level security;
alter table public.rate_limits   enable row level security;

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists friendships_own on public.friendships;
create policy friendships_own on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
drop policy if exists activity_own on public.activity;
create policy activity_own on public.activity for select to authenticated using (user_id = auth.uid());
drop policy if exists beta_own on public.beta_signups;
create policy beta_own on public.beta_signups for select to authenticated using (user_id = auth.uid());
drop policy if exists usage_own on public.play_usage;
create policy usage_own on public.play_usage for select to authenticated using (user_id = auth.uid());

-- Permissões mínimas: tira tudo de anon/authenticated e devolve só a leitura acima.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.friendships, public.activity, public.beta_signups, public.play_usage to authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------- ARMAZENAMENTO DE IMAGENS ----------
-- Leitura pública das imagens; gravação só pelo servidor (sem política de escrita para clientes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 1048576, array['image/png', 'image/jpeg', 'image/webp']),
  ('banners', 'banners', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
