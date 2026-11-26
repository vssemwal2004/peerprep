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

// Reference hues for dark accents. Text, controls, and status colors share the same hue family.
const DARK_ACCENTS = {
  sky: '#3cbbf4', blue: '#58adfa', cyan: '#4bc7d7', teal: '#58c7af',
  emerald: '#56cba3', green: '#67cc88', lime: '#a8c571', yellow: '#ebbf5e',
  amber: '#edae55', orange: '#f2a16b', red: '#ed8c85', rose: '#ed96a7',
  pink: '#e79bc2', fuchsia: '#db99e2', purple: '#c79ded', violet: '#b89bf3', indigo: '#98a7ef',
};

const SURFACE_TONES = {
  50: [230, 0.16], 100: [214, 0.31], 200: [197, 0.56], 300: [179, 0.81], 400: [162, 0.94],
  500: [31, 0.74, 0.174], 600: [24, 0.62, 0.15], 700: [23, 0.51, 0.112], 800: [28, 0.25], 900: [25, 0.17], 950: [23, 0.10],
};

// Medium shades also appear as labels, icons, and focus rings. Give those uses brighter values
// than the corresponding fills so text on a dark card and white text on a button both read well.
const INK_TONES = { 500: [157, 0.92], 600: [149, 0.82], 700: [143, 0.72] };

const rgb = (hex) => hex.slice(1).match(/../g).map((channel) => Number.parseInt(channel, 16));

// Bound solid fills in linear RGB to preserve their hue and keep white button labels readable.
function limitFillLuminance(channels, maximumLuminance) {
  const linear = channels.map((channel) => channel / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  if (luminance <= maximumLuminance) return channels;
  return linear.map((channel) => channel * maximumLuminance / luminance)
    .map((channel) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055) * 255);
}

function accentScale(tones, role) {
  const properties = {};
  const scale = Object.fromEntries(Object.entries(DARK_ACCENTS).map(([family, hue]) => {
    const reference = rgb(hue);
    const shades = Object.entries(tones).map(([shade, [neutral, strength, maximumLuminance]]) => {
      const name = `--pp-dark-${role}-${family}-${shade}`;
      const mixed = reference.map((channel) => neutral + (channel - neutral) * strength);
      const channels = maximumLuminance === undefined ? mixed : limitFillLuminance(mixed, maximumLuminance);
      properties[name] = channels.map(Math.round).join(' ');
      return [shade, `rgb(var(${name}, ${rgb(colors[family][shade]).join(' ')}) / <alpha-value>)`];
    });
    return [family, Object.fromEntries(shades)];
  }));
  return { scale, properties };
}

const accentSurfaces = accentScale(SURFACE_TONES, 'accent');
const accentInk = accentScale(INK_TONES, 'ink');

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
        ...accentSurfaces.scale,
        gray: { ...colors.gray, ...NEUTRAL_DARK },
        slate: { ...colors.slate, ...NEUTRAL_DARK },
      },
      textColor: accentInk.scale,
      ringColor: accentInk.scale,
      outlineColor: accentInk.scale,
      fill: accentInk.scale,
      stroke: accentInk.scale,
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        jakarta: ['"Plus Jakarta Sans"', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        dmsans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  // The theme class toggles at runtime, so emit its variables independently of utility scanning.
  plugins: [({ addBase }) => addBase({ '[class~="dark"]': { ...accentSurfaces.properties, ...accentInk.properties } })],
}
