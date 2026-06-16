-- ============================================================
-- 2026-06-16 — Substilių taksonomijos sutvarkymas
-- ============================================================
-- Problema: artist-import (ir kiti kūrimo keliai) kūrė naujus substilius
-- per "eq(name) → insert if missing", todėl prisikaupė šiukšlinių / dublikatinių
-- substilių (685 vs 538 kanoninių). Substiliai taip pat neturėjo ryšio su
-- pagrindiniu žanru (genre_id).
--
-- Šis migrate:
--   1. Prideda genre_id (pagrindinis žanras), status, review_note ir
--      suggested_* stulpelius peržiūrai.
--   2. Backfill'ina genre_id + status='approved' VISIEMS kanoniniams
--      substiliams (iš lib/constants.ts SUBSTYLES + SUBSTYLE_ADDITIONS).
--   3. Likę (ne-kanoniniai) → status='pending' peržiūrai per /admin/substiliai.
--
-- Idempotentiškas: kolonos su IF NOT EXISTS, UPDATE'ai pagal lower(name).
-- ============================================================

BEGIN;

-- 1. Schema ---------------------------------------------------
ALTER TABLE public.substyles ADD COLUMN IF NOT EXISTS genre_id BIGINT REFERENCES public.genres(id) ON DELETE SET NULL;
ALTER TABLE public.substyles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public.substyles ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE public.substyles ADD COLUMN IF NOT EXISTS suggested_substyle_id BIGINT REFERENCES public.substyles(id) ON DELETE SET NULL;
ALTER TABLE public.substyles ADD COLUMN IF NOT EXISTS suggested_genre_id BIGINT REFERENCES public.genres(id) ON DELETE SET NULL;
ALTER TABLE public.substyles ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.substyles ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'substyles_status_check') THEN
    ALTER TABLE public.substyles ADD CONSTRAINT substyles_status_check
      CHECK (status IN ('approved','pending','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_substyles_status ON public.substyles (status);
CREATE INDEX IF NOT EXISTS idx_substyles_genre ON public.substyles (genre_id);

-- 2. Backfill kanoninius (genre_id + approved) ----------------
UPDATE public.substyles SET genre_id=1000556, status='approved' WHERE lower(name) = ANY(ARRAY['2 step','acid rock','acoustic','aggrotech','alternative','alternative dance','alternative hip hop','alternative pop','alternative rap','ambient','apocalyptic folk','avant-garde','avant-garde rock','bass','bossa nova','cabaret','celtic','celtic punk','dainuojamoji poezija','dark ambient','dark cabaret','dark electro','dark pop','dark wave','desert rock','downtempo','drone','dub','dubstep','easy listening','ebm','electro industrial','electro rock','emo','experimental','experimental rock','folk','folk punk','folk rock','freak folk','funk','future jazz','futurepop','glam rock','glitch','grime','grunge','hardcore punk','harsh electro','horror punk','idm','indie','indie folk','industrial','instrumental pop','j-rock','kita','krautrock','lo-fi','madchester','martial','martial industrial/military pop','melodic hardcore','minimalistic','neo soul','neofolk','new age','noise','pop punk','post grunge','post hardcore','post industrial','post punk','post rock','power electronics','power noise','progressive rock','psych folk','psychedelic pop','psychedelic soul','punk rock','rap metal','rapcore','rhythmic noise','roots music','screamo','shoegazing','ska','ska punk','spoken word','steampunk','stoner rock','surf rock','trip hop','turntablism','uk garage','world','avant-pop','singer-songwriter','experimental pop','experimental electronic']);
UPDATE public.substyles SET genre_id=1000557, status='approved' WHERE lower(name) = ANY(ARRAY['acid house','acid jazz','acid techno','acid trance','ambient house','ambient techno','baile funk','balearic beat','balearic house','big beat','brazilian bass','break','breakbeat','breakcore','breakdance','breaks','broken beat','chill-out','chillwave','chiptune','club','dance','dance punk','deep house','detroit techno','disco','downbeat','dream house','drill & bass','drum & bass','dubstyle','early trance','electro','electro funk','electro hop','electro house','electro pop','electro techno','electroclash','electronica','ethnic electronica','euro disco','euro house','euro trance','eurobeat','eurodance','experimental techno','fidget house','folktronica','french house','funktronica','funky breaks','funky house','gabber','garage','goa trance','happy hardcore','hard dance','hard house','hard trance','hardcore techno','hardstyle','hi-nrg','house','illbient','indie electronic','industrial dance','italo dance','italo disco','jumpstyle','jungle','latin dance','left-field house','lento violento','liquid funk','mashup','microsound','minimal','neo electro','neotango','new beat','new rave','nu breaks','nu disco','old school jungle','polka','post disco','progressive house','progressive trance','psy trance','psybient','rave','samba','symphonic techno','synthpunk','tango','tech house','tech-trance','techno','trance','tribal','uplifting trance','vocal trance','witch house','synthwave','edm','electro-disco','coldwave','minimal synth','progressive electronic']);
UPDATE public.substyles SET genre_id=1000558, status='approved' WHERE lower(name) = ANY(ARRAY['bounce','comedy hip hop','country rap','crunk','crunkcore','dirty rap','east coast hip hop','g-funk','gangsta rap','golden age','hardcore hip hop','hip hop','hip hop soul','horrorcore','japanese hip hop','jazz rap','latin rap','midwest hip hop','old school hip hop','political rap','pop rap','ragga','rap','rap rock','reggaeton','snap','southern hip hop','thug rap','uk hip hop','underground hip hop','west coast hip hop','trap','latin trap','trap-pop']);
UPDATE public.substyles SET genre_id=1000559, status='approved' WHERE lower(name) = ANY(ARRAY['2 tone','a cappella','abstract','afrobeat','alternative country','anapus','anasheed','anti folk','axe','bachata','beatbox','bhangra','bluegrass','brazilian','cajun','celtic fusion','cha-cha-cha','choir','comedy','compas','congolese','country','cyberpunk','dancehall','digital hardcore','electro swing','enka','ethnic','ethnic fusion','filmų muzika','fingerstyle','flamenco','gypsy','hamd','hawaiian','hindu','humppa','laïko','latin','mambo','march','mbalax','mpb','neo medieval','nueva trova','outlaw country','pagode','parody','ranchera','reggae','reggae fusion','rocksteady','roots reggae','salsa','sertanejo','shibuya-kei','son','space','swing revival','tejano','third wave ska','trailer music','tropicalia','vocaloid','world beat','afrobeats','regional mexican','corridos tumbados','film music']);
UPDATE public.substyles SET genre_id=1000560, status='approved' WHERE lower(name) = ANY(ARRAY['ambient pop','arabic pop','art pop','balkan pop','ballad','baroque pop','blue-eyed soul','bolero','boogaloo','brown-eyed soul','chanson','chicago soul','children','christmas music','contemporary christian','country pop','cumbia','dance pop','doo wop','europop','french pop','guajira','indipop','j pop','k-pop','latin pop','lounge music','lt estrada','merengue','new jack swing','new romanticism','operatic pop','philadelphia soul','pop','pop rock','quiet storm','r&b','russian pop','schlager','sophisti pop','soul','southern soul','sunshine pop','synthpop','teen pop','traditional pop','tropical','urban','vocal pop','wonky pop','hyperpop','alternative r&b','bedroom pop','pop-soul','folk-pop','acoustic pop']);
UPDATE public.substyles SET genre_id=1000561, status='approved' WHERE lower(name) = ANY(ARRAY['adult contemporary','afro-cuban jazz','avant-garde jazz','bebop','big band','blues','boogie woogie','british blues','chicago blues','classical','classical crossover','cool jazz','country blues','crossover jazz','cubop','delta blues','dixieland','electric blues','free improvisation','free jazz','gospel','gospel blues','gregorian','hard bop','instrumental','jazz','jazz blues','jazz funk','jazz fusion','jazz hop','jazz rock','jazzcore','jazzstep','jive','latin jazz','modal jazz','modern classical','neo classical','new classical','nu jazz','opera','piano blues','post bop','post jazz','ragtime','smooth jazz','soul blues','soul jazz','space age','stride','swing','talking blues','texas blues','third stream','torch songs','vocal jazz','dark jazz','fusion jazz','progressive jazz']);
UPDATE public.substyles SET genre_id=1000562, status='approved' WHERE lower(name) = ANY(ARRAY['acid / psychedelic blues','acoustic rock','alternative rock','americana','anarcho punk','arena rock','art punk','art rock','atmospheric rock','beat','blues rock','boogie rock','britpop','cello rock','celtic rock','chicano rock','christian rock','classic rock','college rock','comedy rock','country rock','death rock','dream pop','electronic rock','ethereal wave','funk rock','garage rock','garage rock revival','geek rock','german rock','glam punk','gothabilly','gothic rock','gypsy punk','hard rock','heartland rock','indie pop','indie rock','industrial rock','instrumental rock','italian progressive rock','jam band','jangle pop','latin rock','lt old rock','math rock','medieval rock','mod revival','neo progressive rock','neo psychedelia','neue deutsche härte','neue deutsche welle','new prog','new wave','noise pop','noise rock','occult rock','oi!','pagan rock','piano rock','post britpop','post punk revival','powerpop','protopunk','psychedelic folk','psychedelic rock','psychobilly','pub rock','punk blues','queercore','raga rock','riot grrrl','rock','rock noir','rock''n''roll','rockabilly','roots rock','russian rock','sadcore','shock rock','ska-core','skate punk','soft rock','southern rock','space rock','street punk','symphonic rock','synthrock','trip rock','visual kei','heavy rock','orchestral rock','groove rock']);
UPDATE public.substyles SET genre_id=1000563, status='approved' WHERE lower(name) = ANY(ARRAY['alternative metal','avant-garde metal','black metal','cello metal','celtic metal','christian metal','crossover thrash','death metal','death''n''roll','death/doom','deathcore','deathgrind','doom metal','extreme metal','flamenco metal','folk metal','funeral doom','funk metal','glam metal','gothic metal','grindcore','groove metal','heavy metal','industrial metal','mathcore','medieval metal','melodic death metal','metal','metalcore','neo-classical metal','nsbm','nu metal','pagan metal','post metal','power metal','progressive metal','punk metal','sludge metal','southern metal','speed metal','symphonic metal','technical death metal','thrash metal','thrashcore','viking metal','progressive death metal','atmospheric black metal','experimental metal']);
-- 3. Likę ne-kanoniniai → pending peržiūrai --------------------
UPDATE public.substyles
   SET status = 'pending',
       review_note = COALESCE(review_note, 'Ne taksonomijoje — laukia peržiūros (auto 2026-06-16)')
 WHERE genre_id IS NULL;

COMMIT;
