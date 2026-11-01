// Aplica o conteúdo pedido no feedback da cliente de 31/10/2026:
//   1. "Sabores e apresentação" vira carrossel com as fotos de produto que já estão na biblioteca;
//   2. cria a seção "Açaí" (fundo roxo açaí, botão do WhatsApp) entre o formulário e o atendimento.
//
// Uso:
//   npm run conteudo:feedback              confere e mostra o que muda (nada é alterado)
//   npm run conteudo:feedback -- --confirm aplica
//
// Requer em .env.local (NUNCA versionar):
//   SUPABASE_URL=...                 URL do projeto
//   SUPABASE_SERVICE_ROLE_KEY=...    chave secreta (Project Settings > API)
//
// Idempotente: pode rodar de novo sem duplicar nada. Os itens do carrossel e a seção de açaí têm ids fixos.
// Não sobrescreve o que a cliente já editou: a seção de açaí só é criada se ainda não existir, e as fotos
// do carrossel que ela excluiu (ou que não existem na biblioteca deste projeto) são puladas com aviso.
// Requer a versão do app com carrossel e cor de fundo (PR "feedback-cliente-carrossel-acai") publicada.
import { createClient } from '@supabase/supabase-js';

const confirm = process.argv.includes('--confirm');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!url || !serviceKey) fail('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.');

// Ids fixos das seções (migração 20261023120000_secoes_ordenaveis e seed).
const SABORES = '00000000-0000-4000-b000-000000000004';
const FORMULARIO = '00000000-0000-4000-b000-000000000011';
const ACAI = '00000000-0000-4000-b000-000000000014';

// Foto principal de "Sabores e apresentação" (seed): primeira do carrossel.
const COPINHO = '00000000-0000-4000-a000-000000000002';
const COPINHO_ALT = 'Sorvete soft no copinho vermelho La Dolce Soft com cereais coloridos e biscoito';

// Fotos do carrossel, na ordem. As 5 imagens enviadas pelo painel têm os mesmos ids em todos os projetos
// restaurados da cópia la-dolce-conteudo-2026-10-31.json. Textos alternativos: o que aparece na foto.
const CARROSSEL = [
  {
    id: '00000000-0000-4000-c000-000000000001',
    media_id: '00000000-0000-4000-a000-000000000003',
    alt: 'Casquinha com sorvete soft de morango',
  },
  {
    id: '00000000-0000-4000-c000-000000000002',
    media_id: '6cab6512-545c-4b3a-903c-e67a4776692a',
    alt: 'Milkshake no copo La Dolce Soft com calda de chocolate e confeitos coloridos por cima',
  },
  {
    id: '00000000-0000-4000-c000-000000000003',
    media_id: '43ac04a2-4327-415d-8d69-0be354800e88',
    alt: 'Sundae no copinho vermelho La Dolce Soft com calda de morango e biscoito',
  },
  {
    id: '00000000-0000-4000-c000-000000000004',
    media_id: 'cf8dd7e9-3043-4fd5-9a21-ac9c9cf95be1',
    alt: 'Casquinha e copinhos La Dolce Soft com sorvete de baunilha em cenário rosa',
  },
  {
    id: '00000000-0000-4000-c000-000000000005',
    media_id: 'a9d5a7af-f141-459e-a824-d48ab30f7194',
    alt: 'Copinho laranja personalizado com a marca Natura e sorvete soft de chocolate',
  },
];

// Seção de açaí: texto genérico, sem sabores, preços ou quantidades (a cliente completa no painel).
const SECAO_ACAI = {
  id: ACAI,
  type: 'texto_imagem',
  slug: 'acai',
  name: 'Açaí',
  icon: 'ice-cream-bowl',
  nav_label: '',
  eyebrow: 'Açaí',
  title: 'Açaí para o seu evento',
  body: 'Quer servir açaí na sua festa ou no evento da sua empresa? Chame a gente no WhatsApp, conte a data e o tipo de evento e receba um orçamento.',
  cta_label: 'Pedir orçamento de açaí',
  options: { theme: 'acai', imagePosition: 'direita', imageFit: 'cortada', carouselSeconds: '5' },
  visible: true,
};

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function read(table, query) {
  const { data, error } = await query(db.from(table));
  if (error) fail(`Não foi possível ler "${table}": ${error.message}`);
  return data;
}

