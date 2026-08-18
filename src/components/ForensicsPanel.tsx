import { useMemo, useState } from "react";
import { PRIORITY_TABLES } from "../lib/forensics/catalog";
import { runAll } from "../lib/forensics/detectors";
import { buildChart } from "../lib/forensics/model";
import { PROVABLE, STRONG, SUPPORTING } from "../lib/forensics/types";
import type { Finding, ForensicsConfig, Severity } from "../lib/forensics/types";
import type { TableInfo } from "../lib/types";
import { EvidenceTable } from "./EvidenceTable";
import { IconAlertTriangle, IconSearch } from "./icons";

const DEFAULT_CONFIG_TEXT = JSON.stringify(
  {
    utc_offset_hours: -7,
    backfill_minutes: 90,
    session_min_rows: 3,
    priority_rows: [],
    backdate_hours: 2,
    order_gap_minutes: 20,
    critical_window: null,
    timeline_events: [],
    contradiction_pairs: [],
  },
  null,
  2,
);

const SEVERITY_LABEL: Record<Severity, string> = {
  [PROVABLE]: "Provable",
  [STRONG]: "Strong",
  [SUPPORTING]: "Supporting",
};

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className={`finding-card sev-${finding.severity}`}>
      <header className="finding-header">
        <span className={`sev-badge sev-badge-${finding.severity}`}>{SEVERITY_LABEL[finding.severity]}</span>
        <span className="finding-id">{finding.id}</span>
        <div className="finding-heading">
          <h4>{finding.title}</h4>
          <p className="finding-subtitle">{finding.subtitle}</p>
        </div>
      </header>

      <ul className="finding-facts">
        {finding.facts.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>

      {finding.evidence.map((ev, i) => (
        <EvidenceTable key={i} evidence={ev} />
      ))}

      {(finding.demands?.length || finding.depositions?.length) && (
        <div className="finding-followup">
          {finding.demands?.map((d, i) => (
            <p key={`d${i}`} className="finding-demand">
              <strong>Demand:</strong> {d}
            </p>
          ))}
          {finding.depositions?.map((d, i) => (
            <p key={`q${i}`} className="finding-demand">
              <strong>Ask {d.who}:</strong> {d.question}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}

export function ForensicsPanel({ tables }: { tables: TableInfo[] }) {
  const [cfgText, setCfgText] = useState(DEFAULT_CONFIG_TEXT);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const recognized = useMemo(() => {
    const present = new Set(tables.map((t) => t.name));
    return PRIORITY_TABLES.map((spec) => ({ ...spec, imported: present.has(spec.name.toLowerCase()) }));
  }, [tables]);
  const importedCount = recognized.filter((r) => r.imported).length;

  const run = async () => {
    setError(null);
    let cfg: ForensicsConfig;
    try {
      cfg = JSON.parse(cfgText) as ForensicsConfig;
    } catch (err) {
      setError(`Config is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setRunning(true);
    try {
      const chart = await buildChart(tables, { utcOffsetHours: cfg.utc_offset_hours ?? -7 });
      setFindings(runAll(chart, cfg));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const grouped = useMemo(() => {
    if (!findings) return null;
    const by: Record<Severity, Finding[]> = { [PROVABLE]: [], [STRONG]: [], [SUPPORTING]: [] };
    for (const f of findings) by[f.severity].push(f);
    return by;
  }, [findings]);

  return (
    <div className="forensics-panel">
      <div className="forensics-intro">
        <p className="muted">
          Runs six deterministic checks over the imported Clarity tables — late/clustered documentation, note
          backdating, reopened results, order-entry silence, import completeness, and field contradictions — entirely
          in this browser tab. Every finding lists the exact rows behind it; nothing here is a conclusion, only what
          the import shows.
        </p>
        <p className="muted forensics-caveat">
          <IconAlertTriangle />
          Not legal or clinical advice. Note-version alteration detection (the strongest signal in the original
          methodology) needs the FHIR DocumentReference feed, which this importer doesn't parse — only flat TSV/CSV
          tables are checked here.
        </p>
      </div>

      <div className="forensics-tables">
        <span className="muted">
          {importedCount} of {recognized.length} recognized tables imported
        </span>
        <ul className="table-checklist">
          {recognized.map((r) => (
            <li key={r.name} className={r.imported ? "present" : "absent"}>
              <code>{r.name}</code>
              {r.critical && <span className="critical-mark" title={r.why}>
                *
              </span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="forensics-config">
        <button className="btn-secondary config-toggle" onClick={() => setShowConfig((v) => !v)}>
          {showConfig ? "Hide case configuration" : "Case configuration (JSON)"}
        </button>
        {showConfig && (
          <>
            <textarea
              className="sql-box config-box"
              value={cfgText}
              spellCheck={false}
              rows={12}
              onChange={(e) => setCfgText(e.target.value)}
            />
            <p className="muted config-help">
              <code>utc_offset_hours</code> is the facility's UTC offset (Arizona: -7). <code>priority_rows</code>{" "}
              flags flowsheet rows that are load-bearing for this matter. <code>critical_window</code> is{" "}
              <code>[start, end, label]</code> for order-silence detection; <code>timeline_events</code> is{" "}
              <code>[[time, label], ...]</code>. <code>contradiction_pairs</code> is{" "}
              <code>[[table, columnA, columnB, label], ...]</code>.
            </p>
          </>
        )}
      </div>

      <button className="btn-primary run-forensics" disabled={running || tables.length === 0} onClick={run}>
        <IconSearch />
        {running ? "Running review..." : "Run forensic review"}
      </button>
      {error && <p className="error-msg">{error}</p>}

      {grouped && (
        <div className="findings-list">
          {findings?.length === 0 && <p className="muted">No findings from the six detectors against this import.</p>}
          {([PROVABLE, STRONG, SUPPORTING] as Severity[]).map(
            (sev) =>
              grouped[sev].length > 0 && (
                <section key={sev} className="finding-group">
                  <h3 className={`finding-group-heading sev-text-${sev}`}>
                    {SEVERITY_LABEL[sev]} ({grouped[sev].length})
                  </h3>
                  {grouped[sev].map((f) => (
                    <FindingCard key={f.id} finding={f} />
                  ))}
                </section>
              ),
          )}
        </div>
      )}
    </div>
  );
}
