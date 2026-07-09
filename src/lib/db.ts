import { openDB, type DBSchema } from "idb";
import type {
  AccountRecord,
  ImportSummary,
  OpportunityRecord,
  PersonMomentRecord,
  SalesforceDataset
} from "../types/salesforce";

interface BriefDb extends DBSchema {
  accounts: {
    key: string;
    value: AccountRecord;
  };
  opportunities: {
    key: string;
    value: OpportunityRecord;
  };
  contacts: {
    key: string;
    value: PersonMomentRecord;
  };
  leads: {
    key: string;
    value: PersonMomentRecord;
  };
  meta: {
    key: string;
    value: ImportSummary;
  };
}

const DB_NAME = "account-briefs-for-outreach";
const DB_VERSION = 1;

async function db() {
  return openDB<BriefDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore("accounts", { keyPath: "id" });
      database.createObjectStore("opportunities", { keyPath: "id" });
      database.createObjectStore("contacts", { keyPath: "id" });
      database.createObjectStore("leads", { keyPath: "id" });
      database.createObjectStore("meta");
    }
  });
}

export async function saveDataset(dataset: SalesforceDataset): Promise<ImportSummary> {
  const database = await db();
  const tx = database.transaction(["accounts", "opportunities", "contacts", "leads", "meta"], "readwrite");

  await Promise.all([
    tx.objectStore("accounts").clear(),
    tx.objectStore("opportunities").clear(),
    tx.objectStore("contacts").clear(),
    tx.objectStore("leads").clear()
  ]);

  await Promise.all([
    ...dataset.accounts.map((record) => tx.objectStore("accounts").put(record)),
    ...dataset.opportunities.map((record) => tx.objectStore("opportunities").put(record)),
    ...dataset.contacts.map((record) => tx.objectStore("contacts").put(record)),
    ...dataset.leads.map((record) => tx.objectStore("leads").put(record))
  ]);

  const summary: ImportSummary = {
    accounts: dataset.accounts.length,
    opportunities: dataset.opportunities.length,
    contacts: dataset.contacts.length,
    leads: dataset.leads.length,
    importedAt: dataset.importedAt
  };
  await tx.objectStore("meta").put(summary, "summary");
  await tx.done;

  return summary;
}

export async function clearDataset(): Promise<void> {
  const database = await db();
  const tx = database.transaction(["accounts", "opportunities", "contacts", "leads", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("accounts").clear(),
    tx.objectStore("opportunities").clear(),
    tx.objectStore("contacts").clear(),
    tx.objectStore("leads").clear(),
    tx.objectStore("meta").clear()
  ]);
  await tx.done;
}

export async function getSummary(): Promise<ImportSummary | undefined> {
  return (await db()).get("meta", "summary");
}

export async function getDataset(): Promise<SalesforceDataset> {
  const database = await db();
  const [accounts, opportunities, contacts, leads, summary] = await Promise.all([
    database.getAll("accounts"),
    database.getAll("opportunities"),
    database.getAll("contacts"),
    database.getAll("leads"),
    database.get("meta", "summary")
  ]);

  return {
    importedAt: summary?.importedAt ?? "",
    accounts,
    opportunities,
    contacts,
    leads
  };
}
