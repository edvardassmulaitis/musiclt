# Puslapių išdėstymo taisyklės (Page Layout Rules)

Vienos, privalomos taisyklės VISIEMS top-level puslapiams, kad turinio plotis,
antraščių dydžiai, paraštės ir tarpai būtų vienodi visoje svetainėje.

Visi tokenai gyvena `app/globals.css` bloke **PAGE LAYOUT SYSTEM**. Vertes keisk
**TIK ten** — pakeitimas atsinaujina globaliai visuose puslapiuose.

## Kanoninės vertės

| Tokenas | Vertė | Reikšmė |
|---|---|---|
| `--page-max` | `1280px` | turinio plotis (konteineris centruotas) |
| `--page-pad-x` | `24px` | horizontali paraštė (desktop) |
| `--page-pad-x-sm` | `16px` | horizontali paraštė (≤640px) |
| `--page-pad-top` | `28px` | viršus iki antraštės |
| `--page-pad-bottom` | `80px` | apačia (vieta mobile barui) |
| `--page-h1-size` | `clamp(1.75rem, 1.2rem + 1.6vw, 2.25rem)` | H1 ~28px → 36px |
| `--page-h1-weight` | `900` | H1 storis |
| `--page-h1-tracking` | `-0.025em` | H1 letter-spacing |
| `--page-sub-size` | `14.5px` | paantraštės dydis |
| `--page-sub-color` | `var(--text-muted)` | paantraštės spalva |
| `--page-sub-max` | `640px` | paantraštės/teksto plotis |
| `--page-head-gap` | `22px` | tarpas po antraštės bloku |
| `--page-section-gap` | `34px` | tarpas tarp sekcijų |

H1 šriftas visada `'Outfit', sans-serif`. Pagrindinis turinio šriftas `'DM Sans'`.

## Kaip naudoti naujame puslapyje

Paprasčiausias kelias — bendros klasės:

```tsx
export default function Page() {
  return (
    <div className="page-shell">
      <header className="page-head">
        <h1>Puslapio pavadinimas</h1>
        <p>Trumpa paantraštė viena eilute.</p>
      </header>

      {/* turinys */}
    </div>
  )
}
```

`.page-shell` suteikia plotį + paraštes + viršaus/apačios tarpus.
`.page-head` suteikia H1/paantraštės tipografiją ir tarpą iki turinio.

## Jei puslapis turi savą `<style>` bloką (CSS klases)

Nedubliuok skaičių — **nurodyk į tokenus**, kad liktų sinchronizuota:

```css
.mano-wrap   { max-width: var(--page-max); margin: 0 auto;
               padding: var(--page-pad-top) var(--page-pad-x) var(--page-pad-bottom); }
.mano-title  { font-family: 'Outfit', sans-serif; font-size: var(--page-h1-size);
               font-weight: var(--page-h1-weight); letter-spacing: var(--page-h1-tracking);
               line-height: 1.05; }
.mano-sub    { font-size: var(--page-sub-size); color: var(--page-sub-color);
               line-height: 1.55; max-width: var(--page-sub-max); }

@media (max-width: 640px) {
  .mano-wrap { padding-left: var(--page-pad-x-sm); padding-right: var(--page-pad-x-sm); }
}
```

## Taisyklės (DON'T)

- ❌ Nerašyk fiksuotų pločių (`1400px`, `1320`, `1080`…) puslapio konteineriui — naudok `var(--page-max)`.
- ❌ Nerašyk savų H1 dydžių (`text-4xl`, `clamp(30px,5vw,46px)`…) — naudok `.page-head h1` arba `var(--page-h1-size)`.
- ❌ Nemaišyk paantraštės spalvų — visada `var(--page-sub-color)`.
- ✅ Reikia kitokio pločio (pvz. siauras straipsnis)? Naudok atskirą vidinį konteinerį turiniui, bet **išorinis `.page-shell` lieka**.

## Jau suvienodinta (2026-06-04)

`muzika`, `topai`, `koncertai`/`renginiai`, `naujienos`, `atradimai`, `skelbimai`.
Šie buvo nuo 1080–1400px pločio ir 30–51px H1 → dabar visi 1280px / ~36px H1.
