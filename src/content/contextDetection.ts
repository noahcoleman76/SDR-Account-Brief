import type { ProspectContext } from "../types/salesforce";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

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

function firstHeading(): string | undefined {
  const heading = document.querySelector<HTMLElement>("h1, h2, [data-test-id*='name'], [class*='name']");
  const text = heading?.innerText?.trim();
  return text && text.length < 120 ? text : undefined;
}

export function detectProspectContext(): ProspectContext {
  const text = visibleText();
  const email =
    document.querySelector<HTMLAnchorElement>("a[href^='mailto:']")?.href.replace(/^mailto:/i, "") ??
    text.match(EMAIL_RE)?.[0];

  const accountFromLabel = textNearLabel(["Account", "Company", "Account Name"]);
  const prospectFromLabel = textNearLabel(["Prospect", "Name", "Contact", "Lead"]);

  return {
    accountName: accountFromLabel,
    prospectEmail: email,
    prospectName: prospectFromLabel ?? firstHeading()
  };
}
