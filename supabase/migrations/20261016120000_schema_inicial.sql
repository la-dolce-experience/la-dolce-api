-- =====================================================================
-- La Dolce Experience — schema inicial do conteúdo administrável
-- Leitura pública do conteúdo; escrita somente por administradores (RLS).
-- =====================================================================

-- ---------- Administradores ----------
create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Usuários do Supabase Auth com acesso ao painel. Criados apenas via scripts/create-admin.mjs.';

-- security definer: consulta admin_users sem depender das políticas da própria tabela.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Helpers de validação ----------
-- URL externa segura para uso em href: só https (bloqueia javascript:, data: etc.).
create or replace function public.is_safe_url(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value = '' or (value ~* '^https://[^\s<>"]+$' and char_length(value) <= 500);
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Imagens ----------
-- Arquivos ficam no Storage (bucket "media"); aqui só metadados.
-- src_* = caminho no bucket, ou caminho absoluto "/images/..." para imagens estáticas do site.
create table public.media (
  id            uuid primary key default gen_random_uuid(),
  src_lg        text not null check (char_length(src_lg) between 1 and 300),
  src_sm        text not null check (char_length(src_sm) between 1 and 300),
  width_lg      int  not null check (width_lg between 1 and 6000),
  height_lg     int  not null check (height_lg between 1 and 6000),
  width_sm      int  not null check (width_sm between 1 and 6000),
  height_sm     int  not null check (height_sm between 1 and 6000),
  size_bytes    int  not null default 0 check (size_bytes between 0 and 10485760),
  mime_type     text not null default 'image/webp' check (mime_type in ('image/webp', 'image/jpeg', 'image/png')),
  alt           text not null default '' check (char_length(alt) <= 200),
  original_name text not null default '' check (char_length(original_name) <= 200),
  created_at    timestamptz not null default now()
);

-- ---------- Configurações comerciais (linha única) ----------
create table public.site_settings (
  id                smallint primary key default 1 check (id = 1),
  business_name     text not null check (char_length(business_name) between 1 and 80),
  footer_tagline    text not null default '' check (char_length(footer_tagline) <= 200),
  logo_media_id     uuid references public.media (id) on delete set null,
  whatsapp_number   text not null check (whatsapp_number ~ '^[1-9][0-9]{9,14}$'),
  whatsapp_greeting text not null check (char_length(whatsapp_greeting) between 1 and 300),
  phone             text not null default '' check (phone ~ '^[0-9]{0,15}$'),
  email             text not null default '' check (email = '' or (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(email) <= 120)),
  instagram_url     text not null default '' check (public.is_safe_url(instagram_url)),
  facebook_url      text not null default '' check (public.is_safe_url(facebook_url)),
  tiktok_url        text not null default '' check (public.is_safe_url(tiktok_url)),
  address_street    text not null default '' check (char_length(address_street) <= 160),
  address_district  text not null default '' check (char_length(address_district) <= 80),
  city              text not null default '' check (char_length(city) <= 80),
  state             text not null default '' check (state = '' or state ~ '^[A-Z]{2}$'),
  postal_code       text not null default '' check (postal_code = '' or postal_code ~ '^[0-9]{8}$'),
  service_area      text not null default '' check (char_length(service_area) <= 300),
  opening_hours     text not null default '' check (char_length(opening_hours) <= 500),
  maps_url          text not null default '' check (public.is_safe_url(maps_url)),
  show_map          boolean not null default false,
  seo_title         text not null check (char_length(seo_title) between 1 and 70),
  seo_description   text not null check (char_length(seo_description) between 1 and 170),
  og_media_id       uuid references public.media (id) on delete set null,
  updated_at        timestamptz not null default now()
);

create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------- Seções da página ----------
create table public.sections (
  key            text primary key check (key in (
                   'hero', 'experience', 'events', 'flavors', 'personalization', 'steps',
                   'gallery', 'testimonials', 'quote', 'location', 'faq')),
  eyebrow        text not null default '' check (char_length(eyebrow) <= 80),
  title          text not null default '' check (char_length(title) <= 140),
  body           text not null default '' check (char_length(body) <= 1200),
  cta_label      text not null default '' check (char_length(cta_label) <= 60),
  note           text not null default '' check (char_length(note) <= 160),
  image_caption  text not null default '' check (char_length(image_caption) <= 120),
  image_media_id uuid references public.media (id) on delete set null,
  image_alt      text not null default '' check (char_length(image_alt) <= 200),
  visible        boolean not null default true,
  updated_at     timestamptz not null default now()
);

create trigger sections_touch before update on public.sections
  for each row execute function public.touch_updated_at();

-- ---------- Listas ordenáveis ----------
create table public.event_types (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 400),
  form_label  text not null check (char_length(form_label) between 1 and 60),
  position    int  not null default 0,
  visible     boolean not null default true
);

