// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER DISCLOSURE — what happens to a user's data, per provider
//
// WHY THIS EXISTS, IN ONE PARAGRAPH
// When someone types their cost structure, capital plan or customer list into
// OrchestrIQ, that text leaves this site and reaches a third party. Which third
// party depends on which provider is switched on — something the user chose in
// Settings, possibly weeks ago, and has no reason to remember. DeepSeek's own
// policy is explicit that it does not cover end users of applications built on
// their platform: "The developer operating the application, as the controller of
// the Personal Data processing activity, should disclose the relevant Personal
// Data protection policies to the end users." That developer is us. This file is
// how we discharge that.
//
// ── THREE RULES THIS FILE FOLLOWS ────────────────────────────────────────────
// 1. NOTHING HERE IS INVENTED. Every entry carries the provider's own policy URL.
//    Where public reporting conflicts, `disputed` says so rather than picking the
//    convenient reading. The user is pointed at the source and decides.
// 2. NO LEGAL ADVICE. This is a factual summary to support an informed choice.
//    It is not a legal opinion and does not make the operator compliant with any
//    particular law by itself.
// 3. IT GOES STALE. `verified` records when each entry was last checked. Provider
//    terms change without notice; anything older than ~90 days needs re-checking.
// ─────────────────────────────────────────────────────────────────────────────

export type TrainingStance = "excluded" | "used" | "disputed" | "unknown";

export type ProviderDisclosure = {
  id: string;
  name: string;
  company: string;
  jurisdiction: string;
  dataResidency: string;
  training: TrainingStance;
  trainingNote: string;
  retentionNote: string;
  policyUrl: string;
  termsUrl: string;
  disputed: string;          // "" when reporting is consistent
  regulatoryNote: string;    // "" when there is nothing material
  suitability: "own_use" | "trial_ok" | "client_ok";
  verified: string;          // YYYY-MM
};

