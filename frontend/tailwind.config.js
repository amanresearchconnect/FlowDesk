/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          500: '#10b981',
          600: '#00a884',
          700: '#008069',
          800: '#065f46',
          900: '#064e3b',
        },
        sidebar: {
          bg: '#0f172a',
          hover: '#1e293b',
          active: '#334155',
          border: '#1e293b',
          text: '#94a3b8',
          textActive: '#f8fafc',
        },
        chat: {
          bg: '#f0f2f5',
          inbound: '#ffffff',
          outbound: '#d9fdd3',
          ticks: '#0284c7',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
