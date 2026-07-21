// Bendra bendruomenės įrašų „tipo" logika — badge'ai + spalvos.
// Naudojama /bendruomene IR /v2 „Kas naujo?" sekcijoje, kad badge'ai sutaptų.

export const KIND_META: Record<string, { label: string; color: string }> = {
  apzvalga: { label: 'Muzikos apžvalga', color: '#ef4444' },
  koncertai: { label: 'Koncertų įspūdžiai', color: '#3b82f6' },
  topas: { label: 'Topas', color: '#f59e0b' },
  atradimas: { label: 'Atradimas', color: 'var(--accent-orange)' },
  diskusija: { label: 'Diskusija', color: '#8b5cf6' },
  kuryba: { label: 'Kūryba', color: '#ec4899' },
  vertimas: { label: 'Vertimas', color: '#10b981' },
  irasas: { label: 'Įrašas', color: '#94a3b8' },
}

export function kindColor(kind: string): string {
  return (KIND_META[kind] || KIND_META.irasas).color
}

export function KindBadge({ kind, abs = true, label }: { kind: string; abs?: boolean; label?: string }) {
  const m = KIND_META[kind] || KIND_META.irasas
  // !abs — inline-flex + self-start, kad flex-col tėvas neištemptų per visą plotį.
  return (
    <span className={`${abs ? 'absolute left-3 top-3 z-[2]' : 'inline-flex self-start'} rounded-[7px] px-2 py-1 font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.08em] text-white`}
      style={{ background: m.color }}>{label || m.label}</span>
  )
}

// home/community feed'o item (type/subtype/editorial_type) → KIND_META raktas.
// Ta pati logika kaip /bendruomene postKind().
export function communityItemKind(it: { type?: string | null; subtype?: string | null; editorial_type?: string | null }): string {
  if (it.type === 'discussion') return 'diskusija'
  if (it.type === 'atradimas') return 'atradimas'
  if (it.subtype === 'topas') return 'topas'
  if (it.subtype === 'review' || it.editorial_type === 'recenzija') return 'apzvalga'
  if (it.editorial_type === 'koncertai') return 'koncertai'
  if (it.subtype === 'creation') return 'kuryba'
  if (it.subtype === 'translation') return 'vertimas'
  return 'irasas'
}
