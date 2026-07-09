import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";
import { ensureBriefDefaults } from "../src/lib/brief";
import type { AccountBrief, MatchedAccountData, ProspectContext } from "../src/types/salesforce";

dotenv.config({ path: ".env.local" });

const PORT = 8787;
const app = express();

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
app.use(express.json({ limit: "2mb" }));

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
    };

    if (!body.matchedData) {
      response.status(400).json({ error: "matchedData is required." });
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

    const brief = await generateAiBrief(client, context, body.matchedData);
    response.json(ensureBriefDefaults(brief));
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

async function generateAiBrief(
  client: OpenAI,
  context: ProspectContext,
  matchedData: MatchedAccountData
): Promise<AccountBrief> {
  // Future production path: move this OpenAI request behind a secured company backend,
  // then have the extension call that backend instead of sending prompts from local code.
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate concise sales call briefings for NICE reps. Return only valid JSON matching the requested shape. The brief must be readable in under 60 seconds. Do not invent facts; infer only from supplied data and label uncertainty plainly."
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction:
            "Create an account brief with: whyCalling, openingLine, previousConversations, opportunityHistory, recentInterestingMoments, knownContactsLeads, accountProfile, suggestedAngles, nextBestAction. whyCalling should be first-person call prep style beginning with \"I'm calling because\".",
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

  const parsed = JSON.parse(content) as Partial<AccountBrief>;
  return {
    whyCalling: parsed.whyCalling ?? "I'm calling because this account has imported Salesforce context worth referencing before the conversation.",
    openingLine: parsed.openingLine ?? "Hi, I'm calling from NICE and wanted to connect what we're seeing in your account history to current service priorities.",
    previousConversations: arrayOrEmpty(parsed.previousConversations),
    opportunityHistory: arrayOrEmpty(parsed.opportunityHistory),
    recentInterestingMoments: arrayOrEmpty(parsed.recentInterestingMoments),
    knownContactsLeads: arrayOrEmpty(parsed.knownContactsLeads),
    accountProfile: arrayOrEmpty(parsed.accountProfile),
    suggestedAngles: arrayOrEmpty(parsed.suggestedAngles),
    nextBestAction:
      parsed.nextBestAction ??
      "Confirm current customer experience priorities and ask for the right owner if this prospect is not responsible."
  };
}

function arrayOrEmpty(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
