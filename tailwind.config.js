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
    },
  },
  plugins: [],
}
