-- app uses NextAuth (Google/Facebook OAuth) so session.user.id is the row id
-- from public.profiles, NOT auth.users.id. The existing artist_likes_user_id_fkey
-- constraint points to auth.users which causes every like insert to fail with
-- "violates foreign key constraint". Drop that FK and re-point to profiles.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'artist_likes_user_id_fkey'
  ) THEN
    ALTER TABLE public.artist_likes DROP CONSTRAINT artist_likes_user_id_fkey;
  END IF;
END $$;

ALTER TABLE public.artist_likes
  ADD CONSTRAINT artist_likes_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- Same for artist_follows (likely same mismatch, safe to fix pre-emptively).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'artist_follows_user_id_fkey'
  ) THEN
    ALTER TABLE public.artist_follows DROP CONSTRAINT artist_follows_user_id_fkey;
    ALTER TABLE public.artist_follows
      ADD CONSTRAINT artist_follows_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;
