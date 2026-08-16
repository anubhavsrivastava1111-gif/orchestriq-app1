/* ============================================================================
 * OrchestrIQ :: AutomationCoach.ts
 *
 * Guides a non-technical person through building a REAL, RECURRING automation
 * on their own tools - ServiceNow, Google Workspace, Power BI, Salesforce - a
 * few steps at a time, verifying as it goes.
 *
 * DESIGN PRINCIPLES (each one exists because the alternative is dangerous):
 *
 * 1. CURATED SKELETON, AI ADAPTATION. The phase structure of every supported
 *    automation is human-verified and stored here. The AI personalises it; it
 *    never invents the shape. Pure generation is how people get told to click
 *    buttons that do not exist.
 *
 * 2. NO FABRICATED SCREENSHOTS. We give exact navigation paths, "what you
 *    should see" checkpoints, and links to the vendor's own documentation -
 *    which is current, correct and has real screenshots. A convincing but
 *    wrong picture is worse than no picture.
 *
 * 3. VERIFY BEFORE ADVANCING. Every phase ends in a test the user runs. No
 *    phase is marked done on the user's say-so alone.
 *
 * 4. RISK TIERS AND GATES. Anything touching production or shared data
 *    requires an explicit sandbox-first acknowledgement.
 *
 * 5. SAY WHEN UNSURE. Every step carries a confidence level. Unverified steps
 *    are labelled as such rather than asserted.
 *
 * Pure functions. No React, no Supabase, no side effects.
 * ========================================================================== */

import { extractJSON } from "./BusinessBlueprint";

/* -------------------------------------------------------------------- types */

export type RiskTier = "green" | "amber" | "red";
export type Confidence = "verified" | "likely" | "unverified";

export interface DocLink { label: string; url: string; }

export interface Prereq {
  id: string;
  question: string;
  whyItMatters: string;
  howToCheck: string;
  blocksIfMissing: boolean;
}

export interface Step {
  id: string;
  n: number;
  action: string;            // what to do, one instruction
  whereExactly: string;      // navigation breadcrumb
  whatYouShouldSee: string;  // the screenshot substitute
  ifYouDontSeeIt: string;    // recovery hint
  confidence: Confidence;
  caution?: string;
}

export interface Verification {
  test: string;
  expected: string;
  ifItFails: string;
}

export interface Phase {
  id: string;
  name: string;
  goal: string;
  steps: Step[];
  verify: Verification;
  rollback: string;
}

export interface Playbook {
  id: string;
  title: string;
  platforms: string[];
  keywords: RegExp;
  riskTier: RiskTier;
  summary: string;
  outcome: string;
  timeEstimate: string;
  blastRadius: string;
  approvalNote: string;
  prerequisites: Prereq[];
  docs: DocLink[];
  phaseOutline: Array<{ id: string; name: string; goal: string; verify: string }>;
  recurrenceOptions: string[];
  lastReviewed: string;
}

export interface CoachPlan {
  title: string;
  understanding: string;
  platforms: string[];
  riskTier: RiskTier;
  outcome: string;
  timeEstimate: string;
  recurrence: string;
  blastRadius: string;
  rollbackSummary: string;
  approvalNote: string;
  prerequisites: Prereq[];
  phases: Phase[];
  docs: DocLink[];
  cautions: string[];
  unverifiedAreas: string[];
  playbookId: string | null;
  generatedFrom: "playbook" | "playbook_adapted" | "generated";
}

/* ============================================================================
 * CURATED PLAYBOOKS
 * Each skeleton has been walked through and confirmed. `lastReviewed` is the
 * honesty marker - a stale playbook must be re-verified, not trusted.
 * ========================================================================== */

