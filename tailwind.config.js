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
      /* Globaliai padidinta šriftų skalė (~+1px kiekvienam žingsniui) —
         testuotojo prašymu tekstas visoje svetainėje buvo per smulkus.
         Paveikia VISAS text-xs / text-sm / text-base / text-lg / text-xl
         klases (arbitrary text-[Npx] tvarkomi atskirai sed'u). */
      fontSize: {
        'xs':   ['0.8125rem', '1.1rem'],   /* 12 -> 13 */
        'sm':   ['0.9375rem', '1.35rem'],  /* 14 -> 15 */
        'base': ['1.0625rem', '1.6rem'],   /* 16 -> 17 */
        'lg':   ['1.1875rem', '1.75rem'],  /* 18 -> 19 */
        'xl':   ['1.3125rem', '1.85rem'],  /* 20 -> 21 */
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
