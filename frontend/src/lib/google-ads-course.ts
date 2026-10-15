export interface GoogleAdsReference {
  id: string;
  title: string;
  url: string;
  note: string;
}

export interface GoogleAdsLesson {
  id: string;
  title: string;
  objective: string;
  decision: string;
  technical: string;
  executive: string;
  steps: Array<{ title: string; body: string }>;
  exercise: string;
  question: string;
  choices: string[];
  answer: number;
  explanation: string;
  referenceIds: string[];
  handbookPages: string;
}

export const GOOGLE_ADS_REFERENCES: GoogleAdsReference[] = [
  {
    id: "google-conversions",
    title: "About conversion measurement",
    url: "https://support.google.com/google-ads/answer/1722022?hl=en",
    note: "Conversion measurement concepts and business outcomes.",
  },
  {
    id: "google-smart-bidding",
    title: "Finding success with Smart Bidding",
    url: "https://support.google.com/google-ads/answer/6167140?hl=en",
    note: "Google guidance for setup, bid strategy, testing, and evaluation.",
  },
  {
    id: "google-responsive-ads",
    title: "Best practices for responsive Search ads",
    url: "https://support.google.com/google-ads/answer/6167122?hl=en",
    note: "Google guidance for Search ad assets, messaging, and review.",
  },
  {
    id: "google-keyword-planner",
    title: "Use Keyword Planner",
    url: "https://support.google.com/google-ads/answer/7337243?hl=en",
    note: "Research keyword ideas and forecasts for Search campaigns.",
  },
  {
    id: "google-search-terms",
    title: "About the search terms report",
    url: "https://support.google.com/google-ads/answer/2472708?hl=en",
    note: "Review searches that triggered ads and how those searches performed.",
  },
  {
    id: "google-search-insights",
    title: "About search terms insights",
    url: "https://support.google.com/google-ads/answer/11386930?hl=en",
    note: "Understand grouped search intent and related campaign metrics.",
  },
  {
    id: "google-api-conversions",
    title: "Google Ads API conversion management",
    url: "https://developers.google.com/google-ads/api/docs/conversions/overview?hl=en",
    note: "Technical reference for conversion actions, imports, and monitoring.",
  },
];

