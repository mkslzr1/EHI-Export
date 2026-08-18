import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this as a project site at /EHI-Export/, but keep the
  // dev server at root so `npm run dev` isn't affected.
  base: command === "build" ? "/EHI-Export/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      workbox: {
        // DuckDB-WASM's .wasm/worker bundles (tens of MB) are cached on first
        // use via runtimeCaching below instead of being eagerly precached.
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        globIgnores: ["**/duckdb-*.js"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.endsWith(".wasm") || /duckdb-browser/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "duckdb-wasm-assets",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Epic Clarity data dictionary (~10MB) — cached after first fetch
            // rather than precached on install, same reasoning as the WASM rule.
            urlPattern: ({ url }) => url.pathname.endsWith("epic-schema.json"),
            handler: "CacheFirst",
            options: {
              cacheName: "epic-schema-assets",
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "EHI Query",
        short_name: "EHI Query",
        description: "Natural-language SQL queries across Epic EHI export TSV files, entirely on-device.",
        theme_color: "#2563eb",
        background_color: "#111317",
        display: "standalone",
        orientation: "any",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
}));
