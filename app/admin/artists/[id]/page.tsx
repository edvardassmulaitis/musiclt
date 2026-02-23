'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import ArtistForm, { ArtistFormData, emptyArtistForm } from '@/components/ArtistForm'

// Convert DB row → ArtistFormData

const GENRE_BY_ID: Record<number, string> = {
  1: 'Alternatyvioji muzika',
  2: 'Elektroninė, šokių muzika',
  3: "Hip-hop'o muzika",
  4: 'Kitų stilių muzika',
  5: 'Pop, R&B muzika',
  6: 'Rimtoji muzika',
  7: 'Roko muzika',
  8: 'Sunkioji muzika',
}

function dbToForm(data: any): ArtistFormData {
  return {
    ...emptyArtistForm,
    name:        data.name || '',
    type:        data.type || 'group',
    country:     data.country || 'Lietuva',
    genre:       data.genres?.[0] ? (GENRE_BY_ID[data.genres[0]] || '') : '',
    substyles:   [], // substyles handled separately via StyleModal
    description: data.description || '',
    yearStart:   data.active_from ? String(data.active_from) : '',
    yearEnd:     data.active_until ? String(data.active_until) : '',
    breaks:      data.breaks || [],
    avatar:      data.cover_image_url || '',
    photos:      data.photos || [],
    website:     data.website || '',
    subdomain:   data.subdomain || '',
    gender:      data.gender || '',
    birthYear:   data.birth_date ? data.birth_date.split('-')[0] : '',
    birthMonth:  data.birth_date ? data.birth_date.split('-')[1] : '',
    birthDay:    data.birth_date ? data.birth_date.split('-')[2] : '',
    deathYear:   data.death_date ? data.death_date.split('-')[0] : '',
    deathMonth:  data.death_date ? data.death_date.split('-')[1] : '',
    deathDay:    data.death_date ? data.death_date.split('-')[2] : '',
    facebook:    data.links?.facebook || '',
    instagram:   data.links?.instagram || '',
    youtube:     data.links?.youtube || '',
    tiktok:      data.links?.tiktok || '',
    spotify:     data.links?.spotify || '',
    soundcloud:  data.links?.soundcloud || '',
    bandcamp:    data.links?.bandcamp || '',
    twitter:     data.links?.twitter || '',
    members:     data.related?.filter((r: any) => r.type === 'solo') || [],
    groups:      data.related?.filter((r: any) => r.type === 'group') || [],
  }
}

// Convert ArtistFormData → DB payload

const GENRE_IDS: Record<string, number> = {
  'Alternatyvioji muzika': 1,
  'Elektroninė, šokių muzika': 2,
  "Hip-hop'o muzika": 3,
  'Kitų stilių muzika': 4,
  'Pop, R&B muzika': 5,
  'Rimtoji muzika': 6,
  'Roko muzika': 7,
  'Sunkioji muzika': 8,
}

function formToDb(form: ArtistFormData) {
  const genreIds: number[] = []
  if (form.genre && GENRE_IDS[form.genre]) genreIds.push(GENRE_IDS[form.genre])

  const birthDate = form.birthYear
    ? `${form.birthYear}-${String(form.birthMonth||1).padStart(2,'0')}-${String(form.birthDay||1).padStart(2,'0')}`
    : null
  const deathDate = form.deathYear
    ? `${form.deathYear}-${String(form.deathMonth||1).padStart(2,'0')}-${String(form.deathDay||1).padStart(2,'0')}`
    : null

  return {
    name:               form.name,
    type:               form.type,
    country:            form.country,
    type_music:         true,
    type_film:          false,
    type_dance:         false,
    type_books:         false,
    active_from:        form.yearStart ? parseInt(form.yearStart) : null,
    active_until:       form.yearEnd   ? parseInt(form.yearEnd)   : null,
    description:        form.description,
    cover_image_url:    form.avatar,
    website:            form.website,
    subdomain:          form.subdomain,
    gender:             form.gender,
    birth_date:         birthDate,
    death_date:         deathDate,
    genres:             genreIds,
    breaks:             form.breaks,
    photos:             form.photos,
    links: {
      facebook:   form.facebook,
      instagram:  form.instagram,
      youtube:    form.youtube,
      tiktok:     form.tiktok,
      spotify:    form.spotify,
      soundcloud: form.soundcloud,
      bandcamp:   form.bandcamp,
      twitter:    form.twitter,
    },
    related: [
      ...(form.members||[]).map(m=>({ id: typeof m.id==='string' ? parseInt(m.id) : Number(m.id), yearFrom: m.yearFrom, yearTo: m.yearTo })),
      ...(form.groups||[]).map(g=>({ id: typeof g.id==='string' ? parseInt(g.id) : Number(g.id), yearFrom: g.yearFrom, yearTo: g.yearTo })),
    ],
  }
}

export default function EditArtist() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const [initialData, setInitialData] = useState<ArtistFormData | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status !== 'authenticated') return

    fetch(`/api/artists/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { alert('Atlikėjas nerastas!'); router.push('/admin/artists'); return }
        setInitialData(dbToForm(data))
      })
  }, [status, isAdmin, params.id, router])

  const handleSubmit = async (form: ArtistFormData) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/artists/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToDb(form)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/admin/artists')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || !initialData) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg">
          ❌ {error}
        </div>
      )}
      <ArtistForm
        title="✏️ Redaguoti atlikėją"
        submitLabel={saving ? 'Saugoma...' : 'Išsaugoti pakeitimus'}
        backHref="/admin/artists"
        initialData={initialData}
        artistId={params.id as string}
        onSubmit={handleSubmit}
      />
    </>
  )
}
