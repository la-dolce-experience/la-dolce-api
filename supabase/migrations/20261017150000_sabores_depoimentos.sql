-- =====================================================================
-- Sabores, apresentações e depoimentos:
--   1. Lista livre de sabores e de apresentações (copinho, casquinha...), com foto opcional.
--   2. Depoimentos com foto opcional e nota de 1 a 5 estrelas.
-- =====================================================================

-- ---------- 1. Sabores e apresentações ----------
-- Uma tabela só: "kind" separa as duas listas do painel e do site.
create table public.flavor_items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('sabor', 'apresentacao')),
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  media_id    uuid references public.media (id) on delete set null,
  alt         text not null default '' check (char_length(alt) <= 200),
  position    int  not null default 0,
  visible     boolean not null default true
);

create index on public.flavor_items (kind, position);
create index on public.flavor_items (media_id);

alter table public.flavor_items enable row level security;

create policy "flavor_items: leitura" on public.flavor_items
  for select using (visible or (select public.is_admin()));
create policy "flavor_items: insert admin" on public.flavor_items
  for insert to authenticated with check ((select public.is_admin()));
create policy "flavor_items: update admin" on public.flavor_items
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "flavor_items: delete admin" on public.flavor_items
  for delete to authenticated using ((select public.is_admin()));

-- ---------- 2. Depoimentos com foto e estrelas ----------
alter table public.testimonials
  add column media_id uuid references public.media (id) on delete set null,
  add column rating   smallint not null default 5 check (rating between 1 and 5);

create index on public.testimonials (media_id);

-- ---------- Lixeira ----------
alter table public.trash drop constraint trash_table_name_check;
alter table public.trash add constraint trash_table_name_check check (table_name in
  ('event_types', 'features', 'steps', 'gallery_items', 'faqs', 'testimonials', 'flavor_items'));

create trigger copy_to_trash before delete on public.flavor_items
  for each row execute function public.copy_to_trash();

-- Depoimentos excluídos antes desta migration não têm nota: sem ela, a restauração violaria o "not null".
update public.trash
  set row_data = row_data || '{"rating": 5}'::jsonb
  where table_name = 'testimonials' and not row_data ? 'rating';
