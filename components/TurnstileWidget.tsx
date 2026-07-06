'use client'

// Cloudflare Turnstile widget — rodomas TIK kai NEXT_PUBLIC_TURNSTILE_SITE_KEY
// nustatytas. Kitu atveju nieko nerenderina (grąžina null) ir iškart praneša
// „tuščią" token'ą, kad formos veiktų kaip anksčiau (Turnstile išjungtas).
//
// Naudojimas:
//   const [captcha, setCaptcha] = useState('')
//   <TurnstileWidget onVerify={setCaptcha} />
//   // siunčiant formą: body: JSON.stringify({ ..., turnstileToken: captcha })

import { useEffect, useRef } from 'react'

declare global {
  interface Window { turnstile?: any }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export default function TurnstileWidget({
  onVerify,
  theme = 'auto',
}: {
  onVerify: (token: string) => void
  theme?: 'auto' | 'light' | 'dark'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!SITE_KEY) return // išjungta
    let cancelled = false

    function render() {
      if (cancelled || !ref.current || !window.turnstile) return
      if (widgetId.current) return
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        theme,
        callback: (token: string) => onVerify(token),
        'error-callback': () => onVerify(''),
        'expired-callback': () => onVerify(''),
      })
    }

    if (window.turnstile) {
      render()
    } else {
      const existing = document.querySelector('script[data-turnstile]')
      if (!existing) {
        const s = document.createElement('script')
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        s.defer = true
        s.setAttribute('data-turnstile', '1')
        s.onload = render
        document.head.appendChild(s)
      } else {
        existing.addEventListener('load', render)
      }
    }

    return () => {
      cancelled = true
      try {
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      } catch {}
      widgetId.current = null
    }
  }, [onVerify, theme])

  if (!SITE_KEY) return null
  return <div ref={ref} className="cf-turnstile my-2" />
}
