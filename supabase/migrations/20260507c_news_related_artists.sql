-- DEPRECATED — sprendimas pakeistas: vietoj atskiro `related_artists` column'o
-- naudojam esamą `related_tracks` JSONB array'ą su `kind='artist'` įrašais.
-- Tai išlaiko schema simple (tas pats column'as visam susijusiam content'ui:
-- artist/track/album), o filtravimas vyksta UI/scraper kode per `kind` field'ą.
--
-- Šitas migracijos failas paliekamas tuščias kaip placeholder — galima drop'inti
-- po visų aplikuotų migracijų cleanup'o.

SELECT 1; -- no-op
