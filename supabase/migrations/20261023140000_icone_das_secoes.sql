-- =====================================================================
-- Ícone de cada seção no menu lateral do painel.
--
-- O painel tem um catálogo de ícones (la-dolce-app/src/features/admin/sectionIcons.ts); aqui fica só o
-- nome escolhido. Vazio = o ícone padrão do tipo da seção. Um nome que o painel não conhece também cai
-- no ícone do tipo, então o banco só confere o formato.
-- =====================================================================

alter table public.sections
  add column icon text not null default '' check (icon ~ '^[a-z0-9-]{0,40}$');

comment on column public.sections.icon is
  'Ícone da seção no menu do painel (nome do catálogo do app). Vazio = ícone padrão do tipo.';

-- Os mesmos ícones que cada parte do site tinha no menu antes das seções ordenáveis.
update public.sections s
  set icon = v.icon
  from (values
    ('00000000-0000-4000-b000-000000000001'::uuid, 'sparkles'),
    ('00000000-0000-4000-b000-000000000002'::uuid, 'heart-handshake'),
    ('00000000-0000-4000-b000-000000000003'::uuid, 'party-popper'),
    ('00000000-0000-4000-b000-000000000004'::uuid, 'ice-cream-cone'),
    ('00000000-0000-4000-b000-000000000005'::uuid, 'ice-cream-cone'),
    ('00000000-0000-4000-b000-000000000006'::uuid, 'ice-cream-cone'),
    ('00000000-0000-4000-b000-000000000007'::uuid, 'palette'),
    ('00000000-0000-4000-b000-000000000008'::uuid, 'list-ordered'),
    ('00000000-0000-4000-b000-000000000009'::uuid, 'camera'),
    ('00000000-0000-4000-b000-000000000010'::uuid, 'message-square-quote'),
    ('00000000-0000-4000-b000-000000000011'::uuid, 'clipboard-list'),
    ('00000000-0000-4000-b000-000000000012'::uuid, 'map-pin'),
    ('00000000-0000-4000-b000-000000000013'::uuid, 'circle-help')
  ) as v(id, icon)
  where s.id = v.id;

-- Seção nova: o ícone vem junto com os outros campos.
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
  insert into public.sections (type, slug, name, nav_label, icon, position, eyebrow, title, body, cta_label, note,
                               options, visible)
  values (
    p_section ->> 'type',
    p_section ->> 'slug',
    p_section ->> 'name',
    coalesce(p_section ->> 'nav_label', ''),
    coalesce(p_section ->> 'icon', ''),
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

-- A cópia de uma seção mantém o ícone da original.
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
  insert into public.sections (type, slug, name, nav_label, icon, position, eyebrow, title, body, cta_label, note,
                               image_caption, image_media_id, image_alt, options, visible)
  values (original.type, p_slug, p_name, '', original.icon, original.position + 1, original.eyebrow, original.title,
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

revoke all on function public.create_section(jsonb, int) from public, anon;
revoke all on function public.duplicate_section(uuid, text, text) from public, anon;
grant execute on function public.create_section(jsonb, int) to authenticated;
grant execute on function public.duplicate_section(uuid, text, text) to authenticated;
