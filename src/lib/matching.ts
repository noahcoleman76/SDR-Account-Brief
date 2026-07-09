import type {
  AccountMatch,
  AccountRecord,
  MatchedAccountData,
  ProspectContext,
  SalesforceDataset
} from "../types/salesforce";
import { normalizeCompanyName, normalizeEmail, parseDateValue, scoreCompanyMatch } from "./normalize";

function findAccountForName(accounts: AccountRecord[], accountName?: string): AccountRecord | undefined {
  const normalized = normalizeCompanyName(accountName);
  return accounts.find((account) => normalizeCompanyName(account.accountName) === normalized);
}

export function matchAccount(dataset: SalesforceDataset, context: ProspectContext): AccountMatch {
  const email = normalizeEmail(context.prospectEmail);
  const people = [...dataset.contacts, ...dataset.leads];

  if (email) {
    const matchedPerson = people.find((person) => normalizeEmail(person.email) === email);
    if (matchedPerson) {
      const account =
        matchedPerson.accountId
          ? dataset.accounts.find((candidate) => candidate.id === matchedPerson.accountId)
          : findAccountForName(dataset.accounts, matchedPerson.accountName);

      if (account) {
        return {
          status: "single",
          context,
          account,
          matchedPerson,
          possibleAccounts: [account],
          confidence: 1,
          reason: "Matched prospect email to imported contact/lead."
        };
      }
    }
  }

  if (!context.accountName) {
    return {
      status: "none",
      context,
      possibleAccounts: [],
      confidence: 0,
      reason: "No prospect email or account name was detected on this Outreach page."
    };
  }

  const detectedAccountName = context.accountName;
  const scored = dataset.accounts
    .map((account) => ({
      account,
      score: scoreCompanyMatch(account.accountName, detectedAccountName)
    }))
    .filter((match) => match.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) {
    return {
      status: "none",
      context,
      possibleAccounts: [],
      confidence: 0,
      reason: `No imported account matched "${context.accountName}".`
    };
  }

  const best = scored[0];
  const closeMatches = scored.filter((match) => best.score - match.score < 0.08);

  if (closeMatches.length > 1 && best.score < 0.95) {
    return {
      status: "multiple",
      context,
      possibleAccounts: closeMatches.map((match) => match.account),
      confidence: best.score,
      reason: "Multiple imported accounts look similar. Choose the right one."
    };
  }

  return {
    status: "single",
    context,
    account: best.account,
    possibleAccounts: scored.map((match) => match.account),
    confidence: best.score,
    reason: "Matched detected account name to imported account."
  };
}

export function collectMatchedData(dataset: SalesforceDataset, account?: AccountRecord): MatchedAccountData {
  if (!account) {
    return {
      opportunities: [],
      contacts: [],
      leads: []
    };
  }

  const accountKey = normalizeCompanyName(account.accountName);
  const matchesAccount = (accountName?: string, accountId?: string) =>
    Boolean(accountId && accountId === account.id) || normalizeCompanyName(accountName) === accountKey;

  return {
    account,
    opportunities: dataset.opportunities
      .filter((opportunity) => matchesAccount(opportunity.accountName, opportunity.accountId))
      .sort((a, b) => {
        const openA = a.stage && !/closed|lost|won/i.test(a.stage) ? 1 : 0;
        const openB = b.stage && !/closed|lost|won/i.test(b.stage) ? 1 : 0;
        return openB - openA || parseDateValue(b.createdDate) - parseDateValue(a.createdDate);
      }),
    contacts: dataset.contacts.filter((contact) => matchesAccount(contact.accountName, contact.accountId)),
    leads: dataset.leads.filter((lead) => matchesAccount(lead.accountName, lead.accountId))
  };
}
