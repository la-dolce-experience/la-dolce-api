// Edge Function "republicar-site": chamada pelo painel (Google e compartilhamento → Atualizar prévia).
// Secrets: VERCEL_DEPLOY_HOOK_URL (Vercel → Settings → Git → Deploy Hooks) e SITE_ORIGINS
// (origens do site separadas por vírgula, ex.: https://la-dolce-app.vercel.app).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handle } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const local = SUPABASE_URL.startsWith('http://kong') || SUPABASE_URL.includes('127.0.0.1');

const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve((req) =>
  handle(req, {
    hookUrl: Deno.env.get('VERCEL_DEPLOY_HOOK_URL') ?? '',
    allowInsecureHook: local,
    allowedOrigins: (Deno.env.get('SITE_ORIGINS') ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    async getCaller(authorization) {
      if (!authorization.startsWith('Bearer ')) return null;
      const user = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authorization } },
      });
      const { data } = await user.auth.getUser();
      if (!data.user) return null;
      const { data: isAdmin } = await user.rpc('is_admin');
      return { id: data.user.id, isAdmin: isAdmin === true };
    },
    async lastSuccessAt() {
      const { data } = await service
        .from('deploy_requests')
        .select('requested_at')
        .eq('ok', true)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? new Date(data.requested_at) : null;
    },
    async record({ requestedBy, ok, detail }) {
      await service.from('deploy_requests').insert({ requested_by: requestedBy, ok, detail });
    },
    fetch,
    now: () => new Date(),
  }),
);
