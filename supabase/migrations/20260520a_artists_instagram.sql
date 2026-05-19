-- 20260520a_artists_instagram.sql
-- Pridedam Instagram URL kolumną prie atlikėjų. Iki šiol jau turėjom
-- facebook, youtube, tiktok, spotify, soundcloud, bandcamp, twitter,
-- bet Instagram nebuvo, nors atlikėjams tai vienas iš svarbiausių
-- platformų. Wiki worker'is dabar parsina Instagram username/URL iš
-- Wiki infobox'o ir saugo čia.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS instagram TEXT;

-- Lookup'as nereikalingas — readas tik per artists.* (joined ant artist
-- profile page'o). Jokio index'o čia.
