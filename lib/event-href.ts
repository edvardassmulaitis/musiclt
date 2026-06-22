// lib/event-href.ts
//
// Client-safe pretty-URL helper'iai renginiams/festivaliams. Atskirti nuo
// lib/supabase-events.ts (serverinis, importuoja admin client'ą), kad juos
// galėtų naudoti IR kliento komponentai (events-client, festivals-client,
// EventInfoModal). DB slug istoriškai = `event-<legacy_id>` → kanoninis URL
// generuojamas iš pavadinimo + legacy_id.

import { slugify } from './slugify'

export type SlugRef = { slug?: string | null; title?: string | null; legacy_id?: number | string | null }

export function eventHref(ev: SlugRef): string {
  if (ev.legacy_id != null) return `/renginiai/${slugify(ev.title || 'renginys')}-${ev.legacy_id}`
  return `/renginiai/${ev.slug || ''}`
}

export function festivalHref(ev: SlugRef): string {
  if (ev.legacy_id != null) return `/festivaliai/${slugify(ev.title || 'festivalis')}-${ev.legacy_id}`
  return `/festivaliai/${ev.slug || ''}`
}
