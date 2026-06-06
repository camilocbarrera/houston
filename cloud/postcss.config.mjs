// Tailwind v4 via PostCSS — same engine the desktop app uses, so the
// @houston-ai/* components render with identical utilities + design tokens.
//
// String-named plugin form: this is what Next's Turbopack `build` and webpack
// `dev` both want. (The instance form `[tailwindcss()]` makes Turbopack bundle
// lightningcss and fail; the string form sidesteps that by letting the bundler
// require the plugin at runtime.) Vitest can't load string plugins, so its
// config (`vitest.config.ts`) supplies an inline empty PostCSS config instead —
// the unit tests don't render CSS.
const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;
