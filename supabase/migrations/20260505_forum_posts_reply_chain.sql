-- Reply chain extraction laukai forum_posts lentelei.
--
-- Music.lt forume reply'ai saugomi VIDUJE post'o HTML'o (`<div class="link_m_X_1">`).
-- Scraper'is dabar parsina parent author + parent body excerpt ir įrašo į
-- šituos laukus, kad backfill_unify_forum.py galėtų matchinti parent_id'ą
-- pagal (parent_username, body excerpt) prieš skirtingo autoriaus posts thread'e.
--
-- Po šitos migracijos reikia re-scrape'inti thread'us, kad reply chain būtų
-- užfiksuotas. Re-scrape idempotent — jau įrašytus post'us papildo naujais laukais.

ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS parent_username TEXT,
  ADD COLUMN IF NOT EXISTS parent_body_excerpt TEXT;

-- Index — naudosim per backfill paiešką: same thread + parent author
CREATE INDEX IF NOT EXISTS idx_forum_posts_parent_lookup
  ON forum_posts (thread_legacy_id, parent_username)
  WHERE parent_username IS NOT NULL;
