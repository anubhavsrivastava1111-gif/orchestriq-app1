// ═══════════════════════════════════════════════════════════════════════════
// CLOUDFLARE PAGES FUNCTION — Per-module social share previews (Step 2)
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS DOES: link-preview robots (Facebook, LinkedIn, X, WhatsApp,
// Slack, etc.) request a URL before a human ever clicks it, to build the
// preview card. This intercepts ONLY those specific robot requests and
// serves them the correct title, description, and image for whichever
// module's URL was shared - so sharing /cost-architecture actually shows
// a Cost Architecture card, not the generic homepage one.
//
// THE SAFETY GUARANTEE, MADE STRUCTURAL, NOT JUST PROMISED:
// Step 1 of this check is "is this request from a known preview-bot user
// agent?" If the answer is no - which is true for every real visitor,
// every time - this function calls next() and returns immediately,
// touching NOTHING else about the request or response. A bug anywhere
// below that first check can only ever affect bot traffic building a
// preview card. It cannot break the site for a real person, because real
// people never reach the code past that check.
//
// SETUP: place this file at functions/_middleware.ts (already done by
// this delivery). Cloudflare Pages automatically runs middleware ahead of
// every request on the site - no dashboard configuration is required for
// this file specifically, unlike functions/api/nvidia.ts which needed
// environment variables and a KV binding. This file needs neither.
// ═══════════════════════════════════════════════════════════════════════════

const SITE = "https://orchestriq.gorakhai.com";

// Matches the exact VIEW_TO_PATH mapping added in Step 1 - kept as a plain,
// hand-checked list here (a Cloudflare Function cannot import from the React
// app's source) rather than derived automatically, so it is easy to verify
// by eye that every path lines up with what Step 1 actually produces.
const MODULE_META: Record<string, { title: string; description: string; image: string }> = {
  "/": {
    title: "OrchestrIQ — Command Center",
    description: "Your business at a glance — everything that matters today, in one screen.",
    image: SITE + "/og-home.png",
  },
  "/nerve-center": {
    title: "OrchestrIQ — Nerve Center",
    description: "AI Boardroom, Time Machine, and Autopilot — strategic thinking for every stage.",
    image: SITE + "/og-nerve-center.png",
  },
  "/workflow": {
    title: "OrchestrIQ — Workflow",
    description: "Turn a business task into a guided, AI-assisted step-by-step plan.",
    image: SITE + "/og-workflow.png",
  },
  "/agentic-ai": {
    title: "OrchestrIQ — Agentic AI",
    description: "AI that plans and executes multi-step work on your behalf.",
    image: SITE + "/og-agentic-ai.png",
  },
  "/ai-agents": {
    title: "OrchestrIQ — AI Agents",
    description: "A team of specialist AI agents, ready to work on demand.",
    image: SITE + "/og-ai-agents.png",
  },
  "/autopilot": {
    title: "OrchestrIQ — Autopilot",
    description: "Describe a goal — AI builds and runs the project plan for you.",
    image: SITE + "/og-autopilot.png",
  },
  "/chat": {
    title: "OrchestrIQ — Executive Chat",
    description: "Talk one-on-one with any AI executive on your board.",
    image: SITE + "/og-chat.png",
  },
  "/data-hub": {
    title: "OrchestrIQ — Data Hub",
    description: "Bring your business data together in one structured place.",
    image: SITE + "/og-data-hub.png",
  },
  "/cost-architecture": {
    title: "OrchestrIQ — Cost Architecture",
    description: "What each thing you sell actually costs, and where the money leaks.",
    image: SITE + "/og-cost-architecture.png",
  },
  "/ledger": {
    title: "OrchestrIQ — Ledger",
    description: "Track spending and income with AI-assisted bookkeeping.",
    image: SITE + "/og-ledger.png",
  },
  "/finance": {
    title: "OrchestrIQ — Finance",
    description: "Financial planning and modeling for your business.",
    image: SITE + "/og-finance.png",
  },
  "/pulse": {
    title: "OrchestrIQ — Pulse",
    description: "Real-time signals and alerts about what needs your attention.",
    image: SITE + "/og-pulse.png",
  },
  "/tasks": {
    title: "OrchestrIQ — Tasks",
    description: "Every action item from every AI conversation, tracked in one place.",
    image: SITE + "/og-tasks.png",
  },
  "/studio": {
    title: "OrchestrIQ — Studio",
    description: "Turn AI conversations into polished documents, decks, and reports.",
    image: SITE + "/og-studio.png",
  },
  "/funding": {
    title: "OrchestrIQ — Funding Intelligence",
    description: "Research investors, funding options, and fundraising strategy.",
    image: SITE + "/og-funding.png",
  },
  "/ai-workspace": {
    title: "OrchestrIQ — AI Workspace",
    description: "Ask anything — business, code, writing, or planning — with any AI model.",
    image: SITE + "/og-ai-workspace.png",
  },
  "/live-boardroom": {
    title: "OrchestrIQ — Live AI Boardroom",
    description: "A live, reactive executive debate that challenges itself and reaches a real decision.",
    image: SITE + "/og-live-boardroom.png",
  },
};

// Deliberately NOT in MODULE_META, and deliberately falling through to the
// generic homepage card if ever requested by a bot: /account, /admin,
// /tokens, /support. These are personal or owner-only screens, not public
// marketing surfaces - there is nothing useful to show a public preview of.

const BOT_UA_PATTERN =
  /facebookexternalhit|Facebot|LinkedInBot|Twitterbot|WhatsApp|Slackbot|TelegramBot|Discordbot|Pinterest|redditbot|SkypeUriPreview|vkShare/i;

export async function onRequest(context: { request: Request; next: () => Promise<Response> }): Promise<Response> {
  const { request, next } = context;

  // STEP 1 OF THE SAFETY GUARANTEE: everything below this line only runs
  // for a small, known set of preview-fetching robots. Every real visitor
  // returns here immediately, completely unaffected by anything else in
  // this file.
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA_PATTERN.test(ua)) {
    return next();
  }

  const url = new URL(request.url);
  const meta = MODULE_META[url.pathname] || MODULE_META["/"];

  // Fetch the real page exactly as it would normally be served, then only
  // swap the meta tag VALUES - nothing else about the page is touched, so
  // a change to the site's actual HTML structure elsewhere can't be
  // silently undone by this function.
  const response = await next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    // Not an HTML page (e.g. a bot somehow requesting an image or script
    // directly) - nothing to rewrite, pass through unchanged.
    return response;
  }

  let html = await response.text();

  const escape = (s: string) => s.replace(/"/g, "&quot;");
  html = html
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escape(meta.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escape(meta.description)}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${escape(meta.image)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${escape(SITE + url.pathname)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${escape(meta.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${escape(meta.description)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${escape(meta.image)}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(meta.title)}</title>`);

  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
}
