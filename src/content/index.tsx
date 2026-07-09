import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ensureBriefDefaults, generateLocalBrief } from "../lib/brief";
import { getDataset, getSummary } from "../lib/db";
import { checkBriefServer, requestAiBrief } from "../lib/localServer";
import { collectMatchedData, matchAccount } from "../lib/matching";
import type {
  AccountBrief,
  AccountMatch,
  AccountRecord,
  ImportSummary,
  MatchedAccountData,
  ProspectContext
} from "../types/salesforce";
import { detectProspectContext } from "./contextDetection";
import styles from "./styles.css?inline";

type ServerState = "checking" | "available" | "unavailable";

interface PanelState {
  context: ProspectContext;
  summary?: ImportSummary;
  match?: AccountMatch;
  matchedData?: MatchedAccountData;
  brief?: AccountBrief;
  server: ServerState;
  loading: boolean;
  error?: string;
}

function mount() {
  if (document.getElementById("account-briefs-outreach-root")) {
    return;
  }

  const host = document.createElement("div");
  host.id = "account-briefs-outreach-root";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const app = document.createElement("div");
  shadow.appendChild(app);

  const style = document.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);

  createRoot(app).render(<AccountBriefPanel />);
}

function AccountBriefPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountRecord>();
  const [state, setState] = useState<PanelState>({
    context: {},
    server: "checking",
    loading: true
  });

  async function refresh(accountOverride?: AccountRecord) {
    setState((current) => ({ ...current, loading: true, error: undefined, server: "checking" }));

    const context = detectProspectContext();
    const [summary, dataset, serverAvailable] = await Promise.all([
      getSummary(),
      getDataset(),
      checkBriefServer()
    ]);

    const match = accountOverride
      ? {
          status: "single" as const,
          context,
          account: accountOverride,
          possibleAccounts: [accountOverride],
          confidence: 1,
          reason: "Manually selected account."
        }
      : matchAccount(dataset, context);

    const matchedData = collectMatchedData(dataset, match.account);
    let brief: AccountBrief | undefined;
    let error: string | undefined;

    if (match.account) {
      if (serverAvailable) {
        try {
          brief = await requestAiBrief(context, matchedData);
        } catch (requestError) {
          error = requestError instanceof Error ? requestError.message : "AI brief request failed.";
          brief = ensureBriefDefaults(generateLocalBrief(matchedData, context));
        }
      } else {
        brief = ensureBriefDefaults(generateLocalBrief(matchedData, context));
      }
    }

    setState({
      context,
      summary,
      match,
      matchedData,
      brief: brief ? ensureBriefDefaults(brief) : undefined,
      server: serverAvailable ? "available" : "unavailable",
      loading: false,
      error
    });
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(selectedAccount), 120000);
    return () => window.clearInterval(timer);
  }, [selectedAccount]);

  const fullBriefText = useMemo(() => {
    if (!state.brief) {
      return "";
    }

    return [
      `Why I'm Calling\n${state.brief.whyCalling}`,
      `Recommended Opening Line\n${state.brief.openingLine}`,
      `Previous Conversations\n${state.brief.previousConversations.join("\n")}`,
      `Opportunity History\n${state.brief.opportunityHistory.join("\n")}`,
      `Known Contacts / Leads\n${state.brief.knownContactsLeads.join("\n")}`,
      `Recent Interesting Moments\n${state.brief.recentInterestingMoments.join("\n")}`,
      `Suggested NICE Products / Angles\n${state.brief.suggestedAngles.join("\n")}`,
      `Next Best Action\n${state.brief.nextBestAction}`
    ].join("\n\n");
  }, [state.brief]);

  if (collapsed) {
    return (
      <button className="brief-tab" onClick={() => setCollapsed(false)}>
        Account Brief
      </button>
    );
  }

  return (
    <aside className="brief-panel">
      <header className="brief-header">
        <div>
          <strong>Account Brief</strong>
          <span>{state.match?.account?.accountName ?? state.context.accountName ?? "No match yet"}</span>
        </div>
        <div className="header-actions">
          <button title="Refresh" onClick={() => void refresh(selectedAccount)}>
            Refresh
          </button>
          <button title="Collapse" onClick={() => setCollapsed(true)}>
            Collapse
          </button>
        </div>
      </header>

      {state.server === "unavailable" ? (
        <div className="warning">
          <strong>Local brief server is not running.</strong>
          <p>Open a terminal and run <code>npm run server</code>.</p>
          <button onClick={() => void refresh(selectedAccount)}>Retry</button>
          <p>Using deterministic local brief generation for now.</p>
        </div>
      ) : null}

      {state.error ? <div className="warning">{state.error}</div> : null}

      {state.loading ? <div className="muted">Loading account context...</div> : null}

      {!state.summary ? (
        <EmptyState message="No Salesforce workbook imported. Open extension options and import the Excel workbook." />
      ) : null}

      {state.match?.status === "none" ? <EmptyState message={state.match.reason ?? "No account match found."} /> : null}

      {state.match?.status === "multiple" ? (
        <section className="section">
          <h2>Possible Matches</h2>
          {state.match.possibleAccounts.map((account) => (
            <button
              className="match-button"
              key={account.id}
              onClick={() => {
                setSelectedAccount(account);
                void refresh(account);
              }}
            >
              {account.accountName}
            </button>
          ))}
        </section>
      ) : null}

      {state.brief ? (
        <div className="brief-content">
          <TopSection
            title="Why I'm Calling"
            text={state.brief.whyCalling}
            copyText={state.brief.whyCalling}
          />
          <TopSection
            title="Recommended Opening Line"
            text={state.brief.openingLine}
            copyText={state.brief.openingLine}
          />
          <button className="copy-full" onClick={() => void navigator.clipboard.writeText(fullBriefText)}>
            Copy Full Brief
          </button>
          <ListSection title="Previous Conversations" items={state.brief.previousConversations} />
          <ListSection title="Known Contacts / Leads" items={state.brief.knownContactsLeads} />
          <ListSection title="Recent Interesting Moments" items={state.brief.recentInterestingMoments} />
          <ListSection title="Opportunity History" items={state.brief.opportunityHistory} />
          <ListSection title="Suggested NICE Products / Angles" items={state.brief.suggestedAngles} />
          <ListSection title="Account Profile" items={state.brief.accountProfile} />
          <section className="section">
            <h2>Next Best Action</h2>
            <p>{state.brief.nextBestAction}</p>
          </section>
        </div>
      ) : null}
    </aside>
  );
}

function TopSection({ title, text, copyText }: { title: string; text: string; copyText: string }) {
  return (
    <section className="top-section">
      <div className="section-title">
        <h2>{title}</h2>
        <button onClick={() => void navigator.clipboard.writeText(copyText)}>Copy</button>
      </div>
      <p>{text}</p>
    </section>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty">{message}</div>;
}

mount();
