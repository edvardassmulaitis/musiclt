// lib/collections.ts
//
// Teminių kolekcijų definicijos /muzika hub'ui ir kolekcijų puslapiams.
//
// DAINŲ kolekcijos (SONG_COLLECTIONS) — KURUOTOS. Turinį valdo adminas per
// `collection_tracks` lentelę (collection_slug + track_id + position). Puslapis
// rodo tik rankiniu būdu atrinktas dainas. Jei kolekcija dar tuščia → puslapis
// pereina į noindex ir siūlo naršyti /dainos (NIEKADA neindeksuojam plono
// auto-sugeneruoto turinio — žr. SEO sprendimą: kuruota > title ILIKE match).
//
// ALBUMŲ kolekcijos (ALBUM_COLLECTIONS) — UŽKLAUSOMOS. Realus albumų reitingas
// pagal žanrą / substilį / šalį (getCollectionAlbums). Tai NE plonas turinys —
// faktinė esamų duomenų agregacija, todėl indeksuojama iš karto.
//
// Kiekviena kolekcija turi unikalų H1, meta title/description ir intro prozą —
// kritiška, kad SEO atžvilgiu puslapiai nebūtų soft-dublikatai.

export type SongCollection = {
  slug: string
  title: string       // H1
  emoji: string
  metaTitle: string   // <title>
  description: string // <meta description>
  intro: string       // unikalus body tekstas (SEO signalas)
  group: 'tema' | 'nuotaika' // hub'e grupavimui
}

export type AlbumCollection = {
  slug: string
  title: string
  emoji: string
  metaTitle: string
  description: string
  intro: string
  // Vienas iš trijų užklausos būdų (žr. getCollectionAlbums):
  genreName?: string     // tikslus DB genres.name
  scope?: 'all' | 'lt' | 'world'
  substyleSlug?: string  // substyles.slug (album_substyles)
}

const SITE = 'music.lt'

/* ───────────────────────── Dainų kolekcijos (13) ───────────────────────── */