export const GOOGLE_ADS_LESSONS: GoogleAdsLesson[] = [
  {
    id: "plan",
    title: "Start with the business outcome",
    objective: "Turn an advertising request into a measurable decision before opening campaign settings.",
    decision: "Name the business result, the person who owns it, the conversion action, and the approved spend limit.",
    technical: "Map each funnel stage to an event or CRM state. Specify the event source, deduplication rule, and how a lead becomes sales-accepted.",
    executive: "Approve the outcome and spend guardrails. Ask who will judge lead quality and what decision a report must support.",
    steps: [
      { title: "Write the outcome", body: "Choose a business result such as qualified inquiries or completed purchases. Clicks are an intermediate signal, not the business result." },
      { title: "Map the funnel", body: "Trace spend to impressions, visits, inquiries, qualified opportunities, and sales. Assign an owner to each handoff." },
      { title: "Approve the guardrails", body: "Set the budget owner, maximum exposure, geography, offer, and escalation path before launch." },
    ],
    exercise: "Draft a one-sentence campaign brief. Include the business outcome, primary conversion, market, budget approver, and lead-quality owner.",
    question: "Which conversion should guide a campaign intended to generate qualified sales opportunities?",
    choices: ["The first page view after an ad click", "A defined qualified opportunity or agreed proxy", "The highest possible number of clicks"],
    answer: 1,
    explanation: "The optimization event should represent the business result as closely as measurement and lead volume allow. Agree on the proxy and validate it before bidding toward it.",
    referenceIds: ["google-conversions"],
    handbookPages: "1-2",
  },
  {
    id: "campaign",
    title: "Build the campaign around intent",
    objective: "Translate the approved brief into a campaign structure that can be measured and reviewed.",
    decision: "Choose campaign type, conversion goal, location, language, network reach, landing page, and bidding approach for this account's constraints.",
    technical: "Verify the selected conversion action fires once, carries the right value or category, and is available to the intended campaign goal. Check consent and attribution requirements with the implementation owner.",
    executive: "Review the target market, offer, budget exposure, and measurement readiness. Require approval for settings that broaden reach or spend.",
    steps: [
      { title: "Set the objective and conversion action", body: "Select an outcome that matches the brief, then verify the account is measuring the intended lead or sale. The handbook's example goal is not a default for every account." },
      { title: "Choose the campaign type and name", body: "Use a name that makes the business goal, market, and offer easy to identify. The handbook walks through a Search campaign, but start from the account's actual plan." },
      { title: "Constrain the market", body: "Confirm locations, languages, network eligibility, and the destination page against where the business can actually serve customers." },
      { title: "Select bidding with evidence", body: "A conversion-based bid strategy depends on useful conversion data. The right strategy and readiness threshold depend on the account and objective." },
      { title: "Review automation deliberately", body: "Check any AI Max or other automation controls in the live account. Decide whether the reach and controls suit the brief, and document the choice." },
      { title: "Review page, keyword ideas, and assets", body: "Keep the proposed page, keyword ideas, ad message, and assets aligned to the same customer intent. Check sitelinks and the inquiry path before approval." },
      { title: "Confirm the budget and approval", body: "Compare the proposed budget with the authorized limit. Save or launch only after the accountable owner approves the spend and settings." },
    ],
    exercise: "For a fictional campaign, make a launch checklist for the objective, conversion action, name, market, networks, bidding, automation, landing page, assets, and budget. Mark each item owner-approved, technically verified, or unresolved.",
    question: "The workshop screenshot uses a particular Search campaign setup. How should you apply it to a different account?",
    choices: ["Copy it exactly because it is the workshop default", "Treat it as an example, then verify each choice against the current brief and account", "Enable every available automation control"],
    answer: 1,
    explanation: "The handbook describes a sample account. Campaign controls and account conditions change, so use the live account and current official documentation to validate choices.",
    referenceIds: ["google-smart-bidding", "google-conversions"],
    handbookPages: "3-15",
  },
  {
    id: "ads",
    title: "Organize ad groups and write the offer",
    objective: "Keep each ad group focused on a coherent customer need and send it to a matching page.",
    decision: "Separate offers or intents when they need different messages, landing pages, or success measures.",
    technical: "Create a reviewable mapping from intent cluster to keywords, ad assets, final URL, tracking parameters, and conversion path. Test the path on mobile and desktop.",
    executive: "Approve the claims, offer terms, audience promise, and landing page. Confirm the inquiry path reaches the right team.",
    steps: [
      { title: "Group by need", body: "Keep closely related searches together when one message and destination genuinely serve them. Split different offers or intents that require different answers." },
      { title: "Write distinct assets", body: "Use headlines and descriptions to explain the real offer, proof, and next step. Avoid unsupported claims and repetitive variants." },
      { title: "Inspect the rendered ad", body: "Review combinations, assets, display path, final URL, and the mobile and desktop landing experience before approval." },
    ],
    exercise: "Choose one customer intent. Write two distinct headlines, one supporting description, the matching page, and the action a visitor should complete.",
    question: "Two search groups represent different offers and need different landing pages. What is the clearest structure?",
    choices: ["Put both offers in one group and use one generic page", "Separate them so each group has a matching message and destination", "Use the same ad assets and page, then compare clicks"],
    answer: 1,
    explanation: "A coherent group makes it easier to align intent, ad message, destination, and measurement. Split when those elements materially differ.",
    referenceIds: ["google-responsive-ads"],
    handbookPages: "16-17",
  },
  {
    id: "research",
    title: "Research keywords and search intent",
    objective: "Build a keyword hypothesis from customer language, then inspect the actual searches that receive traffic.",
    decision: "Decide which intent to serve, which searches are out of scope, and who will review query quality.",
    technical: "Keep keyword and search-term reporting distinct. Preserve dates, campaign/ad group context, match type, conversion definitions, and privacy limitations when analyzing exports.",
    executive: "Ask whether observed demand matches the intended customer and offer. Assign a reviewer for irrelevant, sensitive, or out-of-market queries.",
    steps: [
      { title: "Start with customer language", body: "Use sales conversations, site content, and Keyword Planner ideas as hypotheses. Forecasts are planning inputs, not guaranteed results." },
      { title: "Separate keyword from search term", body: "A keyword is a targeting input. A search term is what a person searched, when it is available in reporting." },
      { title: "Review quality and exclusions", body: "Check which actual searches drove activity. Decide whether to refine targeting, add exclusions, or update the page based on evidence." },
    ],
    exercise: "Create a small intent map with three groups: high-intent, research, and irrelevant. Add one example phrase and a matching landing-page promise to each.",
    question: "What does the Keyword column in the search terms report help you identify?",
    choices: ["The exact text every user searched", "Which of your keywords matched a reported search term", "The landing page that generated a sale"],
    answer: 1,
    explanation: "The keyword column identifies the account keyword that matched a reported search term. It does not show every search made by every person.",
    referenceIds: ["google-keyword-planner", "google-search-terms", "google-search-insights"],
    handbookPages: "21-24, 28-29",
  },
  {
    id: "measure",
    title: "Measure the full funnel and test carefully",
    objective: "Use consistent definitions to connect ad activity to useful business outcomes.",
    decision: "Agree which metric moves the decision, what comparison is fair, and how long evidence needs to mature.",
    technical: "Validate tags and event payloads, conversion action settings, deduplication, attribution windows, timezone, and CRM reconciliation. Freeze unrelated changes during a controlled test.",
    executive: "Review the funnel from exposure to sales-accepted outcomes. Separate what was observed, what it means, and the next decision.",
    steps: [
      { title: "Check measurement first", body: "Confirm the primary action is tracked correctly and reflects value. A broken conversion signal makes bid and creative analysis unreliable." },
      { title: "Read the whole funnel", body: "Compare appearances, visits, inquiries, sales-accepted leads, and progress using agreed definitions and time ranges." },
      { title: "Change one variable", body: "State a hypothesis, change one meaningful variable, keep other conditions stable where practical, and define a decision rule before reading results." },
    ],
    exercise: "Write a test card: hypothesis, one change, success metric, guardrail metric, measurement owner, review date, and decision rule.",
    question: "What makes an A/B test easier to interpret?",
    choices: ["Change several settings at once to move faster", "Change one planned variable and keep the comparison conditions clear", "Choose the winner by click-through rate alone"],
    answer: 1,
    explanation: "A controlled comparison helps isolate the effect of the planned change. The right success metric should represent the goal, not a convenient proxy alone.",
    referenceIds: ["google-conversions", "google-api-conversions", "google-smart-bidding"],
    handbookPages: "25-27",
  },
  {
    id: "manage",
    title: "Manage by evidence and escalate clearly",
    objective: "Turn recurring review into bounded actions with a named owner and decision.",
    decision: "Decide whether evidence is strong enough to act, what risk needs escalation, and who can approve the change.",
    technical: "Check status, date range, conversion lag, search-term quality, tracking health, and whether bidding automation supports the proposed adjustment. Keep a change log with reason and expected effect.",
    executive: "Use the format observed, meaning, action. Escalate broken inquiry paths, inaccurate offers, tracking failures, and spend beyond approval with impact, owner, and decision needed.",
    steps: [
      { title: "Read before editing", body: "Check the account's reporting window, data maturity, campaign status, and full-funnel quality before changing bids or budgets." },
      { title: "Apply a decision rule", body: "For each change, record the evidence, expected result, owner, approval, and date you will review it again." },
      { title: "Escalate with context", body: "State what happened, when, the business impact, the owner, and the specific decision or help required." },
    ],
    exercise: "Write a short escalation note for a fictional campaign with a broken inquiry form. Include observed, impact, owner, immediate action, and decision needed.",
    question: "A campaign's inquiry form is broken and tracking is unreliable. What is the best next step?",
    choices: ["Increase budget so the campaign gathers more data", "Escalate the impact, stop or contain affected spend through the approver, and assign a tracking owner", "Change bids until reported conversions return"],
    answer: 1,
    explanation: "Protect the approved budget and customer path, communicate the impact, and have the right owner repair measurement before optimization decisions rely on it.",
    referenceIds: ["google-smart-bidding", "google-search-terms"],
    handbookPages: "25-31",
  },
];

export function getGoogleAdsEvidence() {
  return [
    ...GOOGLE_ADS_LESSONS.map((lesson) => ({
      sourceId: `google-ads-handbook:${lesson.id}`,
      meetingId: "google-ads-workshop-handbook",
      meetingTitle: `Google Ads Workshop Handbook: ${lesson.title}`,
      meetingDate: "2026-10-14",
      topic: lesson.objective,
      excerpt: [
        `Handbook pages ${lesson.handbookPages}.`,
        lesson.objective,
        lesson.decision,
        ...lesson.steps.map((step) => `${step.title}: ${step.body}`),
        `Technical view: ${lesson.technical}`,
        `Executive view: ${lesson.executive}`,
        `Practice: ${lesson.exercise}`,
      ].join("\n"),
        page: "google-ads" as const,
    })),
    ...GOOGLE_ADS_REFERENCES.map((reference) => ({
      sourceId: `google-ads-reference:${reference.id}`,
      meetingId: "google-ads-official-references",
      meetingTitle: reference.title,
      meetingDate: "",
      topic: reference.note,
      excerpt: `${reference.note} This is a direct link to official Google documentation. Echo should not claim that this page was fetched during the chat.`,
      page: "google-ads" as const,
      url: reference.url,
    })),
  ];
}
