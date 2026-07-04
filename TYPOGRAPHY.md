# Tipografijos skalė (music.lt)

Vienas tiesos šaltinis šriftų dydžiams visoje svetainėje. Naudok **tik** šiuos
žingsnius — jokių „pusinių" (13.5, 12.5, 11…) ar atsitiktinių dydžių, kad UI
liktų nuoseklus.

| px | Tailwind | Semantika |
|----|----------|-----------|
| **12** | `text-xs` | meta, žymos (badge), laikai („prieš 2 sav."), smulkios etiketės |
| **14** | `text-sm` | antrinis tekstas, paantraštės, atlikėjų vardai, kūnas kortelėse |
| **16** | `text-base` | pagrindinis kūnas, kortelių pavadinimai, akcentuotas tekstas |
| **20** | `text-lg` | sekcijų antraštės (visos vienodos) |
| **24** | `text-xl` | didesnės antraštės |
| **30** | `text-2xl` | hero / display |

Didesni „display" dydžiai (≥22px: hero, dideli skaičiai, ikonos) — pagal poreikį,
bet venk naujų tarpinių reikšmių.

## Taisyklės
- **Sekcijų antraštės** visada per `SectionHead` komponentą (arba `text-[20px]`),
  niekada ne kitokio dydžio inline `<h2>`.
- **Naujam tekstui** rinkis artimiausią skalės žingsnį, ne „tikslų" px.
- Skalė apibrėžta `tailwind.config.js` (`theme.extend.fontSize`) — pavadintos
  klasės (`text-xs`…`text-2xl`) jau atitinka lentelę.
- CSS-in-JS `<style>` blokuose (pvz. reels) naudok tas pačias px reikšmes.

## Istorija
2026-07: suvienodinta iš ~15 skirtingų dydžių (su pusiniais žingsniais 10.5,
11.5, 12.5, 13.5…) į šią 6 žingsnių skalę — visi `text-[Npx]`, inline
`fontSize` ir CSS `font-size` priderinti prie artimiausio žingsnio.
