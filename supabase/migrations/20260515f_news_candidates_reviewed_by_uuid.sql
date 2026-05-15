-- ============================================================
-- 2026-05-15 — Pataisyti news_candidates.reviewed_by tipą
-- ============================================================
-- Schema'a turėjo INTEGER (legacy user_id), bet NextAuth/Supabase Auth
-- naudoja UUID. Dėl tipo neatitikimo:
--   - reject veiksmas grąžindavo „invalid input syntax for type integer"
--   - approve veiksmas tylėjo (news inserted OK, bet candidate update
--     silent fail → candidate likdavo 'pending', kartodavosi inbox'e)
--
-- Code'as commit 67e4858+ pašalino reviewed_by iš updates. Po šios
-- migracijos audit trail bus galima atgal pridėti (atskirame commit'e).
-- ============================================================

-- Force NULL'inti esamą turinį (jei buvo kokie nors integer'ai, jie
-- nebebus prasmingi naujoje UUID erdvėje)
ALTER TABLE public.news_candidates
  ALTER COLUMN reviewed_by DROP DEFAULT;

ALTER TABLE public.news_candidates
  ALTER COLUMN reviewed_by TYPE UUID USING NULL;

COMMENT ON COLUMN public.news_candidates.reviewed_by IS
  'Supabase Auth user UUID who approved/rejected this candidate. NextAuth session.user.id.';

-- ============================================================
-- Po migracijos atskirame commit'e:
-- 1) Atstatyti reviewed_by į PATCH update'us /api/admin/news-candidates/[id]
-- 2) Galima pridėti FK constraint į auth.users(id), bet šito niekas
--    aktyviai nereikalauja, taigi paliekam free-form UUID.
-- ============================================================
