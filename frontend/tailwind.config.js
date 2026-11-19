import colors from 'tailwindcss/colors';

// Dark theme: PeerPrep's dark mode is a neutral near-black (#1a1a1a page, #242424 cards), not the
// blue-tinted navy of Tailwind's default gray/slate. Only the dark end of those two scales is
// remapped, so every dark:bg-gray-900 / slate-900 / ... across the platform (shell, sidebar, header,
// pages, dialogs) turns neutral at once; the light-theme shades (50-600) stay exactly as they were.
const NEUTRAL_DARK = {
  700: '#363636',
  800: '#242424',
  900: '#1a1a1a',
  950: '#141414',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        gray: { ...colors.gray, ...NEUTRAL_DARK },
        slate: { ...colors.slate, ...NEUTRAL_DARK },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        jakarta: ['"Plus Jakarta Sans"', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        dmsans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
