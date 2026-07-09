export type RawRow = Record<string, unknown>;

export interface AccountRecord {
  id: string;
  accountName: string;
  website?: string;
  industry?: string;
  employeeRange?: string;
  estimatedSeats?: string;
  stateProvince?: string;
  owner?: string;
  raw: RawRow;
}

export interface OpportunityRecord {
  id: string;
  accountId?: string;
  accountName: string;
  name?: string;
  stage?: string;
  amount?: string;
  createdDate?: string;
  closeDate?: string;
  compellingEvent?: string;
  customerProfile?: string;
  nextStep?: string;
  notes?: string;
  raw: RawRow;
}

export interface PersonMomentRecord {
  id: string;
  source: "contact" | "lead";
  accountId?: string;
  accountName?: string;
  name?: string;
  title?: string;
  email?: string;
  lastInterestingMoment?: string;
  lastInterestingMomentDate?: string;
  raw: RawRow;
}

export interface SalesforceDataset {
  importedAt: string;
  accounts: AccountRecord[];
  opportunities: OpportunityRecord[];
  contacts: PersonMomentRecord[];
  leads: PersonMomentRecord[];
}

export interface ImportSummary {
  accounts: number;
  opportunities: number;
  contacts: number;
  leads: number;
  importedAt?: string;
}

export interface ProspectContext {
  accountName?: string;
  prospectEmail?: string;
  prospectName?: string;
}

export interface AccountBrief {
  whyCalling: string;
  openingLine: string;
  previousConversations: string[];
  opportunityHistory: string[];
  recentInterestingMoments: string[];
  knownContactsLeads: string[];
  accountProfile: string[];
  suggestedAngles: string[];
  nextBestAction: string;
}

export interface AccountMatch {
  status: "none" | "single" | "multiple";
  context: ProspectContext;
  account?: AccountRecord;
  matchedPerson?: PersonMomentRecord;
  possibleAccounts: AccountRecord[];
  confidence: number;
  reason?: string;
}

export interface MatchedAccountData {
  account?: AccountRecord;
  matchedPerson?: PersonMomentRecord;
  opportunities: OpportunityRecord[];
  contacts: PersonMomentRecord[];
  leads: PersonMomentRecord[];
}

export interface AiBriefResponse {
  brief: AccountBrief;
  matchedData: MatchedAccountData;
  resolvedAccountName?: string;
  matchReason?: string;
  usedWebSearch?: boolean;
  webSources?: string[];
}
