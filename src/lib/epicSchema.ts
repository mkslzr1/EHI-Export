/**
 * Epic's Clarity data dictionary, extracted from a DocGen export (see
 * scripts/extract-epic-schema.mjs) and served as a static asset. Maps a
 * Clarity table name to its description and column descriptions/types.
 *
 * ~7,960 tables — effectively the full EHI table set, not just the handful
 * this app has bespoke logic for. Used to annotate the schema sent to Claude
 * for natural-language-to-SQL, so query quality doesn't depend on which
 * tables happen to be well-known; whatever the user imports, if Epic
 * documented it, the model sees what the columns mean.
 */

import type { TableInfo } from "./types";

export interface EpicColumnDoc {
  type: string;
  desc: string;
}

export interface EpicTableDoc {
  desc: string;
  columns: Record<string, EpicColumnDoc>;
}

export type EpicSchemaDict = Record<string, EpicTableDoc>;

let dictPromise: Promise<EpicSchemaDict> | null = null;

/** Fetches and caches the dictionary. Never throws — resolves to {} on failure. */
export function loadEpicSchema(): Promise<EpicSchemaDict> {
  if (!dictPromise) {
    const url = `${import.meta.env.BASE_URL}epic-schema.json`;
    dictPromise = fetch(url)
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return dictPromise;
}

/** Look up a table's doc by name, case-insensitively. */
export function lookupTable(dict: EpicSchemaDict, tableName: string): EpicTableDoc | undefined {
  return dict[tableName.toUpperCase()];
}

/**
 * Same shape as duckdb.ts's buildSchemaPrompt, but annotates every table and
 * column with Epic's own description where the dictionary has one — so the
 * model isn't guessing at cryptic Clarity column names for tables outside
 * the small set anyone would recognize by sight.
 */
export function buildEnrichedSchemaPrompt(tables: TableInfo[], dict: EpicSchemaDict): string {
  if (tables.length === 0) return "(no tables loaded)";
  return tables
    .map((t) => {
      const doc = lookupTable(dict, t.name);
      const header = `TABLE ${t.name} (from ${t.sourceFile}, ${t.rowCount} rows)${doc?.desc ? ` — ${doc.desc}` : ""}`;
      const cols = t.columns
        .map((c) => {
          const colDoc = doc?.columns[c.name.toUpperCase()];
          return colDoc?.desc ? `${c.name} ${c.type} (${colDoc.desc})` : `${c.name} ${c.type}`;
        })
        .join(", ");
      return `${header}: ${cols}`;
    })
    .join("\n");
}
