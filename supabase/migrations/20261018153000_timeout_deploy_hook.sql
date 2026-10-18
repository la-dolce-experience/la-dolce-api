-- O Deploy Hook da Vercel pode levar mais de 5 s para responder (padrão do pg_net): o primeiro pedido
-- automático em produção terminou em "Timeout of 5000 ms reached". Espera até 30 s.
create or replace function public.publish_site_if_needed()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision text := public.site_publish_decision();
  hook text;
begin
  if decision <> 'publicar' then
    return decision;
  end if;
  hook := public.deploy_hook_url();
  if hook is null or hook !~ '^https://api\.vercel\.com/' then
    return 'nao_configurado';
  end if;
  perform net.http_post(url := hook, body := '{}'::jsonb, timeout_milliseconds := 30000);
  insert into public.deploy_requests (requested_by, ok, detail)
    values (null, true, 'Republicação automática após alterações no painel.');
  return 'publicado';
end;
$$;

revoke all on function public.publish_site_if_needed() from public, anon, authenticated;
