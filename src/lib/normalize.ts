const COMPANY_SUFFIXES = [
  "incorporated",
  "corporation",
  "corp",
  "company",
  "co",
  "limited",
  "ltd",
  "llc",
  "llp",
  "plc",
  "inc"
];

export function normalizeCompanyName(value?: string): string {
  if (!value) {
    return "";
  }

  const words = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !COMPANY_SUFFIXES.includes(word));

  return words.join(" ").trim();
}

export function normalizeEmail(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

export function compact(value?: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function parseDateValue(value?: string): number {
  if (!value) {
    return 0;
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function scoreCompanyMatch(candidate: string, detected: string): number {
  const left = normalizeCompanyName(candidate);
  const right = normalizeCompanyName(detected);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.86;
  }

  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const total = new Set([...leftTokens, ...rightTokens]).size;

  return total === 0 ? 0 : shared / total;
}
