/**
 * Testes de integração contra o Supabase LOCAL (npm run db:start).
 * Verificam que a segurança é imposta pelo banco (RLS/constraints), não só pelo frontend.
 * Executar: npm run db:start && npm run test:integration
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';

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
