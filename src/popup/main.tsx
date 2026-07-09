import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getSummary } from "../lib/db";
import type { ImportSummary } from "../types/salesforce";
import "./popup.css";

function Popup() {
  const [summary, setSummary] = useState<ImportSummary>();

  useEffect(() => {
    void getSummary().then(setSummary);
  }, []);

  return (
    <main className="popup">
      <h1>Account Briefs</h1>
      {summary ? (
        <p>
          Imported {summary.accounts} accounts, {summary.opportunities} opportunities,{" "}
          {summary.contacts + summary.leads} people.
        </p>
      ) : (
        <p>No Salesforce workbook imported yet.</p>
      )}
      <button onClick={() => chrome.runtime.openOptionsPage()}>Open Options</button>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<Popup />);
