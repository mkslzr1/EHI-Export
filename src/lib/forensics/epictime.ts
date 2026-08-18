/**
 * Epic time handling, ported from ehiforensics' epictime.py.
 *
 * An Epic EHI export mixes UTC instants (HNO_INFO and other note tables) with
 * local wall-clock instants (flowsheets, orders, MAR, encounters) and never
 * labels which is which in the file itself — TABLE_TZ below is the mapping.
 * Get it backwards and you manufacture a several-hour discrepancy that does
 * not exist, or erase a real one.
 *
 * Every Date here is treated as a "naive" clock reading: its epoch value is
 * whatever DuckDB/the browser parsed the source cell into, with no further
 * timezone meaning attached. toLocal/toUtc apply a fixed hour offset on top
 * of that naive value, exactly as the Python original does with naive
 * datetime + timedelta. Read fields back with the UTC getters (getUTCHours,
 * not getHours) so the browser's own timezone never leaks in.
 *
 * ehiforensics' inverted-contact-date filename scheme and FHIR-version
 * calibration are not ported here: this app only ingests flat TSV/CSV files,
 * not the Rich Text or FHIR containers those depend on.
 */

export type TzLabel = "utc" | "local";

export const UTC: TzLabel = "utc";
export const LOCAL: TzLabel = "local";

/** Per-table timezone semantics, as documented in the Epic EHI export. */
export const TABLE_TZ: Record<string, TzLabel> = {
  HNO_INFO: UTC,
  HNO_NOTE_TEXT: UTC,
  IP_FLWSHT_MEAS: LOCAL,
  IP_FLWSHT_REC: LOCAL,
  MAR_ADMIN_INFO: LOCAL,
  ORDER_PROC: LOCAL,
  ORDER_MED: LOCAL,
  ORDER_STATUS: LOCAL,
  ORDER_RESULTS: LOCAL,
  OR_LOG: LOCAL,
  OR_CASE: LOCAL,
  PAT_ENC: LOCAL,
  PAT_ENC_2: LOCAL,
  PAT_ENC_HSP: LOCAL,
  OB_HSB_DELIVERY: UTC,
  IP_DATA_STORE: LOCAL,
};

export class Clock {
  readonly utcOffsetHours: number;

  constructor(utcOffsetHours: number = -7) {
    this.utcOffsetHours = utcOffsetHours;
  }

  toLocal(dt: Date | null, sourceTz: TzLabel): Date | null {
    if (!dt) return null;
    if (sourceTz === LOCAL) return dt;
    return new Date(dt.getTime() + this.utcOffsetHours * 3_600_000);
  }

  toUtc(dt: Date | null, sourceTz: TzLabel): Date | null {
    if (!dt) return null;
    if (sourceTz === UTC) return dt;
    return new Date(dt.getTime() - this.utcOffsetHours * 3_600_000);
  }

  /** Normalise a value from `table` into local wall-clock. */
  tableLocal(table: string, dt: Date | null): Date | null {
    const tz = TABLE_TZ[table.toUpperCase()] ?? LOCAL;
    return this.toLocal(dt, tz);
  }
}

// ---------------------------------------------------------------------------
// parsing
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}

function to24Hour(h: number, ampm: string): number {
  const p = ampm.toUpperCase();
  if (p === "AM") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

const DT_PATTERNS: Array<{ re: RegExp; build: (m: RegExpMatchArray) => Date }> = [
  {
    // M/D/YYYY h:mm:ss AM/PM
    re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i,
    build: (m) => buildUtc(+m[3], +m[1], +m[2], to24Hour(+m[4], m[7]), +m[5], +m[6]),
  },
  {
    // M/D/YYYY h:mm AM/PM
    re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
    build: (m) => buildUtc(+m[3], +m[1], +m[2], to24Hour(+m[4], m[6]), +m[5], 0),
  },
  {
    // M/D/YYYY H:MM:SS (24h)
    re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
    build: (m) => buildUtc(+m[3], +m[1], +m[2], +m[4], +m[5], +m[6]),
  },
  {
    // M/D/YYYY
    re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    build: (m) => buildUtc(+m[3], +m[1], +m[2], 0, 0, 0),
  },
  {
    // YYYY-MM-DD HH:MM:SS
    re: /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
    build: (m) => buildUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]),
  },
  {
    // YYYY-MM-DD
    re: /^(\d{4})-(\d{2})-(\d{2})$/,
    build: (m) => buildUtc(+m[1], +m[2], +m[3], 0, 0, 0),
  },
];

/**
 * Parse the datetime spellings a Clarity TSV export (or DuckDB's ISO-string
 * round-trip of an already-typed TIMESTAMP column) actually uses. Always
 * treats the parsed clock reading as a naive value — see the module doc.
 */
export function parseDt(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  if (/Z$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  for (const { re, build } of DT_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const d = build(m);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Just the date portion of a parseable value, formatted, or "" if unparseable. */
export function dateOnly(value: unknown): string {
  const d = parseDt(value);
  return d ? fmt(d).split(" ")[0] : "";
}

export function fmt(dt: Date | null, withSecs = false): string {
  if (!dt) return "";
  const mm = pad2(dt.getUTCMonth() + 1);
  const dd = pad2(dt.getUTCDate());
  const yyyy = dt.getUTCFullYear();
  const hh = pad2(dt.getUTCHours());
  const mi = pad2(dt.getUTCMinutes());
  const base = `${mm}/${dd}/${yyyy} ${hh}:${mi}`;
  return withSecs ? `${base}:${pad2(dt.getUTCSeconds())}` : base;
}

/** Difference in milliseconds between two (naive-epoch) Dates, or null. */
export function diffMs(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return a.getTime() - b.getTime();
}

export function dur(ms: number | null): string {
  if (ms === null) return "";
  const sign = ms < 0 ? "-" : "";
  let s = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (h) return `${sign}${h}h ${pad2(m)}m`;
  if (m) return `${sign}${m}m`;
  return `${sign}${s}s`;
}
