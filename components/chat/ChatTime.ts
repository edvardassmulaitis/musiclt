// Datų formatavimo helper'iai chat UI'ui.

export function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - t)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'ką tik'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} val.`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} d.`
  return new Date(iso).toLocaleDateString('lt-LT', { day: 'numeric', month: 'short' })
}

// Konkretus laikas — naudojamas žinučių antraštėms (Slack rodo "11:42").
export function formatHM(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })
}

// Sidebar — trumpa data: jei šiandien → "11:42"; vakar → "vakar"; kitas → "29.04"
export function formatSidebarTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return formatHM(iso)
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'vakar'
  return d.toLocaleDateString('lt-LT', { day: '2-digit', month: '2-digit' })
}

// Date separator žinučių sraute — "Šiandien", "Vakar", "Pirmadienis 28 bal."
export function formatDateSeparator(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return 'Šiandien'
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Vakar'
  return d.toLocaleDateString('lt-LT', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Jei dvi žinutės to pačio user'io eina seka <5min → grupuojam (be antraštės).
export function shouldGroup(prev: { user_id: string; created_at: string } | null, curr: { user_id: string; created_at: string }): boolean {
  if (!prev) return false
  if (prev.user_id !== curr.user_id) return false
  const t1 = new Date(prev.created_at).getTime()
  const t2 = new Date(curr.created_at).getTime()
  return Math.abs(t2 - t1) < 5 * 60_000
}

// Date separator — true jei kita diena nei prev.
export function shouldShowDateSep(prev: { created_at: string } | null, curr: { created_at: string }): boolean {
  if (!prev) return true
  return new Date(prev.created_at).toDateString() !== new Date(curr.created_at).toDateString()
}
