import type { ProspectContext } from "../types/salesforce";
import { normalizeCompanyName } from "../lib/normalize";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const INTERNAL_EMAIL_DOMAINS = ["nice.com", "niceincontact.com"];
const NON_ACCOUNT_PHRASES = [
  "last effort to connect",
  "listen while you dial",
  "step #",
  "call",
  "task",
  "due",
  "complete",
  "skip",
  "snooze"
];

function visibleText(): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  const chunks: string[] = [];
  while (walker.nextNode() && chunks.join(" ").length < 16000) {
    chunks.push(walker.currentNode.textContent?.trim() ?? "");
  }
  return chunks.join("\n");
}

function visibleAttributeText(): string {
  return [...document.querySelectorAll<HTMLElement>("[aria-label], [title], [data-test-id], [data-testid]")]
    .flatMap((element) => [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-test-id"),
      element.getAttribute("data-testid")
    ])
    .filter(Boolean)
    .join("\n");
}

function textNearLabel(labels: string[]): string | undefined {
  const candidates = [...document.querySelectorAll<HTMLElement>("label, dt, th, div, span, p")];
  for (const element of candidates) {
    const text = element.innerText?.trim();
    if (!text || text.length > 80) {
      continue;
    }
    if (!labels.some((label) => text.toLowerCase() === label.toLowerCase())) {
      continue;
    }

    const next = element.nextElementSibling as HTMLElement | null;
    const parentNext = element.parentElement?.nextElementSibling as HTMLElement | null;
    const value = next?.innerText?.trim() || parentNext?.innerText?.trim();
    if (value && value.length < 160) {
      return value.split("\n")[0];
    }
  }

  return undefined;
}

function valueAfterLabel(text: string, labels: string[]): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const matchingLabel = labels.find((label) => line.toLowerCase() === label.toLowerCase());
    if (matchingLabel && lines[index + 1] && lines[index + 1].length < 160) {
      return lines[index + 1];
    }

    for (const label of labels) {
      const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:\\-]\\s*(.+)$`, "i");
      const match = line.match(pattern);
      if (match?.[1] && match[1].length < 160) {
        return match[1].trim();
      }
    }
  }

  return undefined;
}

function isLikelyAccountCandidate(value?: string): value is string {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.length > 2 &&
    normalized.length < 160 &&
    !EMAIL_RE.test(value) &&
    !NON_ACCOUNT_PHRASES.some((phrase) => normalized.includes(phrase))
  );
}

function titleAccountLine(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const separator = line.includes("•") ? "•" : line.includes("·") ? "·" : undefined;
    if (!separator) {
      continue;
    }

    const account = line.split(separator).pop()?.trim();
    if (isLikelyAccountCandidate(account)) {
      return account;
    }
  }

  return undefined;
}

function cleanText(value?: string | null): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  return text || undefined;
}

function titleAccountLineSafe(text: string): string | undefined {
  const separators = [String.fromCharCode(8226), String.fromCharCode(183)];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const separator = separators.find((candidate) => line.includes(candidate));
    const account = separator ? line.split(separator).pop()?.trim() : undefined;
    if (isLikelyAccountCandidate(account)) {
      return account;
    }
  }

  return undefined;
}

function isExternalEmail(email?: string): email is string {
  if (!email) {
    return false;
  }

  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain && !INTERNAL_EMAIL_DOMAINS.includes(domain));
}

function detectProspectEmail(text: string): string | undefined {
  const mailtoEmails = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='mailto:']")]
    .map((link) => link.href.replace(/^mailto:/i, "").trim())
    .filter(isExternalEmail);

  if (mailtoEmails[0]) {
    return mailtoEmails[0];
  }

  return [...text.matchAll(new RegExp(EMAIL_RE, "gi"))]
    .map((match) => match[0])
    .filter(isExternalEmail)[0];
}

function taskFlowRoot(): ParentNode {
  return document.querySelector<HTMLElement>("[aria-label='Task flow']") ?? document;
}

function outreachAccountLink(root: ParentNode = taskFlowRoot()): string | undefined {
  const links = [...root.querySelectorAll<HTMLAnchorElement>("a[href*='/accounts/']")];
  return links
    .map((link) => cleanText(link.innerText || link.textContent))
    .find(isLikelyAccountCandidate);
}

function outreachProspectName(root: ParentNode = taskFlowRoot()): string | undefined {
  const links = [...root.querySelectorAll<HTMLAnchorElement>("a[href*='/prospects/']")];
  return links
    .map((link) => cleanText(link.innerText || link.textContent))
    .find((text) => Boolean(text && text.length < 120 && !text.includes("/") && !EMAIL_RE.test(text)));
}

function outreachProfileLineAccount(root: ParentNode = taskFlowRoot()): string | undefined {
  const prospectLink = root.querySelector<HTMLAnchorElement>("a[href*='/prospects/']");
  const container = prospectLink?.closest("div")?.parentElement;
  const line = cleanText(container?.innerText);
  if (!line) {
    return undefined;
  }

  return titleAccountLineSafe(line);
}

function inferKnownAccount(text: string, knownAccountNames: string[]): string | undefined {
  const normalizedText = normalizeCompanyName(text);
  return [...knownAccountNames]
    .filter((name) => {
      const normalizedName = normalizeCompanyName(name);
      return normalizedName.length >= 4 && normalizedText.includes(normalizedName);
    })
    .sort((a, b) => b.length - a.length)[0];
}

function firstHeading(): string | undefined {
  const heading = document.querySelector<HTMLElement>("h1, h2, [data-test-id*='name'], [class*='name']");
  const text = heading?.innerText?.trim();
  return text && text.length < 120 ? text : undefined;
}

export function detectProspectContext(knownAccountNames: string[] = []): ProspectContext {
  const text = [visibleText(), visibleAttributeText(), document.title].filter(Boolean).join("\n");
  const email = detectProspectEmail(text);

  const accountLabels = ["Account", "Company", "Account Name"];
  const prospectLabels = ["Prospect", "Name", "Contact", "Lead"];
  const taskRoot = taskFlowRoot();
  const accountFromLabel =
    outreachAccountLink(taskRoot) ??
    outreachProfileLineAccount(taskRoot) ??
    inferKnownAccount(text, knownAccountNames) ??
    titleAccountLineSafe(text) ??
    [textNearLabel(accountLabels), valueAfterLabel(text, accountLabels)].find(isLikelyAccountCandidate);
  const prospectFromLabel =
    outreachProspectName(taskRoot) ?? textNearLabel(prospectLabels) ?? valueAfterLabel(text, prospectLabels);

  return {
    accountName: accountFromLabel,
    prospectEmail: email,
    prospectName: prospectFromLabel ?? firstHeading()
  };
}

export function currentOutreachTaskSignature(): string {
  const prospectHref =
    document.querySelector<HTMLAnchorElement>("a[href*='/prospects/']")?.getAttribute("href") ?? "";
  const accountHref =
    document.querySelector<HTMLAnchorElement>("a[href*='/accounts/']")?.getAttribute("href") ?? "";
  const taskText =
    document.querySelector<HTMLElement>("[aria-label='Task flow'], [role='region']")?.innerText?.slice(0, 500) ?? "";

  return [location.pathname, prospectHref, accountHref, taskText].join("|");
}
