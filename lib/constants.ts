export const COUNTRIES = [
  'Afganistanas', 'Airija', 'Albanija', 'Alžyras', 'Andora', 'Angola',
  'Antigva ir Barbuda', 'Argentina', 'Armėnija', 'Australija', 'Austrija',
  'Azerbaidžanas', 'Bahamai', 'Bahreinas', 'Baltarusija', 'Bangladešas',
  'Barbadosas', 'Belgija', 'Belizas', 'Beninas', 'Bisau Gvinėja', 'Bolivija',
  'Bosnija ir Hercegovina', 'Botsvana', 'Brazilija', 'Brunėjus', 'Bulgarija',
  'Burkina Fasas', 'Burundis', 'Butanas', 'Čadas', 'Čekija',
  'Centrinės Afrikos Respublika', 'Čilė', 'Danija', 'Didžioji Britanija',
  'Dominika', 'Dominikos Respublika', 'Dramblio Kaulo Krantas', 'Džibutis',
  'Egiptas', 'Ekvadoras', 'Eritrėja', 'Estija', 'Etiopija', 'Fidžis',
  'Filipinai', 'Gabonas', 'Gajana', 'Gambija', 'Gana', 'Graikija', 'Grenada',
  'Gruzija', 'Gvatemala', 'Gvinėja', 'Haitis', 'Hondūras', 'Indija',
  'Indonezija', 'Irakas', 'Iranas', 'Islandija', 'Ispanija', 'Italija',
  'Izraelis', 'Jamaika', 'Japonija', 'JAV', 'Jemenas', 'Jordanija',
  'Jungtiniai Arabų Emyratai', 'Juodkalnija', 'Kambodža', 'Kamerūnas',
  'Kanada', 'Kataras', 'Kazachija', 'Kenija', 'Kinija', 'Kipras', 'Kirgizija',
  'Kiribatis', 'Kolumbija', 'Komorai', 'Kongas', 'Kongo Demokratinė Respublika',
  'Kosovas', 'Kosta Rika', 'Kroatija', 'Kuba', 'Kuveitas', 'Laosas', 'Latvija',
  'Lenkija', 'Lesotas', 'Libanas', 'Liberija', 'Libija', 'Lichtenšteinas',
  'Lietuva', 'Liuksemburgas', 'Madagaskaras', 'Makedonija', 'Malaizija',
  'Malavis', 'Maldyvai', 'Malis', 'Malta', 'Marokas', 'Mauricijus',
  'Mauritanija', 'Meksika', 'Mianmaras', 'Moldavija', 'Monakas', 'Mongolija',
  'Mozambikas', 'Namibija', 'Naujoji Zelandija', 'Nauru', 'Nepalas', 'Nigerija',
  'Nigeris', 'Nikaragva', 'Norvegija', 'Olandija', 'Omanas', 'Pakistanas',
  'Palau', 'Panama', 'Papua Naujoji Gvinėja', 'Paragvajus', 'Peru',
  'Pietų Afrikos Respublika', 'Pietų Korėja', 'Portugalija', 'Prancūzija',
  'Puerto Rikas', 'Ruanda', 'Rumunija', 'Rusija', 'Saliamono salos',
  'Salvadoras', 'Samoa', 'San Marinas', 'Saudo Arabija', 'Seišeliai',
  'Senegalas', 'Serbija', 'Siera Leonė', 'Singapūras', 'Sirija', 'Škotija',
  'Slovakija', 'Slovėnija', 'Somalis', 'Šri Lanka', 'Sudanas', 'Suomija',
  'Surinamas', 'Svazilandas', 'Švedija', 'Šveicarija', 'Tadžikija', 'Tailandas',
  'Tanzanija', 'Tonga', 'Trinidadas ir Tobagas', 'Tunisas', 'Turkija',
  'Turkmėnija', 'Uganda', 'Ukraina', 'Urugvajus', 'Uzbekija', 'Vanuatu',
  'Vatikanas', 'Velsas', 'Venesuela', 'Vengrija', 'Vietnamas', 'Vokietija',
  'Zambija', 'Zimbabvė', 'Kita',
]

export const GENRES = [
  'Alternatyvioji muzika',
  'Elektroninė, šokių muzika',
  "Hip-hop'o muzika",
  'Kitų stilių muzika',
  'Pop, R&B muzika',
  'Rimtoji muzika',
  'Roko muzika',
  'Sunkioji muzika',
]

export const GENRE_IDS: Record<string, number> = {
  'Alternatyvioji muzika': 1000001,
  'Elektroninė, šokių muzika': 1000002,
  "Hip-hop'o muzika": 1000003,
  'Kitų stilių muzika': 1000004,
  'Pop, R&B muzika': 1000005,
  'Rimtoji muzika': 1000006,
  'Roko muzika': 1000007,
  'Sunkioji muzika': 1000008,
}

