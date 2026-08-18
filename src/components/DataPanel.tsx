import { useRef, useState } from "react";
import type { TableInfo } from "../lib/types";
import { IconTable, IconUpload } from "./icons";

export function DataPanel({
  tables,
  busy,
  progressMessage,
  onImportFiles,
  onPreview,
  onDrop,
  selectedTable,
}: {
  tables: TableInfo[];
  busy: boolean;
  progressMessage: string | null;
  onImportFiles: (files: FileList) => void;
  onPreview: (tableName: string) => void;
  onDrop: (files: FileList) => void;
  selectedTable: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <aside className="data-panel">
      <div
        className={`dropzone${dragOver ? " dropzone-active" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) onDrop(e.dataTransfer.files);
        }}
      >
        <span className="dropzone-icon">
          <IconUpload />
        </span>
        <p className="dropzone-title">Import EHI export</p>
        <p className="muted">Tap to choose files, or drop .tsv / .txt / .csv / .zip here</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".tsv,.txt,.csv,.zip"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onImportFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {busy && progressMessage && <p className="progress-msg">{progressMessage}</p>}

      <div className="table-list">
        <h3>
          Tables{" "}
          {tables.length > 0 && <span className="muted">({tables.length})</span>}
        </h3>
        {tables.length === 0 && (
          <p className="muted">No tables loaded yet. Import files to get started.</p>
        )}
        <ul>
          {tables.map((t) => (
            <li key={t.name}>
              <button
                className={`table-item${selectedTable === t.name ? " table-item-active" : ""}`}
                onClick={() => onPreview(t.name)}
                title={t.sourceFile}
              >
                <span className="table-item-icon">
                  <IconTable />
                </span>
                <span className="table-item-text">
                  <span className="table-name">{t.name}</span>
                  <span className="table-meta">
                    {t.rowCount.toLocaleString()} rows &middot; {t.columns.length} cols
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
