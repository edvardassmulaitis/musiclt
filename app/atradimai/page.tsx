// app/atradimai/page.tsx
//
// Bendruomenės hub'as: /atradimai → /feed → /atrasti (2026-06-05). Šis URL
// palaikomas dėl senų nuorodų — 308 redirect (middleware'e). „Muzikos
// atradimai" (kita funkcija) gyvena /muzikos-atradimai.

import { permanentRedirect } from 'next/navigation'

export default function AtradimaiRedirect() {
  permanentRedirect('/atrasti')
}
