# Naktinis testavimas — 2026-04-29

Push'inta `d66e9ce` (`fix(player): pause crash — stable wrapper + JS-owned inner div`).

## ✅ VERIFIKUOTA LIVE BROWSER

### Pause crash (NotFoundError removeChild)
- **Root cause:** JSX flip'inosi `playing ? <div ref={containerRef}> : <button>` kai useris paspaudžia pause. YT.Player(div) buvo pakeitęs div'ą su iframe; kai React unmount'ino div fiber'į, `parent.removeChild(originalDiv)` fail'indavo, nes original'us div jau buvo pakeistas iframe'u.
- **Fix:** wrapper'is (`containerRef`) visada mounted, niekada nekeičia tipo. Į vidų per JS (ne React) įdedam fresh inner div'ą, kurį YT.Player konsumuoja. Play overlay button'as rodomas absoliučiai ant viršaus kai `!playing`.
- **Test cycle:** Trys Milijonai → play → pause (no crash) → resume → pause → play → pause × 4 spaudimų be crash'o. Aš miręs ir Saulės Vartai modal'uose taip pat.
- **Console:** 0 errors per visus test'us.

### Self-like protection (komentarą pasi-laikinti)
- **Defense layers:**
  1. `disabled={true}` ant `<button>` HTML
  2. `pointer-events: none` ant disabled wrapper
  3. `safeToggle()` defensive check funkcijoje (rollback on backend 403)
- **Test:** synthetic `.click()` + `dispatchEvent(MouseEvent)` ant disabled like button'o → comment text be pakeitimo, count stable.

### Music attachment chip → new tab
- `target="_blank" rel="noopener"` + external-link svg ant chip'o dešinės.
- Test: matomas Saulės Vartai chip'as Edvardo komentaruose su naujo lango ikona.

### Album chips overflow (artist title row)
- 2 chip'ai matomi + `(+N)` overflow pill'as su tooltip listing remaining albums.
- Verifikuota Trys Milijonai modal'e: matomas "Pasveikinkit vieni kitus" + "Gyvo garso koncertas" + "+1" su tooltip'u "Padavimai apie žmones".

## ⏳ NEPATESTUOTA / PALIKTA

### Multi-line lyric selection
Pataisymas pushinta anksčiau (commit a151072 / d7f0260): split'inta į `highlightSpans` (overlap-based) + `chipSpans` (start-based). Reikia praktinio testo — bet automated browser test trūksta multi-line text selection support'o per Chrome MCP.

**Kaip patestuoti rytoj rankomis:**
1. Atidaryk Trys Milijonai modal
2. Click first lyric line → drag to 3rd line → release
3. Tikėtina: visos 3 linijos paryškintos oranžiniu fonu, viena chip strip atsiranda dešinėje
4. Click chip → reaction įsiregistruoja (turi save'inti į `track_lyric_comments` su tomis kelių linijų indices)

### Side video viewer iš modal'o
Atidėtas — reikia portal-based solution kad video būtų matomas šalia modal'o be duplicate audio. Šiuo metu iframe'as išliko tik artist hero player'yje.

### Mobile multi-tap to extend selection
Atidėta — desktop ir taip veikia pakankamai gerai, mobile tap pridėjimas reikalauja papildomo dizaino (tap line → "+ " ant adjacent) kad neužblokuotų natural'aus tap'o.

### Migration `20260429_entity_comments_hidden.sql`
Failas `musiclt/supabase/migrations/20260429_entity_comments_hidden.sql` — pridedam `is_hidden boolean DEFAULT false` ant `entity_comments`. **Reikia tau aplied'inti** per Supabase dashboard SQL editor:

```sql
ALTER TABLE public.entity_comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
```

API kodas turi graceful fallback'ą jei stulpelio nėra, bet kol nesumigruota, admin'o "Slėpti" mygtukas neveiks pilnai (komentaras nepradins).

## 🧠 MEMORY SAVED

- `feedback_yt_iframe_react.md` — pattern'as ateityje. YT.Player(target) replaces target su iframe; React'as fiber'is laiko stale pointer'į. Reikia stable wrapper + JS-owned inner div (ne React JSX). Pridėta į MEMORY.md.
