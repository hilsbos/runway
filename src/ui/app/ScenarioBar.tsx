/**
 * Runway — scenario toolbar: save / load / delete named scenarios, copy a
 * share link, export & import JSON, and print the one-page summary.
 */
import { useRef, useState } from "react";

export interface ScenarioBarProps {
  saved: string[];
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
  onExport: () => void;
  onImport: (text: string) => void;
  onShare: () => void;
  onPrint: () => void;
  /** Transient confirmation message ("Link copied", "Saved"). */
  flash?: string | null;
}

export function ScenarioBar({
  saved,
  onSave,
  onLoad,
  onDelete,
  onExport,
  onImport,
  onShare,
  onPrint,
  flash,
}: ScenarioBarProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const n = name.trim();
    if (n) {
      onSave(n);
      setName("");
    }
  };

  const handleImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImport(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div className="scenbar">
      <div className="scenbar__save">
        <input
          className="scenbar__input"
          placeholder="Name this scenario…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          aria-label="Scenario name"
        />
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={!name.trim()}>
          Save
        </button>
      </div>

      <div className="scenbar__load">
        <select
          className="scenbar__select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Saved scenarios"
        >
          <option value="">
            {saved.length ? "Load saved…" : "No saved scenarios"}
          </option>
          {saved.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => selected && onLoad(selected)} disabled={!selected}>
          Load
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            if (selected) {
              onDelete(selected);
              setSelected("");
            }
          }}
          disabled={!selected}
        >
          Delete
        </button>
      </div>

      <div className="scenbar__actions">
        <button type="button" className="btn" onClick={onShare}>
          Share link
        </button>
        <button type="button" className="btn" onClick={onExport}>
          Export JSON
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            handleImport(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn" onClick={onPrint}>
          Print
        </button>
      </div>

      {flash && <span className="scenbar__flash">{flash}</span>}
    </div>
  );
}
