-- 20260616_revert_import_rpc.sql
-- Importo atšaukimas VIENU serveriniu DELETE (join su music_import_added).
-- Anksčiau revert per daug JS chunk'ų ant didelės likes lentelės tyliai
-- pasiekdavo statement_timeout ir likdavo nepilnas (likdavo dainos/albumai).
create or replace function public.revert_import_batch(p_batch_id uuid, p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_removed integer;
begin
  delete from public.likes l
  using public.music_import_added a
  where a.batch_id = p_batch_id
    and l.entity_type = a.kind
    and l.entity_id = a.entity_id
    and l.user_id = p_user_id;
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;
