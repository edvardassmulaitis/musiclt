import { permanentRedirect } from 'next/navigation'

// Hub'as pervadintas į „Koncertai". Pagrindinis 301/308 vyksta next.config.js
// redirects() lygyje; čia paliekamas atsarginis serverio redirect'as.
export default function RenginiaiRedirect() {
  permanentRedirect('/koncertai')
}
