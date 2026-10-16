-- =====================================================================
-- Melhorias do painel:
--   1. Métricas: visitas e cliques no WhatsApp (sem dados pessoais).
--   2. Lixeira: itens excluídos das listas podem ser restaurados por 30 dias.
--   3. Republicação do site: registro dos pedidos feitos pelo painel.
-- =====================================================================

-- ---------- 1. Métricas ----------
-- Só o tipo do evento, a origem e a hora. Nada de IP, navegador ou identificador:
-- não há dado pessoal (LGPD) nem necessidade de aviso de cookies.
create table public.site_events (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('visit', 'whatsapp_click')),
  source     text check (source is null or source ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now()
);

create index on public.site_events (created_at);

comment on table public.site_events is
  'Contagem anônima de visitas e cliques no WhatsApp. Gravada só pela função track_event.';

alter table public.site_events enable row level security;
-- Sem políticas: ninguém lê nem grava diretamente pela API.

-- Grava um evento. security definer: o visitante não tem acesso à tabela.
create or replace function public.track_event(p_kind text, p_source text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.site_events (kind, source) values (p_kind, nullif(p_source, ''));
$$;

revoke all on function public.track_event(text, text) from public;
grant execute on function public.track_event(text, text) to anon, authenticated;

-- Resumo por dia (horário de Brasília), tipo e origem. Somente administradores.
create or replace function public.events_summary(p_days int default 30)
returns table (day date, kind text, source text, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query
    select (e.created_at at time zone 'America/Sao_Paulo')::date as day, e.kind, e.source, count(*) as total
    from public.site_events e
    where e.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 400))
    group by 1, 2, 3
    order by 1, 2, 3;
end;
$$;

revoke all on function public.events_summary(int) from public;
grant execute on function public.events_summary(int) to authenticated;

-- ---------- 2. Lixeira ----------
create table public.trash (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in
               ('event_types', 'features', 'steps', 'gallery_items', 'faqs', 'testimonials')),
  label      text not null default '',
  row_data   jsonb not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid default auth.uid()
);

create index on public.trash (deleted_at desc);

comment on table public.trash is
  'Cópia dos itens excluídos das listas. Mantidos por 30 dias; restaurados por restore_from_trash.';

alter table public.trash enable row level security;

create policy "trash: leitura admin" on public.trash
  for select to authenticated using ((select public.is_admin()));
create policy "trash: exclusão admin" on public.trash
  for delete to authenticated using ((select public.is_admin()));

-- Antes de apagar um item de lista, guarda uma cópia na lixeira e descarta cópias com mais de 30 dias.
create or replace function public.copy_to_trash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  data jsonb := to_jsonb(old);
begin
  delete from public.trash where deleted_at < now() - interval '30 days';
  insert into public.trash (table_name, label, row_data)
  values (
    tg_table_name,
    left(coalesce(data ->> 'title', data ->> 'question', data ->> 'label', data ->> 'author',
                  nullif(data ->> 'caption', ''), data ->> 'alt', ''), 200),
    data
  );
  return old;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['event_types', 'features', 'steps', 'gallery_items', 'faqs', 'testimonials']
  loop
    execute format(
      'create trigger copy_to_trash before delete on public.%I for each row execute function public.copy_to_trash()', t);
  end loop;
end $$;

-- Restaura um item da lixeira para a lista de origem, com os mesmos dados.
create or replace function public.restore_from_trash(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.trash;
begin
  if not public.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select * into item from public.trash where id = p_id;
  if not found then
    raise exception 'item não encontrado na lixeira' using errcode = 'P0002';
  end if;
  execute format('insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)', item.table_name)
    using item.row_data;
  delete from public.trash where id = p_id;
end;
$$;

revoke all on function public.restore_from_trash(uuid) from public;
grant execute on function public.restore_from_trash(uuid) to authenticated;

-- ---------- 3. Republicação do site ----------
-- Gravado pela Edge Function "republicar-site" (service_role); o painel só lê.
create table public.deploy_requests (
  id           bigint generated always as identity primary key,
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  ok           boolean not null,
  detail       text not null default '' check (char_length(detail) <= 300)
);

create index on public.deploy_requests (requested_at desc);

alter table public.deploy_requests enable row level security;

create policy "deploy_requests: leitura admin" on public.deploy_requests
  for select to authenticated using ((select public.is_admin()));
