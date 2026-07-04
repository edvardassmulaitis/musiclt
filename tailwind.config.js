/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'music-blue': '#2982cd',
        'music-blue-light': '#5eb7f7',
        'music-orange': '#f07820',
      },
      /* ── VIENINGA TIPOGRAFIJOS SKALĖ (px): 12 / 14 / 16 / 20 / 24 / 30 ──
         Vienas tiesos šaltinis visai svetainei. Semantika:
           12 = meta / žymos / laikai      (text-xs)
           14 = antrinis / paantraštės     (text-sm)
           16 = kūnas / kortelių pavadinimai (text-base)
           20 = sekcijų antraštės          (text-lg)
           24 = didesnės antraštės         (text-xl)
           30 = hero / display             (text-2xl)
         Arbitrary text-[Npx] ir inline fontSize priderinti prie šių žingsnių. */
      fontSize: {
        'xs':   ['0.75rem',  '1rem'],     /* 12 */
        'sm':   ['0.875rem', '1.3rem'],   /* 14 */
        'base': ['1rem',     '1.55rem'],  /* 16 */
        'lg':   ['1.25rem',  '1.75rem'],  /* 20 */
        'xl':   ['1.5rem',   '2rem'],     /* 24 */
        '2xl':  ['1.875rem', '2.25rem'],  /* 30 */
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
