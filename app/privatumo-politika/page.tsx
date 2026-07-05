// app/privatumo-politika/page.tsx
//
// Privatumo politika. Statinis, viešas, SEO-indeksuojamas puslapis.
//
// PASTABA REDAGUOJANČIAM: šis tekstas parengtas kaip pagrįstas juodraštis pagal
// realią kodo bazę (Supabase, Vercel, Google/Gmail, jokių reklamos/analitikos
// sekimo skriptų). Prieš laikant tai galutiniu teisiniu dokumentu, patikslinti:
//   • tikslų duomenų valdytojo pavadinimą / registracijos formą (jei įregistruota),
//   • kontaktinį el. paštą, jei nori kito nei nurodytas /kontaktai puslapyje.
// Rekomenduojama peržiūra su teisininku prieš pilną paleidimą.

import type { Metadata } from 'next'
import { LegalLayout } from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: 'Privatumo politika — Music.lt',
  description: 'Kaip Music.lt renka, naudoja ir saugo jūsų asmens duomenis: paskyros informacija, slapukai, jūsų teisės pagal BDAR.',
  alternates: { canonical: '/privatumo-politika' },
  robots: { index: true, follow: true },
}

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      eyebrow="Teisinė informacija"
      title="Privatumo politika"
      updated="2026 m. liepos 5 d."
      intro="Ši politika paaiškina, kokius duomenis renkame naudodamiesi Music.lt platforma, kam juos naudojame ir kokias teises turite pagal Bendrąjį duomenų apsaugos reglamentą (BDAR/GDPR)."
    >
      <h2>1. Bendrosios nuostatos</h2>
      <p>
        Music.lt (toliau — <strong>Platforma</strong>) yra Lietuvos muzikos ekosistemos portalas: atlikėjų
        ir albumų katalogas, naujienos, topai, koncertų kalendorius bei bendruomenės funkcijos (blogas,
        diskusijos, komentarai, „Dienos daina“). Ši politika taikoma visiems, kas naudojasi svetaine
        <code> music.lt</code> (įskaitant tarpinį adresą <code>musiclt.vercel.app</code>).
      </p>

      <h2>2. Duomenų valdytojas</h2>
      <p>
        Duomenis tvarko Music.lt administracija. Visais su privatumu susijusiais klausimais galite kreiptis
        per <a href="/kontaktai">Kontaktų puslapį</a>. Tikslūs juridinio asmens rekvizitai (jei ir kai
        Platforma veiks per registruotą įmonę) bus nurodyti čia.
      </p>

      <h2>3. Kokius duomenis renkame</h2>
      <ul>
        <li><strong>Registracijos duomenys:</strong> el. paštas, vartotojo vardas, slaptažodis (saugomas užšifruotas per Supabase Auth arba per Google OAuth prisijungimą — tokiu atveju slaptažodžio nematome ir nesaugome).</li>
        <li><strong>Profilio duomenys:</strong> tai, ką patys nurodote — profilio nuotrauka, bio, mėgstami atlikėjai/žanrai, atlikėjo profilio (jei valdote atlikėją) informacija ir socialinių tinklų nuorodos.</li>
        <li><strong>Jūsų sukurtas turinys:</strong> blog’o įrašai, komentarai, diskusijų žinutės, balsavimai, „Dienos daina“ pasiūlymai, patikimai (like).</li>
        <li><strong>Techniniai duomenys:</strong> IP adresas, naršyklės tipas, apytikslis regionas ir naudojimosi statistika — tik siekiant užtikrinti saugumą, spręsti sutrikimus ir suprasti bendrą svetainės naudojimą. <strong>Nenaudojame</strong> trečiųjų šalių reklamos ar sekimo analitikos (pvz., Google Analytics, Meta Pixel) šiuo metu.</li>
        <li><strong>Pranešimai:</strong> jei įjungiate „push“ pranešimus, saugomas naršyklės sugeneruotas prenumeratos raktas, reikalingas pranešimams siųsti.</li>
      </ul>

      <h2>4. Kam naudojame duomenis</h2>
      <ul>
        <li>Paskyros sukūrimui, prisijungimui ir saugumui (teisinis pagrindas: sutarties vykdymas).</li>
        <li>Platformos funkcijoms teikti — komentarai, blogas, atlikėjo profilio valdymas, pranešimai apie sekamų atlikėjų naujienas (sutarties vykdymas / teisėtas interesas).</li>
        <li>Elektroniniams laiškams siųsti — paskyros patvirtinimas, atlikėjo profilio patvirtinimas, atlikėjo žinutės fanams, kuriuos sekate (sutikimas / teisėtas interesas).</li>
        <li>Saugumui užtikrinti ir piktnaudžiavimui (spam, sukčiavimas, netinkamas turinys) užkardyti (teisėtas interesas).</li>
        <li>Platformai tobulinti — bendra, agreguota naudojimosi statistika, be individualaus sekimo trečiosioms šalims.</li>
      </ul>

      <h2>5. Slapukai (cookies)</h2>
      <p>
        Naudojame tik <strong>būtinuosius / funkcinius</strong> slapukus:
      </p>
      <ul>
        <li><code>music-lt-theme</code> — įsimena jūsų pasirinktą šviesų/tamsų dizaino režimą.</li>
        <li>Autentifikacijos sesijos slapukai (Supabase Auth / NextAuth) — kad liktumėte prisijungę.</li>
      </ul>
      <p>
        Reklamos ar trečiųjų šalių sekimo slapukų nenaudojame. Kai kuriuose puslapiuose (pvz., blog’o
        įrašuose ar atlikėjų profiliuose) gali būti įterpti <strong>YouTube</strong> ar <strong>Spotify</strong>
        grotuvai — juos įkėlus, šios trečiosios šalys gali nustatyti savo slapukus pagal savo pačių
        privatumo politikas, kurių Music.lt nekontroliuoja.
      </p>

      <h2>6. Duomenų saugojimas ir paslaugų teikėjai</h2>
      <p>Duomenys saugomi ir tvarkomi pasitelkiant šiuos patikimus paslaugų teikėjus (duomenų tvarkytojus):</p>
      <ul>
        <li><strong>Supabase</strong> — duomenų bazė, failų saugykla ir autentifikacija.</li>
        <li><strong>Vercel</strong> — svetainės talpinimas (hostingas).</li>
        <li><strong>Google</strong> — prisijungimas per Google paskyrą (OAuth) ir sistemos siunčiami el. laiškai.</li>
        <li><strong>Resend</strong> — kai kurių transakcinių el. laiškų siuntimas.</li>
      </ul>
      <p>
        Šie teikėjai duomenis tvarko pagal savo saugumo standartus ir tik tiek, kiek reikia paslaugai
        suteikti. Duomenų neparduodame ir neperduodame trečiosioms šalims rinkodaros tikslais.
      </p>

      <h2>7. Duomenų saugojimo trukmė</h2>
      <p>
        Paskyros duomenis saugome tol, kol paskyra aktyvi. Ištrynus paskyrą, asmens duomenys pašalinami
        arba nuasmeninami per protingą terminą, išskyrus atvejus, kai duomenis privalome saugoti ilgiau
        dėl teisinių pareigų (pvz., sukčiavimo prevencijos įrašai).
      </p>

      <h2>8. Jūsų teisės pagal BDAR</h2>
      <p>Turite teisę:</p>
      <ul>
        <li>susipažinti su savo tvarkomais duomenimis;</li>
        <li>reikalauti ištaisyti netikslius duomenis;</li>
        <li>reikalauti ištrinti duomenis („teisė būti pamirštam“);</li>
        <li>apriboti arba nesutikti su duomenų tvarkymu;</li>
        <li>gauti duomenis perkeliamu formatu;</li>
        <li>pateikti skundą Valstybinei duomenų apsaugos inspekcijai (<a href="https://vdai.lrv.lt" target="_blank" rel="noreferrer noopener">vdai.lrv.lt</a>).</li>
      </ul>
      <p>Šias teises galite įgyvendinti kreipdamiesi per <a href="/kontaktai">Kontaktų puslapį</a>.</p>

      <h2>9. Vaikų privatumas</h2>
      <p>
        Platforma nėra skirta jaunesniems nei 16 metų asmenims be tėvų ar globėjų sutikimo. Jei sužinome,
        kad be tokio sutikimo surinkome jaunesnio asmens duomenis, juos pašalinsime.
      </p>

      <h2>10. Politikos pakeitimai</h2>
      <p>
        Ši politika gali būti atnaujinama. Esminius pakeitimus paskelbsime šiame puslapyje su nauja
        atnaujinimo data.
      </p>

      <h2>11. Kontaktai</h2>
      <p>
        Klausimus dėl privatumo ir asmens duomenų tvarkymo siųskite per <a href="/kontaktai">Kontaktų puslapį</a>.
      </p>
    </LegalLayout>
  )
}
