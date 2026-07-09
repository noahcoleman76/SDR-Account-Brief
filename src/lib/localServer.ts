import type { AccountBrief, MatchedAccountData, ProspectContext } from "../types/salesforce";

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
  matchedData: MatchedAccountData
): Promise<AccountBrief> {
  const response = await fetch(`${SERVER_URL}/brief`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      accountName: context.accountName,
      prospectEmail: context.prospectEmail,
      prospectName: context.prospectName,
      matchedData
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Local brief server returned an error.");
  }

  return (await response.json()) as AccountBrief;
}
