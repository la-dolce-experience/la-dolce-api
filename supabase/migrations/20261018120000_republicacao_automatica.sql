-- =====================================================================
-- Republicação automática do site.
--
-- A página inicial é pré-renderizada no build (la-dolce-app): o HTML só traz o que foi salvo até a última
-- publicação. Toda alteração de conteúdo marca o site como desatualizado; a cada minuto, o pg_cron confere e,
-- depois de 2 minutos sem novas alterações (para juntar várias edições em uma publicação), chama o Deploy Hook
-- da Vercel. Respeita o mesmo intervalo mínimo de 5 minutos do botão "Atualizar prévia do link".
--
-- O Deploy Hook fica no Vault (secret "vercel_deploy_hook_url"), lido também pela Edge Function
-- republicar-site. Para definir: npm run deploy-hook:set -- --url <url> (ver README).
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- Estado da publicação (uma linha só).
-- ---------------------------------------------------------------------
create table public.site_publish_state (
  id                 smallint primary key default 1 check (id = 1),
  content_changed_at timestamptz
);

comment on table public.site_publish_state is
  'Quando o conteúdo do site mudou pela última vez (para a republicação automática).';

insert into public.site_publish_state (id) values (1);

alter table public.site_publish_state enable row level security;

create policy "site_publish_state: leitura admin" on public.site_publish_state
  for select to authenticated using ((select public.is_admin()));

-- deploy_requests passa a registrar também os pedidos automáticos (requested_by nulo).
comment on column public.deploy_requests.requested_by is
  'Quem pediu no painel; nulo nos pedidos automáticos (pg_cron).';

-- ---------------------------------------------------------------------
-- Toda alteração no conteúdo publicado marca o site como desatualizado.
-- ---------------------------------------------------------------------
create or replace function public.mark_site_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.site_publish_state set content_changed_at = now() where id = 1;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'media', 'site_settings', 'sections', 'event_types', 'features', 'flavor_items',
    'steps', 'gallery_items', 'faqs', 'testimonials'
  ] loop
    execute format(
      'create trigger mark_site_changed after insert or update or delete on public.%I
         for each statement execute function public.mark_site_changed()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Deploy Hook no Vault.
-- ---------------------------------------------------------------------
create or replace function public.deploy_hook_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vercel_deploy_hook_url' limit 1;
$$;

create or replace function public.set_deploy_hook_url(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if p_url is null or p_url !~ '^https://api\.vercel\.com/' then
    raise exception 'O Deploy Hook deve começar com https://api.vercel.com/' using errcode = '22023';
  end if;
  select id into existing from vault.secrets where name = 'vercel_deploy_hook_url';
  if existing is null then
    perform vault.create_secret(p_url, 'vercel_deploy_hook_url', 'Deploy Hook da Vercel (branch main)');
  else
    perform vault.update_secret(existing, p_url);
  end if;
end;
$$;

-- Só o servidor (service_role) lê ou grava o hook: quem tem a URL dispara deploys.
revoke all on function public.deploy_hook_url() from public, anon, authenticated;
revoke all on function public.set_deploy_hook_url(text) from public, anon, authenticated;
grant execute on function public.deploy_hook_url() to service_role;
grant execute on function public.set_deploy_hook_url(text) to service_role;

-- ---------------------------------------------------------------------
-- Decisão (função pura, testada) e ação (chamada pelo pg_cron).
-- ---------------------------------------------------------------------

-- 'em_dia'          nada mudou desde a última publicação
-- 'aguardando'      houve alteração há menos de 2 minutos (a pessoa pode estar editando)
-- 'intervalo'       a última publicação foi há menos de 5 minutos
-- 'publicar'        pode publicar
create or replace function public.site_publish_decision(p_now timestamptz default now())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select
      (select content_changed_at from public.site_publish_state where id = 1) as changed,
      (select max(requested_at) from public.deploy_requests where ok) as published
  )
  select case
    when changed is null or (published is not null and changed <= published) then 'em_dia'
    when changed > p_now - interval '2 minutes' then 'aguardando'
    when published > p_now - interval '5 minutes' then 'intervalo'
    else 'publicar'
  end
  from s;
$$;

revoke all on function public.site_publish_decision(timestamptz) from public, anon, authenticated;
grant execute on function public.site_publish_decision(timestamptz) to service_role;

create or replace function public.publish_site_if_needed()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision text := public.site_publish_decision();
  hook text;
begin
  if decision <> 'publicar' then
    return decision;
  end if;
  hook := public.deploy_hook_url();
  if hook is null or hook !~ '^https://api\.vercel\.com/' then
    return 'nao_configurado';
  end if;
  perform net.http_post(url := hook, body := '{}'::jsonb);
  insert into public.deploy_requests (requested_by, ok, detail)
    values (null, true, 'Republicação automática após alterações no painel.');
  return 'publicado';
end;
$$;

revoke all on function public.publish_site_if_needed() from public, anon, authenticated;

select cron.schedule('republicar-site-automatico', '* * * * *', 'select public.publish_site_if_needed()');
