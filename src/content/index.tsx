import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ensureBriefDefaults, generateLocalBrief } from "../lib/brief";
import { getDatasetFromExtension, getSummaryFromExtension } from "../lib/extensionData";
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
import { currentOutreachTaskSignature, detectProspectContext } from "./contextDetection";
import styles from "./styles.css?inline";

type ServerState = "checking" | "available" | "unavailable";

interface PanelState {
  context: ProspectContext;
  summary?: ImportSummary;
  match?: AccountMatch;
  matchedData?: MatchedAccountData;
  brief?: AccountBrief;
  allAccounts: AccountRecord[];
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
  const [accountSearch, setAccountSearch] = useState("");
  const [panelPosition, setPanelPosition] = useState(() => ({
    x: Math.max(8, window.innerWidth - 396),
    y: 16
  }));
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const [state, setState] = useState<PanelState>({
    context: {},
    allAccounts: [],
    server: "checking",
    loading: true
  });

  async function refresh(accountOverride?: AccountRecord) {
    setState((current) => ({ ...current, loading: true, error: undefined, server: "checking" }));

    const [summary, dataset, serverAvailable] = await Promise.all([
      getSummaryFromExtension(),
      getDatasetFromExtension(),
      checkBriefServer()
    ]);
    const detectedContext = detectProspectContext(dataset.accounts.map((account) => account.accountName));
    const context = {
      ...detectedContext,
      accountName: detectedContext.accountName ?? accountOverride?.accountName
    };

    let match = accountOverride
      ? {
          status: "single" as const,
          context,
          account: accountOverride,
          possibleAccounts: [accountOverride],
          confidence: 1,
          reason: "Manually selected account."
        }
      : matchAccount(dataset, context);

    let matchedData = collectMatchedData(dataset, match.account, context);
    let brief: AccountBrief | undefined;
    let error: string | undefined;

    if (serverAvailable) {
      try {
        const aiResponse = await requestAiBrief(context, dataset, matchedData);
        brief = aiResponse.brief;
        matchedData = aiResponse.matchedData;
        if (matchedData.account) {
          match = {
            status: "single",
            context,
            account: matchedData.account,
            matchedPerson: matchedData.matchedPerson,
            possibleAccounts: [matchedData.account],
            confidence: 1,
            reason: aiResponse.matchReason ?? "AI selected the most likely imported account."
          };
        }
      } catch (requestError) {
        error = requestError instanceof Error ? requestError.message : "AI brief request failed.";
        if (match.account) {
          brief = ensureBriefDefaults(generateLocalBrief(matchedData, context));
        }
      }
    } else if (match.account) {
      brief = ensureBriefDefaults(generateLocalBrief(matchedData, context));
    }

    setState({
      context,
      summary,
      match,
      matchedData,
      brief: brief ? ensureBriefDefaults(brief) : undefined,
      allAccounts: dataset.accounts,
      server: serverAvailable ? "available" : "unavailable",
      loading: false,
      error
    });
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 120000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let lastSignature = currentOutreachTaskSignature();
    const timer = window.setInterval(() => {
      const nextSignature = currentOutreachTaskSignature();
      if (nextSignature && nextSignature !== lastSignature) {
        lastSignature = nextSignature;
        void refresh();
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, []);

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

  const searchedAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) {
      return state.allAccounts.slice(0, 8);
    }

    return state.allAccounts
      .filter((account) => account.accountName.toLowerCase().includes(query))
      .slice(0, 8);
  }, [accountSearch, state.allAccounts]);

  const serverLabel =
    state.server === "available" ? "AI server on" : state.server === "checking" ? "Checking server" : "Local fallback";
  const matchLabel =
    state.match?.account?.accountName ?? state.context.accountName ?? "Waiting for account";

  function clampPanelPosition(x: number, y: number) {
    const width = Math.min(380, window.innerWidth - 16);
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - 80);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY)
    };
  }

  function startDrag(event: React.PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    const panel = event.currentTarget.closest(".brief-panel");
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    dragOffset.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanel(event: React.PointerEvent<HTMLElement>) {
    if (!dragOffset.current) {
      return;
    }

    setPanelPosition(
      clampPanelPosition(event.clientX - dragOffset.current.x, event.clientY - dragOffset.current.y)
    );
  }

  function stopDrag(event: React.PointerEvent<HTMLElement>) {
    dragOffset.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (collapsed) {
    return (
      <button className="brief-tab" onClick={() => setCollapsed(false)}>
        Account Brief
      </button>
    );
  }

  return (
    <aside
      className="brief-panel"
      style={{
        left: `${panelPosition.x}px`,
        right: "auto",
        top: `${panelPosition.y}px`
      }}
    >
      <header
        className="brief-header"
        onPointerDown={startDrag}
        onPointerMove={movePanel}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="header-copy">
          <strong>Account Brief</strong>
          <span>{matchLabel}</span>
        </div>
        <div className="header-actions">
          <button title="Refresh" onClick={() => void refresh()}>
            Refresh
          </button>
          <button title="Collapse" onClick={() => setCollapsed(true)}>
            Collapse
          </button>
        </div>
      </header>

      <section className="status-strip">
        <span className={`server-pill server-${state.server}`}>{serverLabel}</span>
        <span>{state.summary ? `${state.summary.accounts} accounts imported` : "No workbook"}</span>
      </section>

      {state.server === "unavailable" ? (
        <div className="warning">
          <strong>Local brief server is not running.</strong>
          <p>Open a terminal and run <code>npm run server</code>.</p>
          <button onClick={() => void refresh()}>Retry</button>
          <p>Using deterministic local brief generation for now.</p>
        </div>
      ) : null}

      {state.error ? <div className="warning">{state.error}</div> : null}

      {state.loading ? <div className="muted">Loading account context...</div> : null}

      <section className="detected-context">
        <div className="context-header">
          <strong>Detected Context</strong>
          {state.match?.reason ? <span>{state.match.reason}</span> : null}
        </div>
        <div className="context-grid">
          <ContextField label="Account" value={state.context.accountName} />
          <ContextField label="Prospect" value={state.context.prospectName} />
          <ContextField label="Email" value={state.context.prospectEmail} />
        </div>
      </section>

      {!state.summary ? (
        <EmptyState message="No Salesforce workbook imported. Open extension options and import the Excel workbook." />
      ) : null}

      {state.match?.status === "none" ? <EmptyState message={state.match.reason ?? "No account match found."} /> : null}

      {state.summary && !state.brief ? (
        <section className="section manual-search">
          <h2>Find Imported Account</h2>
          <input
            type="search"
            placeholder="Search account name"
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
          />
          {searchedAccounts.map((account) => (
            <button
              className="match-button"
              key={account.id}
              onClick={() => {
                void refresh(account);
              }}
            >
              {account.accountName}
            </button>
          ))}
        </section>
      ) : null}

      {state.match?.status === "multiple" ? (
        <section className="section">
          <h2>Possible Matches</h2>
          {state.match.possibleAccounts.map((account) => (
            <button
              className="match-button"
              key={account.id}
              onClick={() => {
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
            tone="primary"
            text={state.brief.whyCalling}
            copyText={state.brief.whyCalling}
          />
          <TopSection
            title="Recommended Opening Line"
            tone="accent"
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

function ContextField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="context-field">
      <span>{label}</span>
      <strong>{value ?? "Not found"}</strong>
    </div>
  );
}

function TopSection({
  title,
  text,
  copyText,
  tone = "default"
}: {
  title: string;
  text: string;
  copyText: string;
  tone?: "default" | "primary" | "accent";
}) {
  return (
    <section className={`top-section top-section-${tone}`}>
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