create table public.features (
  id       uuid primary key default gen_random_uuid(),
  label    text not null check (char_length(label) between 1 and 100),
  position int  not null default 0,
  visible  boolean not null default true
);

create table public.steps (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 400),
  position    int  not null default 0,
  visible     boolean not null default true
);

create table public.gallery_items (
  id       uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media (id) on delete cascade,
  alt      text not null default '' check (char_length(alt) <= 200),
  caption  text not null default '' check (char_length(caption) <= 160),
  position int  not null default 0,
  visible  boolean not null default true
);

create table public.faqs (
  id       uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 1 and 200),
  answer   text not null check (char_length(answer) between 1 and 1500),
  position int  not null default 0,
  visible  boolean not null default true
);

create table public.testimonials (
  id         uuid primary key default gen_random_uuid(),
  author     text not null check (char_length(author) between 1 and 80),
  context    text not null default '' check (char_length(context) <= 120),
  quote      text not null check (char_length(quote) between 1 and 800),
  -- Só aparece no site se o cliente confirmar autorização de uso.
  authorized boolean not null default false,
  position   int  not null default 0,
  visible    boolean not null default true
);

create index on public.event_types (position);
create index on public.features (position);
create index on public.steps (position);
create index on public.gallery_items (position);
create index on public.gallery_items (media_id);
create index on public.faqs (position);
create index on public.testimonials (position);
create index on public.sections (image_media_id);

-- ---------- RLS ----------
alter table public.admin_users   enable row level security;
alter table public.media         enable row level security;
alter table public.site_settings enable row level security;
alter table public.sections      enable row level security;
alter table public.event_types   enable row level security;
alter table public.features      enable row level security;
alter table public.steps         enable row level security;
alter table public.gallery_items enable row level security;
alter table public.faqs          enable row level security;
alter table public.testimonials  enable row level security;

-- admin_users: o próprio usuário pode verificar se é admin; ninguém escreve via API.
create policy "admin_users: ler o próprio registro" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

-- Conteúdo com leitura pública total (o front decide o que exibir).
create policy "media: leitura pública" on public.media for select using (true);
create policy "site_settings: leitura pública" on public.site_settings for select using (true);
create policy "sections: leitura pública" on public.sections for select using (true);

-- Listas: público vê apenas itens visíveis; admin vê tudo.
create policy "event_types: leitura" on public.event_types for select using (visible or (select public.is_admin()));
create policy "features: leitura" on public.features for select using (visible or (select public.is_admin()));
create policy "steps: leitura" on public.steps for select using (visible or (select public.is_admin()));
create policy "gallery_items: leitura" on public.gallery_items for select using (visible or (select public.is_admin()));
create policy "faqs: leitura" on public.faqs for select using (visible or (select public.is_admin()));
create policy "testimonials: leitura" on public.testimonials
  for select using ((visible and authorized) or (select public.is_admin()));

-- Escrita: somente administradores.
do $$
declare t text;
begin
  foreach t in array array['media', 'site_settings', 'sections', 'event_types', 'features',
                           'steps', 'gallery_items', 'faqs', 'testimonials']
  loop
    execute format('create policy "%1$s: insert admin" on public.%1$I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "%1$s: update admin" on public.%1$I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "%1$s: delete admin" on public.%1$I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- site_settings e sections têm linhas fixas: impede inserir/apagar mesmo como admin.
drop policy "site_settings: insert admin" on public.site_settings;
drop policy "site_settings: delete admin" on public.site_settings;
drop policy "sections: insert admin" on public.sections;
drop policy "sections: delete admin" on public.sections;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública é feita pela URL pública do bucket; listar/remover via API exige SELECT.
create policy "media bucket: select admin" on storage.objects
  for select to authenticated using (bucket_id = 'media' and (select public.is_admin()));
create policy "media bucket: upload admin" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and (select public.is_admin()));
create policy "media bucket: update admin" on storage.objects
  for update to authenticated using (bucket_id = 'media' and (select public.is_admin()));
create policy "media bucket: delete admin" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and (select public.is_admin()));
