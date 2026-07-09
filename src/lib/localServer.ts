import type {
  AccountBrief,
  AiBriefResponse,
  MatchedAccountData,
  ProspectContext,
  SalesforceDataset
} from "../types/salesforce";

const SERVER_URL = "http://localhost:8787";

export async function checkBriefServer(): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(1200) });
    const body = (await response.json()) as { ok?: boolean };
    return response.ok && body.ok === true;
  } catch {
    return false;
  }
}

export async function requestAiBrief(
  context: ProspectContext,
  dataset: SalesforceDataset,
  matchedData?: MatchedAccountData
): Promise<AiBriefResponse> {
  const response = await fetch(`${SERVER_URL}/brief`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      accountName: context.accountName,
      prospectEmail: context.prospectEmail,
      prospectName: context.prospectName,
      dataset,
      matchedData
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Local brief server returned an error.");
  }

  const payload = (await response.json()) as Partial<AiBriefResponse> | AccountBrief;
  if ("brief" in payload && payload.brief) {
    return {
      brief: payload.brief,
      matchedData: payload.matchedData ?? matchedData ?? {
        opportunities: [],
        contacts: [],
        leads: []
      },
      resolvedAccountName: payload.resolvedAccountName,
      matchReason: payload.matchReason,
      usedWebSearch: payload.usedWebSearch,
      webSources: payload.webSources
    };
  }

  return {
    brief: payload as AccountBrief,
    matchedData: matchedData ?? {
      opportunities: [],
      contacts: [],
      leads: []
    },
    matchReason: "Local server returned legacy brief response. Restart npm run server to enable AI matching."
  };
}
