// Grava o Deploy Hook da Vercel no Vault do Supabase. É lido pela republicação automática (pg_cron) e pelo
// botão "Atualizar prévia do link" (Edge Function republicar-site).
//
// Uso:
//   npm run deploy-hook:set -- --url https://api.vercel.com/v1/integrations/deploy/...
//
// Requer em .env.local (NUNCA versionar):
//   SUPABASE_URL=...                 URL do projeto
//   SUPABASE_SERVICE_ROLE_KEY=...    chave secreta (Project Settings > API)
//
// A URL dispara deploys: não a cole em conversas nem a versione.
import { createClient } from '@supabase/supabase-js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const hook = arg('url')?.trim();
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!hook?.startsWith('https://api.vercel.com/')) {
  console.error('Informe o Deploy Hook da Vercel: npm run deploy-hook:set -- --url https://api.vercel.com/...');
  process.exit(1);
}
if (!url || !serviceKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.');
  process.exit(1);
}

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await service.rpc('set_deploy_hook_url', { p_url: hook });
if (error) {
  console.error('Não foi possível gravar o Deploy Hook:', error.message);
  process.exit(1);
}
console.log(`Deploy Hook gravado no Vault de ${new URL(url).host}.`);
console.log('O site passa a ser republicado sozinho cerca de 2 minutos depois de cada alteração salva no painel.');
