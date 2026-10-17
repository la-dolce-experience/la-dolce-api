// Volta o conteúdo do site para uma cópia de segurança baixada no painel
// (Lixeira e backup > "Baixar cópia do conteúdo", arquivo la-dolce-conteudo-AAAA-MM-DD.json).
// Só aceita esse arquivo: formato "la-dolce-backup", versão 1.
//
// Uso:
//   npm run backup:restore -- --file caminho/la-dolce-conteudo-2026-10-17.json             confere e mostra o que muda
//   npm run backup:restore -- --file caminho/la-dolce-conteudo-2026-10-17.json --confirm   restaura
//
// Requer em .env.local (NUNCA versionar):
//   SUPABASE_URL=...                 URL do projeto que será restaurado
//   SUPABASE_SERVICE_ROLE_KEY=...    chave secreta (Project Settings > API)
//
// Antes de restaurar, o conteúdo atual é salvo ao lado do arquivo informado
// (la-dolce-conteudo-antes-da-restauracao-*.json), no mesmo formato: dá para desfazer
// restaurando esse arquivo. Itens das listas que não estão na cópia vão para a Lixeira do painel.
// Os arquivos de imagem não fazem parte da cópia: se algum foi apagado do Storage, o script avisa.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TABLES = [
  'site_settings',
  'sections',
  'event_types',
  'features',
  'flavor_items',
  'steps',
  'gallery_items',
  'faqs',
  'testimonials',
  'media',
];
const LABELS = {
  site_settings: 'Configurações',
  sections: 'Seções',
  event_types: 'Tipos de evento',
  features: 'Diferenciais',
  flavor_items: 'Sabores e apresentações',
  steps: 'Como funciona',
  gallery_items: 'Galeria',
  faqs: 'Perguntas frequentes',
  testimonials: 'Depoimentos',
  media: 'Imagens (referências)',
};
const MEDIA_BUCKET = 'media';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const file = arg('file');
const confirm = process.argv.includes('--confirm');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!file)
  fail('Informe o arquivo baixado no painel: npm run backup:restore -- --file la-dolce-conteudo-AAAA-MM-DD.json');
if (!url || !serviceKey) fail('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.');

// ---------- O arquivo é uma cópia baixada no painel? ----------
let backup;
try {
  backup = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  fail(`Não foi possível ler "${file}" como JSON: ${e.message}`);
}
const notPanelBackup =
  'O arquivo não é uma cópia de segurança baixada no painel (Lixeira e backup > Baixar cópia do conteúdo).';
if (backup?.formato !== 'la-dolce-backup') fail(notPanelBackup);
if (backup.versao !== 1) fail(`Versão de cópia não suportada: ${backup.versao}. Este script restaura a versão 1.`);
const generatedAt = new Date(backup.geradoEm);
if (Number.isNaN(generatedAt.getTime())) fail(`${notPanelBackup} (data "geradoEm" ausente ou inválida)`);
for (const t of TABLES) {
  if (!Array.isArray(backup.dados?.[t])) fail(`${notPanelBackup} (falta a lista "${t}")`);
}
if (backup.dados.site_settings.length !== 1 || backup.dados.sections.length === 0) {
  fail(`${notPanelBackup} (sem configurações ou seções)`);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Conteúdo atual no mesmo formato do painel (adminService.exportContent). */
async function exportCurrent() {
  const order = { sections: ['key'], flavor_items: ['kind', 'position'], media: ['created_at'], site_settings: [] };
  const dados = {};
  for (const t of TABLES) {
    let query = db.from(t).select('*');
    for (const column of order[t] ?? ['position']) query = query.order(column);
    const { data, error } = await query;
    if (error) fail(`Não foi possível ler "${t}" do banco: ${error.message}`);
    dados[t] = data;
  }
  return {
    formato: 'la-dolce-backup',
    versao: 1,
    geradoEm: new Date().toISOString(),
    observacao:
      'Cópia dos textos, contatos, listas e referências das imagens. Os arquivos de imagem ficam no Storage do Supabase (bucket "media").',
    dados,
  };
}

/** Arquivos de imagem do Storage citados na cópia que não existem mais. "/images/..." são do próprio site. */
async function missingImages() {
  const paths = [...new Set(backup.dados.media.flatMap((m) => [m.src_lg, m.src_sm]))].filter(
    (p) => typeof p === 'string' && !p.startsWith('/'),
  );
  const checks = await Promise.all(
    paths.map(async (p) => {
      const { data } = db.storage.from(MEDIA_BUCKET).getPublicUrl(p);
      const response = await fetch(data.publicUrl, { method: 'HEAD' }).catch(() => null);
      return response?.ok ? null : p;
    }),
  );
  return checks.filter(Boolean);
}

// ---------- Resumo ----------
const current = await exportCurrent();
const when = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
}).format(generatedAt);

console.log(`\nProjeto: ${new URL(url).host}`);
console.log(`Cópia:   ${path.resolve(file)} (baixada em ${when})\n`);
console.table(
  Object.fromEntries(
    TABLES.map((t) => [LABELS[t], { 'Hoje no site': current.dados[t].length, 'Na cópia': backup.dados[t].length }]),
  ),
);

const missing = await missingImages();
if (missing.length) {
  console.warn(`\nAtenção: ${missing.length} arquivo(s) de imagem da cópia não existem mais no Storage.`);
  console.warn('Os itens que usam essas imagens voltam, mas a foto aparecerá quebrada até ser trocada no painel:');
  for (const p of missing) console.warn(`  - ${p}`);
}

if (!confirm) {
  console.log('\nNada foi alterado. Para restaurar, rode de novo com --confirm.');
  process.exit(0);
}

// ---------- Restauração ----------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const safetyFile = path.join(path.dirname(path.resolve(file)), `la-dolce-conteudo-antes-da-restauracao-${stamp}.json`);
writeFileSync(safetyFile, JSON.stringify(current, null, 2));
console.log(`\nConteúdo atual salvo em ${safetyFile}`);

const { data: restored, error } = await db.rpc('restore_backup', { p_backup: backup });
if (error) fail(`\nA restauração falhou e nada foi alterado: ${error.message}`);

console.log('\nConteúdo restaurado:');
for (const t of TABLES) console.log(`  ${LABELS[t]}: ${restored[t] ?? 0}`);
console.log('\nItens das listas que não estavam na cópia foram para a Lixeira do painel (30 dias).');
console.log(
  'No painel, use "Atualizar prévia do link" para o título e a imagem de compartilhamento acompanharem a cópia.\n',
);
