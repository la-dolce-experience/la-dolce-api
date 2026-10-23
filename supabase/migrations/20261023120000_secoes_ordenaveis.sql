-- =====================================================================
-- Seções ordenáveis: a página inicial passa a ser uma lista ORDENADA de seções.
--
-- Antes: 11 seções fixas (sections.key) e uma tabela por lista (event_types, features,
-- flavor_items, steps, gallery_items, faqs, testimonials).
-- Agora (mesmo modelo do template site-personalizavel): cada seção tem um tipo (destaque, texto com
-- imagem, cartões, catálogo...), posição, endereço (#slug) e item de menu; os itens de todas as listas
-- ficam em section_items. O painel cria, duplica, reordena, oculta e exclui seções.
--
-- O conteúdo atual é convertido aqui, com os mesmos ids de itens e imagens. As seções ganham ids fixos
-- (os mesmos do seed em la-dolce-data). "Sabores e apresentação" vira três seções seguidas: o texto com
-- a foto, a lista de sabores e a de apresentações (catálogos sem título, que aparecem colados no texto).
-- Tudo numa transação: se algo falhar, nada muda.
-- =====================================================================

-- ---------- 1. Seções: tipo, endereço, nome, menu, posição e opções ----------
alter table public.sections drop constraint sections_key_check;

alter table public.sections
  add column id        uuid,
  add column type      text,
  add column slug      text,
  add column name      text,
  add column nav_label text not null default '' check (char_length(nav_label) <= 30),
  add column position  int  not null default 0,
  add column options   jsonb not null default '{}'
    check (jsonb_typeof(options) = 'object' and pg_column_size(options) <= 4000);

create temporary table secao_nova (
  key text, id uuid, type text, slug text, name text, nav_label text, position int, options jsonb
) on commit drop;

insert into secao_nova values
  ('hero',            '00000000-0000-4000-b000-000000000001', 'hero',         'destaque',         'Destaque principal',         '',                0,
   '{"whatsappLabel": "Tirar dúvidas no WhatsApp"}'),
  ('experience',      '00000000-0000-4000-b000-000000000002', 'texto_imagem', 'experiencia',      'Experiência',                'Experiência',     1,
   '{"imagePosition": "esquerda", "imageFit": "cortada"}'),
  ('events',          '00000000-0000-4000-b000-000000000003', 'cartoes',      'eventos',          'Tipos de evento',            'Eventos',         2,
   '{"linkLabel": "Pedir orçamento"}'),
  ('flavors',         '00000000-0000-4000-b000-000000000004', 'texto_imagem', 'sabores',          'Sabores e apresentação',     '',                3,
   '{"imagePosition": "direita", "imageFit": "inteira"}'),
  ('personalization', '00000000-0000-4000-b000-000000000007', 'destaques',    'personalizacao',   'Personalização',             '',                6, '{}'),
  ('steps',           '00000000-0000-4000-b000-000000000008', 'etapas',       'como-funciona',    'Como funciona',              '',                7, '{}'),
  ('gallery',         '00000000-0000-4000-b000-000000000009', 'galeria',      'galeria',          'Galeria',                    'Galeria',         8, '{}'),
  ('testimonials',    '00000000-0000-4000-b000-000000000010', 'depoimentos',  'depoimentos',      'Depoimentos',                '',                9, '{}'),
  ('quote',           '00000000-0000-4000-b000-000000000011', 'formulario',   'orcamento',        'Formulário de orçamento',    'Pedir orçamento', 10,
   '{"subjectLabel": "Tipo de evento", "showDate": true, "dateLabel": "Data prevista", "showQuantity": true,
     "quantityLabel": "Nº estimado de convidados", "showLocation": true, "locationLabel": "Cidade ou local do evento",
     "messageLabel": "Conte um pouco sobre o evento"}'),
  ('location',        '00000000-0000-4000-b000-000000000012', 'contato',      'atendimento',      'Atendimento e localização',  'Atendimento',     11, '{}'),
  ('faq',             '00000000-0000-4000-b000-000000000013', 'faq',          'duvidas',          'Perguntas frequentes',       'Dúvidas',         12, '{}');

update public.sections s
  set id = n.id, type = n.type, slug = n.slug, name = n.name, nav_label = n.nav_label,
      position = n.position, options = n.options
  from secao_nova n
  where s.key = n.key;

-- Sabores e apresentações: duas listas logo abaixo do texto de "Sabores e apresentação".
insert into public.sections (key, id, type, slug, name, position, options, visible)
select v.k, v.id, 'catalogo', v.slug, v.name, v.position, v.options, f.visible
from public.sections f,
  (values
    ('lista-de-sabores', '00000000-0000-4000-b000-000000000005'::uuid, 'lista-de-sabores', 'Sabores', 4,
     '{"imagePosition": "direita", "listTitle": "Sabores"}'::jsonb),
    ('apresentacoes', '00000000-0000-4000-b000-000000000006'::uuid, 'apresentacoes', 'Apresentações', 5,
     '{"imagePosition": "direita", "listTitle": "Apresentações"}'::jsonb)
  ) as v(k, id, slug, name, position, options)
where f.key = 'flavors';

alter table public.sections drop constraint sections_pkey;
alter table public.sections drop column key;

alter table public.sections
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column type set not null,
  alter column slug set not null,
  alter column name set not null,
  add primary key (id),
  add constraint sections_type_check check (type in (
    'hero', 'texto_imagem', 'cartoes', 'catalogo', 'destaques', 'etapas',
    'galeria', 'depoimentos', 'formulario', 'contato', 'faq')),
  -- Âncora no site (#slug). "inicio" e "conteudo" já são usados pela página.
  add constraint sections_slug_check check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40
    and slug not in ('inicio', 'conteudo', 'admin')),
  add constraint sections_slug_key unique (slug),
  add constraint sections_name_check check (char_length(name) between 1 and 60);

comment on column public.sections.name is 'Nome da seção no painel (o visitante não vê).';
comment on column public.sections.nav_label is 'Item do menu do site. Vazio = a seção não aparece no menu.';
comment on column public.sections.options is
  'Opções do tipo (lado da foto, campos do formulário...). Validadas no app; aqui só o formato.';

-- Tipos que só fazem sentido uma vez na página.
create unique index sections_single_type on public.sections (type)
  where type in ('hero', 'formulario', 'contato');
create index on public.sections (position);

-- Seções ocultas só o admin vê; o admin passa a poder criar e excluir seções.
drop policy "sections: leitura pública" on public.sections;
create policy "sections: leitura" on public.sections
  for select using (visible or (select public.is_admin()));
create policy "sections: insert admin" on public.sections
  for insert to authenticated with check ((select public.is_admin()));
create policy "sections: delete admin" on public.sections
  for delete to authenticated using ((select public.is_admin()));

-- ---------- 2. Itens das seções ----------
-- Uma tabela para todas as listas. Cada tipo de seção usa só alguns campos:
--   cartoes      title, description, label (opção no formulário)
--   catalogo     title, description, label (preço ou detalhe), media_id, alt
--   destaques    title
--   etapas       title, description
--   galeria      media_id, alt, description (legenda)
--   depoimentos  title (autor), label (contexto), description (texto), rating, media_id, photo_media_ids, authorized
--   faq          title (pergunta), description (resposta)
create table public.section_items (
  id              uuid primary key default gen_random_uuid(),
  section_id      uuid not null references public.sections (id) on delete cascade,
  title           text not null default '' check (char_length(title) <= 200),
  description     text not null default '' check (char_length(description) <= 1500),
  label           text not null default '' check (char_length(label) <= 120),
  media_id        uuid references public.media (id) on delete set null,
  alt             text not null default '' check (char_length(alt) <= 200),
  photo_media_ids uuid[] not null default '{}' check (cardinality(photo_media_ids) <= 5),
  rating          smallint not null default 5 check (rating between 1 and 5),
  -- Depoimentos só aparecem com autorização de uso; nos outros tipos fica sempre true.
  authorized      boolean not null default true,
  position        int  not null default 0,
  visible         boolean not null default true
);

create index on public.section_items (section_id, position);
create index on public.section_items (media_id);
create index on public.section_items using gin (photo_media_ids);

comment on column public.section_items.photo_media_ids is
  'Fotos extras (ids de media), na ordem exibida no site. Máximo 5. Usado nos depoimentos.';

-- Valores padrão também quando a linha vem de um JSON sem a coluna (lixeira, cópia de segurança):
-- jsonb_populate_record entrega null, e o not null é conferido depois deste gatilho.
-- Arrays não têm chave estrangeira: aqui se garante que toda foto existe na biblioteca.
create or replace function public.section_items_fill_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.photo_media_ids := coalesce(new.photo_media_ids, '{}');
  new.rating := coalesce(new.rating, 5);
  new.authorized := coalesce(new.authorized, true);
  if exists (
    select 1 from unnest(new.photo_media_ids) as p(id)
    where not exists (select 1 from public.media m where m.id = p.id)
  ) then
    raise exception 'foto não encontrada na biblioteca de imagens' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger section_items_fill_defaults before insert or update on public.section_items
  for each row execute function public.section_items_fill_defaults();

-- Ao excluir uma imagem da biblioteca, ela sai também das fotos extras dos itens.
create or replace function public.remove_media_from_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.section_items
    set photo_media_ids = array_remove(photo_media_ids, old.id)
    where old.id = any (photo_media_ids);
  return old;
end;
$$;

create trigger remove_media_from_items after delete on public.media
  for each row execute function public.remove_media_from_items();

alter table public.section_items enable row level security;

-- Itens ocultos (ou depoimentos sem autorização) só o admin vê.
create policy "section_items: leitura" on public.section_items
  for select using ((visible and authorized) or (select public.is_admin()));
create policy "section_items: insert admin" on public.section_items
  for insert to authenticated with check ((select public.is_admin()));
create policy "section_items: update admin" on public.section_items
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "section_items: delete admin" on public.section_items
  for delete to authenticated using ((select public.is_admin()));

create trigger mark_site_changed after insert or update or delete on public.section_items
  for each statement execute function public.mark_site_changed();

-- ---------- 3. Conteúdo das listas antigas ----------
-- Mesmos ids, posições e visibilidade. Só entra o que tem seção correspondente.
insert into public.section_items (id, section_id, title, description, label, position, visible)
  select id, '00000000-0000-4000-b000-000000000003', title, description, form_label, position, visible
  from public.event_types
  where exists (select 1 from public.sections where id = '00000000-0000-4000-b000-000000000003');

insert into public.section_items (id, section_id, title, position, visible)
  select id, '00000000-0000-4000-b000-000000000007', label, position, visible
  from public.features
  where exists (select 1 from public.sections where id = '00000000-0000-4000-b000-000000000007');

insert into public.section_items (id, section_id, title, description, media_id, alt, position, visible)
  select f.id,
         case f.kind when 'sabor' then '00000000-0000-4000-b000-000000000005'::uuid
                     else '00000000-0000-4000-b000-000000000006'::uuid end,
         f.title, f.description, f.media_id, f.alt, f.position, f.visible
  from public.flavor_items f
  where exists (select 1 from public.sections where id = '00000000-0000-4000-b000-000000000005');

insert into public.section_items (id, section_id, title, description, position, visible)
  select id, '00000000-0000-4000-b000-000000000008', title, description, position, visible
  from public.steps
  where exists (select 1 from public.sections where id = '00000000-0000-4000-b000-000000000008');

insert into public.section_items (id, section_id, media_id, alt, description, position, visible)
  select id, '00000000-0000-4000-b000-000000000009', media_id, alt, caption, position, visible
  from public.gallery_items
  where exists (select 1 from public.sections where id = '00000000-0000-4000-b000-000000000009');

insert into public.section_items (id, section_id, title, description, position, visible)
  select id, '00000000-0000-4000-b000-000000000013', question, answer, position, visible
  from public.faqs
  where exists (select 1 from public.sections where id = '00000000-0000-4000-b000-000000000013');

insert into public.section_items
    (id, section_id, title, label, description, rating, media_id, photo_media_ids, authorized, position, visible)
  select id, '00000000-0000-4000-b000-000000000010', author, context, quote, rating, media_id, photo_media_ids,
         authorized, position, visible
  from public.testimonials
  where exists (select 1 from public.sections where id = '00000000-0000-4000-b000-000000000010');

-- ---------- 4. Lixeira: itens excluídos das listas antigas continuam restauráveis ----------
alter table public.trash drop constraint trash_table_name_check;

update public.trash t
  set table_name = 'section_items',
      row_data = jsonb_build_object(
        'id', r -> 'id',
        'section_id', case t.table_name
          when 'event_types' then '00000000-0000-4000-b000-000000000003'
          when 'features' then '00000000-0000-4000-b000-000000000007'
          when 'flavor_items' then case r ->> 'kind' when 'sabor' then '00000000-0000-4000-b000-000000000005'
                                                     else '00000000-0000-4000-b000-000000000006' end
          when 'steps' then '00000000-0000-4000-b000-000000000008'
          when 'gallery_items' then '00000000-0000-4000-b000-000000000009'
          when 'faqs' then '00000000-0000-4000-b000-000000000013'
          when 'testimonials' then '00000000-0000-4000-b000-000000000010'
        end,
        'title', coalesce(r ->> 'title', r ->> 'label', r ->> 'question', r ->> 'author', ''),
        'description', coalesce(r ->> 'description', r ->> 'caption', r ->> 'answer', r ->> 'quote', ''),
        'label', coalesce(r ->> 'form_label', r ->> 'context', ''),
        'media_id', r -> 'media_id',
        'alt', coalesce(r ->> 'alt', ''),
        'photo_media_ids', coalesce(r -> 'photo_media_ids', '[]'::jsonb),
        'rating', coalesce(r -> 'rating', '5'::jsonb),
        'authorized', coalesce(r -> 'authorized', 'true'::jsonb),
        'position', coalesce(r -> 'position', '0'::jsonb),
        'visible', coalesce(r -> 'visible', 'true'::jsonb)
      )
  from (select id, row_data as r from public.trash) old
  where old.id = t.id
    and t.table_name in ('event_types', 'features', 'flavor_items', 'steps', 'gallery_items', 'faqs', 'testimonials');

alter table public.trash add constraint trash_table_name_check
  check (table_name in ('sections', 'section_items'));

comment on table public.trash is
  'Cópia das seções e itens excluídos. Mantidos por 30 dias; restaurados por restore_from_trash.';

-- ---------- 5. Fim das tabelas antigas ----------
drop trigger remove_media_from_testimonials on public.media;
drop table public.event_types, public.features, public.flavor_items, public.steps,
  public.gallery_items, public.faqs, public.testimonials;
drop function public.testimonials_fill_defaults();
drop function public.remove_media_from_testimonials();

-- Cliques nos botões das seções são registrados com o endereço (slug) da seção.
alter table public.site_events drop constraint site_events_source_check;
alter table public.site_events add constraint site_events_source_check
  check (source is null or source ~ '^[a-z0-9_-]{1,40}$');

-- ---------- 6. Lixeira de seções e itens ----------
-- Antes de apagar, guarda uma cópia na lixeira e descarta cópias com mais de 30 dias.
-- Ao excluir uma seção, os itens dela também passam por aqui (on delete cascade).
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
    left(coalesce(nullif(data ->> 'name', ''), nullif(data ->> 'title', ''), nullif(data ->> 'alt', ''),
                  nullif(data ->> 'description', ''), ''), 200),
    data
  );
  return old;
