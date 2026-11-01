-- =====================================================================
-- Recorte de imagens no painel.
--
-- O painel recorta a foto no navegador e envia o recorte como uma imagem NOVA (mesmas variantes
-- lg/sm do envio normal). A imagem original continua na biblioteca. Para "Ajustar recorte" de novo,
-- o painel parte sempre da original (source_media_id), nunca de um recorte anterior, e reabre o editor
-- com a mesma área (crop).
--
-- Compatibilidade: colunas opcionais. Cópias de segurança antigas (sem as colunas) restauram com null.
-- =====================================================================

alter table public.media
  add column source_media_id uuid references public.media (id) on delete set null,
  add column crop jsonb check (
    crop is null or (jsonb_typeof(crop) = 'object' and pg_column_size(crop) <= 500)),
  add constraint media_source_not_self check (source_media_id is distinct from id);

create index on public.media (source_media_id);

comment on column public.media.source_media_id is
  'Imagem original de um recorte feito no painel. Null = a imagem é uma original. Excluir a original não exclui o recorte.';
comment on column public.media.crop is
  'Área do recorte na original, em % (x, y, width, height) e a proporção usada (aspect). Só para reabrir o editor.';
