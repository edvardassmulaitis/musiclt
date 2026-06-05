// app/atradimai/page.tsx
//
// Bendruomenės srautas pervadintas į /feed (2026-06-05). Šis URL palaikomas
// dėl senų nuorodų — 308 permanent redirect į /feed. „Muzikos atradimai"
// (kita funkcija) gyvena /muzikos-atradimai.

import { permanentRedirect } from 'next/navigation'

export default function AtradimaiRedirect() {
  permanentRedirect('/feed')
}
