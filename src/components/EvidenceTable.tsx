import type { Evidence } from "../lib/forensics/types";

export function EvidenceTable({ evidence }: { evidence: Evidence }) {
  return (
    <div className="evidence-block">
      <div className="evidence-meta">
        <span className="evidence-source">{evidence.source}</span>
        <span className="evidence-selector">{evidence.selector}</span>
      </div>
      {evidence.caption && <p className="evidence-caption">{evidence.caption}</p>}
      <div className="table-scroll evidence-scroll">
        <table className="results-table evidence-table">
          <thead>
            <tr>
              {evidence.columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evidence.rows.map((row, i) => (
              <tr key={i} className={evidence.rowClasses?.[i] ? `row-${evidence.rowClasses[i]}` : undefined}>
                {row.map((cell, j) => {
                  const role = evidence.highlights?.[`${i}:${j}`];
                  return (
                    <td key={j} className={role ? `hl-${role}` : undefined}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {evidence.footnote && <p className="evidence-footnote">{evidence.footnote}</p>}
    </div>
  );
}
