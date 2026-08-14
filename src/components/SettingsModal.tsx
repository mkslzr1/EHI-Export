import { useState } from "react";
import { clearStoredApiKey, setStoredApiKey } from "../lib/storage";
import { DEFAULT_MODEL } from "../lib/anthropic";

export function SettingsModal({
  currentKey,
  currentModel,
  onSave,
  onClose,
}: {
  currentKey: string | null;
  currentModel: string;
  onSave: (key: string, model: string) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(currentKey ?? "");
  const [model, setModel] = useState(currentModel);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p className="muted">
          Your Anthropic API key is stored only in this browser (localStorage) and is sent
          directly to Anthropic's API to translate your questions into SQL. It is never
          committed anywhere or sent to any other server. Only table and column names are
          sent with each request &mdash; never patient row data.
        </p>
        <label className="field">
          <span>Anthropic API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Model</span>
          <input
            type="text"
            spellCheck={false}
            placeholder={DEFAULT_MODEL}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button
            className="btn-secondary"
            onClick={() => {
              clearStoredApiKey();
              setKey("");
              onSave("", model.trim() || DEFAULT_MODEL);
            }}
          >
            Clear key
          </button>
          <div className="spacer" />
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              const trimmedKey = key.trim();
              const trimmedModel = model.trim() || DEFAULT_MODEL;
              if (trimmedKey) setStoredApiKey(trimmedKey);
              onSave(trimmedKey, trimmedModel);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
