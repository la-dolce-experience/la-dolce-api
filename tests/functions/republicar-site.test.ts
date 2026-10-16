import { COOLDOWN_MS, handle, isValidHook, type Deps } from '../../supabase/functions/republicar-site/handler.ts';

const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_abc/xyz';
const ORIGIN = 'https://la-dolce-app.vercel.app';
const NOW = new Date('2026-10-17T12:00:00Z');

function setup(overrides: Partial<Deps> = {}) {
  const recorded: Parameters<Deps['record']>[0][] = [];
  const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
  const deps: Deps = {
    hookUrl: HOOK,
    allowInsecureHook: false,
    allowedOrigins: [ORIGIN],
    getCaller: async (auth) =>
      auth === 'Bearer admin'
        ? { id: 'u1', isAdmin: true }
        : auth === 'Bearer user'
          ? { id: 'u2', isAdmin: false }
          : null,
    lastSuccessAt: async () => null,
    record: async (entry) => void recorded.push(entry),
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
    ...overrides,
  };
  return { deps, recorded, fetchMock };
}

const post = (auth?: string) =>
  new Request('http://x/republicar-site', {
    method: 'POST',
    headers: { origin: ORIGIN, ...(auth ? { authorization: auth } : {}) },
  });

describe('republicar-site', () => {
  it('responde ao preflight de CORS só para a origem do site', async () => {
    const { deps } = setup();
    const ok = await handle(new Request('http://x', { method: 'OPTIONS', headers: { origin: ORIGIN } }), deps);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const other = await handle(
      new Request('http://x', { method: 'OPTIONS', headers: { origin: 'https://malicioso.com' } }),
      deps,
    );
    expect(other.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('exige login e permissão de administrador', async () => {
    const { deps, fetchMock } = setup();
    expect((await handle(post(), deps)).status).toBe(401);
    expect((await handle(post('Bearer user'), deps)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('avisa quando o Deploy Hook não está configurado ou é inválido', async () => {
    expect((await handle(post('Bearer admin'), setup({ hookUrl: '' }).deps)).status).toBe(503);
    const invalid = await handle(post('Bearer admin'), setup({ hookUrl: 'https://exemplo.com/hook' }).deps);
    expect(await invalid.json()).toEqual({ error: 'hook_invalido' });
  });

  it('aciona a Vercel, registra o pedido e responde 202', async () => {
    const { deps, recorded, fetchMock } = setup();
    const res = await handle(post('Bearer admin'), deps);
    expect(res.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledWith(HOOK, { method: 'POST' });
    expect(recorded).toEqual([{ requestedBy: 'u1', ok: true, detail: 'Republicação iniciada na Vercel.' }]);
  });

  it('respeita o intervalo mínimo entre republicações', async () => {
    const recent = new Date(NOW.getTime() - 60_000);
    const { deps, fetchMock } = setup({ lastSuccessAt: async () => recent });
    const res = await handle(post('Bearer admin'), deps);
    expect(res.status).toBe(429);
    expect((await res.json()).retry_after_seconds).toBe((COOLDOWN_MS - 60_000) / 1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registra a falha quando a Vercel recusa ou está fora do ar', async () => {
    const refused = setup({ fetch: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch });
    expect((await handle(post('Bearer admin'), refused.deps)).status).toBe(502);
    expect(refused.recorded[0]).toMatchObject({ ok: false, detail: 'A Vercel respondeu 404.' });

    const down = setup({
      fetch: (async () => {
        throw new Error('timeout');
      }) as unknown as typeof fetch,
    });
    expect((await handle(post('Bearer admin'), down.deps)).status).toBe(502);
    expect(down.recorded[0].detail).toContain('timeout');
  });

  it('só aceita hooks https da Vercel (http apenas em testes locais)', () => {
    expect(isValidHook(HOOK, false)).toBe(true);
    expect(isValidHook('https://evil.com/x', false)).toBe(false);
    expect(isValidHook('http://host.docker.internal:9999/hook', false)).toBe(false);
    expect(isValidHook('http://host.docker.internal:9999/hook', true)).toBe(true);
    expect(isValidHook('não é url', true)).toBe(false);
  });
});
