/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cinzel"', 'serif'],
        body: ['"Source Sans 3"', 'sans-serif'],
      },
      colors: {
        chess: {
          bg: '#17110e',
          surface: '#221917',
          surfaceSoft: '#2c201d',
          text: '#f3ece4',
          muted: '#c6b4a4',
          accent: '#c9822b',
          accentSoft: '#e7b274',
          turn: '#d89a3d',
        },
      },
      boxShadow: {
        'chess-card': '0 18px 40px -22px rgba(0, 0, 0, 0.85), 0 8px 20px -16px rgba(0, 0, 0, 0.75)',
      },
    },
  },
  plugins: [],
}