export const DISCLOSURES: Record<string, ProviderDisclosure> = {
  claude: {
    id: "claude", name: "Claude", company: "Anthropic PBC",
    jurisdiction: "United States", dataResidency: "United States",
    training: "excluded",
    trainingNote: "Anthropic states that API inputs and outputs are not used to train its models by default.",
    retentionNote: "Retained for a limited period for abuse monitoring. Check current terms for the exact window.",
    policyUrl: "https://www.anthropic.com/legal/privacy",
    termsUrl: "https://www.anthropic.com/legal/commercial-terms",
    disputed: "", regulatoryNote: "",
    suitability: "client_ok", verified: "2026-08",
  },
  openai: {
    id: "openai", name: "OpenAI (GPT)", company: "OpenAI",
    jurisdiction: "United States", dataResidency: "United States",
    training: "excluded",
    trainingNote: "OpenAI states that data submitted through the API is not used to train its models by default.",
    retentionNote: "API data retained up to 30 days for abuse monitoring, then deleted, unless zero-retention is agreed.",
    policyUrl: "https://openai.com/policies/privacy-policy",
    termsUrl: "https://openai.com/policies/api-data-usage-policies",
    disputed: "", regulatoryNote: "",
    suitability: "client_ok", verified: "2026-08",
  },
  gemini: {
    id: "gemini", name: "Gemini", company: "Google LLC",
    jurisdiction: "United States", dataResidency: "Google global infrastructure",
    training: "disputed",
    trainingNote: "PAID Gemini API: excluded from training. FREE tier: Google states free-tier data may be used to improve its products. Which tier applies depends on the key you supplied.",
    retentionNote: "Differs by tier. Free-tier prompts may be reviewed by humans.",
    policyUrl: "https://policies.google.com/privacy",
    termsUrl: "https://ai.google.dev/gemini-api/terms",
    disputed: "The free and paid tiers are treated very differently. If you are on a free key, assume your prompts may be used to improve Google's products.",
    regulatoryNote: "",
    suitability: "trial_ok", verified: "2026-08",
  },
  groq: {
    id: "groq", name: "Groq", company: "Groq Inc.",
    jurisdiction: "United States", dataResidency: "United States",
    training: "unknown",
    trainingNote: "Groq serves open-weight models from other developers. Read Groq's own terms for its retention and training position before sending confidential data.",
    retentionNote: "Not clearly published at the time of checking. Verify before use.",
    policyUrl: "https://groq.com/privacy-policy/",
    termsUrl: "https://groq.com/terms-of-sale/",
    disputed: "", regulatoryNote: "",
    suitability: "trial_ok", verified: "2026-08",
  },
  deepseek: {
    id: "deepseek", name: "DeepSeek", company: "Hangzhou DeepSeek Artificial Intelligence Co., Ltd.",
    jurisdiction: "People's Republic of China", dataResidency: "People's Republic of China",
    training: "disputed",
    trainingNote: "Public reporting conflicts. Some sources state paid API accounts are excluded from training by default; others state DeepSeek's Terms of Service permit training on submitted data by default, unlike OpenAI, Anthropic and Google. Read DeepSeek's own API terms before sending confidential data.",
    retentionNote: "DeepSeek's privacy policy states personal data for its services is collected, processed and stored in the People's Republic of China, under Chinese law.",
    policyUrl: "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html",
    termsUrl: "https://platform.deepseek.com/downloads/DeepSeek%20Open%20Platform%20Terms%20of%20Service.html",
    disputed: "Sources disagree on whether paid API data is used for training. Treat it as unresolved and read the terms yourself before sending confidential information.",
    regulatoryNote: "DeepSeek has been subject to regulatory scrutiny in several countries including India, Germany, Italy, France, Australia and South Korea, largely over transfer of personal data to China.",
    suitability: "own_use", verified: "2026-08",
  },
  kimi: {
    id: "kimi", name: "Kimi (Moonshot)", company: "Moonshot AI",
    jurisdiction: "People's Republic of China", dataResidency: "People's Republic of China",
    training: "unknown",
    trainingNote: "Not clearly published in English at the time of checking. Assume data may be retained; verify before sending confidential information.",
    retentionNote: "Chinese jurisdiction and data protection law apply.",
    policyUrl: "https://platform.moonshot.ai/", termsUrl: "https://platform.moonshot.ai/",
    disputed: "", regulatoryNote: "Chinese data residency. Check acceptability before use with regulated or enterprise clients.",
    suitability: "own_use", verified: "2026-08",
  },
  nvidia: {
    id: "nvidia", name: "NVIDIA (Free tier)", company: "NVIDIA Corporation",
    jurisdiction: "United States", dataResidency: "United States",
    training: "used",
    trainingNote: "NVIDIA's free trial terms permit prompts to be used to improve its models. The trial also EXCLUDES production use — defined as any activity serving real end-users.",
    retentionNote: "Trial terms apply. Not intended for confidential or production data.",
    policyUrl: "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/",
    termsUrl: "https://build.nvidia.com/",
    disputed: "",
    regulatoryNote: "Free tier is for development, testing and evaluation only. Using it to serve other people's data is outside the licence.",
    suitability: "own_use", verified: "2026-08",
  },
  fal: {
    id: "fal", name: "fal.ai", company: "fal.ai",
    jurisdiction: "United States", dataResidency: "United States",
    training: "unknown",
    trainingNote: "Image and video generation. Check fal.ai's terms for retention of generated media and prompts.",
    retentionNote: "Generated media may be retained. Verify before use with client material.",
    policyUrl: "https://fal.ai/privacy", termsUrl: "https://fal.ai/terms",
    disputed: "", regulatoryNote: "",
    suitability: "trial_ok", verified: "2026-08",
  },
  serper: {
    id: "serper", name: "Serper (web search)", company: "Serper",
    jurisdiction: "United States", dataResidency: "United States",
    training: "unknown",
    trainingNote: "Receives SEARCH QUERIES only — never your documents, ledger or executive discussion. Queries are built from your industry and question keywords.",
    retentionNote: "Search queries may be logged. Do not put confidential specifics into a question if that matters to you.",
    policyUrl: "https://serper.dev/privacy", termsUrl: "https://serper.dev/terms",
    disputed: "", regulatoryNote: "",
    suitability: "trial_ok", verified: "2026-08",
  },
  tavily: {
    id: "tavily", name: "Tavily (web search)", company: "Tavily",
    jurisdiction: "United States / Israel", dataResidency: "United States",
    training: "unknown",
    trainingNote: "Receives search queries only, not your documents.",
    retentionNote: "Queries may be logged.",
    policyUrl: "https://tavily.com/privacy", termsUrl: "https://tavily.com/terms",
    disputed: "", regulatoryNote: "",
    suitability: "trial_ok", verified: "2026-08",
  },
  brave: {
    id: "brave", name: "Brave Search", company: "Brave Software",
    jurisdiction: "United States", dataResidency: "United States",
    training: "unknown",
    trainingNote: "Receives search queries only. Brave operates its own index and markets a privacy-first position — read their terms for the specifics.",
    retentionNote: "See Brave's API terms.",
    policyUrl: "https://brave.com/privacy/browser/", termsUrl: "https://brave.com/terms-of-use/",
    disputed: "", regulatoryNote: "",
    suitability: "trial_ok", verified: "2026-08",
  },
  dataforseo: {
    id: "dataforseo", name: "DataForSEO", company: "DataForSEO",
    jurisdiction: "Cyprus / EU", dataResidency: "EU",
    training: "unknown",
    trainingNote: "Receives search queries only.",
    retentionNote: "See DataForSEO's terms.",
    policyUrl: "https://dataforseo.com/privacy-policy", termsUrl: "https://dataforseo.com/terms-of-use",
    disputed: "", regulatoryNote: "",
    suitability: "trial_ok", verified: "2026-08",
  },
};