export const SONG_COLLECTIONS: SongCollection[] = [
  {
    slug: 'meiles-dainos', title: 'Dainos apie meilę', emoji: '❤️', group: 'tema',
    metaTitle: `Dainos apie meilę — gražiausios meilės dainos | ${SITE}`,
    description: 'Gražiausios dainos apie meilę — lietuviškos ir užsienio. Romantiškų dainų rinkinys vestuvėms, pasimatymui ar tiesiog nuotaikai.',
    intro: 'Meilė — labiausiai apdainuojama tema muzikos istorijoje. Šiame rinkinyje surinkome gražiausias dainas apie meilę: nuo švelnių baladžių iki aistringų himnų, lietuvių ir pasaulio atlikėjų. Tinka romantiškam vakarui, pirmam šokiui ar dovanai mylimam žmogui.',
  },
  {
    slug: 'vestuviu-dainos', title: 'Vestuvių dainos', emoji: '💍', group: 'tema',
    metaTitle: `Vestuvių dainos — geriausios dainos vestuvėms | ${SITE}`,
    description: 'Geriausios vestuvių dainos: pirmam šokiui, ceremonijai ir vakarėliui. Lietuviškų ir užsienio dainų rinkinys jūsų didžiajai dienai.',
    intro: 'Tinkama daina gali tapti vestuvių akimirkos siela. Surinkome dainas pirmam jaunavedžių šokiui, ceremonijai ir linksmam vakarėliui — nuo jautrių baladžių iki energingų hitų, kurie pakels visus svečius. Lietuviški ir pasaulio kūriniai vienoje vietoje.',
  },
  {
    slug: 'filmu-dainos', title: 'Filmų ir serialų dainos', emoji: '🎬', group: 'tema',
    metaTitle: `Filmų ir serialų dainos — garso takeliai | ${SITE}`,
    description: 'Žinomiausios dainos iš filmų ir serialų. Garso takelių ir kino muzikos rinkinys, kurį atpažins kiekvienas.',
    intro: 'Kai kurios dainos neatsiejamos nuo scenų, kuriose nuskambėjo. Šiame rinkinyje — įsimintiniausios filmų ir serialų dainos bei garso takeliai, kurie tapo populiaresni už pačius filmus. Kino muzikos klasika ir naujausi hitai iš ekrano.',
  },
  {
    slug: 'lopsines', title: 'Lopšinės', emoji: '🌙', group: 'tema',
    metaTitle: `Lopšinės — ramios dainos vaikams užmigti | ${SITE}`,
    description: 'Gražiausios lopšinės vaikams: ramios lietuviškos ir pasaulio dainos miegui. Švelnios melodijos vakaro ritualui.',
    intro: 'Lopšinė — pirmoji muzika, kurią išgirstame gyvenime. Surinkome ramiausias lietuviškas ir pasaulio lopšines, padedančias mažyliams nurimti ir užmigti. Švelnios melodijos vakaro ritualui visai šeimai.',
  },
  {
    slug: 'lietuviskos-klasikes', title: 'Lietuviškos klasikės', emoji: '🇱🇹', group: 'tema',
    metaTitle: `Lietuviškos klasikės — nemirštantys hitai | ${SITE}`,
    description: 'Nemirštantys lietuviški hitai, kuriuos žino visi. Lietuviškos estrados ir roko klasikos dainų rinkinys per kartas.',
    intro: 'Yra dainų, kurias moka kiekvienas lietuvis. Šiame rinkinyje — auksinis lietuviškos muzikos fondas: estrados, roko ir poso klasika, skambanti vestuvėse, gimtadieniuose ir prie laužo jau ne vieną kartą. Dainos, kurias perduodame iš kartos į kartą.',
  },
  {
    slug: 'vasaros-hitai-2026', title: 'Vasaros hitai 2026', emoji: '☀️', group: 'tema',
    metaTitle: `Vasaros hitai 2026 — karščiausios vasaros dainos | ${SITE}`,
    description: '2026 metų vasaros hitai: karščiausios dainos paplūdimiui, kelionei ir vakarėliui. Šio sezono populiariausi kūriniai.',
    intro: 'Kiekviena vasara turi savo garso takelį. Surinkome 2026 metų vasaros hitus — energingiausias šio sezono dainas paplūdimiui, automobiliui ir naktiniam vakarėliui. Lietuvių ir pasaulio atlikėjų kūriniai, skambantys visur šią vasarą.',
  },
  {
    slug: 'protestas-ir-laisve', title: 'Protestas ir laisvė', emoji: '✊', group: 'tema',
    metaTitle: `Protesto ir laisvės dainos — kovos himnai | ${SITE}`,
    description: 'Protesto ir laisvės dainos: kovos himnai, dainuojanti revoliucija ir laisvės balsas muzikoje. Lietuviški ir pasaulio kūriniai.',
    intro: 'Muzika visada buvo laisvės balsas. Šiame rinkinyje — dainos, virtusios protesto himnais ir kovos už laisvę simboliais: nuo Dainuojančios revoliucijos kūrinių iki pasaulinių laisvės himnų. Dainos, suvienijusios žmones lemtingomis akimirkomis.',
  },
  {
    slug: 'kalediniu-muzika', title: 'Kalėdinės dainos', emoji: '🎄', group: 'tema',
    metaTitle: `Kalėdinės dainos — geriausia šventinė muzika | ${SITE}`,
    description: 'Geriausios kalėdinės dainos: lietuviškos ir pasaulio šventinės klasikos rinkinys Kūčioms ir Kalėdoms.',
    intro: 'Kalėdų nuotaiką sukuria muzika. Surinkome jaukiausias kalėdines dainas — nuo lietuviškų giesmių iki pasaulinės šventinės klasikos, skambančios prie eglutės ir Kūčių stalo. Šventinis rinkinys visai šeimai gruodžio vakarams.',
  },
  {
    slug: 'chill', title: 'Chill nuotaikos', emoji: '🧊', group: 'nuotaika',
    metaTitle: `Chill muzika — ramios dainos atsipalaidavimui | ${SITE}`,
    description: 'Chill muzika atsipalaidavimui: ramios dainos darbui, mokslams ar poilsiui. Raminančių kūrinių rinkinys fonui.',
    intro: 'Kartais reikia tiesiog sulėtinti tempą. Šiame rinkinyje — ramios, chill nuotaikos dainos, tinkančios fonui dirbant, mokantis ar tiesiog ilsintis. Švelnūs bitai ir raminančios melodijos be skubėjimo.',
  },
  {
    slug: 'workout', title: 'Workout dainos', emoji: '💪', group: 'nuotaika',
    metaTitle: `Workout muzika — energingos dainos treniruotei | ${SITE}`,
    description: 'Workout muzika treniruotei: energingos dainos bėgimui ir sporto salei. Greito ritmo kūrinių rinkinys motyvacijai.',
    intro: 'Tinkamas ritmas gali padvigubinti treniruotės jėgą. Surinkome energingiausias workout dainas bėgimui, sporto salei ir kardio treniruotėms — greito tempo kūrinius, kurie nukels motyvaciją į kitą lygį. Pumpuok garsą ir spausk toliau.',
  },
  {
    slug: 'keliones-dainos', title: 'Kelionės dainos', emoji: '🚗', group: 'nuotaika',
    metaTitle: `Kelionės dainos — geriausia muzika kelionei automobiliu | ${SITE}`,
    description: 'Geriausios kelionės dainos: muzika ilgam ratui automobiliu. Road trip dainų rinkinys, su kuriuo neprailgs kelias.',
    intro: 'Ilga kelionė be muzikos — pusė kelionės. Surinkome geriausias road trip dainas, su kuriomis neprailgs net ilgiausias ratas automobiliu. Dainuok kartu, atidaryk langą ir leiskis į kelią.',
  },
  {
    slug: 'vakareliu-muzika', title: 'Vakarėlių muzika', emoji: '🎉', group: 'nuotaika',
    metaTitle: `Vakarėlių muzika — geriausios party dainos | ${SITE}`,
    description: 'Vakarėlių muzika: karščiausios party dainos, kurios pakels visus šokti. Lietuviškų ir užsienio hitų rinkinys vakarėliui.',
    intro: 'Geras vakarėlis prasideda nuo gero grojaraščio. Surinkome dainas, kurios garantuotai užpildys šokių aikštelę — nuo lietuviškų hitų iki pasaulinių party himnų. Pasukk garsą ir tegul prasideda vakarėlis.',
  },
  {
    slug: 'liudnos-dainos', title: 'Liūdnos dainos', emoji: '😢', group: 'nuotaika',
    metaTitle: `Liūdnos dainos — gražiausios graudžios baladės | ${SITE}`,
    description: 'Gražiausios liūdnos dainos: graudžios baladės sunkiai akimirkai. Melancholiškų kūrinių rinkinys, kai reikia išsiverkti.',
    intro: 'Kartais liūdna daina paguodžia geriau nei žodžiai. Šiame rinkinyje — gražiausios liūdnos baladės ir melancholiški kūriniai sunkiai akimirkai. Muzika, kuri supranta, leidžia pajausti ir pamažu paleisti.',
  },
]

