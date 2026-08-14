import * as duckdb from "@duckdb/duckdb-wasm";
import duckdbWasmMvp from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbWorkerMvp from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbWasmEh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbWorkerEh from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import type { ColumnInfo, QueryResult, TableInfo } from "./types";

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdbWasmMvp,
    mainWorker: duckdbWorkerMvp,
  },
  eh: {
    mainModule: duckdbWasmEh,
    mainWorker: duckdbWorkerEh,
  },
};

const MAX_PREVIEW_ROWS = 500;

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;
const registeredNames = new Set<string>();
const knownTables = new Map<string, TableInfo>();

async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      const worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      return db;
    })();
  }
  return dbPromise;
}

async function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = (async () => {
      const db = await getDB();
      return db.connect();
    })();
  }
  return connPromise;
}

export function sanitizeTableName(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, "");
  let name = base
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!name) name = "table";
  if (/^[0-9]/.test(name)) name = `t_${name}`;
  name = name.toLowerCase();

  let candidate = name;
  let suffix = 2;
  while (knownTables.has(candidate)) {
    candidate = `${name}_${suffix++}`;
  }
  return candidate;
}

function arrowValueToJs(value: unknown): unknown {
  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function loadColumns(tableName: string): Promise<ColumnInfo[]> {
  const conn = await getConn();
  const res = await conn.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName.replace(/'/g, "''")}' ORDER BY ordinal_position`,
  );
  return res.toArray().map((row) => ({
    name: String(row.column_name),
    type: String(row.data_type),
  }));
}

async function countRows(tableName: string): Promise<number> {
  const conn = await getConn();
  const res = await conn.query(`SELECT COUNT(*) AS n FROM "${tableName}"`);
  const n = res.toArray()[0]?.n;
  return typeof n === "bigint" ? Number(n) : Number(n ?? 0);
}

export async function importFile(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<TableInfo> {
  const db = await getDB();
  const tableName = sanitizeTableName(file.name);

  onProgress?.(`Reading ${file.name}...`);
  const buffer = new Uint8Array(await file.arrayBuffer());

  const registeredName = `${tableName}__src`;
  await db.registerFileBuffer(registeredName, buffer);
  registeredNames.add(registeredName);

  onProgress?.(`Loading ${file.name} into table "${tableName}"...`);
  const conn = await getConn();
  await conn.query(
    `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${registeredName}', ignore_errors=true, null_padding=true)`,
  );

  const [columns, rowCount] = await Promise.all([
    loadColumns(tableName),
    countRows(tableName),
  ]);

  const info: TableInfo = {
    name: tableName,
    sourceFile: file.name,
    rowCount,
    columns,
  };
  knownTables.set(tableName, info);
  return info;
}

export function getTables(): TableInfo[] {
  return Array.from(knownTables.values());
}

export async function dropTable(tableName: string): Promise<void> {
  const conn = await getConn();
  await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
  knownTables.delete(tableName);
}

export async function previewTable(tableName: string, limit = 50): Promise<QueryResult> {
  return runQuery(`SELECT * FROM "${tableName}" LIMIT ${Math.min(limit, MAX_PREVIEW_ROWS)}`);
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const conn = await getConn();
  const arrowResult = await conn.query(sql);
  const columns = arrowResult.schema.fields.map((f) => f.name);
  const allRows = arrowResult.toArray();
  const truncated = allRows.length > MAX_PREVIEW_ROWS;
  const rows = allRows.slice(0, MAX_PREVIEW_ROWS).map((row) =>
    columns.map((col) => arrowValueToJs(row[col])),
  );
  return {
    columns,
    rows,
    rowCount: allRows.length,
    truncated,
  };
}

export function buildSchemaPrompt(): string {
  const tables = getTables();
  if (tables.length === 0) return "(no tables loaded)";
  return tables
    .map((t) => {
      const cols = t.columns.map((c) => `${c.name} ${c.type}`).join(", ");
      return `TABLE ${t.name} (from ${t.sourceFile}, ${t.rowCount} rows): ${cols}`;
    })
    .join("\n");
}

export function resetDatabase(): void {
  knownTables.clear();
}
