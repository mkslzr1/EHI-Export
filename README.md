# EHI Query

A web app for querying Epic EHI export TSV files with natural language, designed
to install on an iPad home screen like a native app. Everything — file parsing,
storage, and SQL execution — runs entirely in the browser via
[DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview). Patient data never
leaves the device. When you ask a question in plain English, only the database
**schema** (table and column names/types — never row data) is sent to Claude to
generate the SQL, which then runs locally against your data.

## Features

- Import multiple `.tsv` / `.txt` / `.csv` files, or a `.zip` archive of an EHI
  export, via tap-to-choose or drag-and-drop.
- Each file becomes a queryable table (auto-detected delimiter/types via DuckDB).
- Ask questions in plain English; Claude turns them into a SQL query, which you
  can review/edit before running.
- No API key? Type a raw `SELECT` statement directly instead.
- Browse tables and preview rows before querying.
- Installs to the iPad home screen as a standalone app (PWA) and works offline
  after the first load.

## Privacy model

- The app is fully static — there is no backend server. Your data is loaded
  and queried inside the browser's DuckDB-WASM instance only.
- Your Anthropic API key is stored only in the browser's `localStorage`, never
  committed to source control or sent anywhere except `api.anthropic.com`.
- Natural-language-to-SQL requests send **schema only** (table/column names
  and types) plus your question text — never any row/patient data.
- Generated SQL is restricted to read-only `SELECT`/`WITH` statements before
  it's allowed to run (see `assertReadOnlySelect` in `src/lib/anthropic.ts`).

Review your organization's data handling policies before using this with real
patient data exports, and confirm sending schema metadata (not PHI) to a
third-party API is acceptable under your policies.

## Getting started (development)

```bash
npm install
npm run dev
```

Open the printed local URL in a browser.

## Deployment

Merges to `main` auto-deploy to GitHub Pages via
`.github/workflows/deploy.yml`, which builds the app and publishes `dist/` at:

**https://mkslzr1.github.io/EHI-Export/**

One-time setup (repo owner only, first deploy): in the repo's **Settings →
Pages**, set **Source** to **GitHub Actions**. After that, every push to
`main` redeploys automatically — no further action needed.

To deploy elsewhere (Netlify, Vercel, Cloudflare Pages, etc.) instead:

```bash
npm run build
```

This produces a static site in `dist/`. Because everything runs client-side,
no server-side configuration is required beyond serving static files over
HTTPS (required for the install-to-home-screen prompt and for `localStorage`
to persist reliably in Safari). Note `vite.config.ts` sets `base:
"/EHI-Export/"` for the GitHub Pages build — adjust or remove that if
deploying to a host serving from the domain root.

## Installing on iPad

1. Open the deployed URL in Safari on your iPad.
2. Tap the Share icon, then **Add to Home Screen**.
3. Launch it from the home screen icon — it runs full-screen like a native app.

## Using the app

1. Tap **Settings** and paste your Anthropic API key (get one at
   [console.anthropic.com](https://console.anthropic.com)). This step is
   optional if you'd rather type raw SQL.
2. Tap the import area (or drop files) and select your EHI export's `.txt`/
   `.tsv` files, or a `.zip` of them.
3. Ask a question, e.g. *"How many active medication orders are there per
   department?"* Review the generated SQL, then tap **Run query**. You can
   edit the SQL before running, and re-run it any time.
4. Tap a table name in the sidebar to preview its first rows and see its
   columns.

## Regenerating icons

The app icon is authored as `scripts/icon-source.svg`. To regenerate the PNGs
in `public/`:

```bash
npm install -D sharp
node scripts/gen-icons.mjs
npm uninstall sharp
```

## Tech stack

- [Vite](https://vite.dev/) + React + TypeScript
- [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview) for in-browser SQL
- [fflate](https://github.com/101arg/fflate) for client-side zip extraction
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for the installable/
  offline-capable app shell
- [Claude API](https://docs.claude.com/) for natural-language-to-SQL translation
