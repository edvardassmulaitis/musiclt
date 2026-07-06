-- 2026-07-06 — SAUGUMAS: chat lentelės buvo skaitomos viešu anon raktu.
--
-- Problema: chat_conversations/chat_messages/chat_participants/chat_reactions
-- SELECT politika buvo `USING (true)`, o NEXT_PUBLIC_SUPABASE_ANON_KEY siunčiamas
-- į kiekvieną naršyklę → bet kas galėjo per PostgREST nuskaityti VISŲ vartotojų
-- privačias žinutes ir pokalbių dalyvius (patvirtinta gyvai: 16 žinučių, 8 dalyviai).
--
-- Sprendimas: uždaryti skaitymą anon/authenticated rolėms. Visas chat turinys
-- kraunamas per serverio /api/chat/* (service_role, kuris APEINA RLS ir daro
-- assertParticipant patikrą), tad žinučių peržiūra/siuntimas nenukenčia.
-- Realtime live-push (postgres_changes) nustos veikti — jis perkeliamas į
-- contentless broadcast (žr. lib/chat-realtime.ts).
--
-- Grįžti atgal (jei prireiktų): `alter policy ... using (true)`.

alter policy chat_conv_read  on public.chat_conversations using (false);
alter policy chat_msg_read   on public.chat_messages      using (false);
alter policy chat_part_read  on public.chat_participants  using (false);
alter policy chat_react_read on public.chat_reactions     using (false);