export const PLAYBOOKS: Playbook[] = [
  /* ---------------------------------------------------------------------- */
  {
    id: "servicenow_scheduled_report",
    title: "Email yourself a ServiceNow report automatically, every day",
    platforms: ["servicenow"],
    keywords: /servicenow|service now|snow ticket|incident report|ticket export|sla report/i,
    riskTier: "green",
    summary: "Replaces the daily routine of logging in, filtering a list and exporting it by hand. ServiceNow builds the report and emails it to you on a schedule.",
    outcome: "A filtered Excel or CSV report lands in your inbox at a set time every day, with no clicks from you.",
    timeEstimate: "10-15 minutes to set up",
    blastRadius: "Read-only. Creates a report and a schedule. Changes no ticket, no record, no user.",
    approvalNote: "Scheduling a report you are already allowed to run is routine. Still worth telling your manager, since it sends data out by email on a recurring basis.",
    prerequisites: [
      { id: "sn_report_rights", question: "When you open a report in ServiceNow, does the menu include a 'Schedule' option?",
        whyItMatters: "Scheduling needs a role your account may not have. Finding out now saves you reaching step 8 and being blocked.",
        howToCheck: "Open any existing report. Click the menu (usually a chevron or three dots near the report title). Look for 'Schedule'.",
        blocksIfMissing: true },
      { id: "sn_email_allowed", question: "Are you allowed to receive ServiceNow data at the email address you want to use?",
        whyItMatters: "Sending client ticket data to a personal address is usually a policy breach. Use your work or client-issued address.",
        howToCheck: "Use the same address you already receive ServiceNow notifications on.",
        blocksIfMissing: true },
    ],
    docs: [
      { label: "ServiceNow - Creating a scheduled report (community guide)", url: "https://www.servicenow.com/community/itsm-articles/creating-a-scheduled-report-in-servicenow/ta-p/2970255" },
      { label: "ServiceNow - Report distribution overview", url: "https://www.emergys.com/blog/report-distribution-in-servicenow/" },
    ],
    phaseOutline: [
      { id: "p1", name: "Build the report with your exact filters", goal: "Create a saved report that returns precisely the rows you export by hand today.",
        verify: "Run the report and confirm the row count matches what you normally see." },
      { id: "p2", name: "Attach the schedule", goal: "Set frequency, time, format and recipients.",
        verify: "The scheduled job appears under Scheduled Jobs and shows a valid next-run time." },
      { id: "p3", name: "Force a test run and confirm delivery", goal: "Prove the email actually arrives with a readable attachment.",
        verify: "Execute the job now; the email arrives and the attachment opens with the right columns." },
    ],
    recurrenceOptions: ["Every weekday morning", "Daily including weekends", "Weekly on a chosen day", "Monthly"],
    lastReviewed: "2026-08",
  },

  /* ---------------------------------------------------------------------- */
  {
    id: "apps_script_mail_to_sheet",
    title: "Turn a scheduled email attachment into a live tracker and daily status email",
    platforms: ["google_workspace"],
    keywords: /apps ?script|google sheet|google drive|gmail|spreadsheet tracker|daily status email|workspace automation/i,
    riskTier: "amber",
    summary: "A script that lives inside your own Google Workspace reads an incoming report, appends it to a tracker sheet, works out ageing and SLA status, and drafts a formatted email for you to forward.",
    outcome: "Every day the tracker updates itself and a formatted status email waits in your drafts. You review and forward.",
    timeEstimate: "45-70 minutes across two sittings",
    blastRadius: "Writes to one spreadsheet you create, and creates email DRAFTS. Configured to draft rather than send, so nothing leaves without you clicking.",
    approvalNote: "This runs on Google's servers inside your organisation's own Workspace tenant - no external service touches the data. Even so, tell your manager before automating anything that emails a client.",
    prerequisites: [
      { id: "gas_enabled", question: "Can you create a Google Apps Script project?",
        whyItMatters: "Many Workspace administrators disable Apps Script. If it is off, this route is closed until an admin enables it.",
        howToCheck: "In Google Drive click New, then More. If 'Google Apps Script' is missing, it is disabled for your account.",
        blocksIfMissing: true },
      { id: "source_email", question: "Is the source report already arriving by email on a schedule?",
        whyItMatters: "This automation reads an incoming attachment. Without a reliable daily email there is nothing to read.",
        howToCheck: "Check your inbox for the report arriving at a consistent time with a consistent subject line.",
        blocksIfMissing: true },
      { id: "csv_format", question: "Is the attachment CSV rather than XLSX?",
        whyItMatters: "CSV can be read directly. XLSX needs an extra conversion step - doable, but more moving parts. If you control the source, choose CSV.",
        howToCheck: "Look at the attachment's file extension.",
        blocksIfMissing: false },
    ],
    docs: [
      { label: "Google - Apps Script quickstart", url: "https://developers.google.com/apps-script/quickstart/custom-functions" },
      { label: "Google - Installable triggers (scheduling)", url: "https://developers.google.com/apps-script/guides/triggers/installable" },
      { label: "Google - GmailApp service reference", url: "https://developers.google.com/apps-script/reference/gmail/gmail-app" },
      { label: "Google - SpreadsheetApp service reference", url: "https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app" },
    ],
    phaseOutline: [
      { id: "p1", name: "Create the tracker sheet and the script project", goal: "Set up the spreadsheet with the right columns and open a bound script editor.",
        verify: "A 'Hello' test function runs without error and writes a value into cell A1." },
      { id: "p2", name: "Read the email attachment", goal: "Find yesterday's report by search, open the attachment, parse the rows.",
        verify: "Run the function manually - the correct number of rows is logged, matching the file." },
      { id: "p3", name: "Append to the tracker without duplicating", goal: "Write new rows into the sheet, skipping anything already recorded.",
        verify: "Run it twice in a row. The second run adds nothing." },
      { id: "p4", name: "Calculate ageing and SLA status", goal: "Add the columns that classify each item by age and against the SLA threshold.",
        verify: "Spot-check three rows by hand against the calculated values." },
      { id: "p5", name: "Draft the status email", goal: "Build the formatted summary and place it in drafts.",
        verify: "A draft appears with correct totals. Nothing is sent." },
      { id: "p6", name: "Put it on a schedule", goal: "Add time-driven triggers for the morning ingest and the evening summary.",
        verify: "Triggers are listed with correct times; leave it a day and confirm both fired." },
    ],
    recurrenceOptions: ["Weekday mornings only", "Every day", "Twice daily - morning ingest, evening summary", "Weekly digest"],
    lastReviewed: "2026-08",
  },

  /* ---------------------------------------------------------------------- */
  {
    id: "powerbi_scheduled_refresh",
    title: "Keep a Power BI report refreshing itself and email a subscription",
    platforms: ["power_bi", "microsoft_365"],
    keywords: /power ?bi|powerbi|dataset refresh|dashboard refresh|power bi subscription/i,
    riskTier: "amber",
    summary: "Configure a dataset to refresh on a schedule and send a subscription email so recipients always see current figures.",
    outcome: "The report refreshes automatically and stakeholders receive it by email on your chosen schedule.",
    timeEstimate: "25-40 minutes",
    blastRadius: "Refreshes a dataset and emails a report. Does not change source data, but a broken refresh can leave stale figures on a dashboard others rely on.",
    approvalNote: "If the workspace is shared, tell the owner before changing refresh settings. A failed refresh is visible to everyone using the report.",
    prerequisites: [
      { id: "pbi_licence", question: "Do you have a Power BI Pro licence (or is the workspace on Premium capacity)?",
        whyItMatters: "Scheduled refresh and subscriptions are not available on the free licence.",
        howToCheck: "In the Power BI service, open Settings, then look at your account licence type.",
        blocksIfMissing: true },
      { id: "pbi_gateway", question: "Is your data source cloud-based, or on-premises?",
        whyItMatters: "On-premises sources need an installed data gateway, which is a separate project involving IT.",
        howToCheck: "If the data comes from SharePoint, OneDrive or a cloud database, no gateway is needed. A local file or company server needs one.",
        blocksIfMissing: false },
      { id: "pbi_owner", question: "Are you the dataset owner?",
        whyItMatters: "Only the owner can configure the refresh schedule.",
        howToCheck: "Open the dataset settings. If the refresh section is greyed out, you are not the owner.",
        blocksIfMissing: true },
    ],
    docs: [
      { label: "Microsoft - Configure scheduled refresh", url: "https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-scheduled-refresh" },
      { label: "Microsoft - Data refresh overview", url: "https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-data" },
      { label: "Microsoft - Email subscriptions for reports", url: "https://learn.microsoft.com/en-us/power-bi/collaborate-share/end-user-subscribe" },
    ],
    phaseOutline: [
      { id: "p1", name: "Check credentials on the data source", goal: "Make sure the dataset can reach its source unattended.",
        verify: "Run a manual refresh - it completes without a credential error." },
      { id: "p2", name: "Set the refresh schedule", goal: "Choose frequency, times and time zone, and turn on failure notifications.",
        verify: "The schedule is saved and shows the next refresh time." },
      { id: "p3", name: "Add the email subscription", goal: "Send the report to the people who need it, timed after the refresh.",
        verify: "Send a test now - the email arrives with current figures." },
    ],
    recurrenceOptions: ["Once each weekday morning", "Twice daily", "Weekly", "Up to 8 times a day (Pro limit)"],
    lastReviewed: "2026-08",
  },
];

