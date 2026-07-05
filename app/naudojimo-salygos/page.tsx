// app/naudojimo-salygos/page.tsx
//
// Naudojimo sąlygos. Statinis, viešas, SEO-indeksuojamas puslapis.
// Žr. pastabą app/privatumo-politika/page.tsx viršuje — rekomenduojama
// teisininko peržiūra prieš laikant galutiniu dokumentu.

import type { Metadata } from 'next'
import { LegalLayout } from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: 'Naudojimo sąlygos — Music.lt',
  description: 'Music.lt platformos naudojimo sąlygos: paskyra, naudotojų turinys, atlikėjų profiliai, elgesio taisyklės ir atsakomybės apribojimas.',
  alternates: { canonical: '/naudojimo-salygos' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return (
    <LegalLayout
      eyebrow="Teisinė informacija"
      title="Naudojimo sąlygos"
      updated="2026 m. liepos 5 d."
      intro="Naudodamiesi Music.lt platforma, sutinkate su šiomis sąlygomis. Prašome jas atidžiai perskaityti."
    >
      <h2>1. Bendrosios nuostatos</h2>
      <p>
        Music.lt (toliau — <strong>Platforma</strong>) yra Lietuvos muzikos ekosistemos portalas —
        atlikėjų ir albumų katalogas, naujienos, topai, koncertų kalendorius ir bendruomenės funkcijos.
        Naudodamiesi Platforma (registruoti ar ne), sutinkate laikytis šių sąlygų.
      </p>

      <h2>2. Paskyra</h2>
      <ul>
        <li>Kai kurioms funkcijoms (komentarai, blogas, atlikėjo profilio valdymas, „patinka“) reikalinga paskyra.</li>
        <li>Esate atsakingi už savo paskyros duomenų (slaptažodžio) saugumą ir visą veiklą, atliktą prisijungus prie jūsų paskyros.</li>
        <li>Pateikiama registracijos informacija turi būti teisinga; draudžiama apsimesti kitu asmeniu ar atlikėju, kurio nesate.</li>
      </ul>

      <h2>3. Jūsų turinys</h2>
      <p>
        Blog’o įrašai, komentarai, „Dienos daina“ pasiūlymai ir kitas jūsų sukurtas turinys išlieka jūsų
        nuosavybė. Paskelbdami turinį Platformoje, suteikiate Music.lt neišimtinę, neatlygintiną teisę jį
        rodyti, saugoti ir techniškai apdoroti tiek, kiek reikia Platformos veikimui (pvz., miniatiūrų
        generavimui, rodymui feed’uose).
      </p>
      <p>
        Esate atsakingi už savo skelbiamą turinį. Draudžiama skelbti turinį, kuris:
      </p>
      <ul>
        <li>pažeidžia trečiųjų šalių autorių teises ar kitas intelektinės nuosavybės teises;</li>
        <li>yra šmeižikiškas, neapykantą kurstantis, grasinantis ar priekabiaujantis;</li>
        <li>yra šlamštas (spam), klaidinantis ar apgaulingas;</li>
        <li>pažeidžia galiojančius Lietuvos Respublikos ar Europos Sąjungos teisės aktus.</li>
      </ul>
      <p>
        Pasiliekame teisę pašalinti turinį arba apriboti paskyrą, jei manome, kad šios sąlygos pažeidžiamos.
      </p>

      <h2>4. Atlikėjų profiliai</h2>
      <p>
        Atlikėjų profiliai gali būti sukurti automatiškai (viešai prieinamų duomenų pagrindu) arba
        atlikėjų/jų atstovų. Norėdami perimti (claim) savo atlikėjo profilio valdymą, turite pateikti
        įrodymą, kad esate tas atlikėjas ar jo įgaliotas atstovas (pvz., nuorodą į oficialų socialinio
        tinklo profilį). Melagingas prisistatymas kito atlikėju yra šių sąlygų pažeidimas.
      </p>

      <h2>5. Intelektinė nuosavybė</h2>
      <p>
        Platformos dizainas, prekės ženklas „Music.lt“ ir programinis kodas priklauso Music.lt (ar jos
        licencijos davėjams). Katalogo duomenys apie atlikėjus, albumus ir dainas gali būti sudaryti iš
        viešai prieinamų šaltinių ir naudotojų įnašų.
      </p>

      <h2>6. Trečiųjų šalių turinys ir nuorodos</h2>
      <p>
        Platformoje gali būti nuorodų ar įterptinio turinio iš trečiųjų šalių (YouTube, Spotify, socialiniai
        tinklai). Music.lt neatsako už tokio išorinio turinio tikslumą ar prieinamumą.
      </p>

      <h2>7. Paslaugos pakeitimai</h2>
      <p>
        Platforma vystoma nuolat — funkcijos gali keistis, būti pridedamos ar pašalinamos. Stengiamės
        apie esminius pakeitimus informuoti iš anksto, tačiau to negarantuojame visais atvejais.
      </p>

      <h2>8. Atsakomybės apribojimas</h2>
      <p>
        Platforma teikiama „tokia, kokia yra“. Nors siekiame tikslumo, negarantuojame, kad visa informacija
        (pvz., koncertų datos, katalogo duomenys) yra visada tiksli ar aktuali. Tiek, kiek leidžia
        įstatymai, Music.lt neatsako už netiesioginius nuostolius, atsiradusius naudojantis Platforma.
      </p>

      <h2>9. Paskyros nutraukimas</h2>
      <p>
        Galite bet kada nutraukti naudojimąsi Platforma ir paprašyti ištrinti paskyrą per
        <a href="/kontaktai"> Kontaktų puslapį</a>. Pasiliekame teisę sustabdyti ar panaikinti paskyrą,
        šiurkščiai pažeidus šias sąlygas.
      </p>

      <h2>10. Taikoma teisė</h2>
      <p>
        Šioms sąlygoms taikoma Lietuvos Respublikos teisė. Ginčai sprendžiami derybomis, o
        nepavykus susitarti — Lietuvos Respublikos teismuose įstatymų nustatyta tvarka.
      </p>

      <h2>11. Kontaktai</h2>
      <p>Klausimus dėl šių sąlygų siųskite per <a href="/kontaktai">Kontaktų puslapį</a>.</p>
    </LegalLayout>
  )
}
