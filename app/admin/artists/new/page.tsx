'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import WikipediaImport from '@/components/WikipediaImport'
import ArtistForm, { type ArtistFormData } from '@/components/ArtistForm'
import WikipediaImportDiscography from '@/components/WikipediaImportDiscography'

export default function NewArtistPage() {
  const router = useRouter()
  const [initialData, setInitialData] = useState<Partial<ArtistFormData>>({})
  const [formKey, setFormKey] = useState(0)
  const [artistId, setArtistId] = useState<string | null>(null)
  const [artistName, setArtistName] = useState('')
  const [artistWikiTitle, setArtistWikiTitle] = useState<string | undefined>()
  const [isSolo, setIsSolo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const handleWikiImport = useCallback((data: Partial<ArtistFormData>) => {
    setInitialData(data)
    setFormKey(k => k + 1)
    if (data.name) setArtistName(data.name)
    if (data.type) setIsSolo(data.type === 'solo')
    // Try to extract wiki title from any stored url context
  }, [])

  const handleFormSubmit = async (data: ArtistFormData) => {
    setSaving(true)
    setSaveError('')
    setSaved(false)
    try {
      const method = artistId ? 'PUT' : 'POST'
      const url = artistId ? `/api/artists/${artistId}` : '/api/artists'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Nepavyko išsaugoti')
      const json = await res.json()
      const id = artistId || String(json.id || json.artist?.id || '')
      setArtistId(id)
      setArtistName(data.name || artistName)
      setIsSolo(data.type === 'solo')
      setSaved(true)
    } catch (e: any) {
      setSaveError(e.message || 'Klaida')
    } finally {
      setSaving(false)
    }
  }

  // Trigger ArtistForm's submit button (id="submit-btn" in ArtistForm)
  const triggerSave = () => {
    const btn = document.getElementById('submit-btn') as HTMLButtonElement | null
    btn?.click()
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Sticky header — matches edit page */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-11 flex items-center gap-3">
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0 flex-1">
            <Link href="/admin" className="hover:text-gray-700 shrink-0">Admin</Link>
            <span className="shrink-0">/</span>
            <Link href="/admin/artists" className="hover:text-gray-700 shrink-0">Atlikėjai</Link>
            <span className="shrink-0">/</span>
            <span className="text-gray-600 font-medium truncate">{artistName || 'Naujas atlikėjas'}</span>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/admin/artists"
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg bg-white"
            >
              Atšaukti
            </Link>
            {saved && artistId && (
              <Link
                href={`/admin/artists/${artistId}`}
                className="px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg bg-white"
              >
                → Atidaryti
              </Link>
            )}
            <button
              type="button"
              onClick={triggerSave}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saugoma...' : saved ? '✓ Išsaugota' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-4 items-start">

          {/* LEFT col — form */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Wikipedia import */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">
                W Wikipedia importas
              </p>
              <WikipediaImport onImport={handleWikiImport} />
            </div>

            {/* ArtistForm — hides its own bottom buttons, we use header */}
            <ArtistForm
              key={formKey}
              initialData={initialData}
              onSubmit={handleFormSubmit}
              backHref="/admin/artists"
              title=""
              submitLabel={saving ? 'Saugoma...' : 'Išsaugoti'}
            />

            {saveError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
            )}
          </div>

          {/* RIGHT col — discography */}
          <div className="w-80 xl:w-96 shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">Diskografija</span>
                {artistId && (
                  <WikipediaImportDiscography
                    artistId={parseInt(artistId)}
                    artistName={artistName}
                    artistWikiTitle={artistWikiTitle}
                    isSolo={isSolo}
                    buttonLabel="W Įkelti iš Wiki"
                    buttonClassName="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  />
                )}
              </div>
              <div className="px-4 py-6 text-center">
                {artistId ? (
                  <p className="text-xs text-gray-400">Albumai rodomi po importo</p>
                ) : (
                  <p className="text-xs text-gray-400">Prieinama po išsaugojimo</p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
