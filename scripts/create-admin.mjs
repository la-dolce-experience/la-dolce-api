// Cria (ou promove) um administrador do painel.
//
// Uso:
//   npm run admin:create -- --email cliente@exemplo.com
//
// Requer em .env.local (NUNCA versionar):
//   SUPABASE_URL=...                 URL do projeto
//   SUPABASE_SERVICE_ROLE_KEY=...    chave secreta (Project Settings > API)
//
// A senha pode ser definida em ADMIN_PASSWORD; se ausente, uma senha forte é
// gerada e exibida uma única vez. Peça ao cliente para trocá-la no primeiro acesso
// (Painel > Minha conta) ou use "Esqueci minha senha".
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomInt } from 'node:crypto';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function generatePassword() {
  // 18 caracteres com maiúsculas, minúsculas e dígitos garantidos.
  const base = randomBytes(18).toString('base64url').replace(/[-_]/g, 'x');
  return `${base.slice(0, 15)}Aa${randomInt(10)}`;
}

const email = arg('email')?.trim().toLowerCase();
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Informe um e-mail válido: npm run admin:create -- --email cliente@exemplo.com');
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const providedPassword = process.env.ADMIN_PASSWORD;
const password = providedPassword || generatePassword();

// Procura usuário existente (paginação simples: projetos deste porte têm poucos usuários).
let userId;
for (let page = 1; !userId; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (data.users.length < 200) break;
}

let created = false;
if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    console.error('Não foi possível criar o usuário:', error.message);
    process.exit(1);
  }
  userId = data.user.id;
  created = true;
}

const { error: grantError } = await admin.from('admin_users').upsert({ user_id: userId });
if (grantError) {
  console.error('Usuário criado, mas falhou ao conceder acesso de administrador:', grantError.message);
  process.exit(1);
}

console.log(`\nAdministrador pronto: ${email}`);
if (created && !providedPassword) {
  console.log(`Senha temporária (exibida só agora): ${password}`);
  console.log('Oriente o cliente a trocar a senha em Painel > Minha conta.\n');
} else if (!created) {
  console.log('O usuário já existia; a senha não foi alterada.\n');
}
