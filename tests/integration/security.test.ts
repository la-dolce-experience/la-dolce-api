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
const createdSections: string[] = [];
const createdMedia: string[] = [];

// Seções do seed (la-dolce-data/seed/seed.sql), com os mesmos ids da migração 20261023120000_secoes_ordenaveis.
const HERO = '00000000-0000-4000-b000-000000000001';
const FORM = '00000000-0000-4000-b000-000000000011';
const FAQ = '00000000-0000-4000-b000-000000000013';
const TESTIMONIALS = '00000000-0000-4000-b000-000000000010';

async function signedClient(email: string) {
  const client = createClient<Database>(url, anonKey, opts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Seção temporária, criada pelo servidor e apagada no fim. */
async function tempSection(patch: Partial<Database['public']['Tables']['sections']['Insert']> = {}) {
  const { data, error } = await service
    .from('sections')
    .insert({
      type: 'texto_imagem',
      slug: `teste-${stamp}-${createdSections.length}`,
      name: 'Teste',
      position: 999,
      ...patch,
    })
    .select()
    .single();
  if (error) throw error;
  createdSections.push(data.id);
  return data;
}

async function tempMedia() {
  const { data, error } = await service
    .from('media')
    .insert({ src_lg: 'teste/a.webp', src_sm: 'teste/a.webp', width_lg: 1, height_lg: 1, width_sm: 1, height_sm: 1 })
    .select()
    .single();
  if (error) throw error;
  createdMedia.push(data.id);
  return data;
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
  if (createdSections.length) {
    await service.from('sections').delete().in('id', createdSections);
    await service.from('trash').delete().in('row_data->>id', createdSections);
    await service.from('trash').delete().in('row_data->>section_id', createdSections);
  }
  if (createdMedia.length) await service.from('media').delete().in('id', createdMedia);
  for (const id of createdUsers) await service.auth.admin.deleteUser(id);
});

describe('leitura pública', () => {
  it('visitante lê o conteúdo do site', async () => {
    const { data, error } = await anon.from('sections').select('type, title').eq('id', HERO).single();
    expect(error).toBeNull();
    expect(data?.title).toBeTruthy();
  });

  it('visitante NÃO vê seções ocultas nem depoimentos sem autorização; o admin vê', async () => {
    const hidden = await tempSection({ visible: false });
    const { data: item } = await service
      .from('section_items')
      .insert({ section_id: TESTIMONIALS, title: 'Teste', description: 'Não autorizado', authorized: false })
      .select()
      .single();
    expect((await anon.from('sections').select('id').eq('id', hidden.id)).data).toEqual([]);
    expect((await admin.from('sections').select('id').eq('id', hidden.id)).data).toHaveLength(1);
    expect((await anon.from('section_items').select('id').eq('id', item!.id)).data).toEqual([]);
    expect((await admin.from('section_items').select('id').eq('id', item!.id)).data).toHaveLength(1);
    await service.from('section_items').delete().eq('id', item!.id);
    await service.from('trash').delete().eq('row_data->>id', item!.id);
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
  ])('%s não altera, cria, reordena nem exclui seções', async (_label, client) => {
    const { data } = await client().from('sections').update({ title: 'HACK' }).eq('id', HERO).select();
    expect(data ?? []).toEqual([]);
    expect((await service.from('sections').select('title').eq('id', HERO).single()).data?.title).not.toBe('HACK');

    const insert = await client()
      .from('sections')
      .insert({ type: 'faq', slug: `hack-${stamp}`, name: 'Hack' });
    expect(insert.error?.code).toBe('42501');
    expect((await client().rpc('reorder_sections', { p_ids: [FAQ, HERO] })).error).not.toBeNull();
    expect(
      (
        await client().rpc('create_section', {
          p_section: { type: 'faq', slug: `hack2-${stamp}`, name: 'x' },
          p_position: 0,
        })
      ).error,
    ).not.toBeNull();
    await client().from('sections').delete().eq('id', FAQ);
    expect((await service.from('sections').select('id').eq('id', FAQ)).data).toHaveLength(1);
  });

  it.each([
    ['visitante', () => anon],
    ['usuário logado sem permissão', () => editor],
  ])('%s não insere itens', async (_label, client) => {
    const { error } = await client().from('section_items').insert({ section_id: FAQ, title: 'Spam?' });
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
    const original = (await anon.from('sections').select('body').eq('id', FORM).single()).data!.body;
    const updated = await admin
      .from('sections')
      .update({ body: `${original} [teste]` })
      .eq('id', FORM)
      .select();
    expect(updated.error).toBeNull();
    expect((await anon.from('sections').select('body').eq('id', FORM).single()).data?.body).toBe(`${original} [teste]`);
    await admin.from('sections').update({ body: original }).eq('id', FORM);
  });

  it('não consegue apagar a configuração do site', async () => {
    await admin.from('site_settings').delete().eq('id', 1);
    expect((await anon.from('site_settings').select('id')).data).toHaveLength(1);
  });

  it('o banco rejeita dados inválidos mesmo vindos do admin', async () => {
    const badNumber = await admin.from('site_settings').update({ whatsapp_number: 'abc' }).eq('id', 1);
    const badUrl = await admin.from('site_settings').update({ instagram_url: 'javascript:alert(1)' }).eq('id', 1);
    const badType = await admin.from('sections').insert({ type: 'inventado', slug: `x-${stamp}`, name: 'x' });
    const badSlug = await admin.from('sections').insert({ type: 'faq', slug: 'Com Espaço', name: 'x' });
    const reserved = await admin.from('sections').insert({ type: 'faq', slug: 'inicio', name: 'x' });
    const badOptions = await admin
      .from('sections')
      .update({ options: [1, 2] as unknown as never })
      .eq('id', FAQ);
    for (const r of [badNumber, badUrl, badType, badSlug, reserved, badOptions]) expect(r.error?.code).toBe('23514');
  });

  it('só pode haver um destaque, um formulário e um bloco de atendimento; endereços não se repetem', async () => {
    const hero = await admin.from('sections').insert({ type: 'hero', slug: `hero-${stamp}`, name: 'Outro' });
    const slug = await admin.from('sections').insert({ type: 'faq', slug: 'duvidas', name: 'Outro' });
    expect(hero.error?.code).toBe('23505');
    expect(slug.error?.code).toBe('23505');
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

describe('ordem e criação de seções', () => {
  const order = async () =>
    (await service.from('sections').select('id, position').order('position')).data!.map((s) => s.id);

  it('cria uma seção na posição pedida e empurra as seguintes', async () => {
    const before = await order();
    const { data, error } = await admin
      .rpc('create_section', {
        p_section: {
          type: 'faq',
          slug: `nova-${stamp}`,
          name: 'Nova',
          icon: 'ice-cream-bowl',
          title: 'Nova seção',
          options: { a: 'b' },
        },
        p_position: 1,
      })
      .returns<Database['public']['Tables']['sections']['Row']>();
    expect(error).toBeNull();
    createdSections.push(data!.id);
    expect(data!.options).toEqual({ a: 'b' });
    expect(data!.icon).toBe('ice-cream-bowl');
    const after = await order();
    expect(after).toEqual([before[0], data!.id, ...before.slice(1)]);
  });

  it('o ícone do menu só aceita nomes simples (letras minúsculas, números e hífens)', async () => {
    const section = await tempSection();
    const bad = await admin.from('sections').update({ icon: '<svg onload=x>' }).eq('id', section.id);
    expect(bad.error?.code).toBe('23514');
    const ok = await admin.from('sections').update({ icon: 'party-popper' }).eq('id', section.id).select('icon');
    expect(ok.data?.[0].icon).toBe('party-popper');
  });

  it('reordena todas as seções de uma vez', async () => {
    const before = await order();
    const reversed = [...before].reverse();
    expect((await admin.rpc('reorder_sections', { p_ids: reversed })).error).toBeNull();
    expect(await order()).toEqual(reversed);
    expect((await admin.rpc('reorder_sections', { p_ids: before })).error).toBeNull();
    expect(await order()).toEqual(before);
  });

  it('duplica a seção com os itens, oculta, logo abaixo da original', async () => {
    const { data: copy, error } = await admin
      .rpc('duplicate_section', { p_id: FAQ, p_slug: `duvidas-copia-${stamp}`, p_name: 'Cópia' })
      .returns<Database['public']['Tables']['sections']['Row']>();
    expect(error).toBeNull();
    createdSections.push(copy!.id);
    const original = (await service.from('sections').select('position').eq('id', FAQ).single()).data!;
    expect(copy!.visible).toBe(false);
    expect(copy!.icon).toBe('circle-help'); // a cópia mantém o ícone da original
    expect(copy!.position).toBe(original.position + 1);
    const count = async (id: string) =>
      (await service.from('section_items').select('id').eq('section_id', id)).data!.length;
    expect(await count(copy!.id)).toBe(await count(FAQ));
  });

  it('reordena os itens de uma seção', async () => {
    const section = await tempSection({ type: 'faq' });
    const { data: items } = await service
      .from('section_items')
      .insert([
        { section_id: section.id, title: 'A', position: 0 },
        { section_id: section.id, title: 'B', position: 1 },
      ])
      .select();
    const ids = items!.map((i) => i.id).reverse();
    expect((await admin.rpc('reorder_section_items', { p_ids: ids })).error).toBeNull();
    const { data } = await service.from('section_items').select('title').eq('section_id', section.id).order('position');
    expect(data!.map((i) => i.title)).toEqual(['B', 'A']);
  });
});

describe('métricas de visitas e cliques', () => {
  it('visitante registra eventos, mas não lê a tabela nem o resumo', async () => {
    expect((await anon.rpc('track_event', { p_kind: 'visit' })).error).toBeNull();
    expect((await anon.rpc('track_event', { p_kind: 'whatsapp_click', p_source: 'botao_flutuante' })).error).toBeNull();
    expect((await anon.rpc('track_event', { p_kind: 'whatsapp_click', p_source: 'como-funciona' })).error).toBeNull();
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
    const section = await tempSection({ type: 'faq' });
    const { data: item } = await admin
      .from('section_items')
      .insert({ section_id: section.id, title: `Lixeira ${stamp}?`, description: 'Teste' })
      .select()
      .single();
    expect((await admin.from('section_items').delete().eq('id', item!.id)).error).toBeNull();

    const { data: trashed } = await admin.from('trash').select('*').eq('row_data->>id', item!.id).single();
    expect(trashed!.table_name).toBe('section_items');
    expect(trashed!.label).toBe(`Lixeira ${stamp}?`);

    expect((await admin.rpc('restore_from_trash', { p_id: trashed!.id })).error).toBeNull();
    expect((await admin.from('section_items').select('title').eq('id', item!.id).single()).data!.title).toBe(
      `Lixeira ${stamp}?`,
    );
    expect((await admin.from('trash').select('id').eq('id', trashed!.id)).data).toEqual([]);
  });

  it('seção excluída leva os itens para a lixeira e volta com eles', async () => {
    const section = await tempSection({ type: 'faq', name: `Seção ${stamp}` });
    await service.from('section_items').insert([
      { section_id: section.id, title: 'P1' },
      { section_id: section.id, title: 'P2' },
    ]);
    expect((await admin.from('sections').delete().eq('id', section.id)).error).toBeNull();
    const { data: trash } = await admin.from('trash').select('*').eq('row_data->>section_id', section.id);
    expect(trash).toHaveLength(2);

    // Um item sozinho não volta: a seção dele está na lixeira.
    const lonely = await admin.rpc('restore_from_trash', { p_id: trash![0].id });
    expect(lonely.error?.hint).toBe('secao_excluida');

    const { data: sectionTrash } = await admin
      .from('trash')
      .select('id, label')
      .eq('row_data->>id', section.id)
      .single();
    expect(sectionTrash!.label).toBe(`Seção ${stamp}`);
    expect((await admin.rpc('restore_from_trash', { p_id: sectionTrash!.id })).error).toBeNull();
    expect((await service.from('section_items').select('id').eq('section_id', section.id)).data).toHaveLength(2);
    expect((await admin.from('trash').select('id').eq('row_data->>section_id', section.id)).data).toEqual([]);
  });

  it('visitante e usuário sem permissão não veem nem restauram a lixeira', async () => {
    const section = await tempSection({ type: 'faq' });
    await service.from('sections').delete().eq('id', section.id);
    const { data: trashed } = await service.from('trash').select('id').eq('row_data->>id', section.id).single();

    for (const client of [anon, editor]) {
      expect((await client.from('trash').select('*')).data ?? []).toEqual([]);
      expect((await client.rpc('restore_from_trash', { p_id: trashed!.id })).error).not.toBeNull();
    }
    expect((await service.from('sections').select('id').eq('id', section.id)).data).toEqual([]);
  });
});

describe('restauração da cópia de segurança', () => {
  const tables = ['site_settings', 'sections', 'section_items', 'media'] as const;

  async function panelBackup() {
    const dados: Record<string, Json[]> = {};
    for (const t of tables) dados[t] = (await service.from(t).select('*')).data as Json[];
    return { formato: 'la-dolce-backup', versao: 2, geradoEm: new Date().toISOString(), observacao: '', dados };
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
      { ...backup, versao: 1 },
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
    const { data: item } = await service
      .from('section_items')
      .insert({ section_id: FAQ, title: `Depois da cópia ${stamp}?` })
      .select()
      .single();

    const trashBefore = new Set((await service.from('trash').select('id')).data!.map((r) => r.id));

    const { error } = await service.rpc('restore_backup', { p_backup: backup });
    expect(error).toBeNull();
    expect((await service.from('site_settings').select('business_name').single()).data).toEqual(settings);
    expect((await service.from('section_items').select('id').eq('id', item!.id)).data).toEqual([]);

    // O que a cópia trouxe de volta não fica duplicado na lixeira.
    const { data: trash } = await service.from('trash').select('id, row_data');
    const added = trash!.filter((r) => !trashBefore.has(r.id));
    expect(added.map((r) => (r.row_data as { id: string }).id)).toEqual([item!.id]);
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

    const { data: hero } = await admin.from('sections').select('title').eq('id', HERO).single();
    expect((await admin.from('sections').update({ title: hero!.title }).eq('id', HERO)).error).toBeNull();
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

describe('fotos extras dos itens (depoimentos)', () => {
  it('aceita até 5 fotos da biblioteca; recusa mais que isso e fotos inexistentes', async () => {
    const photo = (await tempMedia()).id;
    const section = await tempSection({ type: 'depoimentos' });
    const ok = await admin
      .from('section_items')
      .insert({ section_id: section.id, title: 'Teste fotos', photo_media_ids: [photo, photo] })
      .select()
      .single();
    expect(ok.error).toBeNull();
    expect(ok.data!.photo_media_ids).toEqual([photo, photo]);

    const tooMany = await admin
      .from('section_items')
      .insert({ section_id: section.id, title: 'x', photo_media_ids: Array(6).fill(photo) });
    expect(tooMany.error?.code).toBe('23514');

    const missing = await admin
      .from('section_items')
      .insert({ section_id: section.id, title: 'x', photo_media_ids: [crypto.randomUUID()] });
    expect(missing.error?.code).toBe('23503');
  });

  it('ao excluir uma imagem da biblioteca, ela sai das fotos do item', async () => {
    const [a, b] = [await tempMedia(), await tempMedia()];
    const section = await tempSection({ type: 'depoimentos' });
    const { data: row } = await service
      .from('section_items')
      .insert({ section_id: section.id, title: 'Teste exclusão', photo_media_ids: [a.id, b.id] })
      .select()
      .single();

    await service.from('media').delete().eq('id', a.id);
    const { data } = await service.from('section_items').select('photo_media_ids').eq('id', row!.id).single();
    expect(data!.photo_media_ids).toEqual([b.id]);
  });
});

describe('recorte de imagens (media.source_media_id e crop)', () => {
  const cropped = (source: string) => ({
    src_lg: 'teste/recorte.webp',
    src_sm: 'teste/recorte.webp',
    width_lg: 1,
    height_lg: 1,
    width_sm: 1,
    height_sm: 1,
    source_media_id: source,
    crop: { x: 10, y: 0, width: 80, height: 100, aspect: 1.25 },
  });

  it('admin grava o recorte com a original; usuário sem permissão e visitante não', async () => {
    const original = await tempMedia();
    const { data, error } = await admin.from('media').insert(cropped(original.id)).select().single();
    expect(error).toBeNull();
    createdMedia.push(data!.id);
    expect(data!.source_media_id).toBe(original.id);

    for (const client of [anon, editor]) {
      expect((await client.from('media').insert(cropped(original.id))).error).not.toBeNull();
      await client.from('media').update({ source_media_id: null }).eq('id', data!.id);
    }
    const { data: after } = await service.from('media').select('source_media_id').eq('id', data!.id).single();
    expect(after!.source_media_id).toBe(original.id);
  });

  it('recusa original inexistente, a própria imagem como original e crop que não é objeto', async () => {
    const missing = await admin.from('media').insert(cropped(crypto.randomUUID()));
    expect(missing.error?.code).toBe('23503');

    const media = await tempMedia();
    const self = await service.from('media').update({ source_media_id: media.id }).eq('id', media.id);
    expect(self.error?.code).toBe('23514');

    const badCrop = await service
      .from('media')
      .update({ crop: [1, 2] })
      .eq('id', media.id);
    expect(badCrop.error?.code).toBe('23514');
  });

  it('excluir a original mantém o recorte, sem a referência', async () => {
    const original = await tempMedia();
    const { data } = await service.from('media').insert(cropped(original.id)).select().single();
    createdMedia.push(data!.id);
    await service.from('media').delete().eq('id', original.id);
    const { data: after } = await service.from('media').select('source_media_id').eq('id', data!.id).single();
    expect(after!.source_media_id).toBeNull();
  });
});
