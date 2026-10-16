// Lógica da função "republicar-site", sem dependências do Deno: testada com Vitest em tests/functions.
//
// Republica o site na Vercel (Deploy Hook) para atualizar o SEO gravado no HTML,
// que WhatsApp, Facebook e Google leem sem executar JavaScript.

/** Intervalo mínimo entre republicações: cada uma gasta minutos de build na Vercel. */
export const COOLDOWN_MS = 5 * 60 * 1000;

export interface Deps {
  /** URL do Deploy Hook da Vercel (secret da função). Vazia = não configurado. */
  hookUrl: string;
  /** Permite http:// no hook, só para testes locais. */
  allowInsecureHook: boolean;
  /** Origens do site autorizadas a chamar a função (CORS). */
  allowedOrigins: string[];
  /** Usuário logado e se é administrador, a partir do token da requisição. */
  getCaller: (authorization: string) => Promise<{ id: string; isAdmin: boolean } | null>;
  /** Data do último pedido bem-sucedido. */
  lastSuccessAt: () => Promise<Date | null>;
  /** Registra o pedido em deploy_requests. */
  record: (entry: { requestedBy: string; ok: boolean; detail: string }) => Promise<void>;
  fetch: typeof fetch;
  now: () => Date;
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const allow = origin && allowed.includes(origin) ? origin : (allowed[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function isValidHook(url: string, allowInsecure: boolean): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return parsed.hostname === 'api.vercel.com';
    return allowInsecure && parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(req.headers.get('origin'), deps.allowedOrigins);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'metodo_nao_permitido' });

  const caller = await deps.getCaller(req.headers.get('authorization') ?? '');
  if (!caller) return json(401, { error: 'nao_autenticado' });
  if (!caller.isAdmin) return json(403, { error: 'acesso_negado' });

  if (!deps.hookUrl) return json(503, { error: 'nao_configurado' });
  if (!isValidHook(deps.hookUrl, deps.allowInsecureHook)) return json(503, { error: 'hook_invalido' });

  const last = await deps.lastSuccessAt();
  const wait = last ? COOLDOWN_MS - (deps.now().getTime() - last.getTime()) : 0;
  if (wait > 0) return json(429, { error: 'aguarde', retry_after_seconds: Math.ceil(wait / 1000) });

  let ok = false;
  let detail = '';
  try {
    const res = await deps.fetch(deps.hookUrl, { method: 'POST' });
    ok = res.ok;
    detail = ok ? 'Republicação iniciada na Vercel.' : `A Vercel respondeu ${res.status}.`;
  } catch (e) {
    detail = `Falha ao contatar a Vercel: ${(e as Error).message}`.slice(0, 300);
  }
  await deps.record({ requestedBy: caller.id, ok, detail });
  return ok ? json(202, { ok: true }) : json(502, { error: 'falha_na_vercel', detail });
}
