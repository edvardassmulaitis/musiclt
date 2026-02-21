'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import ArtistForm, { ArtistFormData, emptyArtistForm } from '@/components/ArtistForm'
import { loadArtists, saveArtistWithRelations } from '@/lib/artists'

export default function EditArtist() {
  const router = useRouter()
  const params = useParams()
  const [mounted, setMounted] = useState(false)
  const [initialData, setInitialData] = useState<ArtistFormData | null>(null)

  useEffect(() => {
    setMounted(true)
    if (!localStorage.getItem('admin_logged_in')) { router.push('/admin'); return }
    const artists = loadArtists()
    const artist = artists.find((a: any) => a.id === params.id)
    if (!artist) { alert('Atlikėjas nerastas!'); router.push('/admin/artists'); return }
    setInitialData({ ...emptyArtistForm, ...artist })
  }, [router, params.id])

  const handleSubmit = (data: ArtistFormData) => {
    saveArtistWithRelations(params.id as string, data, false)
    alert('✅ Atlikėjas sėkmingai atnaujintas!')
    router.push('/admin/artists')
  }

  if (!mounted || !initialData) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">Kraunama...</div>
    </div>
  )

  return (
    <ArtistForm
      title="✏️ Redaguoti atlikėją"
      submitLabel="Išsaugoti pakeitimus"
      backHref="/admin/artists"
      initialData={initialData}
      artistId={params.id as string}
      onSubmit={handleSubmit}
    />
  )
}
