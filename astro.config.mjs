// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build
export default defineConfig({
  site: 'https://metascrub.vercel.app', // hosted on Vercel; no custom domain yet
  integrations: [svelte(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
