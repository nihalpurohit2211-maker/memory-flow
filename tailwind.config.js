/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#F7F5EF',
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F0ECE1',
          subtle: '#EAE5D8',
        },
        charcoal: {
          DEFAULT: '#242822',
          muted: '#5A6056',
          light: '#80877C',
        },
        accent: {
          DEFAULT: '#52664F',
          hover: '#41523E',
          light: '#E6ECE5',
          border: '#C8D4C6',
        },
        border: {
          DEFAULT: '#E4DFC8',
          subtle: '#EDE8D5',
          dark: '#D0C9AF',
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif'
        ],
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(36, 40, 34, 0.05), 0 1px 2px 0 rgba(36, 40, 34, 0.03)',
        'card': '0 4px 6px -1px rgba(36, 40, 34, 0.07), 0 2px 4px -1px rgba(36, 40, 34, 0.04)',
        'modal': '0 20px 25px -5px rgba(36, 40, 34, 0.15), 0 10px 10px -5px rgba(36, 40, 34, 0.04)',
      }
    },
  },
  plugins: [],
}
