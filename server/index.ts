import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";
import { ensureBriefDefaults, generateLocalBrief } from "../src/lib/brief";
import { collectMatchedData } from "../src/lib/matching";
import { normalizeCompanyName, normalizeEmail, scoreCompanyMatch } from "../src/lib/normalize";
import type {
  AccountBrief,
  AccountRecord,
  AiBriefResponse,
  MatchedAccountData,
  PersonMomentRecord,
  ProspectContext,
  SalesforceDataset
} from "../src/types/salesforce";

dotenv.config({ path: ".env.local" });

const PORT = 8787;
const app = express();
const NICE_PRODUCT_CONTEXT = [
  "NICE CXone for cloud contact center modernization, omnichannel routing, AI-powered agent assist, analytics, quality, and workforce engagement.",
  "Cognigy for conversational AI, virtual agents, self-service automation, and agentic service experiences.",
  "CXone Mpower for AI-driven customer service automation, orchestration, knowledge, and productivity across service teams.",
  "NICE workforce engagement management for forecasting, scheduling, quality management, recording, coaching, and performance improvement.",
  "NICE analytics and interaction intelligence for surfacing customer intent, compliance risk, operational trends, and coaching opportunities.",
  "Digital and self-service engagement for chat, messaging, email, journey orchestration, and deflecting routine service demand."
];

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  try {
    const url = new URL(origin);
    return (
      origin.startsWith("chrome-extension://") ||
      url.hostname === "localhost" ||
      url.hostname === "outreach.io" ||
      url.hostname.endsWith(".outreach.io")
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by local brief server CORS policy."));
    }
  })
);
app.use(express.json({ limit: "15mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/brief", async (request, response) => {
  try {
    const body = request.body as {
      accountName?: string;
      prospectEmail?: string;
      prospectName?: string;
      matchedData?: MatchedAccountData;
      dataset?: SalesforceDataset;
    };

    if (!body.matchedData && !body.dataset) {
      response.status(400).json({ error: "matchedData or dataset is required." });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      response.status(500).json({
        error: "OPENAI_API_KEY is not configured. Create .env.local and restart npm run server."
      });
      return;
    }

    const client = new OpenAI({ apiKey });
    const context: ProspectContext = {
      accountName: body.accountName,
      prospectEmail: body.prospectEmail,
      prospectName: body.prospectName
    };

    const resolvedData = body.dataset
      ? await resolveAccountData(client, context, body.dataset, body.matchedData)
      : body.matchedData ?? emptyMatchedData();

    if (!resolvedData?.account && !context.accountName) {
      response.status(404).json({ error: "No account context was detected and no imported match could be resolved." });
      return;
    }

    const hasImportedData = hasUsefulImportedData(resolvedData);
    const result =
      hasImportedData && !needsWebEnrichment(resolvedData)
        ? await generateAiBrief(client, context, resolvedData)
        : await generateWebBrief(
            client,
            context,
            resolvedData,
            hasImportedData
              ? "Imported workbook data exists, but it is weak for a strong conversation opener."
              : "No useful imported Salesforce detail was found."
          );

    response.json({
      ...result,
      brief: ensureBriefDefaults(result.brief),
      matchedData: resolvedData
    } satisfies AiBriefResponse);
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to generate account brief."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Local brief server listening on http://localhost:${PORT}`);
});

interface CandidateBundle {
  account: AccountRecord;
  score: number;
  contacts: PersonMomentRecord[];
  leads: PersonMomentRecord[];
  opportunityCount: number;
}

async function resolveAccountData(
  client: OpenAI,
  context: ProspectContext,
  dataset: SalesforceDataset,
  localMatchedData?: MatchedAccountData
): Promise<MatchedAccountData> {
  if (localMatchedData?.account && hasUsefulImportedData(localMatchedData)) {
    return localMatchedData;
  }

  const email = normalizeEmail(context.prospectEmail);
  const people = [...dataset.contacts, ...dataset.leads];
  const exactPerson = email ? people.find((person) => normalizeEmail(person.email) === email) : undefined;
  if (exactPerson?.accountName || exactPerson?.accountId) {
    const exactAccount =
      exactPerson.accountId
        ? dataset.accounts.find((account) => account.id === exactPerson.accountId)
        : dataset.accounts.find(
            (account) => normalizeCompanyName(account.accountName) === normalizeCompanyName(exactPerson.accountName)
          );
    if (exactAccount) {
      return { ...collectMatchedData(dataset, exactAccount), matchedPerson: exactPerson };
    }
  }

  const candidates = buildCandidateBundles(dataset, context).slice(0, 30);
  if (candidates.length === 0) {
    return emptyMatchedData();
  }

  const exactNameMatch = candidates.find((candidate) => isSameCompany(candidate.account.accountName, context.accountName));
  if (exactNameMatch) {
    return collectMatchedData(dataset, exactNameMatch.account);
  }

  const obvious = candidates[0];
  if (obvious.score >= 0.92) {
    return collectMatchedData(dataset, obvious.account);
  }

  const selectedAccountId = await selectAccountWithAi(client, context, candidates);
  const selected = candidates.find((candidate) => candidate.account.id === selectedAccountId);

  return selected ? collectMatchedData(dataset, selected.account) : emptyMatchedData();
}

function buildCandidateBundles(dataset: SalesforceDataset, context: ProspectContext): CandidateBundle[] {
  const contextName = context.accountName ?? "";
  const prospectName = context.prospectName?.toLowerCase() ?? "";
  const prospectEmail = normalizeEmail(context.prospectEmail);

  return dataset.accounts
    .map((account) => {
      const accountKey = normalizeCompanyName(account.accountName);
      const contacts = dataset.contacts.filter(
        (contact) =>
          normalizeCompanyName(contact.accountName) === accountKey ||
          Boolean(contact.accountId && contact.accountId === account.id)
      );
      const leads = dataset.leads.filter(
        (lead) =>
          normalizeCompanyName(lead.accountName) === accountKey ||
          Boolean(lead.accountId && lead.accountId === account.id)
      );
      const opportunityCount = dataset.opportunities.filter(
        (opportunity) =>
          normalizeCompanyName(opportunity.accountName) === accountKey ||
          Boolean(opportunity.accountId && opportunity.accountId === account.id)
      ).length;

      const personSignals = [...contacts, ...leads];
      const emailBoost = prospectEmail
        ? personSignals.some((person) => normalizeEmail(person.email) === prospectEmail)
          ? 1
          : 0
        : 0;
      const nameBoost = prospectName
        ? personSignals.some((person) => person.name?.toLowerCase().includes(prospectName))
          ? 0.25
          : 0
        : 0;

      return {
        account,
        contacts,
        leads,
        opportunityCount,
        score: Math.min(1, scoreCompanyMatch(account.accountName, contextName) + emailBoost + nameBoost)
      };
    })
    .filter((candidate) => candidate.score >= 0.2 || candidate.contacts.length || candidate.leads.length)
    .sort((a, b) => b.score - a.score || b.opportunityCount - a.opportunityCount);
}

function isSameCompany(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeCompanyName(left);
  const normalizedRight = normalizeCompanyName(right);
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft === normalizedRight ||
        normalizedLeft.replace(/\s+/g, "") === normalizedRight.replace(/\s+/g, ""))
  );
}

async function selectAccountWithAi(
  client: OpenAI,
  context: ProspectContext,
  candidates: CandidateBundle[]
): Promise<string | undefined> {
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MATCH_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You resolve which imported Salesforce account is most likely related to the current Outreach call task. Return strict JSON only. Choose no account if the candidates are not plausibly the same company."
      },
      {
        role: "user",
        content: JSON.stringify({
          outputShape: {
            selectedAccountId: "string or null",
            confidence: "number 0-1",
            reason: "short explanation"
          },
          context,
          candidates: candidates.map((candidate) => ({
            id: candidate.account.id,
            accountName: candidate.account.accountName,
            website: candidate.account.website,
            industry: candidate.account.industry,
            deterministicScore: candidate.score,
            opportunityCount: candidate.opportunityCount,
            contacts: candidate.contacts.slice(0, 5).map((person) => ({
              name: person.name,
              title: person.title,
              email: person.email,
              lastInterestingMoment: person.lastInterestingMoment
            })),
            leads: candidate.leads.slice(0, 5).map((person) => ({
              name: person.name,
              title: person.title,
              email: person.email,
              lastInterestingMoment: person.lastInterestingMoment
            }))
          }))
        })
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    return undefined;
  }

  const parsed = parseJsonObject(content) as {
    selectedAccountId?: string | null;
    confidence?: number;
  };

  return parsed.confidence && parsed.confidence >= 0.55 && parsed.selectedAccountId
    ? parsed.selectedAccountId
    : undefined;
}