export const GENRE_BY_ID: Record<number, string> = {
  1000001: 'Alternatyvioji muzika',
  1000002: 'Elektroninė, šokių muzika',
  1000003: "Hip-hop'o muzika",
  1000004: 'Kitų stilių muzika',
  1000005: 'Pop, R&B muzika',
  1000006: 'Rimtoji muzika',
  1000007: 'Roko muzika',
  1000008: 'Sunkioji muzika',
}
export const SUBSTYLES: Record<string, string[]> = {
  'Alternatyvioji muzika': [
    '2 step','Acid rock','Acoustic','Aggrotech','Alternative','Alternative dance','Alternative hip hop','Alternative pop','Alternative rap','Ambient','Apocalyptic folk','Avant-garde','Avant-garde rock','Bass','Bossa nova','Cabaret','Celtic','Celtic punk','Dainuojamoji poezija','Dark ambient','Dark Cabaret','Dark electro','Dark pop','Dark Wave','Desert rock','Downtempo','Drone','Dub','Dubstep','Easy listening','EBM','Electro industrial','Electro rock','Emo','Experimental','Experimental rock','Folk','Folk punk','Folk rock','Freak folk','Funk','Future jazz','Futurepop','Glam rock','Glitch','Grime','Grunge','Hardcore punk','Harsh Electro','Horror punk','IDM','Indie','Indie folk','Industrial','Instrumental pop','J-rock','Kita','Krautrock','Lo-fi','Madchester','Martial','Martial industrial/military pop','Melodic hardcore','Minimalistic','Neo soul','Neofolk','New Age','Noise','Pop punk','Post grunge','Post hardcore','Post industrial','Post punk','Post rock','Power electronics','Power noise','Progressive rock','Psych folk','Psychedelic pop','Psychedelic soul','Punk rock','Rap metal','Rapcore','Rhythmic Noise','Roots music','Screamo','Shoegazing','Ska','Ska punk','Spoken word','Steampunk','Stoner rock','Surf rock','Trip hop','Turntablism','UK garage','World',
  ],
  'Elektroninė, šokių muzika': [
    'Acid house','Acid jazz','Acid techno','Acid trance','Ambient house','Ambient techno','Baile funk','Balearic beat','Balearic house','Big beat','Brazilian Bass','Break','Breakbeat','Breakcore','Breakdance','Breaks','Broken beat','Chill-out','Chillwave','Chiptune','Club','Dance','Dance punk','Deep house','Detroit techno','Disco','Downbeat','Dream house','Drill & Bass','Drum & Bass','Dubstyle','Early trance','Electro','Electro funk','Electro hop','Electro house','Electro pop','Electro techno','Electroclash','Electronica','Ethnic electronica','Euro disco','Euro house','Euro trance','Eurobeat','Eurodance','Experimental techno','Fidget house','Folktronica','French house','Funktronica','Funky breaks','Funky house','Gabber','Garage','Goa trance','Happy hardcore','Hard dance','Hard house','Hard trance','Hardcore Techno','Hardstyle','Hi-NRG','House','Illbient','Indie electronic','Industrial dance','Italo Dance','Italo disco','Jumpstyle','Jungle','Latin dance','Left-field house','Lento Violento','Liquid Funk','Mashup','Microsound','Minimal','Neo electro','Neotango','New beat','New rave','Nu breaks','Nu disco','Old School Jungle','Polka','Post disco','Progressive house','Progressive trance','Psy trance','Psybient','Rave','Samba','Symphonic techno','Synthpunk','Tango','Tech house','Tech-trance','Techno','Trance','Tribal','Uplifting trance','Vocal trance','Witch house',
  ],
  'Hip-hop\'o muzika': [
    'Bounce','Comedy hip hop','Country rap','Crunk','Crunkcore','Dirty rap','East Coast hip hop','G-Funk','Gangsta rap','Golden age','Hardcore hip hop','Hip hop','Hip hop soul','Horrorcore','Japanese hip hop','Jazz rap','Latin rap','Midwest hip hop','Old School Hip Hop','Political rap','Pop rap','Ragga','Rap','Rap rock','Reggaeton','Snap','Southern hip hop','Thug rap','UK hip hop','Underground hip hop','West Coast hip hop',
  ],
  'Kitų stilių muzika': [
    '2 Tone','A cappella','Abstract','Afrobeat','Alternative country','Anapus','Anasheed','Anti Folk','Axe','Bachata','Beatbox','Bhangra','Bluegrass','Brazilian','Cajun','Celtic fusion','Cha-cha-cha','Choir','Comedy','Compas','Congolese','Country','Cyberpunk','Dancehall','Digital hardcore','Electro Swing','Enka','Ethnic','Ethnic fusion','Filmų muzika','Fingerstyle','Flamenco','Gypsy','Hamd','Hawaiian','Hindu','Humppa','Laïko','Latin','Mambo','March','Mbalax','MPB','Neo medieval','Nueva trova','Outlaw country','Pagode','Parody','Ranchera','Reggae','Reggae fusion','Rocksteady','Roots reggae','Salsa','Sertanejo','Shibuya-kei','Son','Space','Swing revival','Tejano','Third wave ska','Trailer music','Tropicalia','Vocaloid','World beat',
  ],
  'Pop, R&B muzika': [
    'Ambient pop','Arabic pop','Art pop','Balkan pop','Ballad','Baroque pop','Blue-eyed soul','Bolero','Boogaloo','Brown-eyed soul','Chanson','Chicago soul','Children','Christmas music','Contemporary Christian','Country pop','Cumbia','Dance pop','Doo wop','Europop','French pop','Guajira','Indipop','J pop','K-pop','Latin pop','Lounge music','LT estrada','Merengue','New jack swing','New romanticism','Operatic pop','Philadelphia soul','Pop','Pop rock','Quiet storm','R&B','Russian pop','Schlager','Sophisti pop','Soul','Southern soul','Sunshine pop','Synthpop','Teen pop','Traditional pop','Tropical','Urban','Vocal pop','Wonky pop',
  ],
  'Rimtoji muzika': [
    'Adult contemporary','Afro-Cuban jazz','Avant-garde jazz','Bebop','Big band','Blues','Boogie woogie','British blues','Chicago blues','Classical','Classical crossover','Cool jazz','Country blues','Crossover jazz','Cubop','Delta blues','Dixieland','Electric blues','Free improvisation','Free jazz','Gospel','Gospel blues','Gregorian','Hard bop','Instrumental','Jazz','Jazz blues','Jazz funk','Jazz fusion','Jazz Hop','Jazz rock','Jazzcore','Jazzstep','Jive','Latin jazz','Modal jazz','Modern classical','Neo classical','New classical','Nu jazz','Opera','Piano blues','Post bop','Post jazz','Ragtime','Smooth jazz','Soul blues','Soul jazz','Space age','Stride','Swing','Talking blues','Texas blues','Third stream','Torch songs','Vocal jazz',
  ],
  'Roko muzika': [
    'Acid / Psychedelic Blues','Acoustic rock','Alternative rock','Americana','Anarcho punk','Arena rock','Art punk','Art rock','Atmospheric rock','Beat','Blues rock','Boogie rock','Britpop','Cello rock','Celtic rock','Chicano rock','Christian rock','Classic rock','College rock','Comedy rock','Country rock','Death rock','Dream pop','Electronic rock','Ethereal wave','Funk rock','Garage rock','Garage rock revival','Geek rock','German rock','Glam punk','Gothabilly','Gothic rock','Gypsy punk','Hard rock','Heartland rock','Indie pop','Indie rock','Industrial rock','Instrumental rock','Italian progressive rock','Jam band','Jangle pop','Latin rock','LT old rock','Math rock','Medieval rock','Mod Revival','Neo progressive rock','Neo psychedelia','Neue Deutsche Härte','Neue Deutsche Welle','New prog','New Wave','Noise pop','Noise rock','Occult rock','Oi!','Pagan rock','Piano rock','Post britpop','Post punk revival','Powerpop','Protopunk','Psychedelic folk','Psychedelic rock','Psychobilly','Pub rock','Punk blues','Queercore','Raga rock','Riot grrrl','Rock','Rock noir','Rock\'n\'roll','Rockabilly','Roots rock','Russian rock','Sadcore','Shock rock','Ska-core','Skate punk','Soft rock','Southern rock','Space rock','Street punk','Symphonic rock','Synthrock','Trip rock','Visual Kei',
  ],
  'Sunkioji muzika': [
    'Alternative metal','Avant-garde metal','Black metal','Cello metal','Celtic metal','Christian metal','Crossover thrash','Death metal','Death\'n\'roll','Death/doom','Deathcore','Deathgrind','Doom metal','Extreme metal','Flamenco metal','Folk metal','Funeral doom','Funk metal','Glam metal','Gothic metal','Grindcore','Groove metal','Heavy metal','Industrial metal','Mathcore','Medieval metal','Melodic death metal','Metal','Metalcore','Neo-classical metal','NSBM','Nu metal','Pagan metal','Post metal','Power metal','Progressive metal','Punk metal','Sludge metal','Southern metal','Speed metal','Symphonic metal','Technical death metal','Thrash metal','Thrashcore','Viking metal',
  ],
}

export const MONTHS = [
  'Sausio','Vasario','Kovo','Balandžio','Gegužės','Birželio',
  'Liepos','Rugpjūčio','Rugsėjo','Spalio','Lapkričio','Gruodžio',
]

export const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
