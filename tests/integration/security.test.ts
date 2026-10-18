/**
 * Testes de integração contra o Supabase LOCAL (npm run db:start).
 * Verificam que a segurança é imposta pelo banco (RLS/constraints), não só pelo frontend.
 * Executar: npm run db:start && npm run test:integration
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../types/database';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url?.includes('127.0.0.1') && !url?.includes('localhost')) {
  throw new Error('Os testes de integração só rodam contra o Supabase local.');
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient<Database>(url, serviceKey, opts);
const anon = createClient<Database>(url, anonKey, opts);
let admin: SupabaseClient<Database>;
let editor: SupabaseClient<Database>; // usuário autenticado SEM permissão de admin

const stamp = Date.now();
const adminEmail = `admin-${stamp}@teste.local`;
const editorEmail = `intruso-${stamp}@teste.local`;
const password = `Aa1-${crypto.randomUUID()}`; // gerada a cada execução
const createdUsers: string[] = [];
const createdTestimonials: string[] = [];

async function signedClient(email: string) {
  const client = createClient<Database>(url, anonKey, opts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  for (const email of [adminEmail, editorEmail]) {
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    createdUsers.push(data.user.id);
  }
  await service.from('admin_users').insert({ user_id: createdUsers[0] });
  admin = await signedClient(adminEmail);
  editor = await signedClient(editorEmail);
});

afterAll(async () => {
  if (createdTestimonials.length) await service.from('testimonials').delete().in('id', createdTestimonials);
  for (const id of createdUsers) await service.auth.admin.deleteUser(id);
});

describe('leitura pública', () => {
  it('visitante lê o conteúdo do site', async () => {
    const { data, error } = await anon.from('sections').select('key, title').eq('key', 'hero').single();
    expect(error).toBeNull();
    expect(data?.title).toBeTruthy();
  });

  it('visitante NÃO vê depoimentos sem autorização de uso, o admin vê', async () => {
    const { data: row } = await service
      .from('testimonials')
      .insert({ author: 'Teste', quote: 'Não autorizado', authorized: false })
      .select()
      .single();
    createdTestimonials.push(row!.id);
    const publicRows = await anon.from('testimonials').select('id').eq('id', row!.id);
    const adminRows = await admin.from('testimonials').select('id').eq('id', row!.id);
    expect(publicRows.data).toEqual([]);
    expect(adminRows.data).toHaveLength(1);
  });

  it('visitante não lista administradores', async () => {
    const { data } = await anon.from('admin_users').select('*');
    expect(data ?? []).toEqual([]);
  });
});

describe('escrita bloqueada para quem não é admin', () => {
  it.each([
    ['visitante', () => anon],
    ['usuário logado sem permissão', () => editor],
  ])('%s não altera seções', async (_label, client) => {
    const { data } = await client().from('sections').update({ title: 'HACK' }).eq('key', 'hero').select();
    expect(data ?? []).toEqual([]);
    const check = await service.from('sections').select('title').eq('key', 'hero').single();
    expect(check.data?.title).not.toBe('HACK');
  });

  it.each([
    ['visitante', () => anon],
    ['usuário logado sem permissão', () => editor],
  ])('%s não insere itens', async (_label, client) => {
    const { error } = await client().from('faqs').insert({ question: 'Spam?', answer: 'Spam' });
    expect(error?.code).toBe('42501');
  });

  it('usuário sem permissão não altera o WhatsApp', async () => {
    const { data } = await editor
      .from('site_settings')
      .update({ whatsapp_number: '5511000000000' })
      .eq('id', 1)
      .select();
    expect(data ?? []).toEqual([]);
  });

  it('usuário sem permissão não envia arquivos ao Storage', async () => {
    const { error } = await editor.storage
      .from('media')
      .upload(`uploads/intruso-${stamp}.webp`, new Blob(['x'], { type: 'image/webp' }), { contentType: 'image/webp' });
    expect(error).not.toBeNull();
  });

  it('cadastro público de usuários está desabilitado', async () => {
    const { error } = await anon.auth.signUp({ email: `novo-${stamp}@teste.local`, password });
    expect(error).not.toBeNull();
  });
});

describe('administrador', () => {
  it('altera conteúdo e a alteração fica visível ao público', async () => {
    const original = (await anon.from('sections').select('body').eq('key', 'quote').single()).data!.body;
    const updated = await admin
      .from('sections')
      .update({ body: `${original} [teste]` })
      .eq('key', 'quote')
      .select();
    expect(updated.error).toBeNull();
    expect((await anon.from('sections').select('body').eq('key', 'quote').single()).data?.body).toBe(
      `${original} [teste]`,
    );
    await admin.from('sections').update({ body: original }).eq('key', 'quote');
  });

  it('não consegue apagar seções fixas nem a configuração', async () => {
    await admin.from('sections').delete().eq('key', 'hero');
    await admin.from('site_settings').delete().eq('id', 1);
    expect((await anon.from('sections').select('key').eq('key', 'hero')).data).toHaveLength(1);
    expect((await anon.from('site_settings').select('id')).data).toHaveLength(1);
  });

  it('o banco rejeita dados inválidos mesmo vindos do admin', async () => {
    const badNumber = await admin.from('site_settings').update({ whatsapp_number: 'abc' }).eq('id', 1);
    const badUrl = await admin.from('site_settings').update({ instagram_url: 'javascript:alert(1)' }).eq('id', 1);
    const badSection = await admin.from('sections').insert({ key: 'inventada' });
    expect(badNumber.error?.code).toBe('23514');
    expect(badUrl.error?.code).toBe('23514');
    expect(badSection.error).not.toBeNull();
  });

  it('envia e remove imagens do Storage; tipos não permitidos são recusados', async () => {
    const path = `uploads/teste-${stamp}.webp`;
    const ok = await admin.storage.from('media').upload(path, new Blob(['webp'], { type: 'image/webp' }), {
      contentType: 'image/webp',
    });
    expect(ok.error).toBeNull();
    const svg = await admin.storage
      .from('media')
      .upload(`uploads/teste-${stamp}.svg`, new Blob(['<svg/>'], { type: 'image/svg+xml' }), {
        contentType: 'image/svg+xml',
      });
    expect(svg.error).not.toBeNull();
    const removed = await admin.storage.from('media').remove([path]);
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);
  });
});

describe('métricas de visitas e cliques', () => {
  it('visitante registra eventos, mas não lê a tabela nem o resumo', async () => {
    expect((await anon.rpc('track_event', { p_kind: 'visit' })).error).toBeNull();
    expect((await anon.rpc('track_event', { p_kind: 'whatsapp_click', p_source: 'botao_flutuante' })).error).toBeNull();
    expect((await anon.from('site_events').select('*')).data ?? []).toEqual([]);
    expect((await anon.rpc('events_summary', { p_days: 30 })).error).not.toBeNull();
    expect((await editor.rpc('events_summary', { p_days: 30 })).error?.code).toBe('42501');
  });

  it('o banco recusa tipos e origens inválidos', async () => {
    expect((await anon.rpc('track_event', { p_kind: 'compra' })).error?.code).toBe('23514');
    expect((await anon.rpc('track_event', { p_kind: 'visit', p_source: '<script>' })).error?.code).toBe('23514');
  });

  it('admin vê o resumo por dia, tipo e origem', async () => {
    const { data, error } = await admin.rpc('events_summary', { p_days: 30 });
    expect(error).toBeNull();
    const clicks = data!.filter((r) => r.kind === 'whatsapp_click' && r.source === 'botao_flutuante');
    expect(clicks.reduce((sum, r) => sum + Number(r.total), 0)).toBeGreaterThanOrEqual(1);
  });
});

describe('lixeira', () => {
  it('item excluído vai para a lixeira e pode ser restaurado', async () => {
    const { data: faq } = await admin
      .from('faqs')
      .insert({ question: `Lixeira ${stamp}?`, answer: 'Teste', visible: false })
      .select()
      .single();
    expect((await admin.from('faqs').delete().eq('id', faq!.id)).error).toBeNull();

    const { data: trashed } = await admin.from('trash').select('*').eq('row_data->>id', faq!.id).single();
    expect(trashed!.table_name).toBe('faqs');
    expect(trashed!.label).toBe(`Lixeira ${stamp}?`);

    expect((await admin.rpc('restore_from_trash', { p_id: trashed!.id })).error).toBeNull();
    const { data: restored } = await admin.from('faqs').select('*').eq('id', faq!.id).single();
    expect(restored!.question).toBe(`Lixeira ${stamp}?`);
    expect((await admin.from('trash').select('id').eq('id', trashed!.id)).data).toEqual([]);

    await service.from('faqs').delete().eq('id', faq!.id);
    await service.from('trash').delete().eq('row_data->>id', faq!.id);
  });

  it('visitante e usuário sem permissão não veem nem restauram a lixeira', async () => {
    const { data: faq } = await service
      .from('faqs')
      .insert({ question: `Lixeira 2 ${stamp}?`, answer: 'Teste', visible: false })
      .select()
      .single();
    await service.from('faqs').delete().eq('id', faq!.id);
    const { data: trashed } = await service.from('trash').select('id').eq('row_data->>id', faq!.id).single();

    for (const client of [anon, editor]) {
      expect((await client.from('trash').select('*')).data ?? []).toEqual([]);
      expect((await client.rpc('restore_from_trash', { p_id: trashed!.id })).error).not.toBeNull();
    }
    expect((await service.from('faqs').select('id').eq('id', faq!.id)).data).toEqual([]);
    await service.from('trash').delete().eq('id', trashed!.id);
  });
});

describe('restauração da cópia de segurança', () => {
  const tables = [
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
  ] as const;

  async function panelBackup() {
    const dados: Record<string, Json[]> = {};
    for (const t of tables) dados[t] = (await service.from(t).select('*')).data as Json[];
    return { formato: 'la-dolce-backup', versao: 1, geradoEm: new Date().toISOString(), observacao: '', dados };
  }

  it('só a service_role restaura; admin, usuário sem permissão e visitante não', async () => {
    const backup = await panelBackup();
    for (const client of [anon, editor, admin]) {
      const { error } = await client.rpc('restore_backup', { p_backup: backup });
      expect(error).not.toBeNull();
    }
  });

  it('recusa arquivos que não são a cópia baixada no painel', async () => {
    const backup = await panelBackup();
    for (const p_backup of [
      { ...backup, formato: 'outro' },
      { ...backup, versao: 2 },
      { ...backup, dados: {} },
    ]) {
      const { error } = await service.rpc('restore_backup', { p_backup });
      expect(error?.code).toBe('22023');
    }
  });

  it('volta o conteúdo para a cópia; o que não estava nela vai para a lixeira', async () => {
    const backup = await panelBackup();
    const { data: settings } = await service.from('site_settings').select('business_name').single();
    await service
      .from('site_settings')
      .update({ business_name: `Alterado ${stamp}` })
      .eq('id', 1);
    const { data: faq } = await service
      .from('faqs')
      .insert({ question: `Depois da cópia ${stamp}?`, answer: 'Teste', visible: false })
      .select()
      .single();

    const trashBefore = new Set((await service.from('trash').select('id')).data!.map((r) => r.id));

    const { error } = await service.rpc('restore_backup', { p_backup: backup });
    expect(error).toBeNull();
    expect((await service.from('site_settings').select('business_name').single()).data).toEqual(settings);
    expect((await service.from('faqs').select('id').eq('id', faq!.id)).data).toEqual([]);

    // Os itens que a cópia trouxe de volta não ficam duplicados na lixeira.
    const { data: trash } = await service.from('trash').select('id, row_data');
    const added = trash!.filter((r) => !trashBefore.has(r.id));
    expect(added.map((r) => (r.row_data as { id: string }).id)).toEqual([faq!.id]);
    await service.from('trash').delete().eq('id', added[0].id);
  });
});

describe('pedidos de republicação do site', () => {
  it('só administradores leem; ninguém grava pela API', async () => {
    expect((await anon.from('deploy_requests').select('*')).data ?? []).toEqual([]);
    expect((await editor.from('deploy_requests').select('*')).data ?? []).toEqual([]);
    expect((await admin.from('deploy_requests').select('*')).error).toBeNull();
    const insert = await admin.from('deploy_requests').insert({ ok: true });
    expect(insert.error?.code).toBe('42501');
  });
});

describe('republicação automática', () => {
  const changedAt = async () =>
    (await service.from('site_publish_state').select('content_changed_at').single()).data!.content_changed_at;
  const decision = async (at: Date) => (await service.rpc('site_publish_decision', { p_now: at.toISOString() })).data;
  const createdRequests: number[] = [];

  afterAll(async () => {
    if (createdRequests.length) await service.from('deploy_requests').delete().in('id', createdRequests);
  });

  it('alterar o conteúdo marca o site como desatualizado; visitas não', async () => {
    const before = await changedAt();
    await anon.rpc('track_event', { p_kind: 'visit' });
    expect(await changedAt()).toBe(before);

    const { data: hero } = await admin.from('sections').select('title').eq('key', 'hero').single();
    expect((await admin.from('sections').update({ title: hero!.title }).eq('key', 'hero')).error).toBeNull();
    const after = await changedAt();
    expect(new Date(after!).getTime()).toBeGreaterThan(new Date(before ?? 0).getTime());
  });

  it('espera 2 minutos sem edições e respeita 5 minutos entre publicações', async () => {
    const changed = new Date((await changedAt())!);
    const minutes = (n: number) => new Date(changed.getTime() + n * 60_000);
    const { data: last } = await service
      .from('deploy_requests')
      .select('requested_at')
      .eq('ok', true)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAt = last ? new Date(last.requested_at).getTime() : 0;

    expect(await decision(minutes(1))).toBe('aguardando');
    if (lastAt < minutes(3).getTime() - 5 * 60_000) expect(await decision(minutes(3))).toBe('publicar');

    // Uma publicação feita há pouco (antes desta alteração) segura a próxima pelo intervalo.
    const { data: recent } = await service
      .from('deploy_requests')
      .insert({ ok: true, detail: 'teste', requested_at: minutes(-1).toISOString() })
      .select('id')
      .single();
    createdRequests.push(recent!.id);
    expect(await decision(minutes(3))).toBe('intervalo');

    // Publicação posterior à alteração: o site está em dia.
    const { data: covering } = await service
      .from('deploy_requests')
      .insert({ ok: true, detail: 'teste', requested_at: minutes(0.5).toISOString() })
      .select('id')
      .single();
    createdRequests.push(covering!.id);
    expect(await decision(minutes(10))).toBe('em_dia');
  });

  it('o Deploy Hook só é lido ou gravado pelo servidor, e precisa ser da Vercel', async () => {
    for (const client of [anon, editor, admin]) {
      expect((await client.rpc('deploy_hook_url')).error).not.toBeNull();
      expect((await client.rpc('set_deploy_hook_url', { p_url: 'https://api.vercel.com/x' })).error).not.toBeNull();
      expect((await client.rpc('site_publish_decision', {})).error).not.toBeNull();
    }
    expect((await admin.from('site_publish_state').select('content_changed_at')).error).toBeNull();
    expect((await service.rpc('set_deploy_hook_url', { p_url: 'https://exemplo.com/hook' })).error?.code).toBe('22023');
  });
});

describe('fotos do evento nos depoimentos', () => {
  const station = '00000000-0000-4000-a000-000000000001';

  it('aceita até 5 fotos da biblioteca; recusa mais que isso e fotos inexistentes', async () => {
    const ok = await admin
      .from('testimonials')
      .insert({ author: 'Teste fotos', quote: 'x', photo_media_ids: [station, station] })
      .select()
      .single();
    expect(ok.error).toBeNull();
    createdTestimonials.push(ok.data!.id);
    expect(ok.data!.photo_media_ids).toEqual([station, station]);

    const tooMany = await admin
      .from('testimonials')
      .insert({ author: 'x', quote: 'x', photo_media_ids: Array(6).fill(station) });
    expect(tooMany.error?.code).toBe('23514');

    const missing = await admin
      .from('testimonials')
      .insert({ author: 'x', quote: 'x', photo_media_ids: [crypto.randomUUID()] });
    expect(missing.error?.code).toBe('23503');
  });

  it('ao excluir uma imagem da biblioteca, ela sai das fotos do depoimento', async () => {
    const { data: media } = await service
      .from('media')
      .insert({ src_lg: 'teste/a.webp', src_sm: 'teste/a.webp', width_lg: 1, height_lg: 1, width_sm: 1, height_sm: 1 })
      .select()
      .single();
    const { data: row } = await service
      .from('testimonials')
      .insert({ author: 'Teste exclusão', quote: 'x', photo_media_ids: [media!.id, station] })
      .select()
      .single();
    createdTestimonials.push(row!.id);

    await service.from('media').delete().eq('id', media!.id);
    const { data } = await service.from('testimonials').select('photo_media_ids').eq('id', row!.id).single();
    expect(data!.photo_media_ids).toEqual([station]);
  });
});
