export default {
  plugins: {
    // Tailwind v4 ships its own pipeline; it handles imports and vendor
    // prefixing itself, so postcss-import and autoprefixer are not needed.
    '@tailwindcss/postcss': {},
  },
}
