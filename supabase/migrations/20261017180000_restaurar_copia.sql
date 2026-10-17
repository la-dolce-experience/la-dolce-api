-- =====================================================================
-- Restauração da cópia de segurança baixada no painel
-- ("Lixeira e backup" > "Baixar cópia do conteúdo").
--
-- Só aceita esse arquivo (formato "la-dolce-backup", versão 1) e só pode ser
-- chamada com a secret/service_role key, pelo script scripts/restore-backup.mjs.
-- Tudo acontece numa transação: se algo falhar, nada muda.
-- =====================================================================

create or replace function public.restore_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dados jsonb := p_backup -> 'dados';
  lists text[] := array['event_types', 'features', 'flavor_items', 'steps', 'gallery_items', 'faqs', 'testimonials'];
  t text;
  n int;
  result jsonb := '{}';
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  if p_backup ->> 'formato' is distinct from 'la-dolce-backup' or p_backup -> 'versao' is distinct from '1'::jsonb then
    raise exception 'o arquivo não é uma cópia de segurança baixada no painel (formato la-dolce-backup, versão 1)'
      using errcode = '22023';
  end if;
  foreach t in array lists || array['site_settings', 'sections', 'media'] loop
    if jsonb_typeof(dados -> t) is distinct from 'array' then
      raise exception 'a cópia não tem a lista "%"', t using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(dados -> 'site_settings') <> 1 or jsonb_array_length(dados -> 'sections') = 0 then
    raise exception 'a cópia não tem as configurações ou as seções do site' using errcode = '22023';
  end if;

  -- 1. Itens atuais das listas vão para a lixeira (gatilho copy_to_trash): os que a cópia não
  --    trouxer de volta continuam recuperáveis por 30 dias (ver passo 4).
  foreach t in array lists loop
    execute format('delete from public.%I where true', t);
  end loop;

  -- 2. Imagens da cópia voltam com os mesmos ids. Imagens enviadas depois da cópia continuam na biblioteca.
  delete from public.media where id in (select (m ->> 'id')::uuid from jsonb_array_elements(dados -> 'media') m);
  insert into public.media select * from jsonb_populate_recordset(null::public.media, dados -> 'media');
  get diagnostics n = row_count;
  result := result || jsonb_build_object('media', n);

  -- 3. Configurações e seções. Uma seção que não estiver na cópia fica como está.
  delete from public.site_settings where true;
  insert into public.site_settings select * from jsonb_populate_recordset(null::public.site_settings, dados -> 'site_settings');
  delete from public.sections where key in (select s ->> 'key' from jsonb_array_elements(dados -> 'sections') s);
  insert into public.sections select * from jsonb_populate_recordset(null::public.sections, dados -> 'sections');
  get diagnostics n = row_count;
  result := result || jsonb_build_object('site_settings', 1, 'sections', n);

  -- 4. Listas, com os mesmos ids e posições da cópia.
  foreach t in array lists loop
    execute format('insert into public.%1$I select * from jsonb_populate_recordset(null::public.%1$I, $1)', t)
      using dados -> t;
    get diagnostics n = row_count;
    result := result || jsonb_build_object(t, n);
    -- Na lixeira ficam só os itens que a cópia não trouxe de volta (now() = início desta transação).
    execute format(
      'delete from public.trash tr where tr.deleted_at = now() and tr.table_name = %1$L
         and exists (select 1 from public.%1$I x where x.id = (tr.row_data ->> ''id'')::uuid)', t);
  end loop;

  return result;
end;
$$;

-- O Supabase concede execute a anon e authenticated por padrão: aqui só a service_role.
revoke all on function public.restore_backup(jsonb) from public, anon, authenticated;
grant execute on function public.restore_backup(jsonb) to service_role;