/* ───────────────────────── Albumų kolekcijos (7) ───────────────────────── */

export const ALBUM_COLLECTIONS: AlbumCollection[] = [
  {
    slug: 'roko', title: 'Geriausi roko albumai', emoji: '🎸', genreName: 'Roko muzika',
    metaTitle: `Geriausi roko albumai — roko klasika ir naujienos | ${SITE}`,
    description: 'Geriausi roko albumai music.lt kataloge: legendinė roko klasika ir naujausi išleidimai. Lietuvių ir pasaulio roko grupių diskografijos.',
    intro: 'Rokas — žanras, apibrėžęs ištisas kartas. Surinkome reikšmingiausius roko albumus: nuo nemirštančios klasikos iki šviežiausių išleidimų. Lietuvių ir pasaulio grupių darbai, kuriuos verta išgirsti nuo pradžios iki pabaigos.',
  },
  {
    slug: 'pop', title: 'Geriausi pop albumai', emoji: '🎤', genreName: 'Pop, R&B muzika',
    metaTitle: `Geriausi pop albumai — populiariausi pop ir R&B albumai | ${SITE}`,
    description: 'Geriausi pop ir R&B albumai: populiariausių atlikėjų darbai vienoje vietoje. Lietuviška ir pasaulio popmuzika.',
    intro: 'Popmuzika diktuoja, ką dainuoja visas pasaulis. Šiame rinkinyje — ryškiausi pop ir R&B albumai, formuojantys šiandienos garsą. Lietuvių ir pasaulio žvaigždžių darbai, kuriuos žino kiekvienas.',
  },
  {
    slug: 'lietuviski', title: 'Geriausi lietuviški albumai', emoji: '🇱🇹', scope: 'lt',
    metaTitle: `Geriausi lietuviški albumai — LT muzikos fondas | ${SITE}`,
    description: 'Geriausi lietuviški albumai: nacionalinės muzikos fondas nuo klasikos iki šiandienos. Populiariausių Lietuvos atlikėjų darbai.',
    intro: 'Lietuviška muzika turi savo aukso fondą. Surinkome reikšmingiausius lietuviškus albumus — nuo legendinių estrados ir roko darbų iki naujosios scenos išleidimų. Nacionalinės muzikos istorija viename rinkinyje.',
  },
  {
    slug: 'hip-hop', title: 'Geriausi hip-hop albumai', emoji: '🎧', genreName: "Hip-hop'o muzika",
    metaTitle: `Geriausi hip-hop albumai — repo klasika ir naujienos | ${SITE}`,
    description: 'Geriausi hip-hop ir repo albumai: lietuviška ir pasaulio gatvės muzika. Reikšmingiausi žanro darbai vienoje vietoje.',
    intro: 'Hip-hopas — daugiau nei muzika, tai kultūra ir balsas. Šiame rinkinyje — svarbiausi hip-hop ir repo albumai: lietuvių scenos darbai ir pasaulio klasika, apibrėžę žanrą ir gatvės garsą.',
  },
  {
    slug: 'metalo', title: 'Geriausi metalo albumai', emoji: '🤘', genreName: 'Sunkioji muzika',
    metaTitle: `Geriausi metalo albumai — sunkiosios muzikos klasika | ${SITE}`,
    description: 'Geriausi metalo ir sunkiosios muzikos albumai: nuo klasikinio heavy metal iki modernių žanrų. Lietuvių ir pasaulio grupės.',
    intro: 'Metalas — vienas galingiausių muzikos žanrų. Surinkome sunkiausius ir reikšmingiausius metalo albumus: nuo klasikinio heavy metal iki ekstremalesnių atšakų. Lietuvių ir pasaulio grupių darbai gerbėjams.',
  },
  {
    slug: 'jazz', title: 'Geriausi džiazo albumai', emoji: '🎷', substyleSlug: 'jazz',
    metaTitle: `Geriausi džiazo albumai — jazz klasika ir naujienos | ${SITE}`,
    description: 'Geriausi džiazo albumai: jazz klasika ir šiuolaikiniai darbai. Improvizacijos ir grūvio meistrų rinkinys.',
    intro: 'Džiazas — laisvės ir improvizacijos muzika. Šiame rinkinyje — reikšmingiausi jazz albumai nuo klasikinių įrašų iki šiuolaikinių interpretacijų. Subtilus grūvis ir meistriškumas tiems, kas vertina gilumą.',
  },
  {
    slug: 'elektronines', title: 'Geriausi elektroniniai albumai', emoji: '🎛️', genreName: 'Elektroninė, šokių muzika',
    metaTitle: `Geriausi elektroniniai albumai — EDM ir šokių muzika | ${SITE}`,
    description: 'Geriausi elektroniniai ir šokių muzikos albumai: nuo techno iki house. Lietuvių ir pasaulio elektroninės scenos darbai.',
    intro: 'Elektroninė muzika nutiesė kelią į ateities garsą. Surinkome ryškiausius elektroninius ir šokių muzikos albumus — nuo techno ir house iki eksperimentinių darbų. Lietuvių ir pasaulio prodiuserių kūriniai šokių aikštelei ir klausymuisi.',
  },
]

/* ───────────────────────── Helperiai ───────────────────────── */

export const SONG_COLLECTION_SLUGS = SONG_COLLECTIONS.map((c) => c.slug)
export const ALBUM_COLLECTION_SLUGS = ALBUM_COLLECTIONS.map((c) => c.slug)

export function findSongCollection(slug: string): SongCollection | null {
  return SONG_COLLECTIONS.find((c) => c.slug === slug) || null
}
export function findAlbumCollection(slug: string): AlbumCollection | null {
  return ALBUM_COLLECTIONS.find((c) => c.slug === slug) || null
}
export function isSongCollectionSlug(slug: string): boolean {
  return SONG_COLLECTION_SLUGS.includes(slug)
}

/** Kiek kuruotų dainų reikia, kad kolekcijos puslapis būtų indeksuojamas
 *  (mažiau → noindex + browse fallback, kad neturėtume plono turinio). */
export const SONG_COLLECTION_MIN_INDEX = 6

export function songCollectionHref(slug: string): string {
  return `/dainos/${slug}`
}
export function albumCollectionHref(slug: string): string {
  return `/albumai/geriausi/${slug}`
}
