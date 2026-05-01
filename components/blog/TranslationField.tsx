'use client'
// components/blog/TranslationField.tsx
//
// Vertimo metadata. Paprastas grid be spalvotų boxų.

const LANGS = [
  { code: 'en', label: 'Anglų' },
  { code: 'ru', label: 'Rusų' },
  { code: 'de', label: 'Vokiečių' },
  { code: 'fr', label: 'Prancūzų' },
  { code: 'es', label: 'Ispanų' },
  { code: 'it', label: 'Italų' },
  { code: 'pl', label: 'Lenkų' },
  { code: 'lv', label: 'Latvių' },
  { code: 'et', label: 'Estų' },
  { code: 'fi', label: 'Suomių' },
  { code: 'sv', label: 'Švedų' },
  { code: 'other', label: 'Kita' },
]

export type TranslationMeta = {
  original_url: string
  original_author: string
  original_lang: string
}

export function TranslationField({
  value, onChange,
}: {
  value: TranslationMeta
  onChange: (v: TranslationMeta) => void
}) {
  return (
    <div className="space-y-3 mb-6">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
          Nuoroda į originalą
        </label>
        <input
          value={value.original_url}
          onChange={e => onChange({ ...value, original_url: e.target.value })}
          placeholder="https://..."
          className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/30 transition"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
            Autorius
          </label>
          <input
            value={value.original_author}
            onChange={e => onChange({ ...value, original_author: e.target.value })}
            placeholder="Originalo autorius"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/30 transition"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider mb-2 block" style={{ color: '#5e7290', fontFamily: "'Outfit', sans-serif" }}>
            Kalba
          </label>
          <select
            value={value.original_lang || ''}
            onChange={e => onChange({ ...value, original_lang: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:border-[#f97316]/30 transition"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#dde8f8' }}
          >
            <option value="">— pasirink —</option>
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
