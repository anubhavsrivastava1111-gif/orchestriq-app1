import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { supabase } from "./lib/supabase";

/* ============================================================================
 * JARVIS 3.0 — AUTONOMOUS INTELLIGENCE / ORCHESTRATION LAYER
 *
 * Design:
 *
 *   USER GOAL
 *      ↓
 *   INTENT ENGINE
 *      ↓
 *   PLANNER
 *      ↓
 *   RESEARCH / OBSERVATION
 *      ↓
 *   TOOL EXECUTION
 *      ↓
 *   VERIFICATION
 *      ↓
 *   MEMORY
 *      ↓
 *   SELF-EVALUATION
 *      ↓
 *   IMPROVEMENT PROPOSAL
 *
 * This component deliberately separates:
 *
 *   OBSERVE
 *   ANALYZE
 *   PLAN
 *   EXECUTE
 *   VERIFY
 *   LEARN
 *
 * It does not grant arbitrary browser/OS execution privileges.
 * Consequential actions remain permission controlled.
 * ========================================================================== */

type Role = "user" | "assistant";

type ChatMsg = {
  role: Role;
  content: string;
};

type JarvisMode =
  | "chat"
  | "mission"
  | "signals"
  | "memory"
  | "approvals";

type RiskLevel =
  | "read_only"
  | "low_risk"
  | "consequential"
  | "dangerous";

type ToolDefinition = {
  name: string;
  description: string;
  input_schema: any;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  riskCategory?: string;
  handler: (input: any) => Promise<any>;
  executeApproved?: (input: any) => Promise<any>;
};

type MissionStep = {
  id: string;
  title: string;
  description: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "skipped"
    | "paused";
  tool?: string;
  result?: any;
  error?: string;
};

type Mission = {
  id: string;
  goal: string;
  status: "planning" | "running" | "completed" | "failed" | "paused";
  steps: MissionStep[];
  startedAt: string;
  completedAt?: string;
  summary?: string;
};

type Signal = {
  id: string;
  source_module: string;
  signal_type: string;
  severity: string;
  title: string;
  description: string;
  data: any;
  status: string;
  detected_at: string;
};

type Recommendation = {
  id: string;
  signal_id: string;
  root_cause: string;
  recommendation: string;
  confidence: string;
  provider?: string;
  model?: string;
  created_at: string;
};

type MemoryItem = {
  id: string;
  type:
    | "fact"
    | "decision"
    | "preference"
    | "lesson"
    | "project"
    | "failure"
    | "success";
  content: string;
  source: string;
  createdAt: string;
  importance: number;
};


type JarvisGateway = {
  getPlatformManifest?: () => Promise<any> | any;
  getRepositorySnapshot?: (input?: any) => Promise<any> | any;
  searchRepository?: (input: { query: string; path?: string; maxResults?: number }) => Promise<any> | any;
  inspectModule?: (input: { module: string; detail?: string }) => Promise<any> | any;
  getModuleSnapshot?: (input?: { modules?: string[] }) => Promise<any> | any;
};

declare global {
  interface Window {
    __ORCHESTRIQ_JARVIS_GATEWAY__?: JarvisGateway;
  }
}
type JarvisProps = {
  ask: (
    sys: any,
    msg: any,
    maxT: number,
    enableSearch?: boolean,
    taskType?: string,
    provider?: string,
    model?: string
  ) => Promise<string>;

  askWithTools?: (
    sys: string,
    userMsg: string,
    history: { role: string; content: string }[],
    tools: any[],
    onToolCall?: (name: string, input?: any) => void
  ) => Promise<string>;

  isOwner?: boolean;

  availableProviders?: Array<{
    id: string;
    label: string;
  }>;

  ledgerEntries?: any[];

  /**
   * Optional host-provided gateway. This is the secure bridge between JARVIS
   * and the rest of OrchestrIQ. It may expose read-only repository/module
   * inspection and separately controlled execution endpoints.
   */
  gateway?: JarvisGateway;
};

/* ============================================================================
 * CONFIGURATION
 * ========================================================================== */

const JARVIS_VERSION = "4.0.0";

const EXECUTION_POLICY = {
  allowReadOnly: true,
  allowLowRisk: true,
  requireApprovalForConsequential: true,
  requireOwnerApprovalForAllExternalWrites: true,
  allowDangerous: false,
  allowSelfModification: false,
};

const MAX_PLAN_STEPS = 8;
const MAX_TOOL_CALLS_PER_MISSION = 16;
const MAX_MEMORY_ITEMS = 100;
const MISSION_TIMEOUT_MS = 180000;

const C = {
  bg: "#070B14",
  panel: "#0F1420",
  raised: "#0A0E1A",
  line: "#1A2030",
  ink: "#F1F5F9",
  dim: "#A0AAC0",
  faint: "#5A6480",
  teal: "#14B8A6",
  amber: "#F59E0B",
  red: "#EF4444",
  green: "#22C55E",
};

const SEVERITY_COLOR: Record<string, string> = {
  low: C.dim,
  medium: C.amber,
  high: "#F97316",
  critical: C.red,
};

const TYPE_ICON: Record<string, string> = {
  anomaly: "⚠",
  risk: "⚠",
  opportunity: "◆",
  failure: "✕",
  bottleneck: "◌",
};

/* ============================================================================
 * PLATFORM KNOWLEDGE
 *
 * This remains useful as contextual knowledge, but JARVIS is explicitly told
 * that this is not a live representation of the repository.
 * ========================================================================== */

const ARCHITECTURE_BRIEFING = `
ORCHESTRIQ PLATFORM CONTEXT

Known architectural facts:

- App.tsx is a very large central application file and historically carries
  significant blast radius.
- main.tsx is the actual application entry point.
- Supabase authentication and database security are important platform
  boundaries.
- Cloudflare Pages Functions can exist separately from the browser application.
- NVIDIA shared infrastructure may have separate rate limits and permissions.
- Cost Architecture contains financial formulas whose correctness matters.
- Some historical parts of the platform evolved from local browser storage into
  cloud-backed infrastructure, so stale assumptions must be treated cautiously.
- Database row-level security is an important security boundary.
- JARVIS should never claim repository-level knowledge unless it has actually
  received repository data.
- JARVIS should distinguish:
    FACT
    OBSERVATION
    INFERENCE
    RECOMMENDATION
    UNKNOWN

The architecture briefing is contextual memory, NOT live repository access.

For live repository/module access, use the controlled JarvisGateway tools. If those tools report unavailable, say exactly what capability is missing. Never infer access from the fact that the JARVIS UI is embedded in the application.
`;

/* ============================================================================
 * UTILITY FUNCTIONS
 * ========================================================================== */

function uid(prefix = "jarvis"): string {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 9)
  );
}

function safeJson(value: any, max = 12000): string {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > max ? text.slice(0, max) + "\n...[truncated]" : text;
  } catch {
    return String(value);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function currentUserId(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id || null;
  } catch {
    return null;
  }
}

function extractJson(text: string): any | null {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*#_`]/g, "")
    .replace(/\n+/g, " ")
    .slice(0, 1200);
}

/* ============================================================================
 * LOCAL MEMORY
 *
 * This gives JARVIS a real structured memory layer without assuming that a
 * specific new Supabase table exists.
 *
 * If desired later, this can be migrated to a proper vector/knowledge store.
 * ========================================================================== */

const MEMORY_KEY = "orchestriq-jarvis-memory-v3";