end;
$$;

create trigger copy_to_trash before delete on public.sections
  for each row execute function public.copy_to_trash();
create trigger copy_to_trash before delete on public.section_items
  for each row execute function public.copy_to_trash();

-- Restaura uma seção (com os itens excluídos junto com ela) ou um item.
create or replace function public.restore_from_trash(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.trash;
  v_section uuid;
begin
  if not public.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select * into item from public.trash where id = p_id;
  if not found then
    raise exception 'item não encontrado na lixeira' using errcode = 'P0002';
  end if;

  if item.table_name = 'sections' then
    if exists (select 1 from public.sections where slug = item.row_data ->> 'slug') then
      raise exception 'já existe uma seção com o endereço "%"', item.row_data ->> 'slug' using errcode = '23505';
    end if;
    insert into public.sections select * from jsonb_populate_record(null::public.sections, item.row_data);
    v_section := (item.row_data ->> 'id')::uuid;
    insert into public.section_items
      select r.* from public.trash t, jsonb_populate_record(null::public.section_items, t.row_data) r
      where t.table_name = 'section_items' and (t.row_data ->> 'section_id')::uuid = v_section;
    delete from public.trash where table_name = 'section_items' and (row_data ->> 'section_id')::uuid = v_section;
  else
    if not exists (select 1 from public.sections where id = (item.row_data ->> 'section_id')::uuid) then
      raise exception 'a seção deste item foi excluída: restaure a seção primeiro' using errcode = 'P0001',
        hint = 'secao_excluida';
    end if;
    insert into public.section_items select * from jsonb_populate_record(null::public.section_items, item.row_data);
  end if;
  delete from public.trash where id = p_id;
end;
$$;

revoke all on function public.restore_from_trash(uuid) from public;
grant execute on function public.restore_from_trash(uuid) to authenticated;

-- ---------- 7. Ordem e criação de seções ----------
-- security invoker: as políticas acima continuam valendo; a checagem explícita só melhora a mensagem.

-- Grava a nova ordem: a posição de cada seção passa a ser seu índice no array.
create or replace function public.reorder_sections(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  update public.sections s
    set position = o.idx - 1
    from unnest(p_ids) with ordinality as o(id, idx)
    where s.id = o.id and s.position is distinct from o.idx - 1;
end;
$$;

-- Mesma coisa para os itens de uma seção.
create or replace function public.reorder_section_items(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  update public.section_items i
    set position = o.idx - 1
    from unnest(p_ids) with ordinality as o(id, idx)
    where i.id = o.id and i.position is distinct from o.idx - 1;
end;
$$;

-- Cria uma seção na posição pedida, empurrando as seguintes uma casa para baixo.
create or replace function public.create_section(p_section jsonb, p_position int)
returns public.sections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.sections;
  pos int := greatest(coalesce(p_position, 0), 0);
begin
  if not public.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  update public.sections set position = position + 1 where position >= pos;
  insert into public.sections (type, slug, name, nav_label, position, eyebrow, title, body, cta_label, note, options, visible)
  values (
    p_section ->> 'type',
    p_section ->> 'slug',
    p_section ->> 'name',
    coalesce(p_section ->> 'nav_label', ''),
    pos,
    coalesce(p_section ->> 'eyebrow', ''),
    coalesce(p_section ->> 'title', ''),
    coalesce(p_section ->> 'body', ''),
    coalesce(p_section ->> 'cta_label', ''),
    coalesce(p_section ->> 'note', ''),
    coalesce(p_section -> 'options', '{}'::jsonb),
    coalesce((p_section ->> 'visible')::boolean, true)
  )
  returning * into created;
  return created;
end;
$$;

-- Duplica uma seção (com os itens) logo abaixo da original. A cópia nasce oculta.
create or replace function public.duplicate_section(p_id uuid, p_slug text, p_name text)
returns public.sections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  original public.sections;
  created public.sections;
begin
  if not public.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select * into original from public.sections where id = p_id;
  if not found then
    raise exception 'seção não encontrada' using errcode = 'P0002';
  end if;
  update public.sections set position = position + 1 where position > original.position;
  insert into public.sections (type, slug, name, nav_label, position, eyebrow, title, body, cta_label, note,
                               image_caption, image_media_id, image_alt, options, visible)
  values (original.type, p_slug, p_name, '', original.position + 1, original.eyebrow, original.title,
          original.body, original.cta_label, original.note, original.image_caption, original.image_media_id,
          original.image_alt, original.options, false)
  returning * into created;
  insert into public.section_items (section_id, title, description, label, media_id, alt, photo_media_ids,
                                    rating, authorized, position, visible)
    select created.id, title, description, label, media_id, alt, photo_media_ids, rating, authorized, position, visible
    from public.section_items where section_id = p_id;
  return created;
end;
$$;

revoke all on function public.reorder_sections(uuid[]) from public, anon;
revoke all on function public.reorder_section_items(uuid[]) from public, anon;
revoke all on function public.create_section(jsonb, int) from public, anon;
revoke all on function public.duplicate_section(uuid, text, text) from public, anon;
grant execute on function public.reorder_sections(uuid[]) to authenticated;
grant execute on function public.reorder_section_items(uuid[]) to authenticated;
grant execute on function public.create_section(jsonb, int) to authenticated;
grant execute on function public.duplicate_section(uuid, text, text) to authenticated;

-- ---------- 8. Restauração da cópia de segurança (formato la-dolce-backup, versão 2) ----------
-- A versão 1 (cópias baixadas antes desta migração) tinha uma tabela por lista e não é mais aceita.
create or replace function public.restore_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dados jsonb := p_backup -> 'dados';
  t text;
  n int;
  result jsonb := '{}';
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  if p_backup ->> 'formato' is distinct from 'la-dolce-backup' or p_backup -> 'versao' is distinct from '2'::jsonb then
    raise exception 'o arquivo não é uma cópia de segurança baixada no painel (formato la-dolce-backup, versão 2)'
      using errcode = '22023';
  end if;
  foreach t in array array['site_settings', 'sections', 'section_items', 'media'] loop
    if jsonb_typeof(dados -> t) is distinct from 'array' then
      raise exception 'a cópia não tem a lista "%"', t using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(dados -> 'site_settings') <> 1 or jsonb_array_length(dados -> 'sections') = 0 then
    raise exception 'a cópia não tem as configurações ou as seções do site' using errcode = '22023';
  end if;

  -- 1. Seções e itens atuais vão para a lixeira (gatilho copy_to_trash): o que a cópia não
  --    trouxer de volta continua recuperável por 30 dias (ver passo 4).
  delete from public.section_items where true;
  delete from public.sections where true;

  -- 2. Imagens da cópia voltam com os mesmos ids. Imagens enviadas depois da cópia continuam na biblioteca.
  delete from public.media where id in (select (m ->> 'id')::uuid from jsonb_array_elements(dados -> 'media') m);
  insert into public.media select * from jsonb_populate_recordset(null::public.media, dados -> 'media');
  get diagnostics n = row_count;
  result := result || jsonb_build_object('media', n);

  -- 3. Configurações.
  delete from public.site_settings where true;
  insert into public.site_settings select * from jsonb_populate_recordset(null::public.site_settings, dados -> 'site_settings');
  result := result || jsonb_build_object('site_settings', 1);

  -- 4. Seções e itens, com os mesmos ids e posições da cópia.
  insert into public.sections select * from jsonb_populate_recordset(null::public.sections, dados -> 'sections');
  get diagnostics n = row_count;
  result := result || jsonb_build_object('sections', n);
  insert into public.section_items
    select * from jsonb_populate_recordset(null::public.section_items, dados -> 'section_items');
  get diagnostics n = row_count;
  result := result || jsonb_build_object('section_items', n);

  -- Na lixeira ficam só os que a cópia não trouxe de volta (now() = início desta transação).
  delete from public.trash tr where tr.deleted_at = now() and (
    (tr.table_name = 'sections' and exists (select 1 from public.sections x where x.id = (tr.row_data ->> 'id')::uuid))
    or (tr.table_name = 'section_items'
        and exists (select 1 from public.section_items x where x.id = (tr.row_data ->> 'id')::uuid)));

  return result;
end;
$$;

-- O Supabase concede execute a anon e authenticated por padrão: aqui só a service_role.
revoke all on function public.restore_backup(jsonb) from public, anon, authenticated;
grant execute on function public.restore_backup(jsonb) to service_role;
