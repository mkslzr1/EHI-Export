import { useState } from "react";
import type { HistoryEntry } from "../lib/types";
import { IconPlay, IconSend } from "./icons";
import { ResultsTable } from "./ResultsTable";

function HistoryCard({
  entry,
  onRunSql,
}: {
  entry: HistoryEntry;
  onRunSql: (id: string, sql: string) => void;
}) {
  const [sql, setSql] = useState(entry.sql);

  return (
    <div className="history-card">
      <div className="bubble bubble-user">{entry.question}</div>
      <div className="bubble bubble-assistant">
        <label className="sql-label">Generated SQL</label>
        <textarea
          className="sql-box"
          value={sql}
          spellCheck={false}
          rows={Math.min(8, Math.max(2, sql.split("\n").length))}
          onChange={(e) => setSql(e.target.value)}
        />
        <div className="history-actions">
          <button
            className="btn-secondary"
            disabled={entry.status === "pending"}
            onClick={() => onRunSql(entry.id, sql)}
          >
            <IconPlay />
            {entry.status === "pending" ? "Running..." : "Run query"}
          </button>
        </div>
        {entry.status === "error" && <p className="error-msg">{entry.error}</p>}
        {entry.status === "success" && entry.result && <ResultsTable result={entry.result} />}
      </div>
    </div>
  );
}

export function QueryChat({
  history,
  asking,
  disabled,
  hint,
  onAsk,
  onRunSql,
}: {
  history: HistoryEntry[];
  asking: boolean;
  disabled: boolean;
  hint: string | null;
  onAsk: (question: string) => void;
  onRunSql: (id: string, sql: string) => void;
}) {
  const [question, setQuestion] = useState("");

  const submit = () => {
    const trimmed = question.trim();
    if (!trimmed || asking || disabled) return;
    onAsk(trimmed);
    setQuestion("");
  };

  return (
    <div className="query-chat">
      <div className="history-scroll">
        {history.length === 0 && (
          <p className="muted empty-hint">
            Ask a question in plain English, e.g. &ldquo;How many active medication orders are
            there per department?&rdquo;
          </p>
        )}
        {history.map((entry) => (
          <HistoryCard key={entry.id} entry={entry} onRunSql={onRunSql} />
        ))}
        {asking && (
          <div className="bubble bubble-assistant">
            <span className="thinking" aria-label="Generating SQL">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
      </div>

      <div className="ask-bar">
        <div className="ask-bar-column">
          {hint && <p className="disabled-hint">{hint}</p>}
          <textarea
            className="ask-input"
            placeholder="Ask a question about your data..."
            rows={2}
            value={question}
            disabled={disabled}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <button
          className="send-btn"
          aria-label="Ask"
          disabled={disabled || asking || !question.trim()}
          onClick={submit}
        >
          <IconSend />
        </button>
      </div>
    </div>
  );
}