async function generateAiBrief(
  client: OpenAI,
  context: ProspectContext,
  matchedData: MatchedAccountData
): Promise<Omit<AiBriefResponse, "matchedData">> {
  // Future production path: move this OpenAI request behind a secured company backend,
  // then have the extension call that backend instead of sending prompts from local code.
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate concise sales call briefings for NICE reps. Return only valid JSON matching the requested shape. The brief must be readable in under 60 seconds. Keep whyCalling simple and factual: company size, employee count/range, relevant technology or CX signal, and the best NICE angle. Product recommendations must be NICE offerings only: CXone, Cognigy, CXone Mpower, workforce engagement management, analytics/interaction intelligence, digital engagement, and self-service automation. Do not recommend non-NICE products. Do not invent facts; infer only from supplied data and label uncertainty plainly."
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction:
            "Create an account brief with: whyCalling, openingLine, previousConversations, opportunityHistory, recentInterestingMoments, knownContactsLeads, accountProfile, suggestedAngles, nextBestAction. whyCalling should be 2-3 plain sentences beginning with \"I'm calling because\". It must include company size/employee range when available, any relevant technology or CX signal, and one practical NICE angle. Make the opening line use the actual Outreach prospectName only; do not use any other person name from page or workbook unless it is the detected prospect.",
          niceProductContext: NICE_PRODUCT_CONTEXT,
          context,
          matchedData
        })
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("OpenAI returned an empty brief.");
  }

  const parsed = parseJsonObject(content) as Partial<AccountBrief>;
  return {
    brief: parseBrief(parsed),
    resolvedAccountName: matchedData.account?.accountName,
    matchReason: "AI generated brief from imported Salesforce records.",
    usedWebSearch: false
  };
}