export function getDisclosure(id: string): ProviderDisclosure | null {
  return DISCLOSURES[id] || null;
}

export function trainingLabel(t: TrainingStance): { text: string; tone: "good" | "warn" | "bad" } {
  if (t === "excluded") return { text: "Not used for training", tone: "good" };
  if (t === "used") return { text: "MAY BE USED FOR TRAINING", tone: "bad" };
  if (t === "disputed") return { text: "Disputed — read the terms", tone: "warn" };
  return { text: "Not published — verify", tone: "warn" };
}

/** One-line summary for the always-visible status strip. */
export function activeProviderSummary(activeIds: string[]): string {
  const ds = activeIds.map(getDisclosure).filter(Boolean) as ProviderDisclosure[];
  if (!ds.length) return "No AI provider is active.";
  const names = ds.map(d => d.name).join(", ");
  const places = Array.from(new Set(ds.map(d => d.jurisdiction)));
  return "Your input is sent to: " + names + " (" + places.join("; ") + ")";
}

/** The text a user must see and accept BEFORE their first submission. */
export function buildConsentText(activeIds: string[], currency = "INR"): string {
  const ds = activeIds.map(getDisclosure).filter(Boolean) as ProviderDisclosure[];
  const lines: string[] = [];
  lines.push("BEFORE YOU CONTINUE — where your data goes");
  lines.push("");
  lines.push("OrchestrIQ does not run its own AI models. Whatever you type is sent to the third-party providers you have switched on in Settings. Those companies, not this site, then handle your text under their own terms.");
  lines.push("");
  if (!ds.length) {
    lines.push("No provider is currently active, so nothing can be sent.");
    return lines.join("\n");
  }
  lines.push("ACTIVE RIGHT NOW:");
  ds.forEach(d => {
    const t = trainingLabel(d.training);
    lines.push("");
    lines.push("  " + d.name + " — " + d.company);
    lines.push("     Processed in: " + d.dataResidency);
    lines.push("     Training on your data: " + t.text);
    lines.push("     " + d.trainingNote);
    if (d.disputed) lines.push("     ⚠ " + d.disputed);
    if (d.regulatoryNote) lines.push("     ⚠ " + d.regulatoryNote);
    lines.push("     Their policy: " + d.policyUrl);
  });
  lines.push("");
  lines.push("WHAT THIS MEANS IN PRACTICE");
  lines.push("- Do not paste anything you would not be willing to send to the companies named above.");
  lines.push("- Where a provider's position is marked disputed or not published, read their terms yourself. We summarise; we do not warrant.");
  lines.push("- You can change which providers are active at any time in Settings, and switch any of them off.");
  lines.push("");
  lines.push("This summary is provided so you can make an informed choice. It is not legal advice, and provider terms can change without notice. The dates each entry was last checked are shown in Settings.");
  return lines.join("\n");
}

/** Attribution line appended to a generated answer, so its author is never ambiguous. */
export function attributionLine(providerId: string, modelName: string): string {
  const d = getDisclosure(providerId);
  if (!d) return "_Generated by " + (modelName || providerId) + "._";
  const t = trainingLabel(d.training);
  return "_Generated by " + d.name + (modelName ? " (" + modelName + ")" : "") +
    " — processed in " + d.dataResidency + ". Training on your data: " + t.text.toLowerCase() + ". " +
    "Provider policy: " + d.policyUrl + "_";
}

/** Providers whose stance is not "excluded" — used to warn before a first send. */
export function providersNeedingCaution(activeIds: string[]): ProviderDisclosure[] {
  return activeIds.map(getDisclosure).filter(d => !!d && d.training !== "excluded") as ProviderDisclosure[];
}
