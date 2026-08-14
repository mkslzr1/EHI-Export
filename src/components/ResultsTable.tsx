import type { QueryResult } from "../lib/types";

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ResultsTable({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) {
    return <p className="muted">Query returned no columns.</p>;
  }
  if (result.rows.length === 0) {
    return <p className="muted">No rows matched.</p>;
  }

  return (
    <div className="results-wrap">
      <div className="table-scroll">
        <table className="results-table">
          <thead>
            <tr>
              {result.columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{formatCell(cell)}</td>
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
