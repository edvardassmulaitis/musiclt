'use client'

import { useState, useEffect } from 'react'

// ── Unified date number input ────────────────────────────────────────────────
// Used across admin pages: albums, tracks, artist dates
// Supports both `number | null` and `string` value modes via overloads

type BaseProps = {
  min: number
  max: number
  placeholder: string
  width?: string
  className?: string
}

type NumberMode = BaseProps & {
  value: number | undefined | null
  onChange: (v: number | null) => void
  mode?: 'number'
}

type StringMode = BaseProps & {
  value: string
  onChange: (v: string) => void
  mode: 'string'
}

type Props = NumberMode | StringMode

export default function DateNumberInput(props: Props) {
  const { min, max, placeholder, width, className: extraCls } = props
  const isString = props.mode === 'string'

  const toRaw = () => {
    if (isString) return (props as StringMode).value || ''
    const v = (props as NumberMode).value
    return v != null ? String(v) : ''
  }

  const [raw, setRaw] = useState(toRaw)
  useEffect(() => setRaw(toRaw()), [isString ? (props as StringMode).value : (props as NumberMode).value])

  const commit = (s: string) => {
    const n = parseInt(s)
    if (!s || isNaN(n)) {
      if (isString) (props as StringMode).onChange('')
      else (props as NumberMode).onChange(null)
      setRaw('')
    } else if (n >= min && n <= max) {
      if (isString) (props as StringMode).onChange(String(n))
      else (props as NumberMode).onChange(n)
      setRaw(String(n))
    } else {
      setRaw(toRaw())
    }
  }

  return (
    <input
      type="number"
      value={raw}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && commit(raw)}
      placeholder={placeholder}
      min={min}
      max={max}
      className={`${width || 'w-full'} px-2 py-1.5 border rounded-lg text-sm focus:outline-none transition-colors
        border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-text)] placeholder:text-[var(--input-placeholder)]
        focus:border-blue-400
        [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
        ${extraCls || ''}`}
    />
  )
}
