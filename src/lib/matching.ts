import type {
  AccountMatch,
  AccountRecord,
  MatchedAccountData,
  ProspectContext,
  SalesforceDataset
} from "../types/salesforce";
import {
  isLikelyCompanyAlias,
  normalizeCompanyName,
  normalizeEmail,
  normalizePersonName,
  parseDateValue,
  scoreCompanyMatch
} from "./normalize";

function findAccountForName(accounts: AccountRecord[], accountName?: string): AccountRecord | undefined {
  const normalized = normalizeCompanyName(accountName);
  const compact = normalized.replace(/\s+/g, "");
  return accounts.find((account) => {
    const candidate = normalizeCompanyName(account.accountName);
    return candidate === normalized || candidate.replace(/\s+/g, "") === compact;
  });
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

  const prospectName = normalizePersonName(context.prospectName);
  const matchedByName = prospectName
    ? people.find((person) => normalizePersonName(person.name) === prospectName)
    : undefined;
  if (matchedByName?.accountName || matchedByName?.accountId) {
    const account = matchedByName.accountId
      ? dataset.accounts.find((candidate) => candidate.id === matchedByName.accountId)
      : dataset.accounts.find((candidate) => isLikelyCompanyAlias(candidate.accountName, matchedByName.accountName));
    if (account && isLikelyCompanyAlias(account.accountName, context.accountName ?? matchedByName.accountName)) {
      return {
        status: "single",
        context,
        account,
        matchedPerson: matchedByName,
        possibleAccounts: [account],
        confidence: 0.95,
        reason: "Matched the Outreach prospect name to an imported contact/lead and a related account alias."
      };
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
  const exactAccount = findAccountForName(dataset.accounts, detectedAccountName);
  if (exactAccount) {
    return {
      status: "single",
      context,
      account: exactAccount,
      possibleAccounts: [exactAccount],
      confidence: 1,
      reason: "Matched exact normalized account name."
    };
  }

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

export function collectMatchedData(
  dataset: SalesforceDataset,
  account?: AccountRecord,
  context?: ProspectContext
): MatchedAccountData {
  if (!account) {
    return {
      opportunities: [],
      contacts: [],
      leads: []
    };
  }

  const accountKey = normalizeCompanyName(account.accountName);
  const prospectName = normalizePersonName(context?.prospectName);
  const prospectEmail = normalizeEmail(context?.prospectEmail);
  const matchesPerson = (person: { accountName?: string; accountId?: string; name?: string; email?: string }) =>
    Boolean(person.accountId && person.accountId === account.id) ||
    normalizeCompanyName(person.accountName) === accountKey ||
    isLikelyCompanyAlias(person.accountName, account.accountName) ||
    Boolean(prospectEmail && normalizeEmail(person.email) === prospectEmail) ||
    Boolean(prospectName && normalizePersonName(person.name) === prospectName);
  const matchesAccount = (accountName?: string, accountId?: string) =>
    Boolean(accountId && accountId === account.id) ||
    normalizeCompanyName(accountName) === accountKey ||
    isLikelyCompanyAlias(accountName, account.accountName);

  return {
    account,
    opportunities: dataset.opportunities
      .filter((opportunity) => matchesAccount(opportunity.accountName, opportunity.accountId))
      .sort((a, b) => {
        const openA = a.stage && !/closed|lost|won/i.test(a.stage) ? 1 : 0;
        const openB = b.stage && !/closed|lost|won/i.test(b.stage) ? 1 : 0;
        return openB - openA || parseDateValue(b.createdDate) - parseDateValue(a.createdDate);
      }),
    contacts: dataset.contacts.filter(matchesPerson),
    leads: dataset.leads.filter(matchesPerson)
  };
}