function readLocalMemory(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalMemory(items: MemoryItem[]) {
  try {
    localStorage.setItem(
      MEMORY_KEY,
      JSON.stringify(items.slice(-MAX_MEMORY_ITEMS))
    );
  } catch {}
}

function remember(
  item: Omit<MemoryItem, "id" | "createdAt">
): MemoryItem {
  const memory: MemoryItem = {
    ...item,
    id: uid("memory"),
    createdAt: nowIso(),
  };

  const existing = readLocalMemory();

  const next = [
    ...existing.filter(
      (x) =>
        x.content.trim().toLowerCase() !==
        memory.content.trim().toLowerCase()
    ),
    memory,
  ];

  writeLocalMemory(next);

  return memory;
}

function retrieveMemory(query: string, limit = 8): MemoryItem[] {
  const items = readLocalMemory();

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((x) => x.length > 2);

  return items
    .map((item) => {
      const haystack = item.content.toLowerCase();

      let score = item.importance || 1;

      for (const term of terms) {
        if (haystack.includes(term)) score += 3;
      }

      return {
        item,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}

/* ============================================================================
 * CONTROLLED PLATFORM GATEWAY
 *
 * JARVIS cannot magically inspect source code or modules from a browser
 * component. The host application must expose a read-only gateway. We accept
 * it explicitly through props or through the documented window bridge.
 * No gateway means JARVIS reports the missing capability instead of guessing.
 * ========================================================================== */

function resolveGateway(explicit?: JarvisGateway): JarvisGateway | undefined {
  if (explicit) return explicit;
  try {
    return window.__ORCHESTRIQ_JARVIS_GATEWAY__;
  } catch {
    return undefined;
  }
}

async function callGateway<T>(
  fn: (() => Promise<T> | T) | undefined,
  missing: string
): Promise<any> {
  if (!fn) {
    return {
      available: false,
      capability: missing,
      reason: `JARVIS does not have the ${missing} gateway connected in this session.`,
      requiredIntegration: `Expose the ${missing} capability through JarvisGateway.`,
    };
  }
  try {
    const data = await fn();
    return { available: true, data };
  } catch (error: any) {
    return {
      available: false,
      capability: missing,
      error: error?.message || String(error),
    };
  }
}

/* ============================================================================
 * TOOL REGISTRY
 * ========================================================================== */

function buildJarvisTools(ctx: {
  ledgerEntries?: any[];
  isOwner?: boolean;
  gateway?: JarvisGateway;
}): ToolDefinition[] {
  const gateway = resolveGateway(ctx.gateway);

  const tools: ToolDefinition[] = [
    {
      name: "get_platform_access",
      description:
        "Determine exactly what live OrchestrIQ platform, module, repository, and execution capabilities are connected to JARVIS in this session. Use this before claiming access.",
      input_schema: { type: "object", properties: {}, required: [] },
      riskLevel: "read_only",
      requiresApproval: false,
      handler: async () => {
        const manifest = await callGateway(
          gateway?.getPlatformManifest,
          "platform manifest"
        );
        return {
          session_authenticated: Boolean(await currentUserId()),
          gateway_connected: Boolean(gateway),
          gateway_manifest: manifest,
          built_in_capabilities: [
            "JARVIS conversation history",
            "JARVIS structured memory",
            "JARVIS signals",
            "Cost Architecture signal detector",
            "platform statistics snapshot",
            "loaded General Ledger session data",
            "Live Boardroom session metadata",
            "AI Workspace conversation metadata",
          ],
          repository_access: Boolean(gateway?.getRepositorySnapshot || gateway?.searchRepository),
          module_inspection: Boolean(gateway?.inspectModule || gateway?.getModuleSnapshot),
          write_authority: "OWNER_APPROVAL_REQUIRED",
          dangerous_operations: "BLOCKED",
        };
      },
    },
    {
      name: "get_repository_snapshot",
      description:
        "Read a repository-wide snapshot supplied by the OrchestrIQ host gateway. This is observational only and never edits code.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          maxChars: { type: "number" },
        },
        required: [],
      },
      riskLevel: "read_only",
      requiresApproval: false,
      handler: async (input: any) => {
        return callGateway(
          gateway?.getRepositorySnapshot
            ? () => gateway.getRepositorySnapshot?.(input)
            : undefined,
          "repository access"
        );
      },
    },
    {
      name: "search_codebase",
      description:
        "Search the connected OrchestrIQ repository for files, symbols, components, APIs, database calls, configuration, or other code. Read-only.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          path: { type: "string" },
          maxResults: { type: "number" },
        },
        required: ["query"],
      },
      riskLevel: "read_only",
      requiresApproval: false,
      handler: async (input: any) => {
        if (!gateway?.searchRepository) {
          return {
            available: false,
            capability: "repository search",
            reason: "No repository search gateway is connected.",
          };
        }
        try {
          return {
            available: true,
            data: await gateway.searchRepository({
              query: String(input?.query || ""),
              path: input?.path ? String(input.path) : undefined,
              maxResults: Math.min(100, Math.max(1, Number(input?.maxResults) || 25)),
            }),
          };
        } catch (error: any) {
          return { available: false, error: error?.message || String(error) };
        }
      },
    },
    {
      name: "inspect_module",
      description:
        "Inspect a named OrchestrIQ module through the connected host gateway. Use this when the owner asks what a module does, what is broken, or what data/code it currently exposes.",
      input_schema: {
        type: "object",
        properties: {
          module: { type: "string" },
          detail: { type: "string" },
        },
        required: ["module"],
      },
      riskLevel: "read_only",
      requiresApproval: false,
      handler: async (input: any) => {
        if (!gateway?.inspectModule) {
          return {
            available: false,
            capability: "module inspection",
            requested_module: input?.module,
            reason: "No module inspection gateway is connected.",
          };
        }
        try {
          return {
            available: true,
            data: await gateway.inspectModule({
              module: String(input?.module || ""),
              detail: input?.detail ? String(input.detail) : undefined,
            }),
          };
        } catch (error: any) {
          return { available: false, error: error?.message || String(error) };
        }
      },
    },
    {
      name: "get_module_snapshot",
      description:
        "Read current snapshots for one or more OrchestrIQ modules through the host gateway. Read-only.",
      input_schema: {
        type: "object",
        properties: {
          modules: { type: "array", items: { type: "string" } },
        },
        required: [],
      },
      riskLevel: "read_only",
      requiresApproval: false,
      handler: async (input: any) => {
        if (!gateway?.getModuleSnapshot) {
          return {
            available: false,
            capability: "module snapshot",
            reason: "No module snapshot gateway is connected.",
          };
        }
        try {
          const modules = Array.isArray(input?.modules)
            ? input.modules.map(String).slice(0, 50)
            : undefined;
          return { available: true, data: await gateway.getModuleSnapshot({ modules }) };
        } catch (error: any) {
          return { available: false, error: error?.message || String(error) };
        }
      },
    },
    {
      name: "create_code_improvement_proposal",
      description:
        "Record a proposed code or architecture improvement. This NEVER edits, commits, deploys, or overwrites production code.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          problem: { type: "string" },
          proposed_change: { type: "string" },
          expected_benefit: { type: "string" },
          verification_plan: { type: "string" },
        },
        required: ["title", "problem", "proposed_change", "expected_benefit", "verification_plan"],
      },
      riskLevel: "low_risk",
      requiresApproval: false,
      handler: async (input: any) => {
        const proposal = {
          id: uid("code_proposal"),
          createdAt: nowIso(),
          ...input,
          status: "proposal_only",
          execution: "blocked_until_owner_approval",
        };
        const key = "orchestriq-jarvis-code-proposals-v4";
        try {
          const existing = JSON.parse(localStorage.getItem(key) || "[]");
          localStorage.setItem(key, JSON.stringify([...existing, proposal].slice(-100)));
        } catch {}
        return { recorded: true, proposal };
      },
    },
    {
      name: "get_open_signals",

      description:
        "Read the current unresolved JARVIS signals from Supabase. Use when investigating current platform problems.",

      input_schema: {
        type: "object",
        properties: {},
        required: [],
      },

      riskLevel: "read_only",
      requiresApproval: false,

      handler: async () => {
        const uid = await currentUserId();

        if (!uid) return { error: "Not signed in" };

        const { data, error } = await supabase
          .from("jarvis_lab_signals")
          .select(
            "id,title,severity,source_module,signal_type,description,data,status,detected_at"
          )
          .eq("user_id", uid)
          .not("status", "in.(dismissed,resolved)")
          .order("severity", { ascending: false })
          .limit(50);

        if (error) {
          return {
            error: error.message,
          };
        }

        return {
          open_signal_count: data?.length || 0,
          signals: data || [],
        };
      },
    },

    {
      name: "get_cost_anomalies",

      description:
        "Run the existing Cost Architecture anomaly detector and return recent cost signals.",

      input_schema: {
        type: "object",
        properties: {},
        required: [],
      },

      riskLevel: "read_only",
      requiresApproval: false,

      handler: async () => {
        const uid = await currentUserId();

        if (!uid) return { error: "Not signed in" };

        const { data, error } = await supabase.rpc(
          "jarvis_lab_detect_cost_signals",
          {
            p_user_id: uid,
          }
        );

        if (error) {
          return {
            error: error.message,
          };
        }

        const { data: recent } = await supabase
          .from("jarvis_lab_signals")
          .select("title,description,data,severity,detected_at")
          .eq("user_id", uid)
          .eq("source_module", "cost_architecture")
          .order("detected_at", { ascending: false })
          .limit(20);

        return {
          new_anomalies_found_this_check: data ?? 0,
          current_cost_signals: recent || [],
        };
      },
    },

    {
      name: "get_ledger_status",

      description:
        "Check loaded General Ledger entries and identify entries where total debits and credits do not balance.",

      input_schema: {
        type: "object",
        properties: {},
        required: [],
      },

      riskLevel: "read_only",
      requiresApproval: false,

      handler: async () => {
        const entries = ctx.ledgerEntries || [];

        if (!entries.length) {
          return {
            available: false,
            reason:
              "No ledger entries are loaded in this browser session.",
          };
        }

        const imbalanced = entries.filter((entry: any) => {
          const debits = (entry.lines || []).reduce(
            (sum: number, line: any) =>
              sum + (Number(line.debit) || 0),
            0
          );

          const credits = (entry.lines || []).reduce(
            (sum: number, line: any) =>
              sum + (Number(line.credit) || 0),
            0
          );

          return Math.abs(debits - credits) > 0.01;
        });

        return {
          available: true,
          checked_this_session_only: true,
          total_entries: entries.length,
          imbalanced_entries: imbalanced.map((entry: any) => ({
            id: entry.id,
            date: entry.date,
            narration: entry.narration,
          })),
          imbalanced_count: imbalanced.length,
        };
      },
    },

    {
      name: "get_platform_stats",

      description:
        "Read current platform statistics using the existing Supabase snapshot RPC.",

      input_schema: {
        type: "object",
        properties: {},
        required: [],
      },

      riskLevel: "read_only",
      requiresApproval: false,

      handler: async () => {
        const uid = await currentUserId();

        if (!uid) return { error: "Not signed in" };

        const { data, error } = await supabase.rpc(
          "jarvis_platform_snapshot",
          {
            p_user_id: uid,
          }
        );

        if (error) {
          return {
            error: error.message,
          };
        }

        return data || {};
      },
    },

    // NEW — genuinely server-side, confirmed directly against the schema
    // before writing these, not assumed. Finance and Ledger are NOT
    // included here because both were confirmed to store data only in
    // browser localStorage (via WorkspaceMemory) — a real tool for either
    // would have nothing to actually query server-side.
    {
      name: "get_boardroom_status",
      description:
        "Read the current user's Live Boardroom sessions from Supabase — objective, status, whether paused, and any question currently awaiting the user's answer.",
      input_schema: { type: "object", properties: {}, required: [] },
      riskLevel: "read_only",
      requiresApproval: false,
      handler: async () => {
        const uid = await currentUserId();
        if (!uid) return { error: "Not signed in" };
        const { data, error } = await supabase
          .from("boardroom_sessions")
          .select("id,objective,status,paused,pending_question,updated_at")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(10);
        if (error) return { error: error.message };
        return { session_count: data?.length || 0, sessions: data || [] };
      },
    },

    {
      name: "get_workspace_activity",
      description:
        "Read the current user's recent AI Workspace conversations from Supabase — titles, which provider/model was used, and when each was last active. Does not read message content, only conversation metadata.",
      input_schema: { type: "object", properties: {}, required: [] },
      riskLevel: "read_only",
      requiresApproval: false,
      handler: async () => {
        const uid = await currentUserId();
        if (!uid) return { error: "Not signed in" };
        const { data, error } = await supabase
          .from("workspace_conversations")
          .select("title,provider,model,updated_at")
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .limit(10);
        if (error) return { error: error.message };
        return { conversation_count: data?.length || 0, recent_conversations: data || [] };
      },
    },

    {
      name: "retrieve_memory",

      description:
        "Retrieve relevant structured JARVIS memories from the current user's local memory store.",

      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
          },
        },
        required: ["query"],
      },

      riskLevel: "read_only",
      requiresApproval: false,

      handler: async (input: any) => {
        return {
          memories: retrieveMemory(String(input?.query || ""), 10),
        };
      },
    },

    {
      name: "remember_lesson",

      description:
        "Store an important lesson, decision, fact, success, failure, preference, or project fact for future JARVIS sessions.",

      input_schema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "fact",
              "decision",
              "preference",
              "lesson",
              "project",
              "failure",
              "success",
            ],
          },

          content: {
            type: "string",
          },

          importance: {
            type: "number",
          },
        },

        required: ["type", "content"],
      },

      riskLevel: "low_risk",
      requiresApproval: false,

      handler: async (input: any) => {
        const memory = remember({
          type: input.type || "lesson",
          content: String(input.content || "").trim(),
          source: "jarvis",
          importance: Math.max(
            1,
            Math.min(10, Number(input.importance) || 5)
          ),
        });

        return {
          remembered: true,
          memory,
        };
      },
    },

    {
      name: "dismiss_signal",

      description:
        "Dismiss one JARVIS signal belonging to the current user.",

      input_schema: {
        type: "object",
        properties: {
          signal_id: {
            type: "string",
          },
        },
        required: ["signal_id"],
      },

      riskLevel: "low_risk",
      requiresApproval: false,

      handler: async (input: any) => {
        const uid = await currentUserId();

        if (!uid) return { error: "Not signed in" };

        const { error } = await supabase
          .from("jarvis_lab_signals")
          .update({
            status: "dismissed",
          })
          .eq("id", input.signal_id)
          .eq("user_id", uid);

        if (error) {
          return {
            error: error.message,
          };
        }

        return {
          dismissed: true,
          signal_id: input.signal_id,
        };
      },
    },

    {
      name: "propose_resource_price_update",

      description:
        "Create an approval proposal for a Cost Architecture resource price update. This does not execute immediately.",

      input_schema: {
        type: "object",

        properties: {
          resource_id: {
            type: "string",
          },

          resource_name: {
            type: "string",
          },

          new_price: {
            type: "number",
          },

          reasoning: {
            type: "string",
          },
        },

        required: [
          "resource_id",
          "resource_name",
          "new_price",
          "reasoning",
        ],
      },

      riskLevel: "consequential",
      requiresApproval: true,
      riskCategory: "financial",

      // Conversation/mission phase: create a pending approval only.
      handler: async (input: any) => {
        const uid = await currentUserId();

        if (!uid) return { error: "Not signed in" };

        const { data, error } = await supabase
          .from("jarvis_lab_approvals")
          .insert({
            user_id: uid,
            tool_name: "propose_resource_price_update",
            risk_category: "financial",
            reasoning: input.reasoning,
            proposed_input: input,
            status: "pending",
            created_at: nowIso(),
          })
          .select()
          .single();

        if (error) {
          return {
            error: error.message,
          };
        }

        return {
          queued_for_owner_approval: true,
          approval: data,
        };
      },

      // Execution phase: ONLY called from the owner approval handler.
      executeApproved: async (input: any) => {
        const uid = await currentUserId();
        if (!uid) return { error: "Not signed in" };
        const { error } = await supabase.from("ca_price_history").insert({
          user_id: uid,
          resource_id: input.resource_id,
          price: input.new_price,
          effective_date: new Date().toISOString().slice(0, 10),
          source: "jarvis_lab_approved",
        });
        if (error) return { error: error.message };
        return {
          updated: true,
          resource_id: input.resource_id,
          new_price: input.new_price,
        };
      },
    },

    {
      name: "create_improvement_proposal",

      description:
        "Create a structured self-improvement proposal. This only records the proposal; it never modifies production code.",

      input_schema: {
        type: "object",

        properties: {
          title: {
            type: "string",
          },

          problem: {
            type: "string",
          },

          proposed_change: {
            type: "string",
          },

          expected_benefit: {
            type: "string",
          },

          verification_plan: {
            type: "string",
          },
        },

        required: [
          "title",
          "problem",
          "proposed_change",
          "expected_benefit",
          "verification_plan",
        ],
      },

      riskLevel: "low_risk",
      requiresApproval: false,

      handler: async (input: any) => {
        const proposal = {
          id: uid("improvement"),
          createdAt: nowIso(),
          ...input,
          status: "proposal_only",
        };

        const existing = (() => {
          try {
            return JSON.parse(
              localStorage.getItem(
                "orchestriq-jarvis-improvements-v3"
              ) || "[]"
            );
          } catch {
            return [];
          }
        })();

        try {
          localStorage.setItem(
            "orchestriq-jarvis-improvements-v3",
            JSON.stringify([...existing, proposal].slice(-50))
          );
        } catch {}

        return {
          recorded: true,
          proposal,
        };
      },
    },
  ];

  return tools;
}