/* ------------------------------------------------------------------ matching */

export interface PlaybookMatch { playbook: Playbook | null; score: number; alternatives: Playbook[]; }

export function matchPlaybook(goal: string, platforms: string[] = []): PlaybookMatch {
  const text = (goal || "") + " " + platforms.join(" ");
  const scored = PLAYBOOKS.map((p) => {
    let score = 0;
    if (p.keywords.test(text)) score += 3;
    for (const pl of platforms) if (p.platforms.includes(pl)) score += 2;
    return { p, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  return {
    playbook: best && best.score >= 2 ? best.p : null,
    score: best ? best.score : 0,
    alternatives: scored.filter((x) => x.score > 0).slice(1, 3).map((x) => x.p),
  };
}

export const PLATFORM_OPTIONS = [
  { v: "servicenow", label: "ServiceNow" },
  { v: "google_workspace", label: "Google Workspace (Gmail, Sheets, Drive)" },
  { v: "microsoft_365", label: "Microsoft 365 (Outlook, Excel, SharePoint)" },
  { v: "power_bi", label: "Power BI" },
  { v: "power_automate", label: "Power Automate" },
  { v: "salesforce", label: "Salesforce" },
  { v: "sap_concur", label: "SAP Concur" },
  { v: "aws", label: "AWS" },
  { v: "jira", label: "Jira" },
  { v: "slack", label: "Slack" },
  { v: "other", label: "Something else" },
];

/* ---------------------------------------------------------------- risk gates */

export const RISK_COPY: Record<RiskTier, { label: string; meaning: string; gate: string | null }> = {
  green: {
    label: "Low risk",
    meaning: "Read-only or affects only your own files. Nothing shared changes.",
    gate: null,
  },
  amber: {
    label: "Moderate risk",
    meaning: "Writes to a file, sends or drafts email, or changes a schedule others may depend on.",
    gate: "Test with a file or recipient only you can see before pointing it at anything real.",
  },
  red: {
    label: "High risk",
    meaning: "Touches production records, shared data or customer information. A mistake here affects other people's work.",
    gate: "Build this in a sandbox or test environment first, and get your IT or platform owner to approve it before it goes live. This is not optional.",
  },
};

/** Anything that writes to production records is red, whatever the user says. */
const RED_PATTERNS = /salesforce (flow|trigger|apex)|production (record|data|org)|delete|mass update|bulk update|customer data|payment|payroll|invoice post|journal post|approve automatically|auto-approve/i;
const AMBER_PATTERNS = /send email|shared (drive|sheet|folder|workspace)|power automate|write to|update (sheet|record)|schedule refresh|teams message|slack message/i;

export function assessRisk(goal: string, playbook: Playbook | null): RiskTier {
  if (RED_PATTERNS.test(goal || "")) return "red";
  if (playbook) {
    if (playbook.riskTier === "red") return "red";
    if (AMBER_PATTERNS.test(goal || "") && playbook.riskTier === "green") return "amber";
    return playbook.riskTier;
  }
  if (AMBER_PATTERNS.test(goal || "")) return "amber";
  return "amber"; // unknown territory is never "low risk"
}

/* ------------------------------------------------------------------ prompts */

const RULES = `
NON-NEGOTIABLE RULES
1. NEVER invent a menu path, button name or screen you are not confident exists. If unsure, mark the step confidence "unverified" and say plainly what the user should look for instead.
2. NEVER describe a screenshot or image. Instead give: the exact navigation breadcrumb, and a "what you should see" description so the user can confirm they are in the right place.
3. Write for someone non-technical. No jargon without a one-line plain explanation.
4. One action per step. Never combine two clicks into one instruction.
5. Every step must include what to do if the thing described is NOT there.
6. Prefer the platform's own built-in scheduling over custom code. Custom code only when the platform cannot do it.
7. The automation must RECUR on a schedule, not run once. Scheduling is part of the deliverable, not an afterthought.
8. If a step could affect data other people depend on, say so in the caution field.
9. Cite the official documentation you relied on.
`;

export function buildPlanPrompt(input: {
  goal: string; platforms: string[]; recurrence: string; playbook: Playbook | null;
  riskTier: RiskTier; context?: string;
}): string {
  const { goal, platforms, recurrence, playbook, riskTier, context } = input;

  const skeleton = playbook ? `
A VERIFIED PLAYBOOK MATCHES THIS REQUEST. Use its phase structure exactly - do not reorder, merge or invent phases. Adapt the wording and detail to the user's specific situation.

PLAYBOOK: ${playbook.title}
Outcome: ${playbook.outcome}
Blast radius: ${playbook.blastRadius}
Approval note: ${playbook.approvalNote}
Phases:
${playbook.phaseOutline.map((p, i) => `  ${i + 1}. ${p.name} - ${p.goal} (verify: ${p.verify})`).join("\n")}
Prerequisites to check first:
${playbook.prerequisites.map((p) => `  - ${p.question} (${p.blocksIfMissing ? "BLOCKING" : "advisory"})`).join("\n")}
Official documentation:
${playbook.docs.map((d) => `  - ${d.label}: ${d.url}`).join("\n")}
` : `
NO VERIFIED PLAYBOOK MATCHES. Build the plan from first principles, and be markedly more cautious: mark most steps "likely" or "unverified" rather than "verified", and tell the user to confirm each screen against their own system before acting.
`;

  return `You are an automation architect who guides non-technical people through building recurring automations on their own business systems. You have web search - use it to check the CURRENT official documentation before writing any navigation path, because these interfaces change several times a year.

WHAT THE USER WANTS:
"""${(goal || "").slice(0, 1500)}"""

PLATFORMS THEY USE: ${platforms.join(", ") || "not specified"}
HOW OFTEN IT SHOULD RUN: ${recurrence || "not specified - ask"}
RISK TIER: ${riskTier}${riskTier === "red" ? " (HIGH - insist on a sandbox and platform-owner approval before any live step)" : riskTier === "amber" ? " (MODERATE - insist on a test file or test recipient first)" : ""}
${context ? "ADDITIONAL CONTEXT: " + context.slice(0, 800) : ""}
${skeleton}
${RULES}

Return ONLY JSON. No markdown fences, no commentary.

{
  "title": "short name for this automation",
  "understanding": "two or three sentences restating what they want, so they can correct you if wrong",
  "outcome": "what will be true when this is finished",
  "timeEstimate": "e.g. 45-60 minutes across two sittings",
  "recurrence": "the schedule this will run on",
  "blastRadius": "exactly what this touches and what it cannot touch",
  "rollbackSummary": "how to undo the whole thing if it goes wrong",
  "approvalNote": "who they should tell before building this",
  "prerequisites": [{"id":"","question":"","whyItMatters":"","howToCheck":"","blocksIfMissing":true}],
  "phases": [{
    "id":"p1","name":"","goal":"",
    "steps":[{"id":"p1s1","n":1,"action":"","whereExactly":"","whatYouShouldSee":"","ifYouDontSeeIt":"","confidence":"verified|likely|unverified","caution":""}],
    "verify":{"test":"","expected":"","ifItFails":""},
    "rollback":"how to undo just this phase"
  }],
  "docs":[{"label":"","url":""}],
  "cautions":["things that could go wrong"],
  "unverifiedAreas":["anything you could not confirm against current documentation - be honest"]
}

SIZE: 3 to 6 phases. 3 to 5 steps per phase - never more, because the user works through one phase at a time. Keep each field under 40 words.`;
}

/** Called when the user reports a step did not match reality. */
export function buildRecoveryPrompt(input: {
  goal: string; platforms: string[]; phaseName: string;
  stepsIssued: Step[]; problem: string; playbook: Playbook | null;
}): string {
  return `You are guiding a non-technical user through an automation build. They have hit a problem and need you to get them back on track.

THE AUTOMATION: ${input.goal.slice(0, 600)}
PLATFORMS: ${input.platforms.join(", ")}
CURRENT PHASE: ${input.phaseName}
${input.playbook ? "PLAYBOOK IN USE: " + input.playbook.title : "No verified playbook - be extra cautious."}

STEPS THEY WERE GIVEN:
${input.stepsIssued.map((s) => `${s.n}. ${s.action} (${s.whereExactly})`).join("\n")}

WHAT THEY REPORT:
"""${input.problem.slice(0, 900)}"""

Use web search to check the current interface if the problem is "I cannot find that option".

Diagnose it. The likely causes are: a permission or licence they lack, a different version or interface layout, they are on the wrong screen, a prerequisite was skipped, or an action was taken by mistake that needs undoing.

${RULES}

Return ONLY JSON:
{
  "diagnosis": "plain-language explanation of what has probably happened",
  "isBlocking": true,
  "undoNeeded": "if they clicked something wrong, exactly how to undo it - or empty string",
  "replacementSteps": [{"id":"r1","n":1,"action":"","whereExactly":"","whatYouShouldSee":"","ifYouDontSeeIt":"","confidence":"verified|likely|unverified","caution":""}],
  "askUser": "one question to narrow it down, if you genuinely cannot tell - otherwise empty string",
  "escalation": "if this needs their IT team or admin, say exactly what to ask for - otherwise empty string"
}`;
}

/* ----------------------------------------------------------- normalisation */

const s = (v: any, d = ""): string => (typeof v === "string" ? v.trim() : v == null ? d : String(v));
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const CONF: Confidence[] = ["verified", "likely", "unverified"];

function normStep(x: any, i: number, pid: string): Step {
  return {
    id: s(x?.id, `${pid}s${i + 1}`),
    n: typeof x?.n === "number" ? x.n : i + 1,
    action: s(x?.action),
    whereExactly: s(x?.whereExactly),
    whatYouShouldSee: s(x?.whatYouShouldSee),
    ifYouDontSeeIt: s(x?.ifYouDontSeeIt, "Tell the coach what you see instead and it will re-route you."),
    confidence: CONF.includes(x?.confidence) ? x.confidence : "likely",
    caution: s(x?.caution) || undefined,
  };
}

export function normalisePlan(o: any, playbook: Playbook | null, riskTier: RiskTier): CoachPlan {
  const phases: Phase[] = arr(o?.phases).map((p: any, i: number) => {
    const pid = s(p?.id, `p${i + 1}`);
    return {
      id: pid,
      name: s(p?.name, `Phase ${i + 1}`),
      goal: s(p?.goal),
      steps: arr(p?.steps).map((x: any, j: number) => normStep(x, j, pid)).filter((x: Step) => !!x.action),
      verify: {
        test: s(p?.verify?.test, "Confirm the phase goal has been achieved."),
        expected: s(p?.verify?.expected),
        ifItFails: s(p?.verify?.ifItFails, "Tell the coach what happened and it will diagnose it."),
      },
      rollback: s(p?.rollback, "Undo the changes made in this phase before continuing."),
    };
  }).filter((p: Phase) => p.steps.length > 0);

  const prereqs: Prereq[] = arr(o?.prerequisites).map((p: any, i: number) => ({
    id: s(p?.id, `pre${i + 1}`),
    question: s(p?.question),
    whyItMatters: s(p?.whyItMatters),
    howToCheck: s(p?.howToCheck),
    blocksIfMissing: p?.blocksIfMissing !== false,
  })).filter((p: Prereq) => !!p.question);

  const unverified = arr(o?.unverifiedAreas).map((x: any) => s(x)).filter(Boolean);
  // Any step the model itself marked unverified must surface at plan level too.
  for (const ph of phases) {
    for (const st of ph.steps) {
      if (st.confidence === "unverified") {
        const line = `"${st.action}" in ${ph.name} could not be confirmed against current documentation.`;
        if (!unverified.includes(line)) unverified.push(line);
      }
    }
  }

  return {
    title: s(o?.title, playbook?.title || "Automation plan"),
    understanding: s(o?.understanding),
    platforms: playbook?.platforms ?? [],
    riskTier,
    outcome: s(o?.outcome, playbook?.outcome || ""),
    timeEstimate: s(o?.timeEstimate, playbook?.timeEstimate || ""),
    recurrence: s(o?.recurrence),
    blastRadius: s(o?.blastRadius, playbook?.blastRadius || ""),
    rollbackSummary: s(o?.rollbackSummary),
    approvalNote: s(o?.approvalNote, playbook?.approvalNote || ""),
    prerequisites: prereqs.length ? prereqs : (playbook?.prerequisites ?? []),
    phases,
    docs: arr(o?.docs).map((d: any) => ({ label: s(d?.label), url: s(d?.url) }))
      .filter((d: DocLink) => /^https?:\/\//.test(d.url))
      .concat(playbook?.docs ?? [])
      .filter((d, i, a) => a.findIndex((x) => x.url === d.url) === i),
    cautions: arr(o?.cautions).map((x: any) => s(x)).filter(Boolean),
    unverifiedAreas: unverified,
    playbookId: playbook?.id ?? null,
    generatedFrom: playbook ? "playbook_adapted" : "generated",
  };
}

/* -------------------------------------------------------------- the runners */

export type CoachCaller = (prompt: string, useWebSearch: boolean) => Promise<string>;

export interface PlanResult {
  ok: boolean; plan: CoachPlan | null; error: string | null;
  stage: "researched" | "model_knowledge" | "playbook_only" | "failed";
  attempts: string[];
}

/** Fallback: the curated skeleton alone, honestly labelled. */
export function planFromPlaybookOnly(pb: Playbook, recurrence: string, riskTier: RiskTier): CoachPlan {
  return {
    title: pb.title,
    understanding: `Based on what you described, this matches our verified playbook: ${pb.summary}`,
    platforms: pb.platforms,
    riskTier,
    outcome: pb.outcome,
    timeEstimate: pb.timeEstimate,
    recurrence: recurrence || pb.recurrenceOptions[0],
    blastRadius: pb.blastRadius,
    rollbackSummary: "Each phase lists how to undo it. Work backwards through the phases you completed.",
    approvalNote: pb.approvalNote,
    prerequisites: pb.prerequisites,
    phases: pb.phaseOutline.map((p) => ({
      id: p.id, name: p.name, goal: p.goal,
      steps: [{
        id: `${p.id}s1`, n: 1,
        action: p.goal,
        whereExactly: "Detailed steps could not be generated. Follow the linked official documentation for this phase.",
        whatYouShouldSee: p.verify,
        ifYouDontSeeIt: "Tell the coach what you see and it will guide you from there.",
        confidence: "unverified" as Confidence,
        caution: "This outline came from our verified playbook, but the detailed click-by-click steps were not generated. Check the official documentation link before acting.",
      }],
      verify: { test: p.verify, expected: "As described above.", ifItFails: "Report what happened to the coach." },
      rollback: "Undo the changes made in this phase.",
    })),
    docs: pb.docs,
    cautions: ["Detailed steps were not generated - this is the verified outline only. Follow the documentation links closely."],
    unverifiedAreas: ["All detailed steps. Only the phase structure is verified."],
    playbookId: pb.id,
    generatedFrom: "playbook",
  };
}

export async function generatePlan(
  callAI: CoachCaller,
  input: { goal: string; platforms: string[]; recurrence: string; context?: string }
): Promise<PlanResult> {
  const attempts: string[] = [];
  const goal = (input.goal || "").trim();
  if (goal.length < 15) {
    return { ok: false, plan: null, stage: "failed", attempts,
      error: "Describe the automation in a bit more detail - what you do manually today, and what you want to happen instead." };
  }

  const match = matchPlaybook(goal, input.platforms);
  const riskTier = assessRisk(goal, match.playbook);
  const prompt = buildPlanPrompt({ ...input, playbook: match.playbook, riskTier });

  const rungs: Array<{ label: string; search: boolean; stage: PlanResult["stage"] }> = [
    { label: "Checked official docs", search: true, stage: "researched" },
    { label: "From model knowledge", search: false, stage: "model_knowledge" },
  ];

  for (const rung of rungs) {
    let raw = "";
    try {
      raw = await callAI(prompt, rung.search);
    } catch (e: any) {
      const msg = e?.message || "unknown error";
      attempts.push(`${rung.label}: THREW - ${msg}`);
      if (/invalid api key|401|no api key|quota|billing/i.test(msg)) {
        return { ok: false, plan: null, stage: "failed", attempts,
          error: "Your AI provider rejected the request: " + msg + " Fix the key in Settings and try again." };
      }
      continue;
    }
    if (!raw || !raw.trim()) { attempts.push(`${rung.label}: EMPTY reply`); continue; }

    const parsed = extractJSON(raw);
    if (!parsed) { attempts.push(`${rung.label}: UNPARSEABLE (${raw.length} chars) | starts: ${JSON.stringify(raw.slice(0, 140))}`); continue; }

    const plan = normalisePlan(parsed, match.playbook, riskTier);
    if (!plan.phases.length) { attempts.push(`${rung.label}: no usable phases`); continue; }

    attempts.push(`${rung.label}: success`);
    if (rung.stage !== "researched") {
      plan.cautions.unshift("Live documentation could not be checked, so these steps come from the model's own knowledge. Interfaces change - confirm each screen before acting.");
    }
    return { ok: true, plan, error: null, stage: rung.stage, attempts };
  }

  if (match.playbook) {
    attempts.push("Fell back to the verified playbook outline");
    return { ok: true, plan: planFromPlaybookOnly(match.playbook, input.recurrence, riskTier),
      error: null, stage: "playbook_only", attempts };
  }

  return { ok: false, plan: null, stage: "failed", attempts,
    error: "Could not build a plan, and no verified playbook matches this request. Try naming the exact tools involved - for example ServiceNow, Google Sheets, Power BI." };
}

export interface RecoveryResult {
  ok: boolean;
  diagnosis: string;
  undoNeeded: string;
  replacementSteps: Step[];
  askUser: string;
  escalation: string;
  error: string | null;
}

export async function recover(
  callAI: CoachCaller,
  input: { goal: string; platforms: string[]; phaseName: string; stepsIssued: Step[]; problem: string; playbook: Playbook | null }
): Promise<RecoveryResult> {
  const empty: RecoveryResult = { ok: false, diagnosis: "", undoNeeded: "", replacementSteps: [], askUser: "", escalation: "", error: null };
  try {
    const raw = await callAI(buildRecoveryPrompt(input), true);
    const parsed = extractJSON(raw || "");
    if (!parsed) return { ...empty, error: "The coach could not read its own reply. Describe the problem again in a sentence or two." };
    return {
      ok: true,
      diagnosis: s(parsed.diagnosis),
      undoNeeded: s(parsed.undoNeeded),
      replacementSteps: arr(parsed.replacementSteps).map((x: any, i: number) => normStep(x, i, "r")).filter((x: Step) => !!x.action),
      askUser: s(parsed.askUser),
      escalation: s(parsed.escalation),
      error: null,
    };
  } catch (e: any) {
    return { ...empty, error: e?.message || "The request failed. Try again." };
  }
}

/* -------------------------------------------------------------- progress */

export function phaseProgress(plan: CoachPlan | null, completed: string[]): { done: number; total: number; pct: number } {
  if (!plan) return { done: 0, total: 0, pct: 0 };
  const total = plan.phases.reduce((n, p) => n + p.steps.length, 0);
  const done = completed.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export const AUTOMATION_COACH_VERSION = "1.0.0";
