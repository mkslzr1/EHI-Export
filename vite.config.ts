import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
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
        scope: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
