-- ============================================================
-- 2026-06-25 — news_songs.is_embed: atskirti straipsnio embed'ą nuo katalogo dainos
-- ============================================================
-- news_songs lentelėje buvo sumaišyti DU dalykai: (a) katalogo dainos (song_id
-- užpildytas) ir (b) straipsnyje rasti video embed'ai (tik youtube_url). Dabar
-- embed'ai aiškiai pažymimi is_embed=true → renderis gali rodyti juos kaip
-- įterptus video po teksto, o katalogo dainos lieka kaip dainos.
-- Embed'as NIEKADA netampa katalogo tracku.
-- ============================================================

ALTER TABLE public.news_songs
  ADD COLUMN IF NOT EXISTS is_embed boolean NOT NULL DEFAULT false;
