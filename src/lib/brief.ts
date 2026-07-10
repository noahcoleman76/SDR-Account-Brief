import type { AccountBrief, MatchedAccountData, ProspectContext } from "../types/salesforce";
import { parseDateValue } from "./normalize";

const EMPTY = "No imported detail found.";

function joinDefined(values: Array<string | undefined>, separator = " | "): string {
  return values.filter(Boolean).join(separator);
}

function latestMoments(data: MatchedAccountData) {
  return [...data.contacts, ...data.leads]
    .filter((person) => person.lastInterestingMoment || person.lastInterestingMomentDate)
    .sort((a, b) => parseDateValue(b.lastInterestingMomentDate) - parseDateValue(a.lastInterestingMomentDate));
}

function productAngles(data: MatchedAccountData): string[] {
  const text = JSON.stringify(data).toLowerCase();
  const angles = new Set<string>();

  if (/ai|automation|agentic|bot|virtual agent|self service/.test(text)) {
    angles.add("Cognigy and CXone Mpower for AI-driven service automation, virtual agents, and self-service.");
  }
  if (/gartner|cx.trends|customer experience trends|trends.gartner/.test(text)) {
    angles.add("Connect the prospect's NICE CX trends and Gartner research to CXone modernization and CXone Mpower priorities.");
  }
  if (/contact center|call center|ccaas|cxone|agent/.test(text)) {
    angles.add("CXone for cloud contact center modernization, omnichannel routing, and agent productivity.");
  }
  if (/wfm|workforce|quality|recording|analytics/.test(text)) {
    angles.add("NICE workforce engagement management, quality, recording, and analytics for operational improvement.");
  }
  if (/digital|chat|email|omnichannel|journey/.test(text)) {
    angles.add("NICE digital engagement and journey orchestration across chat, messaging, email, and service channels.");
  }

  if (angles.size === 0) {
    angles.add("Discovery-led NICE conversation around CXone, Cognigy, CXone Mpower, service automation, and customer experience operations.");
  }

  return [...angles].slice(0, 4);
}

export function generateLocalBrief(data: MatchedAccountData, context: ProspectContext): AccountBrief {
  const accountName = data.account?.accountName ?? context.accountName ?? "this account";
  const moments = latestMoments(data);
  const openOpp = data.opportunities.find((opportunity) => !/closed|lost|won/i.test(opportunity.stage ?? ""));
  const recentOpp = data.opportunities[0];
  const matchedPerson = [...data.contacts, ...data.leads].find(
    (person) => person.email?.toLowerCase() === context.prospectEmail?.toLowerCase()
  );

  const interestSignal = moments[0]?.lastInterestingMoment
    ? `recent interest around ${moments[0].lastInterestingMoment}`
    : "signals in the imported Salesforce data";
  const oppSignal = openOpp
    ? `There is an open opportunity in ${openOpp.stage ?? "an active stage"}`
    : recentOpp
      ? `There is prior opportunity history with NICE, most recently ${recentOpp.stage ?? "logged in Salesforce"}`
      : "There is no clear opportunity history in the imported workbook";
  const angle = productAngles(data)[0];
  const sizeSignal = data.account?.employeeRange
    ? `${accountName} is listed at ${data.account.employeeRange} employees`
    : `${accountName} has imported account profile data`;
  const profileSignal = [
    data.account?.industry ? `industry: ${data.account.industry}` : undefined,
    data.account?.website ? `website: ${data.account.website}` : undefined,
    data.account?.estimatedSeats ? `estimated seats: ${data.account.estimatedSeats}` : undefined
  ]
    .filter(Boolean)
    .join(", ");

  return {
    whyCalling: `I'm calling because ${sizeSignal}${profileSignal ? ` (${profileSignal})` : ""}. ${oppSignal}. The best NICE angle is ${angle}`,
    openingLine: `Hi ${context.prospectName ?? matchedPerson?.name ?? "there"}, I'm calling from NICE because ${accountName} looks like a good fit for a quick conversation around customer service operations, automation, or contact center modernization.`,
    previousConversations: data.opportunities
      .filter((opportunity) => opportunity.notes || opportunity.nextStep || opportunity.compellingEvent)
      .slice(0, 4)
      .map((opportunity) =>
        joinDefined([
          opportunity.createdDate,
          opportunity.name,
          opportunity.notes ?? opportunity.compellingEvent,
          opportunity.nextStep ? `Next: ${opportunity.nextStep}` : undefined
        ])
      ),
    opportunityHistory: data.opportunities.slice(0, 5).map((opportunity) =>
      joinDefined([
        opportunity.name ?? "Opportunity",
        opportunity.stage,
        opportunity.createdDate ? `Created ${opportunity.createdDate}` : undefined,
        opportunity.closeDate ? `Close ${opportunity.closeDate}` : undefined,
        opportunity.compellingEvent ? `Compelling event: ${opportunity.compellingEvent}` : undefined,
        opportunity.customerProfile ? `Profile: ${opportunity.customerProfile}` : undefined,
        opportunity.nextStep ? `Next step: ${opportunity.nextStep}` : undefined
      ])
    ),
    recentInterestingMoments: moments.slice(0, 6).map((person) =>
      joinDefined([
        person.name,
        person.title,
        person.email,
        person.lastInterestingMomentDate,
        person.lastInterestingMoment
      ])
    ),
    knownContactsLeads: [...data.contacts, ...data.leads].slice(0, 8).map((person) =>
      joinDefined([
        person.name,
        person.title,
        person.email,
        person.source === "lead" ? "Lead" : "Contact"
      ])
    ),
    accountProfile: [
      joinDefined(["Industry", data.account?.industry], ": "),
      joinDefined(["Employee range", data.account?.employeeRange], ": "),
      joinDefined(["Estimated contact center seats", data.account?.estimatedSeats], ": "),
      joinDefined(["Website", data.account?.website], ": "),
      joinDefined(["State/Province", data.account?.stateProvince], ": ")
    ].filter((line) => !line.endsWith(": ")),
    suggestedAngles: productAngles(data),
    nextBestAction:
      openOpp?.nextStep ??
      `Open with the strongest recent interest signal, confirm whether ${accountName} owns customer care or automation initiatives, and ask for the right stakeholder if not.`
  };
}

export function ensureBriefDefaults(brief: AccountBrief): AccountBrief {
  return {
    ...brief,
    previousConversations: brief.previousConversations.length ? brief.previousConversations : [EMPTY],
    opportunityHistory: brief.opportunityHistory.length ? brief.opportunityHistory : [EMPTY],
    recentInterestingMoments: brief.recentInterestingMoments.length ? brief.recentInterestingMoments : [EMPTY],
    knownContactsLeads: brief.knownContactsLeads.length ? brief.knownContactsLeads : [EMPTY],
    accountProfile: brief.accountProfile.length ? brief.accountProfile : [EMPTY],
    suggestedAngles: brief.suggestedAngles.length ? brief.suggestedAngles : [EMPTY]
  };
}
