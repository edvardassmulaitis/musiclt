import { ArtistFormData, Member, GroupRef } from '@/components/ArtistForm'

type StoredArtist = ArtistFormData & { id: string; createdAt: string; updatedAt?: string }

export function loadArtists(): StoredArtist[] {
  if (typeof window === 'undefined') return []
  return JSON.parse(localStorage.getItem('artists') || '[]')
}

export function saveArtists(artists: StoredArtist[]) {
  localStorage.setItem('artists', JSON.stringify(artists))
}

/**
 * Save an artist and sync bidirectional relationships:
 * - If solo artist belongs to groups → add this artist to those groups' members
 * - If group → ensure listed members have this group in their groups list
 * Removes stale relationships automatically.
 */
export function saveArtistWithRelations(
  id: string,
  data: ArtistFormData,
  isNew = false
): StoredArtist {
  let artists = loadArtists()

  const now = new Date().toISOString()
  const saved: StoredArtist = isNew
    ? { ...data, id, createdAt: now }
    : { ...data, id, createdAt: artists.find(a => a.id === id)?.createdAt || now, updatedAt: now }

  // Upsert this artist
  if (isNew) {
    artists = [...artists, saved]
  } else {
    artists = artists.map(a => a.id === id ? saved : a)
  }

  // ── Sync: solo artist's groups ────────────────────────────────────────────
  if (data.type === 'solo') {
    const myGroups: GroupRef[] = data.groups || []

    // Add this artist to each listed group's members (if not already there)
    for (const gRef of myGroups) {
      artists = artists.map(a => {
        if (a.id !== gRef.id) return a
        const members: Member[] = a.members || []
        const alreadyIn = members.find(m => m.id === id)
        if (alreadyIn) {
          // Update years if they changed
          return {
            ...a,
            members: members.map(m => m.id === id
              ? { ...m, yearFrom: gRef.yearFrom, yearTo: gRef.yearTo }
              : m
            )
          }
        }
        // Add new member entry
        return {
          ...a,
          members: [...members, { id, name: data.name, yearFrom: gRef.yearFrom, yearTo: gRef.yearTo }]
        }
      })
    }

    // Remove this artist from groups they no longer belong to
    const currentGroupIds = new Set(myGroups.map(g => g.id))
    artists = artists.map(a => {
      if (a.type !== 'group') return a
      if (currentGroupIds.has(a.id)) return a // still a member, keep
      const hadMe = (a.members || []).some(m => m.id === id)
      if (!hadMe) return a
      return { ...a, members: (a.members || []).filter(m => m.id !== id) }
    })
  }

  // ── Sync: group's members ─────────────────────────────────────────────────
  if (data.type === 'group') {
    const myMembers: Member[] = data.members || []

    // Add this group to each member's groups list (if not already there)
    for (const mRef of myMembers) {
      artists = artists.map(a => {
        if (a.id !== mRef.id) return a
        const groups: GroupRef[] = a.groups || []
        const alreadyIn = groups.find(g => g.id === id)
        if (alreadyIn) {
          return {
            ...a,
            groups: groups.map(g => g.id === id
              ? { ...g, yearFrom: mRef.yearFrom, yearTo: mRef.yearTo }
              : g
            )
          }
        }
        return {
          ...a,
          groups: [...groups, { id, name: data.name, yearFrom: mRef.yearFrom, yearTo: mRef.yearTo }]
        }
      })
    }

    // Remove this group from members who are no longer listed
    const currentMemberIds = new Set(myMembers.map(m => m.id))
    artists = artists.map(a => {
      if (a.type !== 'solo') return a
      if (currentMemberIds.has(a.id)) return a
      const hadGroup = (a.groups || []).some(g => g.id === id)
      if (!hadGroup) return a
      return { ...a, groups: (a.groups || []).filter(g => g.id !== id) }
    })
  }

  saveArtists(artists)
  return saved
}
