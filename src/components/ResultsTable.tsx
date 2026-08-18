import type { QueryResult } from "../lib/types";

function isNumberLike(value: unknown): boolean {
  return typeof value === "number" || typeof value === "bigint";
}

function formatCell(value: unknown, numeric: boolean): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  if (numeric && isNumberLike(value)) return value.toLocaleString();
  return String(value);
}

export function ResultsTable({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) {
    return <p className="muted">Query returned no columns.</p>;
  }
  if (result.rows.length === 0) {
    return <p className="muted">No rows matched.</p>;
  }

  const numericCols = result.columns.map((_, j) =>
    result.rows.every((row) => row[j] === null || row[j] === undefined || isNumberLike(row[j])),
  );

  return (
    <div className="results-wrap">
      <div className="table-scroll">
        <table className="results-table">
          <thead>
            <tr>
              {result.columns.map((col, j) => (
                <th key={col} className={numericCols[j] ? "num" : undefined}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className={numericCols[j] ? "num" : undefined}>
                    {formatCell(cell, numericCols[j])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="result-meta">
        {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? "" : "s"}
        {result.truncated ? " (showing first 500)" : ""}
      </p>
    </div>
  );
}
