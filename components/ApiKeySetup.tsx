'use client'

import { useState, useEffect } from 'react'

export default function ApiKeySetup() {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('anthropic_api_key')
    if (stored) { setHasSaved(true); setKey(stored) }
  }, [])

  const save = () => {
    const trimmed = key.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      alert('Raktas turi prasidėti "sk-ant-"')
      return
    }
    localStorage.setItem('anthropic_api_key', trimmed)
    setHasSaved(true)
    setSaved(true)
    setOpen(false)
    setTimeout(() => setSaved(false), 3000)
  }

  const clear = () => {
    localStorage.removeItem('anthropic_api_key')
    setKey('')
    setHasSaved(false)
  }

  return (
    <div className="mb-4">
      {!open ? (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-lg">
          <span className="text-lg">🔑</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm text-gray-600">
              Vertimas į lietuvių kalbą:&nbsp;
            </span>
            {hasSaved
              ? <span className="text-sm font-medium text-green-600">✓ API raktas nustatytas</span>
              : <span className="text-sm font-medium text-amber-600">⚠ API raktas nenurodytas</span>
            }
          </div>
          <div className="flex gap-2">
            {saved && <span className="text-xs text-green-600 font-medium">Išsaugota!</span>}
            <button type="button" onClick={() => setOpen(true)}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium">
              {hasSaved ? '✏️ Keisti' : '+ Pridėti'}
            </button>
            {hasSaved && (
              <button type="button" onClick={clear}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium">
                Ištrinti
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-lg mt-0.5">🔑</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Anthropic API raktas</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Reikalingas aprašymų vertimui į lietuvių kalbą. Raktas saugomas tik jūsų naršyklėje.
                Gauti galima <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                  className="text-music-blue underline">console.anthropic.com</a>.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="sk-ant-api03-..."
              className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-music-blue bg-white font-mono"
            />
            <button type="button" onClick={save}
              className="px-4 py-2 bg-music-blue text-white rounded-lg text-sm font-bold hover:opacity-90">
              Išsaugoti
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="px-3 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
              ✕
            </button>
          </div>
          <p className="text-xs text-gray-400">
            ⚠️ Raktas matomas tik šiame įrenginyje. Nebenaudodami - ištrinkite.
          </p>
        </div>
      )}
    </div>
  )
}