async function generateWebBrief(
  client: OpenAI,
  context: ProspectContext,
  matchedData: MatchedAccountData,
  reason: string
): Promise<Omit<AiBriefResponse, "matchedData">> {
  const accountName = matchedData.account?.accountName ?? context.accountName;
  if (!accountName) {
    return {
      brief: ensureBriefDefaults(generateLocalBrief(matchedData, context)),
      matchReason: reason,
      usedWebSearch: false
    };
  }

  const response = await client.responses.create({
    model: process.env.OPENAI_WEB_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    tools: [{ type: "web_search" }] as never,
    tool_choice: "auto",
    input: JSON.stringify({
      instruction:
        "Search the web for public account context and create a concise NICE sales call brief. Return only JSON with whyCalling, openingLine, previousConversations, opportunityHistory, recentInterestingMoments, knownContactsLeads, accountProfile, suggestedAngles, nextBestAction. whyCalling should be 2-3 plain sentences beginning with \"I'm calling because\" and should focus on company size, employee count/range, relevant technology or customer-service signals, and one practical NICE angle. Use imported Salesforce facts when present, but do not invent private Salesforce history. The opening line must address the provided prospectName only if present; otherwise use a generic greeting. Product recommendations must be NICE offerings only: CXone, Cognigy, CXone Mpower, workforce engagement management, analytics/interaction intelligence, digital engagement, and self-service automation.",
      niceProductContext: NICE_PRODUCT_CONTEXT,
      accountName,
      prospectName: context.prospectName,
      prospectEmail: context.prospectEmail,
      importedSalesforceData: matchedData,
      enrichmentReason: reason
    })
  });

  const parsed = parseJsonObject(response.output_text) as Partial<AccountBrief>;
  return {
    brief: parseBrief(parsed),
    resolvedAccountName: accountName,
    matchReason: `${reason} The local server used web search for public account context.`,
    usedWebSearch: true,
    webSources: collectResponseSources(response)
  };
}

function parseBrief(parsed: Partial<AccountBrief>): AccountBrief {
  return {
    whyCalling:
      parsed.whyCalling ??
      "I'm calling because this account has enough context to justify a targeted customer experience conversation.",
    openingLine:
      parsed.openingLine ??
      "Hi, I'm calling from NICE and wanted to connect what we're seeing about your organization to current service priorities.",
    previousConversations: arrayOrEmpty(parsed.previousConversations),
    opportunityHistory: arrayOrEmpty(parsed.opportunityHistory),
    recentInterestingMoments: arrayOrEmpty(parsed.recentInterestingMoments),
    knownContactsLeads: arrayOrEmpty(parsed.knownContactsLeads),
    accountProfile: arrayOrEmpty(parsed.accountProfile),
    suggestedAngles: arrayOrEmpty(parsed.suggestedAngles),
    nextBestAction:
      parsed.nextBestAction ??
      "Confirm current customer experience priorities and ask for the right stakeholder if this prospect is not responsible."
  };
}

function hasUsefulImportedData(data?: MatchedAccountData): data is MatchedAccountData {
  return Boolean(
    data?.account &&
      (data.opportunities.length ||
        data.contacts.length ||
        data.leads.length ||
        data.account.industry ||
        data.account.website ||
        data.account.employeeRange)
  );
}

function needsWebEnrichment(data: MatchedAccountData): boolean {
  const hasConversationHistory = data.opportunities.some(
    (opportunity) => opportunity.notes || opportunity.compellingEvent || opportunity.nextStep
  );
  const hasIntentSignal = [...data.contacts, ...data.leads].some((person) => person.lastInterestingMoment);
  const hasOpportunitySignal = data.opportunities.length > 0;

  return !hasConversationHistory && !hasIntentSignal && !hasOpportunitySignal;
}

function emptyMatchedData(): MatchedAccountData {
  return {
    opportunities: [],
    contacts: [],
    leads: []
  };
}

function collectResponseSources(response: unknown): string[] {
  const urls = new Set<string>();
  JSON.stringify(response).replace(/https?:\/\/[^"\\\s)]+/g, (url) => {
    urls.add(url);
    return url;
  });
  return [...urls].slice(0, 8);
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      return JSON.parse(fenced);
    }

    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }

    throw new Error("OpenAI response did not contain valid JSON.");
  }
}

function arrayOrEmpty(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
