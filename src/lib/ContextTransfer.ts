// src/lib/ContextTransfer.ts
// ─────────────────────────────────────────────────────────────────────────────
// SEND TO ORCHESTRIQ — one mechanism, every module.
//
// Your document's section 10 is the important idea here and it is right:
// "Do not blindly inject the content into the destination module."
//
// So a transfer does NOT write into a ledger, a project or a campaign. It
// places a CANDIDATE in that module's inbox, carrying where it came from. The
// destination decides what to do with it, and can ask for what is missing —
// "I have the accounting treatment, but I need the amount, the date and the
// account classification before this touches your ledger."
//
// That distinction is what separates this from a copy-paste button, and it is
// also what protects you: a figure that reaches a ledger can be traced back to
// the model that produced it.
//
// EXTENSIBILITY: a destination is a string. Adding one is an entry in the list
// below — no schema change, no new code path, no new table.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

export interface Destination {
  id: string;        // must match the module's view id in App.tsx
  label: string;
  hint: string;      // what this module will do with it — shown to the user
}

/**
 * Every module a transfer can go to. The UI shows only those the user's plan
 * actually includes, so nobody is offered a destination they cannot open.
 */
export const DESTINATIONS: Destination[] = [
  { id: "ledger",   label: "General Ledger",     hint: "Proposes journal entries. Will ask for amount, date and account before posting." },
  { id: "nerve",    label: "AI Boardroom",       hint: "Executives debate this content and reach a single recommendation." },
  { id: "p3",       label: "Autopilot / Project Engine", hint: "Turns this into an execution plan, or runs it autonomously." },
  { id: "studio",   label: "Presentation Studio",hint: "Builds slides or a document from this." },
  { id: "agentic",  label: "Agentic AI",         hint: "Runs this as an autonomous chain of steps." },
  { id: "agents",   label: "AI Agents",          hint: "Hands this to a single agent to work on." },
  { id: "costarch", label: "Cost Architecture",  hint: "Uses this in unit cost and margin modelling." },
  { id: "dispatch", label: "Pulse Governance",   hint: "Adds this to the governance and SLA workspace." },
  { id: "workflow", label: "Workflow",           hint: "Starts a workflow chain from this." },
  { id: "finance",  label: "Finance",            hint: "Uses this in payables, receivables and cash planning." },
  { id: "actions",  label: "Tasks",              hint: "Creates trackable actions from this." },
  { id: "funding",  label: "Funding Intelligence",hint: "Uses this in fundraising analysis." },
  { id: "data",     label: "Data Hub",           hint: "Stores this as reference data." },
];

export interface TransferPayload {
  destination: string;
  title: string;
  content: string;
  provider?: string;
  model?: string;
  conversationId?: string;
  assetUrl?: string;
}

/**
 * Sends content to a module's inbox WITH its provenance.
 * Returns a plain-language result — never throws into the UI.
 */
export async function sendToModule(p: TransferPayload):
  Promise<{ ok: boolean; message: string }> {
  try {
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return { ok: false, message: "Your session has expired. Please sign in again." };
    if (!p.destination) return { ok: false, message: "Choose a destination first." };
    if (!(p.content || "").trim() && !p.assetUrl)
      return { ok: false, message: "There is nothing selected to send." };

    const { error } = await supabase.from("module_inbox").insert({
      user_id: uid,
      destination: p.destination,
      title: (p.title || "From Universal Workspace").slice(0, 160),
      content: (p.content || "").slice(0, 60000),
      // PROVENANCE. Without these four fields a transfer is anonymous text and
      // nobody can later answer "which model produced this number?"
      source: "workspace",
      source_provider: p.provider || null,
      source_model: p.model || null,
      source_conversation_id: p.conversationId || null,
      asset_url: p.assetUrl || null,
      status: "pending",
    });
    if (error) return { ok: false, message: error.message };

    const d = DESTINATIONS.find(x => x.id === p.destination);
    return { ok: true, message: "Sent to " + (d?.label || p.destination) +
      ". Open that module to review it — nothing has been applied automatically." };
  } catch (e: any) {
    return { ok: false, message: String(e?.message || e).slice(0, 200) };
  }
}

/** What a module should call to see what is waiting for it. */
export async function inboxFor(destination: string) {
  const { data, error } = await supabase.from("module_inbox")
    .select("*").eq("destination", destination).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(20);
  return error ? [] : (data || []);
}

/** How many items are waiting — for a badge on the module's menu entry. */
export async function inboxCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("module_inbox")
    .select("destination").eq("status", "pending");
  if (error || !data) return {};
  const out: Record<string, number> = {};
  data.forEach((r: any) => { out[r.destination] = (out[r.destination] || 0) + 1; });
  return out;
}

export async function markInbox(id: string, status: "accepted" | "rejected") {
  await supabase.from("module_inbox")
    .update({ status, accepted_at: status === "accepted" ? new Date().toISOString() : null })
    .eq("id", id);
}

/**
 * The header a destination module prepends when it uses transferred content.
 * This is what makes the module TREAT it as a candidate rather than as fact —
 * the wording is deliberate and it belongs in one place, not copied per module.
 */
export function provenanceHeader(item: any): string {
  return [
    "CONTENT TRANSFERRED FROM THE UNIVERSAL AI WORKSPACE",
    "Produced by: " + (item.source_provider || "unknown") + " / " + (item.source_model || "unknown"),
    "Transferred: " + new Date(item.created_at).toLocaleString(),
    "",
    "TREAT THIS AS A CANDIDATE, NOT AS VERIFIED DATA. It was generated by a",
    "language model in a general-purpose conversation and has not been checked",
    "against this business's records. Before acting on it, identify what you",
    "still need from the user and ask for it plainly.",
    "",
    "--- TRANSFERRED CONTENT ---",
    item.content || "",
  ].join("\n");
}

export default { DESTINATIONS, sendToModule, inboxFor, inboxCounts, markInbox, provenanceHeader };
