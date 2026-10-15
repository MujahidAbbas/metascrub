// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build
export default defineConfig({
  site: 'https://metascrub.vercel.app', // hosted on Vercel; no custom domain yet
  // Canonicals, internal links and the sitemap all use /scrub, not /scrub/.
  trailingSlash: 'never',
  // Astro 7 defaults to 'jsx' whitespace rules, which glue text to inline
  // elements ("out of yourPDFs"). `true` keeps the v6 HTML-aware behaviour.
  compressHTML: true,
  // The privacy promise, enforced by the browser: connect-src 'none' means the
  // page cannot send a file anywhere even if a dependency tried to. Astro adds
  // hashes for the scripts and styles it emits.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "connect-src 'none'",
        "img-src 'self' data:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ],
      styleDirective: {
        // Hero animation delays are style attributes; scoped to style-src-attr only.
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
  integrations: [svelte(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
