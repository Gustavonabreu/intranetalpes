/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', 'body.dark-mode'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/*.{js,ts,jsx,tsx}" // Garante a leitura da raiz do src (App.tsx e main.tsx)
  ],
  theme: {
    extend: {
      colors: {
        alpes: {
          blue: '#0f172a',
          accent: '#3b82f6'
        }
      }
    },
  },
  plugins: [],
}