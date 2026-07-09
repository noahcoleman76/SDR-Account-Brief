import React, { ChangeEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { clearDataset, getSummary, saveDataset } from "../lib/db";
import { parseWorkbook } from "../lib/workbook";
import type { ImportSummary } from "../types/salesforce";
import "./options.css";

function OptionsPage() {
  const [summary, setSummary] = useState<ImportSummary>();
  const [status, setStatus] = useState("Import a Salesforce workbook exported with the required tabs.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSummary().then(setSummary);
  }, []);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBusy(true);
    setStatus("Parsing workbook...");
    try {
      const dataset = await parseWorkbook(file);
      const nextSummary = await saveDataset(dataset);
      setSummary(nextSummary);
      setStatus("Workbook imported. Existing data was replaced.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleClear() {
    setBusy(true);
    await clearDataset();
    setSummary(undefined);
    setStatus("Imported data cleared.");
    setBusy(false);
  }

  return (
    <main className="options-page">
      <section className="header">
        <div>
          <p className="eyebrow">Local Chrome Extension</p>
          <h1>Account Briefs for Outreach</h1>
          <p>
            Import the Salesforce Excel workbook used for account matching and local call brief generation.
          </p>
        </div>
      </section>

      <section className="panel">
        <h2>Workbook Import</h2>
        <label className="file-picker">
          <span>{busy ? "Working..." : "Upload or Replace Workbook"}</span>
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(event) => void handleFile(event)}
          />
        </label>
        <p className="status">{status}</p>

        <div className="summary-grid">
          <Summary label="Accounts" value={summary?.accounts ?? 0} />
          <Summary label="Opportunities" value={summary?.opportunities ?? 0} />
          <Summary label="Contacts" value={summary?.contacts ?? 0} />
          <Summary label="Leads" value={summary?.leads ?? 0} />
        </div>

        {summary?.importedAt ? (
          <p className="imported">Last imported {new Date(summary.importedAt).toLocaleString()}</p>
        ) : null}

        <button className="danger" disabled={busy || !summary} onClick={() => void handleClear()}>
          Clear Imported Data
        </button>
      </section>

      <section className="panel">
        <h2>Local AI Server</h2>
        <p>
          Start the optional local server with <code>npm run server</code>. If it is unavailable, the
          Outreach panel will show a warning and use deterministic local brief generation.
        </p>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<OptionsPage />);
