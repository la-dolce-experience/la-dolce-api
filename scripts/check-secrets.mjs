// Verifica se algum segredo vazou para o repositório ou para o build público.
//
// Uso:
//   node scripts/check-secrets.mjs          arquivos versionados (git ls-files)
//   node scripts/check-secrets.mjs dist     também o build de produção
//
// O que é segredo aqui: a service_role / secret key do Supabase, chaves privadas,
// tokens de serviços e arquivos .env. A anon/publishable key é pública por
// definição (a segurança está nas políticas RLS) e por isso é permitida.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const checks = [
  { name: 'Secret key do Supabase', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'Chave privada', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Token do GitHub', re: /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/ },
  { name: 'Chave da AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Token da Vercel', re: /\bvercel_[A-Za-z0-9]{20,}/i },
  { name: 'Chave do Resend', re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  { name: 'Chave do Brevo', re: /\bxkeysib-[a-f0-9]{64}/ },
  { name: 'Valor de SUPABASE_SERVICE_ROLE_KEY', re: /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*['"]?[A-Za-z0-9_.-]{20,}/ },
];

const jwtRe = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;

/** JWTs com papel privilegiado (service_role) dão acesso total ao banco. */
function privilegedJwt(text) {
  for (const [, payload] of text.matchAll(jwtRe)) {
    try {
      const { role } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (role && role !== 'anon' && role !== 'authenticated') return role;
    } catch {
      // não é um JWT válido
    }
  }
  return null;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const binary = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|pdf)$/i;
const problems = [];

function scan(file) {
  if (binary.test(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const { name, re } of checks) if (re.test(text)) problems.push(`${file}: ${name}`);
  const role = privilegedJwt(text);
  if (role) problems.push(`${file}: JWT com papel "${role}"`);
}

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

for (const file of tracked) {
  if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith('.env.example'))
    problems.push(`${file}: arquivo .env versionado`);
  // O próprio verificador contém os padrões que procura.
  if (file === 'scripts/check-secrets.mjs') continue;
  // Arquivo versionado mas apagado ou renomeado na pasta de trabalho: não há o que ler.
  if (!existsSync(file)) continue;
  scan(file);
}

const extra = process.argv.slice(2);
for (const dir of extra) {
  if (!existsSync(dir)) {
    console.error(`Pasta "${dir}" não encontrada. Rode "npm run build" antes.`);
    process.exit(1);
  }
  const files = walk(dir);
  for (const file of files) scan(file);
  console.log(`${dir}/: ${files.length} arquivos verificados.`);
}

if (problems.length) {
  console.error(`\nPossíveis segredos expostos (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nRemova o segredo, troque a chave no serviço de origem e rode a verificação de novo.');
  process.exit(1);
}
console.log(`Nenhum segredo encontrado (${tracked.length} arquivos do repositório).`);
