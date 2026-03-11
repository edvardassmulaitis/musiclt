'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback } from 'react'
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
  }, [])

  const handleFormSubmit = async (data: ArtistFormData) => {
    setSaving(true)
    setSaveError('')
    try {
      const method = artistId ? 'PUT' : 'POST'
      const url = artistId ? `/api/artists/${artistId}` : '/api/artists'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Nepavyko išsaugoti')
      }
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

  const triggerSave = () => {
    const btn = document.getElementById('submit-btn') as HTMLButtonElement | null
    btn?.click()
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 h-11 flex items-center gap-3">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0 flex-1 overflow-hidden">
            <Link href="/admin" className="hover:text-gray-700 shrink-0 transition-colors">Admin</Link>
            <span className="shrink-0 text-gray-300">/</span>
            <Link href="/admin/artists" className="hover:text-gray-700 shrink-0 transition-colors">Atlikėjai</Link>
            <span className="shrink-0 text-gray-300">/</span>
            <span className="text-gray-700 font-semibold truncate">
              {artistName || 'Naujas atlikėjas'}
            </span>
          </nav>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/admin/artists"
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg bg-white transition-colors">
              Atšaukti
            </Link>
            {saved && artistId && (
              <Link href={`/admin/artists/${artistId}`}
                className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg bg-white hover:bg-blue-50 transition-colors font-medium">
                Atidaryti →
              </Link>
            )}
            <button
              type="button"
              onClick={triggerSave}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {saving ? 'Saugoma...' : saved ? '✓ Išsaugota' : '✓ Išsaugoti'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main layout: kairė + dešinė ── */}
      <div className="flex items-start">

        {/* LEFT — Wikipedia import strip + ArtistForm */}
        <div className="flex-1 min-w-0">

          {/* Wikipedia import strip */}
          <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-3">
            <WikipediaImport onImport={handleWikiImport} />
          </div>

          {/* ArtistForm — hideButtons kad nerodo savo mygtukų */}
          <ArtistForm
            key={formKey}
            initialData={initialData as ArtistFormData}
            onSubmit={handleFormSubmit}
            backHref="/admin/artists"
            title=""
            submitLabel="Išsaugoti"
            hideButtons
          />

          {/* Klaidos pranešimas */}
          {saveError && (
            <div className="mx-3 mb-4">
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                ⚠ {saveError}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT — Diskografijos šoninė juosta */}
        <div className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 border-l border-gray-200 bg-white min-h-[calc(100vh-44px)] sticky top-11">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Diskografija</span>
            {artistId && (
              <WikipediaImportDiscography
                artistId={parseInt(artistId)}
                artistName={artistName}
                artistWikiTitle={artistWikiTitle}
                isSolo={isSolo}
                buttonLabel="W Įkelti iš Wiki"
                buttonClassName="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
              />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center p-6">
            {artistId ? (
              <p className="text-xs text-gray-400 text-center leading-relaxed">
                Albumai rodomi<br/>po Wikipedia importo
              </p>
            ) : (
              <div className="text-center">
                <div className="text-3xl mb-2 opacity-30">💿</div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Prieinama po<br/>atlikėjo išsaugojimo
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
