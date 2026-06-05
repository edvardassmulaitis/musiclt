// app/feed/page.tsx
//
// Bendruomenės hub'as pervadintas į /atrasti (2026-06-05). Šis URL palaikomas
// dėl senų nuorodų — 308 redirect (middleware'e). Page-lygio fallback'as, jei
// middleware nepagautų.

import { permanentRedirect } from 'next/navigation'

export default function FeedRedirect() {
  permanentRedirect('/atrasti')
}
