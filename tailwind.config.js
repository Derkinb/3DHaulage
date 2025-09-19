/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4fbff',
          100: '#d8efff',
          200: '#b6e2ff',
          300: '#85d0ff',
          400: '#4cb6ff',
          500: '#1f96ff',
          600: '#0b76d4',
          700: '#055ca8',
          800: '#094f86',
          900: '#0e416b'
        }
      },
      boxShadow: {
        soft: '0 18px 40px -24px rgba(15, 23, 42, 0.25)'
      }
    }
  },
  plugins: []
};
