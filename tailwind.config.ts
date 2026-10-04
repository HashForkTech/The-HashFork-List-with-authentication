import type { Config } from 'tailwindcss';

/**
 * The visual identity is intentionally restricted to two colors:
 *   - background: #141414 ("ink")
 *   - foreground: #dedede ("paper")
 * Every other tone is an opacity variation of those two values — with one
 * documented exception: the yellow-400 star rating, the single accent used
 * to make the curated ratings pop against the monochrome list.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#141414',
        paper: '#dedede',
      },
      fontFamily: {
        sans: [
          // Self-hosted via @fontsource-variable/inter (bundled at build
          // time, served from 'self' — keeps the strict CSP and offline
          // installs happy).
          '"Inter Variable"',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      maxWidth: {
        content: '62rem',
      },
    },
  },
  plugins: [],
};

export default config;
