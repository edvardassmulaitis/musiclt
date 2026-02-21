'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ArtistForm, { ArtistFormData } from '@/components/ArtistForm'
import { saveArtistWithRelations } from '@/lib/artists'

export default function NewArtist() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (!localStorage.getItem('admin_logged_in')) router.push('/admin')
  }, [router])

  const handleSubmit = (data: ArtistFormData) => {
    const id = Date.now().toString()
    saveArtistWithRelations(id, data, true)
    alert('✅ Atlikėjas sėkmingai pridėtas!')
    router.push('/admin/artists')
  }

  if (!mounted) return null

  return (
    <ArtistForm
      title="+ Naujas atlikėjas"
      submitLabel="Išsaugoti atlikėją"
      backHref="/admin/artists"
      onSubmit={handleSubmit}
    />
  )
}
