'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import WikipediaImportDiscography from '@/components/WikipediaImportDiscography'
import ArtistForm, { ArtistFormData, emptyArtistForm } from '@/components/ArtistForm'

const GENRE_BY_ID: Record<number, string> = {
  1000001: 'Alternatyvioji muzika',
  1000002: 'Elektroninė, šokių muzika',
  1000003: "Hip-hop'o muzika",
  1000004: 'Kitų stilių muzika',
  1000005: 'Pop, R&B muzika',
  1000006: 'Rimtoji muzika',
  1000007: 'Roko muzika',
  1000008: 'Sunkioji muzika',
}

function dbToForm(data: any): ArtistFormData {
  return {
    ...emptyArtistForm,
    name:        data.name || '',
    type:        data.type || 'group',
    country:     data.country || 'Lietuva',
    genre:       data.genres?.[0] ? (GENRE_BY_ID[data.genres[0]] || '') : '',
    substyles:   data.substyleNames || [],
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

const GENRE_IDS: Record<string, number> = {
  'Alternatyvioji muzika': 1000001,
  'Elektroninė, šokių muzika': 1000002,
  "Hip-hop'o muzika": 1000003,
  'Kitų stilių muzika': 1000004,
  'Pop, R&B muzika': 1000005,
  'Rimtoji muzika': 1000006,
  'Roko muzika': 1000007,
  'Sunkioji muzika': 1000008,
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
    substyleNames:      form.substyles || [],
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
  const [artistName, setArtistName] = useState('')
  const [albumCount, setAlbumCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  const artistId = params.id as string

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/auth/signin'); return }
    if (status === 'authenticated' && !isAdmin) { router.push('/'); return }
    if (status !== 'authenticated') return

    fetch(`/api/artists/${artistId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { alert('Atlikėjas nerastas!'); router.push('/admin/artists'); return }
        setInitialData(dbToForm(data))
        setArtistName(data.name || '')
      })

    fetch(`/api/albums?artist_id=${artistId}&limit=1`)
      .then(r => r.json())
      .then(data => setAlbumCount(data.total ?? 0))
      .catch(() => setAlbumCount(0))
  }, [status, isAdmin, artistId, router])

  const handleSubmit = async (form: ArtistFormData) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/artists/${artistId}`, {
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

      {/* Viršutinė juosta */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-wrap">
        <Link
          href={`/admin/albums?artist_id=${artistId}`}
          className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-sm font-medium transition-colors"
        >
          💿 Diskografija
          {albumCount !== null && (
            <span className="bg-purple-200 text-purple-800 text-xs font-bold px-1.5 py-0.5 rounded-full">
              {albumCount}
            </span>
          )}
        </Link>
        <Link
          href={`/admin/albums/new?artist_id=${artistId}`}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          + Naujas albumas
        </Link>
        {artistName && (
          <WikipediaImportDiscography
            artistId={parseInt(artistId)}
            artistName={artistName}
            artistWikiTitle={artistName.replace(/ /g, '_')}
          />
        )}
      </div>

      <ArtistForm
        title="✏️ Redaguoti atlikėją"
        submitLabel={saving ? 'Saugoma...' : 'Išsaugoti pakeitimus'}
        backHref="/admin/artists"
        initialData={initialData}
        artistId={artistId}
        onSubmit={handleSubmit}
      />
    </>
  )
}
