import { useCallback, useMemo, useState } from "react";
import { DataPanel } from "./components/DataPanel";
import { QueryChat } from "./components/QueryChat";
import { ResultsTable } from "./components/ResultsTable";
import { SettingsModal } from "./components/SettingsModal";
import { assertReadOnlySelect, DEFAULT_MODEL, generateSql } from "./lib/anthropic";
import { buildSchemaPrompt, getTables, importFile, previewTable, runQuery } from "./lib/duckdb";
import { getStoredApiKey } from "./lib/storage";
import type { HistoryEntry, QueryResult, TableInfo } from "./lib/types";
import { expandArchives, isSupportedFile } from "./lib/zip";
import { IconClose, IconDatabase, IconSettings, IconShieldCheck } from "./components/icons";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function App() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey());
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [asking, setAsking] = useState(false);

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<QueryResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const updateEntry = useCallback((id: string, patch: Partial<HistoryEntry>) => {
    setHistory((h) => h.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const handleImportFiles = useCallback(async (fileList: FileList) => {
    const files = Array.from(fileList);
    setBusy(true);
    setProgressMessage("Preparing files...");
    try {
      const expanded = (await expandArchives(files)).filter(isSupportedFile);
      if (expanded.length === 0) {
        setProgressMessage("No .tsv/.txt/.csv files found in the selection.");
        return;
      }
      for (const file of expanded) {
        await importFile(file, setProgressMessage);
      }
      setTables(getTables());
      setProgressMessage(`Loaded ${expanded.length} file${expanded.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setProgressMessage(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handlePreview = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const result = await previewTable(tableName, 100);
      setPreviewResult(result);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleAsk = useCallback(
    async (question: string) => {
      const id = newId();
      setHistory((h) => [
        ...h,
        { id, question, sql: "", status: "pending", createdAt: Date.now() },
      ]);
      setAsking(true);
      try {
        let sql: string;
        if (apiKey) {
          sql = await generateSql(question, buildSchemaPrompt(), apiKey, model);
        } else if (/^\s*(SELECT|WITH)\b/i.test(question)) {
          assertReadOnlySelect(question);
          sql = question;
        } else {
          throw new Error(
            "No API key set. Add one in Settings for natural-language queries, or type a raw SQL SELECT statement.",
          );
        }
        updateEntry(id, { sql });
        const result = await runQuery(sql);
        updateEntry(id, { status: "success", result });
      } catch (err) {
        updateEntry(id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setAsking(false);
      }
    },
    [apiKey, model, updateEntry],
  );

  const handleRunSql = useCallback(
    async (id: string, sql: string) => {
      updateEntry(id, { status: "pending" });
      try {
        assertReadOnlySelect(sql);
        const result = await runQuery(sql);
        updateEntry(id, { sql, status: "success", result });
      } catch (err) {
        updateEntry(id, {
          sql,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [updateEntry],
  );

  const hint = useMemo(() => {
    if (tables.length === 0) return null;
    if (!apiKey) return "No API key set — type a raw SQL SELECT, or add a key in Settings.";
    return null;
  }, [tables.length, apiKey]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="brand">
            <span className="brand-mark">
              <IconDatabase />
            </span>
            <h1>EHI Query</h1>
          </div>
          <p className="muted disclaimer">
            <IconShieldCheck />
            Patient data stays on this device. Only table &amp; column names are sent to
            Claude to generate SQL &mdash; never row data.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setSettingsOpen(true)}>
          <IconSettings />
          Settings
        </button>
      </header>

      <main className="app-body">
        <DataPanel
          tables={tables}
          busy={busy}
          progressMessage={progressMessage}
          onImportFiles={handleImportFiles}
          onDrop={handleImportFiles}
          onPreview={handlePreview}
          selectedTable={selectedTable}
        />

        <section className="main-panel">
          {selectedTable && (
            <div className="preview-card">
              <div className="preview-header">
                <h3>Preview: {selectedTable}</h3>
                <button
                  className="icon-btn"
                  aria-label="Close preview"
                  onClick={() => {
                    setSelectedTable(null);
                    setPreviewResult(null);
                    setPreviewError(null);
                  }}
                >
                  <IconClose />
                </button>
              </div>
              {previewError && <p className="error-msg">{previewError}</p>}
              {previewResult && <ResultsTable result={previewResult} />}
            </div>
          )}

          <QueryChat
            history={history}
            asking={asking}
            disabled={tables.length === 0}
            hint={
              tables.length === 0
                ? "Import at least one file to start querying."
                : hint
            }
            onAsk={handleAsk}
            onRunSql={handleRunSql}
          />
        </section>
      </main>

      {settingsOpen && (
        <SettingsModal
          currentKey={apiKey}
          currentModel={model}
          onSave={(key, newModel) => {
            setApiKey(key || null);
            setModel(newModel);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
