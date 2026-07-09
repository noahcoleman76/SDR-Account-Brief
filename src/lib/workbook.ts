import readWorkbook from "read-excel-file/browser";
import type {
  AccountRecord,
  OpportunityRecord,
  PersonMomentRecord,
  RawRow,
  SalesforceDataset
} from "../types/salesforce";
import { compact } from "./normalize";

const SHEETS = {
  accounts: ["Accounts"],
  opportunities: ["Opportunities"],
  contacts: ["Contacts", "Contact Last Interesting Moments"],
  leads: ["Leads", "Lead Last Interesting Moments"]
} as const;

type Row = Record<string, unknown>;

function value(row: Row, aliases: string[]): string | undefined {
  const normalized = new Map(
    Object.keys(row).map((key) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), key])
  );

  for (const alias of aliases) {
    const key = normalized.get(alias.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const found = key ? compact(row[key]) : undefined;
    if (found) {
      return found;
    }
  }

  return undefined;
}

function rowsToObjects(data: unknown[][]): Row[] {
  const [headerRow, ...dataRows] = data;
  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((cell) => compact(cell) ?? "");

  return dataRows.map((row) => {
    const object: Row = {};
    headers.forEach((header, index) => {
      if (header) {
        object[header] = formatCell(row[index]);
      }
    });
    return object;
  });
}

function formatCell(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}

function normalizeSheetName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sheetRows(sheets: Awaited<ReturnType<typeof readWorkbook>>, sheetNames: readonly string[]): Row[] {
  const acceptedNames = new Set(sheetNames.map(normalizeSheetName));
  const sheet = sheets.find((candidate) => acceptedNames.has(normalizeSheetName(candidate.sheet)));
  if (!sheet) {
    throw new Error(`Missing required sheet: ${sheetNames.join(" or ")}`);
  }

  return rowsToObjects(sheet.data as unknown[][]);
}

function rowId(prefix: string, row: Row, index: number): string {
  return (
    value(row, ["Id", "Account ID", "Opportunity ID", "Contact ID", "Lead ID"]) ??
    `${prefix}-${index}`
  );
}

function mapAccount(row: Row, index: number): AccountRecord | undefined {
  const accountName = value(row, ["Account Name", "Name", "Company", "Account"]);
  if (!accountName) {
    return undefined;
  }

  return {
    id: rowId("account", row, index),
    accountName,
    website: value(row, ["Website", "Account Website"]),
    industry: value(row, ["Industry"]),
    employeeRange: value(row, ["Employee Range", "Employees", "Number of Employees"]),
    estimatedSeats: value(row, ["Estimated Contact Center Seats", "Contact Center Seats", "Seats"]),
    stateProvince: value(row, ["State/Province", "State", "Province", "Billing State/Province"]),
    owner: value(row, ["Account Owner", "Owner"]),
    raw: row as RawRow
  };
}

function mapOpportunity(row: Row, index: number): OpportunityRecord | undefined {
  const accountName = value(row, ["Account Name", "Account", "Company"]);
  if (!accountName) {
    return undefined;
  }

  return {
    id: rowId("opportunity", row, index),
    accountId: value(row, ["Account ID", "AccountId"]),
    accountName,
    name: value(row, ["Opportunity Name", "Name"]),
    stage: value(row, ["Stage", "Stage Name"]),
    amount: value(row, ["Amount"]),
    createdDate: value(row, ["Created Date", "CreatedDate"]),
    closeDate: value(row, ["Close Date", "CloseDate"]),
    compellingEvent: value(row, ["Compelling Event", "Compelling Event/Reason"]),
    customerProfile: value(row, ["Customer Profile", "Profile"]),
    nextStep: value(row, ["Next Step", "NextStep"]),
    notes: value(row, ["Description", "Notes", "Opportunity Notes"]),
    raw: row as RawRow
  };
}

function mapPerson(row: Row, index: number, source: "contact" | "lead"): PersonMomentRecord | undefined {
  const email = value(row, ["Email", "Contact Email", "Lead Email"]);
  const name = value(row, ["Name", "Full Name", "Contact Name", "Lead Name"]);
  const accountName = value(row, ["Account Name", "Company", "Account"]);

  if (!email && !name && !accountName) {
    return undefined;
  }

  return {
    id: rowId(source, row, index),
    source,
    accountId: value(row, ["Account ID", "AccountId"]),
    accountName,
    name,
    title: value(row, ["Title", "Job Title"]),
    email,
    lastInterestingMoment: value(row, [
      "Last Interesting Moment",
      "Last Interesting Moment Description",
      "Interesting Moment",
      "Last Activity"
    ]),
    lastInterestingMomentDate: value(row, [
      "Last Interesting Moment Date",
      "Interesting Moment Date",
      "Last Activity Date"
    ]),
    raw: row as RawRow
  };
}

export async function parseWorkbook(file: File): Promise<SalesforceDataset> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Please import a modern .xlsx workbook. Legacy .xls files are not supported.");
  }

  const sheets = await readWorkbook(file);

  return {
    importedAt: new Date().toISOString(),
    accounts: sheetRows(sheets, SHEETS.accounts).map(mapAccount).filter(Boolean) as AccountRecord[],
    opportunities: sheetRows(sheets, SHEETS.opportunities)
      .map(mapOpportunity)
      .filter(Boolean) as OpportunityRecord[],
    contacts: sheetRows(sheets, SHEETS.contacts)
      .map((row, index) => mapPerson(row, index, "contact"))
      .filter(Boolean) as PersonMomentRecord[],
    leads: sheetRows(sheets, SHEETS.leads)
      .map((row, index) => mapPerson(row, index, "lead"))
      .filter(Boolean) as PersonMomentRecord[]
  };
}
