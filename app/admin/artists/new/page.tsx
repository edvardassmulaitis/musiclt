'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import ArtistForm, { ArtistFormData, emptyArtistForm } from '@/components/ArtistForm'

function formToDb(form: ArtistFormData) {
  const genreIds = [
    form.genre ? parseInt(form.genre) : null,
    ...(form.substyles || []).map(s => parseInt(s))
  ].filter(Boolean) as number[]

  const birthDate = form.birthYear
    ? `${form.birthYear}-${String(form.birthMonth||1).padStart(2,'0')}-${String(form.birthDay||1).padStart(2,'0')}`
    : null
  const deathDate = form.deathYear
    ? `${form.deathYear}-${String(form.deathMonth||1).padStart(2,'0')}-${String(form.deathDay||1).padStart(2,'0')}`
    : null

  return {
    name:            form.name,
    type:            form.type,
    country:         form.country,
    type_music:      true,
    type_film:       false,
    type_dance:      false,
    type_books:      false,
    active_from:     form.yearStart ? parseInt(form.yearStart) : null,
    active_until:    form.yearEnd   ? parseInt(form.yearEnd)   : null,
    description:     form.description,
    cover_image_url: form.avatar,
    website:         form.website,
    subdomain:       form.subdomain,
    gender:          form.gender,
    birth_date:      birthDate,
    death_date:      deathDate,
    genres:          genreIds,
    breaks:          form.breaks,
    photos:          form.photos,
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
  }
}

export default function NewArtist() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (form: ArtistFormData) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToDb(form)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/admin/artists/${data.id}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return (
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
        title="🎤 Naujas atlikėjas"
        submitLabel={saving ? 'Kuriama...' : 'Sukurti atlikėją'}
        backHref="/admin/artists"
        initialData={emptyArtistForm}
        onSubmit={handleSubmit}
      />
    </>
  )
}