const sections = await read('sections', (q) => q.select('*').order('position'));
const sabores = sections.find((s) => s.id === SABORES);
const formulario = sections.find((s) => s.id === FORMULARIO) ?? sections.find((s) => s.type === 'formulario');
const mediaIds = new Set((await read('media', (q) => q.select('id'))).map((m) => m.id));
const items = await read('section_items', (q) => q.select('id, section_id, media_id').eq('section_id', SABORES));
const trashed = new Set(
  (await read('trash', (q) => q.select('row_data').eq('table_name', 'section_items'))).map((t) => t.row_data?.id),
);

const plan = [];
const warnings = [];

// ---------- 1. Carrossel de "Sabores e apresentação" ----------
if (!sabores) {
  warnings.push('A seção "Sabores e apresentação" não existe neste projeto: o carrossel não foi montado.');
} else {
  const options = { ...sabores.options, imageFit: sabores.options?.imageFit ?? 'inteira', carouselSeconds: '5' };
  const patch = {};
  if (JSON.stringify(options) !== JSON.stringify(sabores.options)) patch.options = options;
  if (sabores.image_media_id === COPINHO && sabores.image_alt !== COPINHO_ALT) patch.image_alt = COPINHO_ALT;
  if (Object.keys(patch).length)
    plan.push({ label: 'Sabores e apresentação: opções do carrossel', run: () => update('sections', SABORES, patch) });

  const existing = new Set(items.map((i) => i.id));
  const usedMedia = new Set(items.map((i) => i.media_id));
  const base = items.length;
  CARROSSEL.forEach((photo, index) => {
    if (existing.has(photo.id)) return;
    if (trashed.has(photo.id)) return warnings.push(`Foto "${photo.alt}" foi excluída no painel: não volta.`);
    if (!mediaIds.has(photo.media_id))
      return warnings.push(`Foto "${photo.alt}" não está na biblioteca deste projeto: pulada.`);
    if (usedMedia.has(photo.media_id)) return warnings.push(`Foto "${photo.alt}" já está no carrossel: pulada.`);
    plan.push({
      label: `Carrossel: + ${photo.alt}`,
      run: () => insert('section_items', { ...photo, section_id: SABORES, position: base + index, visible: true }),
    });
  });
}

// ---------- 2. Seção de açaí ----------
if (sections.some((s) => s.id === ACAI || s.slug === SECAO_ACAI.slug)) {
  warnings.push('A seção de açaí já existe: os textos dela não foram alterados.');
} else if (!formulario) {
  warnings.push('Não há formulário de orçamento neste projeto: a seção de açaí não foi criada.');
} else {
  const position = formulario.position + 1;
  const below = sections.filter((s) => s.position >= position);
  plan.push({
    label: `Seção "Açaí" logo abaixo de "${formulario.name}" (${below.length} seção(ões) descem uma posição)`,
    run: async () => {
      // De baixo para cima, para nunca haver duas seções na mesma posição no meio do caminho.
      for (const s of [...below].reverse()) await update('sections', s.id, { position: s.position + 1 });
      await insert('sections', { ...SECAO_ACAI, position });
    },
  });
}

async function update(table, id, patch) {
  const { error } = await db.from(table).update(patch).eq('id', id);
  if (error) fail(`Falha ao alterar "${table}" (${id}): ${error.message}`);
}

async function insert(table, row) {
  const { error } = await db.from(table).insert(row);
  if (error) fail(`Falha ao inserir em "${table}": ${error.message}`);
}

// ---------- Resumo ----------
console.log(`\nProjeto: ${new URL(url).host}\n`);
if (plan.length === 0) console.log('Nada a fazer: o conteúdo do feedback já está aplicado.');
else for (const step of plan) console.log(`  - ${step.label}`);
for (const w of warnings) console.warn(`  ! ${w}`);

if (!confirm) {
  if (plan.length) console.log('\nNada foi alterado. Para aplicar, rode de novo com --confirm.');
} else {
  for (const step of plan) await step.run();
  if (plan.length) {
    console.log('\nConteúdo aplicado. O site é republicado sozinho cerca de 2 minutos depois');
    console.log('(ou use "Atualizar prévia do link" no painel).\n');
  }
}
