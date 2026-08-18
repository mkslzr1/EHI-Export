#!/usr/bin/env node
/**
 * One-time extraction of Epic's Clarity data dictionary (a DocGen HTML export,
 * one file per table) into a compact JSON reference bundled with the app.
 *
 * Not run at build time — run once against a local copy of the DocGen export
 * to (re)generate public/epic-schema.json, which is committed. Usage:
 *
 *   node scripts/extract-epic-schema.mjs <path-to-docgen-dir> public/epic-schema.json
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , srcDir, outFile] = process.argv;
if (!srcDir || !outFile) {
  console.error("usage: extract-epic-schema.mjs <docgen-dir> <out.json>");
  process.exit(1);
}

const MAX_TABLE_DESC = 320;
const MAX_COL_DESC = 220;

function clean(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function extractTable(html) {
  const descMatch = html.match(/<td class="T1Value" style="white-space: normal;">([^<]*)<\/td>/);
  const desc = descMatch ? truncate(clean(descMatch[1]), MAX_TABLE_DESC) : "";

  const colSectionStart = html.indexOf("Column Information");
  const section = colSectionStart >= 0 ? html.slice(colSectionStart) : "";

  const headerRe =
    /<td class="T1Head" style="padding: 5px;">\d+<\/td>\s*<td class="T1Head" style="padding-right: 12px;">([^<]+)<\/td>\s*<td class="T1Head" style="padding-right: 12px;">([^<]+)<\/td>/g;
  const descRe = /<td style="white-space: normal;">([^<]*)<\/td>/g;

  const headers = [...section.matchAll(headerRe)].map((m) => ({ name: clean(m[1]), type: clean(m[2]) }));
  const descs = [...section.matchAll(descRe)].map((m) => clean(m[1]));

  const columns = {};
  headers.forEach((h, i) => {
    if (!h.name) return;
    columns[h.name] = { type: h.type, desc: truncate(descs[i] ?? "", MAX_COL_DESC) };
  });

  if (!desc && Object.keys(columns).length === 0) return null;
  return { desc, columns };
}

const files = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith(".htm") || f.toLowerCase().endsWith(".html"));
console.log(`found ${files.length} table doc files`);

const out = {};
let ok = 0;
for (const f of files) {
  const name = f.replace(/\.html?$/i, "").toUpperCase();
  const html = readFileSync(join(srcDir, f), "utf8");
  const entry = extractTable(html);
  if (entry) {
    out[name] = entry;
    ok++;
  }
}

writeFileSync(outFile, JSON.stringify(out));
console.log(`extracted ${ok}/${files.length} tables -> ${outFile}`);
