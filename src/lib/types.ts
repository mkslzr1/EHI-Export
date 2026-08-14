export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  sourceFile: string;
  rowCount: number;
  columns: ColumnInfo[];
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}

export interface HistoryEntry {
  id: string;
  question: string;
  sql: string;
  status: "pending" | "success" | "error";
  result?: QueryResult;
  error?: string;
  createdAt: number;
}
