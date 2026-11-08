/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0B0B',
        paper: '#F9F9F9',
        cobalt: '#0033FF',
        crimson: '#FF334B',
        amber: '#F59E0B',
      },
      fontFamily: {
        sans: [
          'Inter',
          '"Helvetica Neue"',
          'Helvetica',
          'Arial',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        lux: 'cubic-bezier(0.22, 1, 0.36, 1)',
        weighty: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
