-- ChartDB fork: Supabase schema
-- Применяется в SQL Editor или через Management API. Идемпотентно.

-- ============ Профили: одобрение аккаунтов владельцем ============

create table if not exists public.profiles (
    user_id uuid primary key references auth.users on delete cascade,
    email text,
    approved boolean not null default false,
    created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
    insert into public.profiles (user_id, email)
    values (new.id, new.email)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ============ Диаграммы: один JSON-блоб на диаграмму ============

create table if not exists public.diagrams (
    id text primary key,              -- id из ChartDB (не uuid)
    owner_id uuid not null references auth.users on delete cascade,
    name text not null,
    content jsonb not null,           -- diagramToJSONOutput
    updated_at timestamptz not null,  -- = Diagram.updatedAt, для LWW
    created_at timestamptz not null default now()
);
create index if not exists diagrams_owner_id_idx on public.diagrams (owner_id);

-- ============ RLS ============

alter table public.profiles enable row level security;
alter table public.diagrams enable row level security;

-- Хелпер: текущий пользователь одобрен?
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
    select coalesce(
        (select approved from public.profiles where user_id = auth.uid()),
        false);
$$;

-- Пользователь видит только свой профиль (для экрана «ожидает одобрения»)
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select
    using (user_id = auth.uid());

-- Диаграммы: полный доступ только к своим и только для одобренных
drop policy if exists "own diagrams" on public.diagrams;
create policy "own diagrams" on public.diagrams for all
    using (owner_id = auth.uid() and public.is_approved())
    with check (owner_id = auth.uid() and public.is_approved());
