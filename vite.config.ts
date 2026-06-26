/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
// `TAURI_ENV_PLATFORM` is set by the Tauri CLI for both `tauri dev` and `tauri build`.
// In that context we serve from a custom protocol root, so the GitHub Pages subpath
// (`/kryptax/`) would break asset URLs. Fall back to `/` for the desktop build.
const isTauri = !!process.env.TAURI_ENV_PLATFORM

export default defineConfig({
  base: isTauri ? '/' : '/kryptax/',
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib'),
    },
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
