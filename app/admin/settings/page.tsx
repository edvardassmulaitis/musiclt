'use client'

import { useState } from 'react'
import Link from 'next/link'

type CacheKind = 'tracks' | 'albums' | 'news' | 'events' | 'all'

export default function AdminSettings() {
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [translateTest, setTranslateTest] = useState<any>(null)
  const [translating, setTranslating] = useState(false)
  const [cacheBusy, setCacheBusy] = useState<CacheKind | null>(null)
  const [cacheLog, setCacheLog] = useState<{ ts: string; kind: CacheKind; ok: boolean; msg: string }[]>([])

  const clearHomeCache = async (kind: CacheKind) => {
    setCacheBusy(kind)
    try {
      const res = await fetch(`/api/internal/revalidate-home?kind=${kind}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      setCacheLog(log => [
        {
          ts: new Date().toLocaleTimeString('lt-LT'),
          kind,
          ok: res.ok,
          msg: res.ok
            ? `Išvalyta: ${(data.revalidated || []).join(', ') || kind}`
            : `Klaida ${res.status}: ${data.error || 'unknown'}`,
        },
        ...log,
      ].slice(0, 10))
    } catch (e: any) {
      setCacheLog(log => [
        { ts: new Date().toLocaleTimeString('lt-LT'), kind, ok: false, msg: e?.message || 'Network error' },
        ...log,
      ].slice(0, 10))
    } finally {
      setCacheBusy(null)
    }
  }

  const testApi = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/translate')
      const data = await res.json()
      setTestResult({ status: res.status, ...data })
    } catch (e: any) {
      setTestResult({ error: e.message })
    }
    setTesting(false)
  }

  const testTranslate = async () => {
    setTranslating(true)
    setTranslateTest(null)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello, this is a test translation.' })
      })
      const data = await res.json()
      setTranslateTest({ status: res.status, ...data })
    } catch (e: any) {
      setTranslateTest({ error: e.message })
    }
    setTranslating(false)
  }

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link href="/admin/dashboard" className="text-music-blue hover:text-music-orange text-sm">← Grįžti</Link>
          <h1 className="text-2xl font-black text-[var(--text-primary)] mt-1">⚙️ Nustatymai & Diagnostika</h1>
        </div>

        {/* API Status */}
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--input-border)] shadow-sm">
          <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide">🔑 Anthropic API</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex gap-3">
              <button onClick={testApi} disabled={testing}
                className="px-4 py-2 bg-music-blue text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {testing ? '⏳ Tikrinama...' : '🔍 Patikrinti API raktą'}
              </button>
              <button onClick={testTranslate} disabled={translating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {translating ? '⏳ Verčiama...' : '🌐 Testuoti vertimą'}
              </button>
            </div>

            {testResult && (
              <div className={`rounded-lg p-4 text-sm font-mono whitespace-pre-wrap ${testResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="font-bold mb-2">{testResult.ok ? '✅ API veikia!' : '❌ API klaida'}</div>
                {JSON.stringify(testResult, null, 2)}
              </div>
            )}

            {translateTest && (
              <div className={`rounded-lg p-4 text-sm font-mono whitespace-pre-wrap ${translateTest.translated ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="font-bold mb-2">{translateTest.translated ? '✅ Vertimas veikia!' : '❌ Vertimas nepavyko'}</div>
                {JSON.stringify(translateTest, null, 2)}
              </div>
            )}

            <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded-lg p-3 space-y-1">
              <p><strong>Kaip pridėti ANTHROPIC_API_KEY Vercel'e:</strong></p>
              <p>1. vercel.com → tavo projektas → Settings → Environment Variables</p>
              <p>2. Add: Name = <code className="bg-gray-200 px-1 rounded">ANTHROPIC_API_KEY</code>, Value = sk-ant-...</p>
              <p>3. ✅ Production + ✅ Preview + ✅ Development</p>
              <p>4. Deployments → paskutinis → ⋯ → Redeploy (be cache)</p>
            </div>
          </div>
        </div>

        {/* Homepage cache invalidation */}
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--input-border)] shadow-sm">
          <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide">⚡ Homepage cache</h2>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Vercel edge cache laiko homepage „Naujos dainos / Nauji albumai / Naujienos" sekcijas 5 min. Naujas track/album/news automatiškai pasimato per admin POST (revalidateTag), bet jei matai pasenusią versiją po scrape job'o ar manualinio DB pakeitimo — paspausk čia.
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                { kind: 'tracks' as const, label: 'Dainos', emoji: '🎵' },
                { kind: 'albums' as const, label: 'Albumai', emoji: '💿' },
                { kind: 'news' as const, label: 'Naujienos', emoji: '📰' },
                { kind: 'events' as const, label: 'Renginiai', emoji: '🎤' },
                { kind: 'all' as const, label: 'Visa homepage', emoji: '🔄' },
              ]).map(({ kind, label, emoji }) => (
                <button
                  key={kind}
                  onClick={() => clearHomeCache(kind)}
                  disabled={!!cacheBusy}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    kind === 'all'
                      ? 'bg-music-orange text-white hover:opacity-90'
                      : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-primary)]'
                  }`}
                >
                  {cacheBusy === kind ? '⏳ Valoma...' : `${emoji} ${label}`}
                </button>
              ))}
            </div>
            {cacheLog.length > 0 && (
              <div className="mt-3 space-y-1.5 text-xs">
                {cacheLog.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 rounded px-2 py-1.5 font-mono ${
                      entry.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'
                    }`}
                  >
                    <span className="text-[var(--text-muted)]">{entry.ts}</span>
                    <span className="font-bold">[{entry.kind}]</span>
                    <span>{entry.ok ? '✓' : '✗'} {entry.msg}</span>
                  </div>
                ))}
              </div>
            )}
            <details className="text-xs text-[var(--text-muted)]">
              <summary className="cursor-pointer">Kada to reikia?</summary>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li><strong>Dainos:</strong> po manualinio video_uploaded_at backfill'o ar batch scrape'o, kai nauji tracks neatsiranda LT/World lane'uose.</li>
                <li><strong>Albumai:</strong> po wiki disco re-import'o ar release_date korekcijos.</li>
                <li><strong>Naujienos:</strong> po news-scout cron'o ar manualinio /admin/inbox approve.</li>
                <li><strong>Visa:</strong> po didelio DB pakeitimo (wipe + reimport) — saugiausias variantas.</li>
              </ul>
            </details>
          </div>
        </div>

        {/* Data management */}
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--input-border)] shadow-sm">
          <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wide">🗄️ Duomenų valdymas</h2>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">Visi duomenys saugomi naršyklės localStorage.</p>
            <button
              onClick={() => {
                const data = localStorage.getItem('artists') || '[]'
                const blob = new Blob([data], { type: 'application/json' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `musiclt-backup-${new Date().toISOString().split('T')[0]}.json`
                a.click()
              }}
              className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] text-[var(--text-secondary)] rounded-lg text-sm font-medium">
              ⬇️ Eksportuoti duomenis (JSON)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