/* ============================================================================
 * TOOL EXECUTION
 * ========================================================================== */

async function executeTool(
  tool: ToolDefinition,
  input: any
): Promise<any> {
  if (tool.riskLevel === "dangerous") {
    return {
      blocked: true,
      reason: "Dangerous operations are disabled by JARVIS policy.",
    };
  }

  // A consequential tool's normal handler is a proposal/approval request.
  // It is never the real write path. Real writes are reachable only through
  // executeApproved(), called after an owner approval record is verified.
  return tool.handler(input);
}

/* ============================================================================
 * SYSTEM PROMPT
 * ========================================================================== */

function buildSystemPrompt(args: {
  isOwner?: boolean;
  memories: MemoryItem[];
  mission?: Mission | null;
}): string {
  return `
You are JARVIS ${JARVIS_VERSION}, the operating intelligence layer of OrchestrIQ.

You are not a generic chatbot.

Your responsibilities are:

1. Understand the user's actual objective.
2. Determine what information is missing.
3. Retrieve information when tools are available.
4. Research current information when required.
5. Plan multi-step work when appropriate.
6. Use tools instead of inventing data.
7. Distinguish facts from inference.
8. Verify important results.
9. Record durable lessons when appropriate.
10. Identify opportunities to improve the system.
11. Never claim to have performed an action that did not happen.

CURRENT AUTHORITY:
${args.isOwner ? "The user is the platform owner." : "The user is a platform user."}

OPERATING PRINCIPLES:

FACT:
Only information directly supported by available data.

OBSERVATION:
Something directly discovered through a tool or current context.

INFERENCE:
A conclusion derived from observations.

RECOMMENDATION:
A proposed action, not an executed action.

UNKNOWN:
Information you do not currently possess.

Never manufacture facts.

Never claim repository access unless repository data was actually supplied.

Never claim internet access unless current search/research actually occurred.

Never claim code execution unless a real execution tool returned a result.

Never claim deployment unless a real deployment mechanism returned success.

When a request requires capabilities that are unavailable, explicitly identify the missing capability.

AUTONOMY:

You may reason autonomously.

You may plan autonomously.

You may research when current information is needed.

You may use permitted read-only tools.

You may store low-risk structured memories.

Consequential actions require explicit owner approval.

Any external write, configuration change, code change, deployment, financial action, data mutation, or permission change requires explicit owner approval.

Dangerous actions are blocked.

The owner approval is an authority boundary, not a conversational preference. Never bypass it by using another tool, another provider, a mission loop, or a self-improvement mechanism.

Self-modification is proposal-only.

SELF-IMPROVEMENT:

You should continuously look for:

- repeated failures
- repeated user corrections
- inefficient workflows
- missing tools
- stale assumptions
- unnecessary model calls
- weak prompts
- missing verification
- opportunities for automation
- opportunities to improve reliability

However:

DO NOT directly rewrite your production source code.

Create an improvement proposal instead.

The improvement proposal must contain:

PROBLEM
PROPOSED CHANGE
EXPECTED BENEFIT
VERIFICATION PLAN

MEMORY:

Relevant prior memories are supplied below.

${safeJson(args.memories)}

PLATFORM CONTEXT:

${ARCHITECTURE_BRIEFING}

${
  args.mission
    ? `
CURRENT MISSION:

${safeJson(args.mission)}
`
    : ""
}

STYLE:

Be direct.

Do not produce generic corporate language.

Prefer concrete findings.

When several steps are required, explain the plan briefly.

If the user asks you to execute something, distinguish:
- what you can execute now
- what requires approval
- what infrastructure is missing

Your goal is to be useful, truthful, autonomous within permissions, and continuously improvable.
`;
}

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export default function JarvisLab({
  ask,
  askWithTools,
  isOwner,
  availableProviders,
  ledgerEntries,
  gateway,
}: JarvisProps) {
  const jarvisTools = useMemo(
    () =>
      buildJarvisTools({
        ledgerEntries,
        isOwner,
        gateway,
      }),
    [ledgerEntries, isOwner, gateway]
  );

  const [view, setView] = useState<JarvisMode>("chat");

  const [messages, setMessages] = useState<ChatMsg[]>([]);

  const [chatInput, setChatInput] = useState("");

  const [thinking, setThinking] = useState(false);

  const [toolActivity, setToolActivity] = useState<string | null>(
    null
  );

  const [provider, setProvider] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [voiceOn, setVoiceOn] = useState(true);

  const [listening, setListening] = useState(false);

  const [wakeWordOn, setWakeWordOn] = useState(false);

  const [lastHeard, setLastHeard] = useState("");

  const [wakeError, setWakeError] = useState<string | null>(
    null
  );

  const [signals, setSignals] = useState<Signal[]>([]);

  const [recos, setRecos] = useState<
    Record<string, Recommendation>
  >({});

  const [pendingApprovals, setPendingApprovals] = useState<any[]>(
    []
  );

  const [decidingId, setDecidingId] = useState<string | null>(
    null
  );

  const [filter, setFilter] = useState("all");

  const [scanning, setScanning] = useState(false);

  const [diagnosing, setDiagnosing] = useState<string | null>(
    null
  );

  const [loadingHistory, setLoadingHistory] = useState(true);

  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>(
    []
  );

  const [mission, setMission] = useState<Mission | null>(null);

  const [missionGoal, setMissionGoal] = useState("");

  const [missionLog, setMissionLog] = useState<string[]>([]);

  const [autoMode, setAutoMode] = useState(false);

  const [selectedMissionStep, setSelectedMissionStep] =
    useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  const recognitionRef = useRef<any>(null);

  const wakeRecognitionRef = useRef<any>(null);

  const wakeWordOnRef = useRef(false);

  const mountedRef = useRef(true);

  /* --------------------------------------------------------------------------
   * TOOL LABELS
   * ------------------------------------------------------------------------ */

  const TOOL_LABELS: Record<string, string> = {
    get_open_signals: "Checking current platform issues…",
    get_cost_anomalies: "Checking Cost Architecture…",
    get_ledger_status: "Checking the General Ledger…",
    get_platform_stats: "Checking live platform statistics…",
    retrieve_memory: "Retrieving relevant memory…",
    remember_lesson: "Updating JARVIS memory…",
    dismiss_signal: "Updating the signal…",
    propose_resource_price_update:
      "Preparing the financial approval request…",
    create_improvement_proposal:
      "Recording a self-improvement proposal…",
  };

  /* --------------------------------------------------------------------------
   * INITIALIZATION
   * ------------------------------------------------------------------------ */

  useEffect(() => {
    mountedRef.current = true;

    setMemoryItems(readLocalMemory());

    return () => {
      mountedRef.current = false;

      try {
        recognitionRef.current?.stop();
        wakeRecognitionRef.current?.stop();
        window.speechSynthesis?.cancel();
      } catch {}
    };
  }, []);

  /* --------------------------------------------------------------------------
   * SCROLL
   * ------------------------------------------------------------------------ */

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, thinking, mission]);

  /* --------------------------------------------------------------------------
   * LOAD CHAT
   * ------------------------------------------------------------------------ */

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (active) setLoadingHistory(false);
          return;
        }

        const { data } = await supabase
          .from("jarvis_lab_conversations")
          .select("role,content")
          .eq("user_id", user.id)
          .order("created_at", {
            ascending: true,
          })
          .limit(80);

        if (!active) return;

        setMessages(
          (data || []).map((m: any) => ({
            role: m.role,
            content: m.content,
          }))
        );
      } catch (e) {
        console.warn("[JARVIS] history load failed", e);
      } finally {
        if (active) setLoadingHistory(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /* --------------------------------------------------------------------------
   * SAVE MESSAGE
   * ------------------------------------------------------------------------ */

  const saveMsg = useCallback(
    async (role: Role, content: string) => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        await supabase.from("jarvis_lab_conversations").insert({
          user_id: user.id,
          role,
          content,
          provider: provider || null,
        });
      } catch {}
    },
    [provider]
  );

  /* --------------------------------------------------------------------------
   * VOICE OUTPUT
   * ------------------------------------------------------------------------ */

  const speak = useCallback(
    (text: string) => {
      if (!voiceOn) return;

      if (!("speechSynthesis" in window)) return;

      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(
          cleanForSpeech(text)
        );

        utterance.rate = 1.02;

        window.speechSynthesis.speak(utterance);
      } catch {}
    },
    [voiceOn]
  );

  /* --------------------------------------------------------------------------
   * PUSH TO TALK
   * ------------------------------------------------------------------------ */

  const toggleListen = () => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      setError(
        "Voice input is not supported in this browser. Try Chrome or Edge."
      );
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();

    rec.lang = "en-US";

    rec.interimResults = false;

    rec.onresult = (event: any) => {
      const transcript =
        event?.results?.[0]?.[0]?.transcript || "";

      setChatInput((previous) =>
        previous ? previous + " " + transcript : transcript
      );
    };

    rec.onerror = () => {
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
    };

    recognitionRef.current = rec;

    try {
      rec.start();

      setListening(true);
    } catch {
      setListening(false);
    }
  };

  /* --------------------------------------------------------------------------
   * WAKE WORD
   * ------------------------------------------------------------------------ */

  const [customWakePhrase, setCustomWakePhrase] =
    useState<string | null>(() => {
      try {
        return localStorage.getItem(
          "jarvis-lab-wake-phrase"
        );
      } catch {
        return null;
      }
    });

  const effectiveWakePhrase = (
    customWakePhrase || "jarvis"
  ).toLowerCase();

  const startWakeListener = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      setWakeError(
        "This browser does not support continuous voice recognition."
      );

      setWakeWordOn(false);

      wakeWordOnRef.current = false;

      return;
    }

    const rec = new SR();

    rec.lang = "en-US";

    rec.continuous = true;

    rec.interimResults = true;

    rec.onresult = (event: any) => {
      const last =
        event.results[event.results.length - 1];

      const heard =
        last?.[0]?.transcript?.toLowerCase() || "";

      setLastHeard(heard);

      if (heard.includes(effectiveWakePhrase)) {
        try {
          rec.stop();
        } catch {}

        setChatInput((previous) =>
          previous ? previous + " " : ""
        );
      }
    };

    rec.onend = () => {
      if (wakeWordOnRef.current) {
        try {
          rec.start();
        } catch {}
      }
    };

    rec.onerror = (event: any) => {
      const reason = event?.error || "unknown";

      if (
        reason === "not-allowed" ||
        reason === "service-not-allowed"
      ) {
        setWakeError(
          "Microphone access is blocked. Allow microphone access for this site."
        );

        setWakeWordOn(false);

        wakeWordOnRef.current = false;

        return;
      }

      if (wakeWordOnRef.current) {
        try {
          rec.start();
        } catch {}
      }
    };

    wakeRecognitionRef.current = rec;

    try {
      rec.start();
    } catch {
      setWakeError("Unable to start wake-word listening.");

      setWakeWordOn(false);

      wakeWordOnRef.current = false;
    }
  }, [effectiveWakePhrase]);

  const toggleWakeWord = () => {
    const next = !wakeWordOn;

    wakeWordOnRef.current = next;

    setWakeWordOn(next);

    if (next) {
      startWakeListener();
    } else {
      try {
        wakeRecognitionRef.current?.stop();
      } catch {}
    }
  };

  /* --------------------------------------------------------------------------
   * DATA LOADING
   * ------------------------------------------------------------------------ */

  const loadSignals = useCallback(async () => {
    const { data: sigs } = await supabase
      .from("jarvis_lab_signals")
      .select("*")
      .neq("status", "dismissed")
      .order("detected_at", {
        ascending: false,
      });

    setSignals(sigs || []);

    const { data: recommendations } = await supabase
      .from("jarvis_lab_recommendations")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    const byId: Record<string, Recommendation> = {};

    (recommendations || []).forEach((item: any) => {
      if (!byId[item.signal_id]) {
        byId[item.signal_id] = item;
      }
    });

    setRecos(byId);
  }, []);

  useEffect(() => {
    loadSignals();
  }, [loadSignals]);

  const loadApprovals = useCallback(async () => {
    const uid = await currentUserId();

    if (!uid) return;

    const { data } = await supabase
      .from("jarvis_lab_approvals")
      .select("*")
      .eq("user_id", uid)
      .eq("status", "pending")
      .order("created_at", {
        ascending: false,
      });

    setPendingApprovals(data || []);
  }, []);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  /* --------------------------------------------------------------------------
   * MEMORY REFRESH
   * ------------------------------------------------------------------------ */

  const refreshMemory = () => {
    setMemoryItems(readLocalMemory());
  };

  /* --------------------------------------------------------------------------
   * TOOL CALL LOGGING
   * ------------------------------------------------------------------------ */

  const logToolCall = async (
    toolName: string,
    input: any,
    output: any,
    error?: string
  ) => {
    try {
      const uid = await currentUserId();

      if (!uid) return;

      await supabase.from("jarvis_lab_tool_calls").insert({
        user_id: uid,
        tool_name: toolName,
        input,
        output,
        error: error || null,
      });
    } catch {}
  };

  /* --------------------------------------------------------------------------
   * CHAT ENGINE
   * ------------------------------------------------------------------------ */

  const sendChat = async (text?: string) => {
    const userText = (text ?? chatInput).trim();

    if (!userText || thinking) return;

    setChatInput("");

    setThinking(true);

    setError(null);

    setToolActivity(null);

    const nextMessages = [
      ...messages,
      {
        role: "user" as Role,
        content: userText,
      },
    ];

    setMessages(nextMessages);

    await saveMsg("user", userText);

    try {
      const memories = retrieveMemory(userText, 8);

      const history = nextMessages
        .slice(-16)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      const systemPrompt = buildSystemPrompt({
        isOwner,
        memories,
        mission,
      });

      if (askWithTools) {
        try {
          const reply = await Promise.race([
            askWithTools(
              systemPrompt,
              userText,
              history,
              jarvisTools,
              (name) => {
                setToolActivity(
                  TOOL_LABELS[name] ||
                    `Using ${name}…`
                );
              }
            ),

            new Promise<string>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      "JARVIS tool execution timed out."
                    )
                  ),
                90000
              )
            ),
          ]);

          if (!mountedRef.current) return;

          setToolActivity(null);

          setMessages((previous) => [
            ...previous,
            {
              role: "assistant",
              content: reply,
            },
          ]);

          await saveMsg("assistant", reply);

          speak(reply);

          refreshMemory();

          setThinking(false);

          return;
        } catch (toolError: any) {
          console.warn(
            "[JARVIS] tool mode failed; falling back",
            toolError
          );
        }
      }

      const fallbackReply = await Promise.race([
        ask(
          systemPrompt,
          history,
          1800,
          true,
          "jarvis",
          provider || undefined
        ),

        new Promise<string>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "JARVIS did not respond within the allowed time."
                )
              ),
            90000
          )
        ),
      ]);

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: fallbackReply,
        },
      ]);

      await saveMsg("assistant", fallbackReply);

      speak(fallbackReply);
    } catch (e: any) {
      const message =
        e?.message || "Unknown JARVIS error.";

      setError(message);

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            "I could not complete that request.\n\nReason: " +
            message,
        },
      ]);
    } finally {
      if (mountedRef.current) {
        setToolActivity(null);
        setThinking(false);
      }
    }
  };

  /* ==========================================================================
   * AUTONOMOUS MISSION ENGINE
   * ======================================================================== */

  const createMissionPlan = async (
    goal: string
  ): Promise<MissionStep[]> => {
    const memories = retrieveMemory(goal, 10);

    const planningPrompt = `
You are JARVIS's planning engine.

Convert the user's objective into a practical execution plan.

OBJECTIVE:
${goal}

RELEVANT MEMORY:
${safeJson(memories)}

AVAILABLE CAPABILITIES:
${jarvisTools
  .map(
    (tool) =>
      `- ${tool.name}: ${tool.description} [${tool.riskLevel}]`
  )
  .join("\n")}

Return ONLY valid JSON:

{
  "steps": [
    {
      "title": "short step name",
      "description": "what this step accomplishes",
      "tool": "tool name or null"
    }
  ]
}

Rules:

- Maximum ${MAX_PLAN_STEPS} steps.
- Do not invent tools.
- Use read-only tools to gather facts.
- Use low-risk tools only when useful.
- Consequential tools may be proposed but must require approval.
- Include a verification step when the mission produces an important result.
- Do not claim that unavailable capabilities exist.
`;

    const raw = await ask(
      planningPrompt,
      [
        {
          role: "user",
          content: goal,
        },
      ],
      1400,
      true,
      "jarvis_planning",
      provider || undefined
    );

    const parsed = extractJson(raw);

    if (!parsed?.steps || !Array.isArray(parsed.steps)) {
      return [
        {
          id: uid("step"),
          title: "Analyze objective",
          description:
            "Analyze the user's objective and identify the information required.",
          status: "pending",
        },
        {
          id: uid("step"),
          title: "Research and inspect",
          description:
            "Gather available evidence and current information.",
          status: "pending",
        },
        {
          id: uid("step"),
          title: "Produce result",
          description:
            "Synthesize the findings and provide the best available result.",
          status: "pending",
        },
        {
          id: uid("step"),
          title: "Verify",
          description:
            "Check the result for unsupported assumptions or errors.",
          status: "pending",
        },
      ];
    }

    return parsed.steps
      .slice(0, MAX_PLAN_STEPS)
      .map((step: any) => ({
        id: uid("step"),
        title: String(step.title || "Unnamed step"),
        description: String(
          step.description || ""
        ),
        tool:
          typeof step.tool === "string"
            ? step.tool
            : undefined,
        status: "pending" as const,
      }));
  };

  const executeMissionStep = async (
    activeMission: Mission,
    step: MissionStep
  ): Promise<any> => {
    setMissionLog((previous) => [
      ...previous,
      `Starting: ${step.title}`,
    ]);

    if (step.tool) {
      const tool = jarvisTools.find(
        (candidate) => candidate.name === step.tool
      );

      if (!tool) {
        return {
          success: false,
          error: `Tool '${step.tool}' does not exist.`,
        };
      }

      if (tool.riskLevel === "dangerous") {
        return {
          success: false,
          blocked: true,
          error:
            "Dangerous operation blocked by JARVIS policy.",
        };
      }

      if (
        tool.requiresApproval ||
        tool.riskLevel === "consequential"
      ) {
        // THE ACTUAL FIX: this used to just stop with an error message that
        // went nowhere — the consequential step was correctly BLOCKED from
        // running, but never actually became something the owner could see
        // and approve. That's a dead end, not a real pause. This now
        // queues a genuine, visible approval request, reusing the exact
        // same table and flow the manual chat's tool-calling already uses,
        // so "Approve & Execute" in the Approvals tab genuinely works for
        // something the mission engine proposed too.
        try {
          const uid = await currentUserId();
          if (uid) {
            const toolInputPrompt = `Determine the minimum valid input required to call the tool "${tool.name}" (${tool.description}) for this mission step.\nMission: ${activeMission.goal}\nStep: ${step.description}\nReturn ONLY JSON containing the tool input, including a specific, genuine "reasoning" field if the tool schema requires one.`;
            const rawInput = await ask(toolInputPrompt, [{ role: "user", content: activeMission.goal }], 500, false, "jarvis_tool_planning", provider || undefined);
            const proposedInput = extractJson(rawInput) || {};
            await supabase.from("jarvis_lab_approvals").insert({
              user_id: uid,
              tool_name: tool.name,
              risk_category: tool.riskCategory || "unspecified",
              reasoning: proposedInput?.reasoning || `Proposed automatically while working on: ${activeMission.goal}`,
              proposed_input: proposedInput,
              status: "pending",
              created_at: nowIso(),
            });
          }
        } catch (e) {
          console.warn("[JARVIS] could not queue mission approval", e);
        }
        return {
          success: false,
          requiresApproval: true,
          error:
            "This step requires owner approval before execution — it has been queued in Approvals, not silently dropped.",
        };
      }

      setToolActivity(
        TOOL_LABELS[tool.name] ||
          `Using ${tool.name}…`
      );

      try {
        const toolPrompt = `
Determine the minimum valid input required to call the following tool.

TOOL:
${tool.name}

DESCRIPTION:
${tool.description}

MISSION:
${activeMission.goal}

STEP:
${step.description}

Return ONLY JSON containing the tool input.
`;

        const rawInput = await ask(
          toolPrompt,
          [
            {
              role: "user",
              content: activeMission.goal,
            },
          ],
          700,
          false,
          "jarvis_tool_planning",
          provider || undefined
        );

        const input =
          extractJson(rawInput) || {};

        const output = await executeTool(
          tool,
          input
        );

        await logToolCall(
          tool.name,
          input,
          output
        );

        return {
          success: true,
          tool: tool.name,
          input,
          output,
        };
      } catch (e: any) {
        await logToolCall(
          tool.name,
          {},
          null,
          e?.message || "Tool failed"
        );

        return {
          success: false,
          error:
            e?.message ||
            "Tool execution failed.",
        };
      } finally {
        setToolActivity(null);
      }
    }

    const resultPrompt = `
You are JARVIS executing one analytical mission step.

MISSION:
${activeMission.goal}

STEP:
${step.description}

Relevant memory:
${safeJson(retrieveMemory(activeMission.goal, 8))}

Perform the reasoning required for this step.

Do not claim external execution.

Return a concise result containing:
RESULT
UNKNOWN
NEXT REQUIREMENT
`;

    try {
      const result = await ask(
        resultPrompt,
        [
          {
            role: "user",
            content: activeMission.goal,
          },
        ],
        1400,
        true,
        "jarvis_mission_step",
        provider || undefined
      );

      return {
        success: true,
        output: result,
      };
    } catch (e: any) {
      return {
        success: false,
        error:
          e?.message ||
          "Mission reasoning failed.",
      };
    }
  };

  const verifyMission = async (
    activeMission: Mission
  ): Promise<string> => {
    const verificationPrompt = `
You are JARVIS's verification engine.

Evaluate the mission below.

MISSION:
${activeMission.goal}

STEPS:
${safeJson(activeMission.steps)}

Determine:

1. What was actually established?
2. What remains unknown?
3. Did any step fail?
4. Are there unsupported claims?
5. What should happen next?

Do not invent evidence.

Give a concise verification report.
`;

    return ask(
      verificationPrompt,
      [
        {
          role: "user",
          content: activeMission.goal,
        },
      ],
      1600,
      true,
      "jarvis_verification",
      provider || undefined
    );
  };

  const runMission = async (goalOverride?: string) => {
    const goal = (goalOverride ?? missionGoal).trim();

    if (!goal || thinking) return;

    setThinking(true);

    setError(null);

    setMissionLog([]);

    try {
      const missionId = uid("mission");

      const initialMission: Mission = {
        id: missionId,
        goal,
        status: "planning",
        steps: [],
        startedAt: nowIso(),
      };

      setMission(initialMission);

      setMissionLog([
        "JARVIS is decomposing the objective…",
      ]);

      const steps = await createMissionPlan(goal);

      let activeMission: Mission = {
        ...initialMission,
        status: "running",
        steps,
      };

      setMission(activeMission);

      let toolCalls = 0;

      for (let index = 0; index < steps.length; index++) {
        if (!mountedRef.current) break;

        const step = steps[index];

        const runningStep: MissionStep = {
          ...step,
          status: "running",
        };

        activeMission = {
          ...activeMission,
          steps: activeMission.steps.map(
            (candidate, candidateIndex) =>
              candidateIndex === index
                ? runningStep
                : candidate
          ),
        };

        setMission(activeMission);

        const result =
          await executeMissionStep(
            activeMission,
            runningStep
          );

        if (result?.tool) {
          toolCalls++;

          if (
            toolCalls >=
            MAX_TOOL_CALLS_PER_MISSION
          ) {
            activeMission = {
              ...activeMission,
              status: "paused",
            };

            setMissionLog((previous) => [
              ...previous,
              "Mission paused: tool-call safety limit reached.",
            ]);

            break;
          }
        }

        const completedStep: MissionStep = {
          ...runningStep,
          status: result?.success
            ? "completed"
            : result?.requiresApproval
            ? "paused" as any
            : "failed",
          result,
          error: result?.success
            ? undefined
            : result?.error,
        };

        activeMission = {
          ...activeMission,
          steps: activeMission.steps.map(
            (candidate, candidateIndex) =>
              candidateIndex === index
                ? completedStep
                : candidate
          ),
        };

        setMission(activeMission);

        if (!result?.success) {
          setMissionLog((previous) => [
            ...previous,
            `Step stopped: ${
              result?.error ||
              "unknown failure"
            }`,
          ]);

          if (result?.requiresApproval) {
            activeMission = {
              ...activeMission,
              status: "paused",
            };

            setMission(activeMission);

            break;
          }
        }

        await sleep(250);
      }

      if (activeMission.status !== "paused") {
        setMissionLog((previous) => [
          ...previous,
          "Verifying mission results…",
        ]);

        const verification =
          await verifyMission(activeMission);

        const finalMission: Mission = {
          ...activeMission,
          status: "completed",
          completedAt: nowIso(),
          summary: verification,
        };

        setMission(finalMission);

        remember({
          type: "lesson",
          content:
            `Mission completed: ${goal}\n\nVerification:\n${verification}`,
          source: "jarvis_mission",
          importance: 6,
        });

        refreshMemory();

        setMessages((previous) => [
          ...previous,
          {
            role: "user",
            content: `Run mission: ${goal}`,
          },
          {
            role: "assistant",
            content:
              `MISSION COMPLETED\n\n${verification}`,
          },
        ]);

        await saveMsg(
          "user",
          `Run mission: ${goal}`
        );

        await saveMsg(
          "assistant",
          `MISSION COMPLETED\n\n${verification}`
        );

        speak(verification);
      }
    } catch (e: any) {
      const message =
        e?.message ||
        "Mission failed unexpectedly.";

      setError(message);

      setMission((previous) =>
        previous
          ? {
              ...previous,
              status: "failed",
              completedAt: nowIso(),
              summary: message,
            }
          : previous
      );
    } finally {
      setThinking(false);
      setToolActivity(null);
    }
  };

  /* ==========================================================================
   * CONTINUOUS AUTONOMOUS CYCLE
   *
   * This is intentionally bounded.
   *
   * Auto mode does not mean "run forever with unlimited authority."
   * It means JARVIS periodically evaluates the current platform state and
   * identifies work. Consequential actions still require approval.
   * ======================================================================== */

  const runAutonomousCycle = async () => {
    if (thinking) return;

    const goal = `
Perform an autonomous health and opportunity review of OrchestrIQ.

Check current platform signals, current platform statistics, available
financial/cost anomalies, and relevant JARVIS memory.

Identify:
1. What changed?
2. What is currently broken or risky?
3. What opportunities are visible?
4. What should be investigated next?
5. Is there a useful improvement proposal JARVIS should record?

Do not make unsupported claims.
Do not execute consequential changes.
`;

    setMissionGoal(goal);

    await runMission(goal);
  };

  /* ==========================================================================
   * DAILY BRIEFING
   * ======================================================================== */

  const generateDailyBriefing = async () => {
    if (thinking) return;

    setThinking(true);

    setError(null);

    try {
      const uid = await currentUserId();

      if (!uid) return;

      const since = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();

      const [
        signalsResult,
        recosResult,
        approvalsResult,
        failuresResult,
      ] = await Promise.all([
        supabase
          .from("jarvis_lab_signals")
          .select(
            "title,severity,source_module,description,status,detected_at"
          )
          .gte("detected_at", since),

        supabase
          .from("jarvis_lab_recommendations")
          .select(
            "recommendation,root_cause,confidence,created_at"
          )
          .gte("created_at", since),

        supabase
          .from("jarvis_lab_approvals")
          .select(
            "tool_name,reasoning,status,created_at,executed_at"
          )
          .gte("created_at", since),

        supabase
          .from("jarvis_lab_tool_calls")
          .select(
            "tool_name,error,created_at"
          )
          .not("error", "is", null)
          .gte("created_at", since),
      ]);

      const briefingData = {
        signals:
          signalsResult.data || [],
        recommendations:
          recosResult.data || [],
        approvals:
          approvalsResult.data || [],
        tool_failures:
          failuresResult.data || [],
        memory:
          retrieveMemory(
            "recent platform activity failures opportunities lessons",
            12
          ),
      };

      const prompt = `
You are JARVIS.

Create a concise operational briefing from the supplied real data.

Separate:

OBSERVED FACTS
ANALYSIS
RISKS
OPPORTUNITIES
RECOMMENDATIONS
ACTIONS WAITING FOR OWNER
JARVIS IMPROVEMENT OPPORTUNITIES

Never present an inference as a fact.

Never describe pending or rejected actions as executed.

Data:
${safeJson(briefingData, 18000)}
`;

      const reply = await ask(
        prompt,
        [
          {
            role: "user",
            content: "Generate today's briefing.",
          },
        ],
        1800,
        false,
        "jarvis_briefing",
        provider || undefined
      );

      setMessages((previous) => [
        ...previous,
        {
          role: "user",
          content: "Generate today's briefing.",
        },
        {
          role: "assistant",
          content: reply,
        },
      ]);

      await saveMsg(
        "user",
        "Generate today's briefing."
      );

      await saveMsg("assistant", reply);

      speak(reply);
    } catch (e: any) {
      setError(
        e?.message ||
          "Unable to generate briefing."
      );
    } finally {
      setThinking(false);
    }
  };

  /* ==========================================================================
   * PLATFORM SCAN
   * ======================================================================== */

  const runScan = async () => {
    if (scanning) return;

    setScanning(true);

    setError(null);

    try {
      const uid = await currentUserId();

      if (!uid) {
        throw new Error("Not signed in.");
      }

      const detectors = [
        "jarvis_lab_detect_cost_signals",
      ];

      for (const detector of detectors) {
        await supabase.rpc(detector, {
          p_user_id: uid,
        });
      }

      await loadSignals();
    } catch (e: any) {
      setError(
        e?.message ||
          "Platform scan failed."
      );
    } finally {
      setScanning(false);
    }
  };

  /* ==========================================================================
   * SIGNAL DIAGNOSIS
   * ======================================================================== */

  const diagnose = async (signal: Signal) => {
    if (diagnosing) return;

    setDiagnosing(signal.id);

    setError(null);

    try {
      const system = `
You are JARVIS's diagnostic engine.

Analyze the supplied signal.

Determine:
1. Most likely root cause.
2. Concrete recommendation.
3. Confidence.

Do not invent information.

Use the supplied numbers and evidence.

Return:

ROOT CAUSE:
RECOMMENDATION:
CONFIDENCE:
`;

      const userMessage =
        `Signal: ${signal.title}\n` +
        `Module: ${signal.source_module}\n` +
        `Type: ${signal.signal_type}\n` +
        `Severity: ${signal.severity}\n` +
        `Description: ${signal.description}\n` +
        `Raw data: ${safeJson(signal.data)}`;

      const text = await ask(
        system,
        [
          {
            role: "user",
            content: userMessage,
          },
        ],
        800,
        false,
        "jarvis_diagnosis",
        provider || undefined
      );

      const rootCause =
        /ROOT CAUSE:\s*([\s\S]*?)(?:\nRECOMMENDATION:|$)/i.exec(
          text
        )?.[1]
          ?.trim() || "";

      const recommendation =
        /RECOMMENDATION:\s*([\s\S]*?)(?:\nCONFIDENCE:|$)/i.exec(
          text
        )?.[1]
          ?.trim() || text.trim();

      const confidence =
        /CONFIDENCE:\s*(low|medium|high)/i.exec(
          text
        )?.[1]
          ?.toLowerCase() || "medium";

      const uid = await currentUserId();

      await supabase
        .from("jarvis_lab_recommendations")
        .insert({
          signal_id: signal.id,
          user_id: uid,
          root_cause: rootCause,
          recommendation,
          confidence,
          tier: 1,
        });

      await supabase
        .from("jarvis_lab_signals")
        .update({
          status: "recommended",
        })
        .eq("id", signal.id);

      remember({
        type: "lesson",
        content:
          `Signal diagnosis: ${signal.title}. Root cause: ${rootCause}. Recommendation: ${recommendation}`,
        source: "jarvis_diagnosis",
        importance:
          signal.severity === "critical"
            ? 8
            : 6,
      });

      refreshMemory();

      await loadSignals();
    } catch (e: any) {
      setError(
        e?.message ||
          "Diagnosis failed."
      );
    } finally {
      setDiagnosing(null);
    }
  };

  /* ==========================================================================
   * APPROVALS
   * ======================================================================== */

  const decideApproval = async (
    approval: any,
    approve: boolean
  ) => {
    if (!isOwner) {
      setError("Only the platform owner can approve or reject JARVIS actions.");
      return;
    }

    setDecidingId(approval.id);

    try {
      const uid = await currentUserId();
      if (!uid) throw new Error("Owner session is not authenticated.");
      if (!approve) {
        await supabase
          .from("jarvis_lab_approvals")
          .update({
            status: "rejected",
            decided_at: nowIso(),
          })
          .eq("id", approval.id)
          .eq("user_id", uid);

        remember({
          type: "decision",
          content:
            `Owner rejected JARVIS action: ${approval.tool_name}. Reason supplied by JARVIS: ${approval.reasoning}`,
          source: "approval",
          importance: 6,
        });

        await loadApprovals();

        refreshMemory();

        return;
      }

      const tool = jarvisTools.find(
        (candidate) =>
          candidate.name === approval.tool_name
      );

      if (!tool) {
        await supabase
          .from("jarvis_lab_approvals")
          .update({
            status: "failed",
            error: "Tool no longer exists.",
            decided_at: nowIso(),
          })
          .eq("id", approval.id)
          .eq("user_id", uid);

        await loadApprovals();

        return;
      }

      if (tool.riskLevel === "dangerous") {
        await supabase
          .from("jarvis_lab_approvals")
          .update({
            status: "failed",
            error:
              "Dangerous operations are disabled.",
            decided_at: nowIso(),
          })
          .eq("id", approval.id)
          .eq("user_id", uid);

        await loadApprovals();

        return;
      }

      await supabase
        .from("jarvis_lab_approvals")
        .update({
          status: "approved",
          decided_at: nowIso(),
        })
        .eq("id", approval.id)
          .eq("user_id", uid);

      try {
        if (!tool.executeApproved) {
          throw new Error(
            "This action has no owner-approved execution handler. It remains blocked."
          );
        }

        const result = await tool.executeApproved(
          approval.proposed_input
        );

        await supabase
          .from("jarvis_lab_approvals")
          .update({
            status: "executed",
            result,
            executed_at: nowIso(),
          })
          .eq("id", approval.id)
          .eq("user_id", uid);

        remember({
          type: "success",
          content:
            `Owner approved and JARVIS executed ${approval.tool_name}. Result: ${safeJson(
              result,
              4000
            )}`,
          source: "approval",
          importance: 7,
        });
      } catch (e: any) {
        await supabase
          .from("jarvis_lab_approvals")
          .update({
            status: "failed",
            error:
              e?.message ||
              "Execution failed.",
          })
          .eq("id", approval.id)
          .eq("user_id", uid);

        remember({
          type: "failure",
          content:
            `JARVIS action failed after owner approval: ${approval.tool_name}. Error: ${
              e?.message ||
              "Unknown error"
            }`,
          source: "approval",
          importance: 8,
        });
      }

      refreshMemory();

      await loadApprovals();
    } finally {
      setDecidingId(null);
    }
  };

  /* ==========================================================================
   * MEMORY CLEAR
   * ======================================================================== */

  const clearMemory = () => {
    if (
      !window.confirm(
        "Clear JARVIS's local structured memory?"
      )
    ) {
      return;
    }

    try {
      localStorage.removeItem(MEMORY_KEY);
    } catch {}

    setMemoryItems([]);
  };

  /* ==========================================================================
   * FILTERS
   * ======================================================================== */

  const filteredSignals = signals.filter(
    (signal) =>
      filter === "all" ||
      signal.source_module === filter
  );

  const modules: string[] = Array.from(
    new Set(
      signals.map(
        (signal) => signal.source_module
      )
    )
  ) as string[];

  /* ==========================================================================
   * AUTO MODE TIMER
   * ======================================================================== */

  useEffect(() => {
    if (!autoMode) return;

    const interval = window.setInterval(() => {
      if (!thinking) {
        runAutonomousCycle();
      }
    }, 15 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [autoMode, thinking]);

  /* ==========================================================================
   * RENDER HELPERS
   * ======================================================================== */

  const renderMission = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginTop: 14,
      }}
    >
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.line}`,
          borderRadius: 10,
          padding: 14,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: C.ink,
            marginBottom: 8,
          }}
        >
          Autonomous Mission Engine
        </div>

        <div
          style={{
            fontSize: 11,
            color: C.faint,
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          Give JARVIS an objective. It will decompose
          the objective, gather available information,
          use permitted tools, verify the result, and
          record useful lessons.
        </div>

        <textarea
          value={missionGoal}
          onChange={(event) =>
            setMissionGoal(event.target.value)
          }
          placeholder="Example: Investigate the current platform risks and determine what should be improved next."
          disabled={thinking}
          style={{
            width: "100%",
            minHeight: 100,
            boxSizing: "border-box",
            resize: "vertical",
            background: C.raised,
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            padding: 10,
            color: C.ink,
            fontSize: 12,
            fontFamily: "inherit",
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 10,
          }}
        >
          <button
            onClick={runMission}
            disabled={
              thinking ||
              !missionGoal.trim()
            }
            style={{
              background: C.teal,
              color: "#04070F",
              border: "none",
              borderRadius: 7,
              padding: "8px 15px",
              fontWeight: 800,
              fontSize: 11,
              cursor: "pointer",
              opacity:
                thinking ||
                !missionGoal.trim()
                  ? 0.45
                  : 1,
            }}
          >
            {thinking
              ? "Running…"
              : "Run Mission"}
          </button>

          <button
            onClick={runAutonomousCycle}
            disabled={thinking}
            style={{
              background: "transparent",
              color: C.amber,
              border: `1px solid ${C.amber}66`,
              borderRadius: 7,
              padding: "8px 15px",
              fontWeight: 700,
              fontSize: 11,
              cursor: "pointer",
              opacity: thinking ? 0.45 : 1,
            }}
          >
            Autonomous Review
          </button>
        </div>
      </div>

      {mission && (
        <>
          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: C.ink,
                  }}
                >
                  {mission.goal}
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: C.faint,
                    marginTop: 3,
                  }}
                >
                  {mission.status.toUpperCase()}
                </div>
              </div>

              <div
                style={{
                  fontSize: 9,
                  color: C.faint,
                }}
              >
                {mission.id}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              {mission.steps.map(
                (step, index) => (
                  <div
                    key={step.id}
                    onClick={() =>
                      setSelectedMissionStep(
                        selectedMissionStep ===
                          step.id
                          ? null
                          : step.id
                      )
                    }
                    style={{
                      background: C.raised,
                      border: `1px solid ${
                        selectedMissionStep ===
                        step.id
                          ? C.teal
                          : C.line
                      }`,
                      borderRadius: 7,
                      padding: 9,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          display: "inline-flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "center",
                          background:
                            step.status ===
                            "completed"
                              ? C.green
                              : step.status ===
                                "failed"
                              ? C.red
                              : step.status ===
                                "running"
                              ? C.teal
                              : C.panel,
                          color:
                            step.status ===
                            "completed" ||
                            step.status ===
                              "running"
                              ? "#04070F"
                              : C.dim,
                          fontSize: 9,
                          fontWeight: 800,
                        }}
                      >
                        {index + 1}
                      </span>

                      <div
                        style={{
                          flex: 1,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: C.ink,
                          }}
                        >
                          {step.title}
                        </div>

                        <div
                          style={{
                            fontSize: 9.5,
                            color: C.faint,
                          }}
                        >
                          {step.status}
                          {step.tool
                            ? ` · ${step.tool}`
                            : ""}
                        </div>
                      </div>
                    </div>

                    {selectedMissionStep ===
                      step.id && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 10.5,
                          color: C.dim,
                          lineHeight: 1.5,
                        }}
                      >
                        <div>
                          {step.description}
                        </div>

                        {step.result && (
                          <pre
                            style={{
                              whiteSpace:
                                "pre-wrap",
                              marginTop: 8,
                              background:
                                C.bg,
                              padding: 8,
                              borderRadius: 5,
                              fontSize: 9,
                              color:
                                C.dim,
                              overflow:
                                "auto",
                            }}
                          >
                            {safeJson(
                              step.result,
                              5000
                            )}
                          </pre>
                        )}

                        {step.error && (
                          <div
                            style={{
                              color: C.red,
                              marginTop: 5,
                            }}
                          >
                            {step.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          {mission.summary && (
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.teal}55`,
                borderRadius: 10,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: C.teal,
                  marginBottom: 7,
                  letterSpacing: 0.5,
                }}
              >
                VERIFICATION
              </div>

              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: C.ink,
                }}
              >
                {mission.summary}
              </div>
            </div>
          )}
        </>
      )}

      {missionLog.length > 0 && (
        <div
          style={{
            background: C.raised,
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            padding: 10,
          }}
        >
          {missionLog.map(
            (entry, index) => (
              <div
                key={index}
                style={{
                  fontSize: 10,
                  color: C.faint,
                  marginBottom: 4,
                }}
              >
                {entry}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );

  const renderChat = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        marginTop: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <select
          value={provider}
          onChange={(event) =>
            setProvider(event.target.value)
          }
          style={{
            background: C.raised,
            border: `1px solid ${C.line}`,
            borderRadius: 6,
            padding: "5px 8px",
            color: C.dim,
            fontSize: 11,
          }}
        >
          <option value="">
            Auto
          </option>

          {(availableProviders || []).map(
            (item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.label}
              </option>
            )
          )}
        </select>

        <button
          onClick={() =>
            setVoiceOn((value) => {
              if (value) {
                window.speechSynthesis?.cancel();
              }

              return !value;
            })
          }
          style={{
            background: "transparent",
            border: `1px solid ${C.line}`,
            borderRadius: 6,
            padding: "5px 9px",
            color: voiceOn
              ? C.teal
              : C.faint,
            fontSize: 10.5,
            cursor: "pointer",
          }}
        >
          {voiceOn
            ? "Voice on"
            : "Voice off"}
        </button>

        <button
          onClick={generateDailyBriefing}
          disabled={thinking}
          style={{
            background: "transparent",
            border: `1px solid ${C.teal}55`,
            borderRadius: 6,
            padding: "5px 9px",
            color: C.teal,
            fontSize: 10.5,
            cursor: "pointer",
          }}
        >
          Daily Briefing
        </button>

        <button
          onClick={toggleWakeWord}
          style={{
            background: wakeWordOn
              ? C.red
              : "transparent",
            border: `1px solid ${
              wakeWordOn
                ? C.red
                : C.line
            }`,
            borderRadius: 6,
            padding: "5px 9px",
            color: wakeWordOn
              ? "#fff"
              : C.dim,
            fontSize: 10.5,
            cursor: "pointer",
          }}
        >
          {wakeWordOn
            ? `Listening: ${effectiveWakePhrase}`
            : "Wake word off"}
        </button>
      </div>

      {wakeWordOn && (
        <div
          style={{
            fontSize: 10,
            color: C.faint,
            marginBottom: 8,
          }}
        >
          Hearing:{" "}
          {lastHeard
            ? `"${lastHeard}"`
            : "nothing yet"}
        </div>
      )}

      {wakeError && (
        <div
          style={{
            background:
              "rgba(239,68,68,0.08)",
            border: `1px solid ${C.red}55`,
            borderRadius: 7,
            padding: "7px 10px",
            color: C.red,
            fontSize: 10.5,
            marginBottom: 8,
          }}
        >
          {wakeError}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingBottom: 10,
        }}
      >
        {loadingHistory && (
          <div
            style={{
              textAlign: "center",
              color: C.faint,
              fontSize: 10.5,
              padding: 15,
            }}
          >
            Loading JARVIS memory…
          </div>
        )}

        {!loadingHistory &&
          messages.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "45px 20px",
                color: C.faint,
              }}
            >
              <div
                style={{
                  fontSize: 34,
                  color: C.teal,
                  marginBottom: 10,
                }}
              >
                ◈
              </div>

              <div
                style={{
                  fontSize: 14,
                  color: C.ink,
                  fontWeight: 700,
                  marginBottom: 5,
                }}
              >
                JARVIS {JARVIS_VERSION}
              </div>

              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                Ask a question, give JARVIS an
                objective, or send it to the Mission
                Engine.
              </div>
            </div>
          )}

        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent:
                message.role === "user"
                  ? "flex-end"
                  : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "82%",
                background:
                  message.role === "user"
                    ? "rgba(20,184,166,0.10)"
                    : C.panel,
                border: `1px solid ${
                  message.role === "user"
                    ? "#14B8A633"
                    : C.line
                }`,
                borderRadius: 10,
                padding: "10px 13px",
                fontSize: 12,
                color: C.ink,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {message.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div
            style={{
              fontSize: 10.5,
              color: toolActivity
                ? C.teal
                : C.faint,
              fontStyle: "italic",
            }}
          >
            {toolActivity
              ? "◈ " +
                (TOOL_LABELS[
                  toolActivity
                ] ||
                  `Using ${toolActivity}…`)
              : "JARVIS is reasoning…"}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 7,
          paddingTop: 10,
          borderTop: `1px solid ${C.line}`,
        }}
      >
        <button
          onClick={toggleListen}
          style={{
            background: listening
              ? C.red
              : C.raised,
            border: `1px solid ${
              listening
                ? C.red
                : C.line
            }`,
            borderRadius: 8,
            padding: "0 13px",
            color: listening
              ? "#fff"
              : C.dim,
            cursor: "pointer",
          }}
        >
          {listening ? "◉" : "🎙"}
        </button>

        <input
          value={chatInput}
          onChange={(event) =>
            setChatInput(event.target.value)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey
            ) {
              event.preventDefault();

              sendChat();
            }
          }}
          disabled={thinking}
          placeholder="Ask JARVIS anything…"
          style={{
            flex: 1,
            background: C.raised,
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            padding: "9px 12px",
            color: C.ink,
            fontSize: 12,
          }}
        />

        <button
          onClick={() => sendChat()}
          disabled={
            thinking ||
            !chatInput.trim()
          }
          style={{
            background: C.teal,
            color: "#04070F",
            border: "none",
            borderRadius: 8,
            padding: "0 17px",
            fontWeight: 800,
            fontSize: 11.5,
            cursor: "pointer",
            opacity:
              thinking ||
              !chatInput.trim()
                ? 0.4
                : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );

  const renderSignals = () => (
    <div
      style={{
        marginTop: 14,
        overflowY: "auto",
        flex: 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: C.dim,
          }}
        >
          Live diagnostic signals
        </div>

        <button
          onClick={runScan}
          disabled={scanning}
          style={{
            background: C.teal,
            color: "#04070F",
            border: "none",
            borderRadius: 7,
            padding: "7px 13px",
            fontWeight: 800,
            fontSize: 10.5,
            cursor: "pointer",
          }}
        >
          {scanning
            ? "Scanning…"
            : "Run Scan"}
        </button>
      </div>

      {modules.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {["all", ...modules].map(
            (module) => (
              <button
                key={module}
                onClick={() =>
                  setFilter(module)
                }
                style={{
                  background:
                    filter === module
                      ? C.teal
                      : C.panel,
                  color:
                    filter === module
                      ? "#04070F"
                      : C.dim,
                  border: `1px solid ${C.line}`,
                  borderRadius: 20,
                  padding:
                    "4px 11px",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {module === "all"
                  ? "All"
                  : module.replace(
                      /_/g,
                      " "
                    )}
              </button>
            )
          )}
        </div>
      )}

      {filteredSignals.length ===
        0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: C.faint,
          }}
        >
          No signals found.
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {filteredSignals.map(
          (signal) => {
            const reco =
              recos[signal.id];

            return (
              <div
                key={signal.id}
                style={{
                  background: C.panel,
                  border: `1px solid ${C.line}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      color:
                        SEVERITY_COLOR[
                          signal.severity
                        ] || C.dim,
                      fontSize: 16,
                    }}
                  >
                    {TYPE_ICON[
                      signal.signal_type
                    ] || "•"}
                  </div>

                  <div
                    style={{
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        flexWrap:
                          "wrap",
                        alignItems:
                          "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: C.ink,
                        }}
                      >
                        {signal.title}
                      </span>

                      <span
                        style={{
                          fontSize: 8.5,
                          color:
                            SEVERITY_COLOR[
                              signal.severity
                            ] ||
                            C.dim,
                          textTransform:
                            "uppercase",
                        }}
                      >
                        {
                          signal.severity
                        }
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: C.dim,
                        lineHeight: 1.5,
                        marginTop: 5,
                      }}
                    >
                      {
                        signal.description
                      }
                    </div>

                    {reco && (
                      <div
                        style={{
                          marginTop: 10,
                          padding:
                            "9px 11px",
                          background:
                            C.raised,
                          borderLeft: `2px solid ${C.teal}`,
                          borderRadius: 5,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            color: C.teal,
                            fontWeight: 800,
                            marginBottom: 5,
                          }}
                        >
                          DIAGNOSIS ·{" "}
                          {
                            reco.confidence
                          }
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: C.dim,
                          }}
                        >
                          <b
                            style={{
                              color:
                                C.ink,
                            }}
                          >
                            Root cause:
                          </b>{" "}
                          {
                            reco.root_cause
                          }
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: C.ink,
                            marginTop: 5,
                          }}
                        >
                          <b>
                            Recommendation:
                          </b>{" "}
                          {
                            reco.recommendation
                          }
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        marginTop: 10,
                      }}
                    >
                      {!reco && (
                        <button
                          onClick={() =>
                            diagnose(
                              signal
                            )
                          }
                          disabled={
                            diagnosing ===
                            signal.id
                          }
                          style={{
                            background:
                              "transparent",
                            border: `1px solid ${C.teal}55`,
                            color: C.teal,
                            borderRadius: 6,
                            padding:
                              "5px 11px",
                            fontSize: 10.5,
                            cursor:
                              "pointer",
                          }}
                        >
                          {diagnosing ===
                          signal.id
                            ? "Thinking…"
                            : "Diagnose"}
                        </button>
                      )}

                      <button
                        onClick={async () => {
                          await supabase
                            .from(
                              "jarvis_lab_signals"
                            )
                            .update({
                              status:
                                "dismissed",
                            })
                            .eq(
                              "id",
                              signal.id
                            );

                          await loadSignals();
                        }}
                        style={{
                          background:
                            "transparent",
                          border: `1px solid ${C.line}`,
                          color: C.faint,
                          borderRadius: 6,
                          padding:
                            "5px 11px",
                          fontSize: 10.5,
                          cursor:
                            "pointer",
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
        )}
      </div>
    </div>
  );

  const renderMemory = () => (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        marginTop: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: C.ink,
            }}
          >
            JARVIS Memory
          </div>

          <div
            style={{
              fontSize: 10,
              color: C.faint,
              marginTop: 3,
            }}
          >
            {memoryItems.length} structured
            memories
          </div>
        </div>

        <button
          onClick={clearMemory}
          style={{
            background: "transparent",
            border: `1px solid ${C.red}55`,
            color: C.red,
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>

      {memoryItems.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: C.faint,
          }}
        >
          JARVIS has not recorded any
          structured memories yet.
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {[...memoryItems]
          .reverse()
          .map((item) => (
            <div
              key={item.id}
              style={{
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: 11,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 8.5,
                    color: C.teal,
                    fontWeight: 800,
                    textTransform:
                      "uppercase",
                  }}
                >
                  {item.type}
                </span>

                <span
                  style={{
                    fontSize: 8.5,
                    color: C.faint,
                  }}
                >
                  importance{" "}
                  {item.importance}
                </span>
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: C.ink,
                  lineHeight: 1.5,
                  marginTop: 6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {item.content}
              </div>

              <div
                style={{
                  fontSize: 8.5,
                  color: C.faint,
                  marginTop: 6,
                }}
              >
                {item.source} ·{" "}
                {new Date(
                  item.createdAt
                ).toLocaleString()}
              </div>
            </div>
          ))}
      </div>
    </div>
  );

  const renderApprovals = () => (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        marginTop: 14,
      }}
    >
      {!EXECUTION_POLICY
        .requireApprovalForConsequential && (
        <div
          style={{
            background:
              "rgba(245,158,11,0.08)",
            border: `1px solid ${C.amber}55`,
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
            fontSize: 10.5,
            color: C.dim,
          }}
        >
          Consequential approval policy is
          disabled.
        </div>
      )}

      {pendingApprovals.length ===
        0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: C.faint,
          }}
        >
          No actions are waiting for
          approval.
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {pendingApprovals.map(
          (approval) => (
            <div
              key={approval.id}
              style={{
                background: C.panel,
                border: `1px solid ${C.amber}55`,
                borderRadius: 10,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems:
                    "center",
                  gap: 8,
                  marginBottom: 7,
                }}
              >
                <span
                  style={{
                    fontSize: 8,
                    color: C.amber,
                    textTransform:
                      "uppercase",
                    fontWeight: 800,
                  }}
                >
                  {
                    approval.risk_category
                  }
                </span>

                <span
                  style={{
                    fontSize: 12,
                    color: C.ink,
                    fontWeight: 800,
                  }}
                >
                  {String(
                    approval.tool_name
                  ).replace(
                    /_/g,
                    " "
                  )}
                </span>
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: C.dim,
                  lineHeight: 1.5,
                }}
              >
                <b
                  style={{
                    color: C.ink,
                  }}
                >
                  Reasoning:
                </b>{" "}
                {
                  approval.reasoning
                }
              </div>

              <pre
                style={{
                  background: C.raised,
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 9,
                  color: C.faint,
                  whiteSpace:
                    "pre-wrap",
                  overflow: "auto",
                  marginTop: 8,
                }}
              >
                {safeJson(
                  approval.proposed_input
                )}
              </pre>

              <div
                style={{
                  display: "flex",
                  gap: 7,
                  marginTop: 10,
                }}
              >
                <button
                  onClick={() =>
                    decideApproval(
                      approval,
                      true
                    )
                  }
                  disabled={
                    decidingId ===
                    approval.id
                  }
                  style={{
                    background:
                      C.teal,
                    color:
                      "#04070F",
                    border:
                      "none",
                    borderRadius: 6,
                    padding:
                      "6px 13px",
                    fontWeight: 800,
                    fontSize: 10.5,
                    cursor:
                      "pointer",
                  }}
                >
                  Approve & Execute
                </button>

                <button
                  onClick={() =>
                    decideApproval(
                      approval,
                      false
                    )
                  }
                  disabled={
                    decidingId ===
                    approval.id
                  }
                  style={{
                    background:
                      "transparent",
                    color:
                      C.faint,
                    border: `1px solid ${C.line}`,
                    borderRadius: 6,
                    padding:
                      "6px 13px",
                    fontSize: 10.5,
                    cursor:
                      "pointer",
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );

  /* ==========================================================================
   * MAIN RENDER
   * ======================================================================== */

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1000,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxSizing: "border-box",
        background: C.bg,
        color: C.ink,
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: 12,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                color: C.teal,
                fontSize: 21,
                fontWeight: 900,
              }}
            >
              ◈
            </span>

            <span
              style={{
                fontSize: 20,
                fontWeight: 900,
              }}
            >
              JARVIS
            </span>

            <span
              style={{
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: 0.7,
                color: "#04070F",
                background: C.teal,
                borderRadius: 4,
                padding:
                  "2px 7px",
              }}
            >
              {JARVIS_VERSION}
            </span>
          </div>

          <div
            style={{
              fontSize: 10.5,
              color: C.faint,
              marginTop: 3,
            }}
          >
            Intelligence · Planning · Research ·
            Execution · Verification · Memory
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 5,
            flexWrap: "wrap",
          }}
        >
          {(
            [
              ["chat", "Chat"],
              ["mission", "Mission"],
              ["signals", "Signals"],
              ["memory", "Memory"],
              ["approvals", "Approvals"],
            ] as [JarvisMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() =>
                setView(mode)
              }
              style={{
                background:
                  view === mode
                    ? C.teal
                    : C.panel,
                color:
                  view === mode
                    ? "#04070F"
                    : C.dim,
                border: `1px solid ${
                  mode ===
                    "approvals" &&
                  pendingApprovals.length
                    ? C.amber
                    : C.line
                }`,
                borderRadius: 6,
                padding:
                  "6px 10px",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {label}
              {mode ===
                "approvals" &&
                pendingApprovals.length >
                  0 &&
                ` (${pendingApprovals.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* AUTONOMY STATUS */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: 10,
          background: C.panel,
          border: `1px solid ${C.line}`,
          borderRadius: 7,
          padding:
            "7px 10px",
          marginTop: 5,
          marginBottom: 7,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 7,
            alignItems: "center",
            fontSize: 9.5,
            color: C.faint,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                autoMode
                  ? C.green
                  : C.faint,
            }}
          />

          Autonomous monitoring:
          <b
            style={{
              color: autoMode
                ? C.green
                : C.faint,
            }}
          >
            {autoMode
              ? "ON"
              : "OFF"}
          </b>
        </div>

        <button
          onClick={() =>
            setAutoMode(
              (value) => !value
            )
          }
          style={{
            background:
              autoMode
                ? C.green
                : "transparent",
            color:
              autoMode
                ? "#04070F"
                : C.dim,
            border: `1px solid ${
              autoMode
                ? C.green
                : C.line
            }`,
            borderRadius: 5,
            padding:
              "4px 8px",
            fontSize: 9,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {autoMode
            ? "Disable"
            : "Enable"}
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div
          style={{
            background:
              "rgba(239,68,68,0.08)",
            border: `1px solid ${C.red}55`,
            borderRadius: 8,
            padding:
              "8px 11px",
            marginTop: 8,
            marginBottom: 5,
            fontSize: 10.5,
            color: C.red,
          }}
        >
          {error}
        </div>
      )}

      {/* VIEW */}

      {view === "chat" &&
        renderChat()}

      {view === "mission" &&
        renderMission()}

      {view === "signals" &&
        renderSignals()}

      {view === "memory" &&
        renderMemory()}

      {view === "approvals" &&
        renderApprovals()}

      {/* POLICY FOOTER */}

      <div
        style={{
          borderTop: `1px solid ${C.line}`,
          marginTop: 8,
          paddingTop: 7,
          display: "flex",
          justifyContent:
            "space-between",
          gap: 10,
          fontSize: 8.5,
          color: C.faint,
        }}
      >
        <span>
          JARVIS does not fabricate execution.
        </span>

        <span>
          Consequential actions require authorization.
        </span>

        <span>
          Self-improvement is proposal-only.
        </span>

        <span>
          {resolveGateway(gateway) ? "Platform gateway connected" : "Platform gateway not connected"}
        </span>
      </div>
    </div>
  );
}
