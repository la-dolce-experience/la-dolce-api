-- =====================================================================
-- Fotos do evento nos depoimentos: até 5 por depoimento, na ordem escolhida.
-- A foto de perfil continua em testimonials.media_id (opcional).
-- =====================================================================

alter table public.testimonials
  add column photo_media_ids uuid[] not null default '{}'
    check (cardinality(photo_media_ids) <= 5);

comment on column public.testimonials.photo_media_ids is
  'Fotos do evento (ids de media), na ordem exibida no site. Máximo 5.';

create index on public.testimonials using gin (photo_media_ids);

-- Valores padrão também quando a linha vem de um JSON sem a coluna (lixeira, cópia de segurança
-- antiga): jsonb_populate_record entrega null, e o not null é conferido depois deste gatilho.
-- Arrays não têm chave estrangeira: aqui se garante que toda foto existe na biblioteca.
create or replace function public.testimonials_fill_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.photo_media_ids := coalesce(new.photo_media_ids, '{}');
  new.rating := coalesce(new.rating, 5);
  if exists (
    select 1 from unnest(new.photo_media_ids) as p(id)
    where not exists (select 1 from public.media m where m.id = p.id)
  ) then
    raise exception 'foto do depoimento não encontrada na biblioteca de imagens' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger testimonials_fill_defaults before insert or update on public.testimonials
  for each row execute function public.testimonials_fill_defaults();

-- Ao excluir uma imagem da biblioteca, ela sai também das fotos dos depoimentos.
create or replace function public.remove_media_from_testimonials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.testimonials
    set photo_media_ids = array_remove(photo_media_ids, old.id)
    where old.id = any (photo_media_ids);
  return old;
end;
$$;

create trigger remove_media_from_testimonials after delete on public.media
  for each row execute function public.remove_media_from_testimonials();
