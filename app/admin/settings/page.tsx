'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function AdminSettings() {
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [translateTest, setTranslateTest] = useState<any>(null)
  const [translating, setTranslating] = useState(false)

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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link href="/admin/dashboard" className="text-music-blue hover:text-music-orange text-sm">← Grįžti</Link>
          <h1 className="text-2xl font-black text-gray-900 mt-1">⚙️ Nustatymai & Diagnostika</h1>
        </div>

        {/* API Status */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">🔑 Anthropic API</h2>
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

            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
              <p><strong>Kaip pridėti ANTHROPIC_API_KEY Vercel'e:</strong></p>
              <p>1. vercel.com → tavo projektas → Settings → Environment Variables</p>
              <p>2. Add: Name = <code className="bg-gray-200 px-1 rounded">ANTHROPIC_API_KEY</code>, Value = sk-ant-...</p>
              <p>3. ✅ Production + ✅ Preview + ✅ Development</p>
              <p>4. Deployments → paskutinis → ⋯ → Redeploy (be cache)</p>
            </div>
          </div>
        </div>

        {/* Data management */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">🗄️ Duomenų valdymas</h2>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-600">Visi duomenys saugomi naršyklės localStorage.</p>
            <button
              onClick={() => {
                const data = localStorage.getItem('artists') || '[]'
                const blob = new Blob([data], { type: 'application/json' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `musiclt-backup-${new Date().toISOString().split('T')[0]}.json`
                a.click()
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">
              ⬇️ Eksportuoti duomenis (JSON)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
