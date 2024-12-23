/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./entrypoints/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx,css}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1a73e8',
          hover: '#1557b0',
        },
        gray: {
          bg: '#f1f3f4',
          text: '#666666',
          dark: '#333333',
        }
      },
      width: {
        'popup': '280px',
      },
    },
  },
  plugins: [],
}
