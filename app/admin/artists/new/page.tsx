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
      const method = artistId ? 'PATCH' : 'POST'
      const url = artistId ? `/api/artists/${artistId}` : '/api/artists'

      console.log(`[SAVE] ${method} ${url}`)
      console.log('[SAVE] data.name:', data.name)
      console.log('[SAVE] data.type:', data.type)
      console.log('[SAVE] data.genre:', (data as any).genre)
      console.log('[SAVE] data.members:', JSON.stringify((data as any).members))
      console.log('[SAVE] full data keys:', Object.keys(data))

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const responseText = await res.text()
      console.log(`[SAVE] response status: ${res.status}`)
      console.log('[SAVE] response body:', responseText)

      if (!res.ok) {
        let errMsg = 'Nepavyko išsaugoti'
        try { errMsg = JSON.parse(responseText).error || errMsg } catch {}
        throw new Error(errMsg)
      }

      const json = JSON.parse(responseText)
      const id = artistId || String(json.id || json.artist?.id || '')
      console.log('[SAVE] got id:', id)

      // If this was the first save (POST), redirect to the edit page
      if (!artistId && id) {
        window.location.href = `/admin/artists/${id}`
        return
      }
      setArtistId(id)
      setArtistName(data.name || artistName)
      setIsSolo(data.type === 'solo')
      setSaved(true)
    } catch (e: any) {
      console.error('[SAVE] error:', e)
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
    <div className="min-h-screen bg-[var(--bg-elevated)]">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-40 bg-[var(--bg-surface)] border-b border-[var(--input-border)] shadow-sm">
        <div className="px-4 sm:px-6 h-11 flex items-center gap-3">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] min-w-0 flex-1 overflow-hidden">
            <Link href="/admin" className="hover:text-[var(--text-secondary)] shrink-0 transition-colors">Admin</Link>
            <span className="shrink-0 text-[var(--text-faint)]">/</span>
            <Link href="/admin/artists" className="hover:text-[var(--text-secondary)] shrink-0 transition-colors">Atlikėjai</Link>
            <span className="shrink-0 text-[var(--text-faint)]">/</span>
            <span className="text-[var(--text-secondary)] font-semibold truncate">
              {artistName || 'Naujas atlikėjas'}
            </span>
          </nav>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/admin/artists"
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--input-border)] rounded-lg bg-[var(--bg-surface)] transition-colors">
              Atšaukti
            </Link>
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
          <div className="bg-[var(--bg-surface)] border-b border-[var(--input-border)] px-3 sm:px-4 py-3">
            <WikipediaImport onImport={handleWikiImport} />
          </div>

          {/* ArtistForm — hideButtons kad nerodo savo mygtukų */}
          <div>
          <ArtistForm
            key={formKey}
            initialData={initialData as ArtistFormData}
            onSubmit={handleFormSubmit}
            backHref="/admin/artists"
            title=""
            submitLabel="Išsaugoti"
            hideButtons
          />
          </div>

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
        <div className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 border-l border-[var(--input-border)] bg-[var(--bg-surface)] min-h-[calc(100vh-44px)] sticky top-11">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Diskografija</span>
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
              <p className="text-xs text-[var(--text-muted)] text-center leading-relaxed">
                Albumai rodomi<br/>po Wikipedia importo
              </p>
            ) : (
              <div className="text-center">
                <div className="text-3xl mb-2 opacity-30">💿</div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
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
