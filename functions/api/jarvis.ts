/**
 * JARVIS 6.0 — Repository Intelligence Gateway
 *
 * Location:
 *   functions/api/jarvis.ts
 *
 * PURPOSE
 * -------
 * Provides JARVIS with controlled, read-only intelligence access to the
 * OrchestrIQ repository and related system metadata.
 *
 * JARVIS CAN:
 *   - Inspect repository tree
 *   - Read source files
 *   - Search source code
 *   - Inspect modules
 *   - Inspect package/dependency information
 *   - Inspect Git status
 *   - Inspect repository metadata
 *   - Create structured improvement proposals in memory/response
 *   - Prepare analysis for future testing/execution layers
 *
 * JARVIS CANNOT:
 *   - Write to GitHub
 *   - Commit code
 *   - Deploy
 *   - Delete files
 *   - Change permissions
 *   - Change ownership
 *   - Change authentication
 *   - Modify JARVIS governance
 *   - Execute arbitrary shell commands
 *
 * OWNER MODEL
 * -----------
 * Supabase JWT -> user identity -> profiles.role
 *
 * super_admin = owner
 *
 * IMPORTANT:
 * GitHub credentials remain server-side.
 */

interface Env {
  // Existing Supabase configuration
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  // Compatibility: some Cloudflare deployments expose the existing app
  // Supabase variables with the VITE_ prefix. Server-side code may use either.
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // GitHub configuration
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_REF?: string;

  // Optional security configuration
  ALLOWED_ORIGIN?: string;
}

interface UserContext {
  userId: string;
  email?: string;
  role?: string;
  isOwner: boolean;
}

interface GitHubFile {
  name: string;
  path: string;
  sha?: string;
  size?: number;
  url?: string;
  html_url?: string;
  type?: string;
  download_url?: string | null;
}

interface GitHubTreeItem {
  path: string;
  mode?: string;
  type?: string;
  sha?: string;
  size?: number;
  url?: string;
}

interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeItem[];
  truncated?: boolean;
}

interface GitHubSearchItem {
  name: string;
  path: string;
  sha?: string;
  html_url?: string;
  repository?: {
    full_name?: string;
  };
}

interface GatewayRequest {
  action?: string;
  path?: string;
  query?: string;
  module?: string;
  branch?: string;
  limit?: number;
}

interface GatewayResponse {
  ok: boolean;
  action: string;
  timestamp: string;
  data?: unknown;
  error?: string;
  requiresApproval?: boolean;
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_FILE_SIZE = 1_500_000;
const MAX_SEARCH_RESULTS = 50;
const MAX_TREE_RESULTS = 5_000;

const ALLOWED_ACTIONS = new Set([
  "health",
  "repository_info",
  "repository_tree",
  "read_file",
  "search_code",
  "module_map",
  "inspect_module",
  "dependencies",
  "git_status",
  "architecture_snapshot",
  "improvement_proposal"
]);

/*
 * Files that should never be exposed to the browser/JARVIS frontend.
 *
 * Even though JARVIS is owner-controlled, secrets should never be sent
 * through the repository gateway.
 */
const SENSITIVE_PATH_PATTERNS = [
  /^\.env/i,
  /^\.env\./i,
  /secret/i,
  /credential/i,
  /private[_-]?key/i,
  /service[_-]?role/i,
  /access[_-]?token/i,
  /password/i,
  /\/secrets?\//i,
  /\/credentials?\//i
];

/* -------------------------------------------------------------------------- */
/* BASIC RESPONSE / CORS                                                      */
/* -------------------------------------------------------------------------- */

function corsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get("Origin");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  // Same-origin requests need no CORS permission. If cross-origin access is
  // explicitly configured, allow only that exact origin — never wildcard.
  if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

function json(
  request: Request,
  env: Env,
  payload: GatewayResponse,
  status = 200
): Response {
  const headers = corsHeaders(request, env);

  return new Response(JSON.stringify(payload), {
    status,
    headers
  });
}

/* -------------------------------------------------------------------------- */
/* GENERAL UTILITIES                                                           */
/* -------------------------------------------------------------------------- */

function now(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------------- */
/* ENVIRONMENT RESOLUTION                                                     */
/* -------------------------------------------------------------------------- */

function supabaseUrl(env: Env): string {
  const value = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!value || typeof value !== "string") {
    throw new Error(
      "JARVIS gateway configuration error: SUPABASE_URL (or VITE_SUPABASE_URL) is not configured."
    );
  }
  return value.replace(/\/$/, "");
}

function supabaseAnonKey(env: Env): string {
  const value = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!value || typeof value !== "string") {
    throw new Error(
      "JARVIS gateway configuration error: SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) is not configured."
    );
  }
  return value;
}

function githubConfig(env: Env): { token: string; owner: string; repo: string } {
  const token = env.GITHUB_TOKEN;
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    throw new Error(
      "JARVIS gateway configuration error: GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO must all be configured."
    );
  }
  return { token, owner, repo };
}

function clampLimit(value: unknown, fallback = 25): number {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(n), MAX_SEARCH_RESULTS));
}

function normalizePath(path = ""): string {
  return path
    .replace(/^\/+/, "")
    .replace(/\.\./g, "")
    .trim();
}

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function truncateText(value: string, max = 100_000): string {
  if (value.length <= max) {
    return value;
  }

  return (
    value.slice(0, max) +
    "\n\n[JARVIS GATEWAY: CONTENT TRUNCATED]"
  );
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const bytes = base64UrlDecode(parts[1]);

  const text = new TextDecoder().decode(bytes);

  return JSON.parse(text);
}

/* -------------------------------------------------------------------------- */
/* SUPABASE JWT VALIDATION                                                     */
/* -------------------------------------------------------------------------- */

async function getSupabaseJWKS(env: Env): Promise<any> {
  const response = await fetch(
    `${supabaseUrl(env)}/auth/v1/.well-known/jwks.json`
  );

  if (!response.ok) {
    throw new Error(
      `Unable to retrieve Supabase JWKS (${response.status})`
    );
  }

  return response.json();
}

async function verifySupabaseJwt(
  token: string,
  env: Env
): Promise<Record<string, unknown>> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid authentication token");
  }

  const header = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[0]))
  );

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[1]))
  );

  if (!payload.sub) {
    throw new Error("JWT does not contain a user identity");
  }

  if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) {
    throw new Error("Authentication token has expired");
  }

  const jwks = await getSupabaseJWKS(env);

  const keyData = jwks.keys?.find(
    (key: any) => key.kid === header.kid
  );

  if (!keyData) {
    throw new Error("JWT signing key not found");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    keyData,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["verify"]
  );

  const data = new TextEncoder().encode(
    `${parts[0]}.${parts[1]}`
  );

  const signature = base64UrlDecode(parts[2]);

  const valid = await crypto.subtle.verify(
    {
      name: "RSASSA-PKCS1-v1_5"
    },
    cryptoKey,
    signature,
    data
  );

  if (!valid) {
    throw new Error("Invalid JWT signature");
  }

  return payload;
}

/* -------------------------------------------------------------------------- */
/* OWNER / PROFILE RESOLUTION                                                  */
/* -------------------------------------------------------------------------- */

async function getUserContext(
  request: Request,
  env: Env
): Promise<UserContext> {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing authentication token");
  }

  const token = authorization.slice("Bearer ".length).trim();

  const payload = await verifySupabaseJwt(token, env);

  const userId = String(payload.sub);

  let role: string | undefined;
  let email: string | undefined;

  if (typeof payload.email === "string") {
    email = payload.email;
  }

  /*
   * Query the authenticated user's own profile through Supabase.
   *
   * We deliberately use the user's JWT rather than a service-role key.
   * This keeps the gateway from requiring a service-role credential.
   */
  try {
    const profileUrl =
      `${supabaseUrl(env)}` +
      `/rest/v1/profiles` +
      `?select=role,email` +
      `&id=eq.${encodeURIComponent(userId)}` +
      `&limit=1`;

    const profileApiKey = env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey(env);
    const profileAuthorization = env.SUPABASE_SERVICE_ROLE_KEY
      ? `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      : `Bearer ${token}`;

    const profileResponse = await fetch(profileUrl, {
      headers: {
        apikey: profileApiKey,
        Authorization: profileAuthorization
      }
    });

    if (profileResponse.ok) {
      const profiles = await profileResponse.json();

      if (Array.isArray(profiles) && profiles.length > 0) {
        role = profiles[0]?.role;

        if (!email && profiles[0]?.email) {
          email = profiles[0].email;
        }
      }
    }
  } catch {
    /*
     * JWT identity remains valid even if profile lookup fails.
     *
     * We deliberately DO NOT assume owner status when profile lookup fails.
     */
  }

  const isOwner = role === "super_admin";

  return {
    userId,
    email,
    role,
    isOwner
  };
}

/* -------------------------------------------------------------------------- */
/* GITHUB CLIENT                                                               */
/* -------------------------------------------------------------------------- */

function githubHeaders(env: Env): HeadersInit {
  const { token } = githubConfig(env);
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "OrchestrIQ-JARVIS"
  };
}

function githubBase(env: Env): string {
  const { owner, repo } = githubConfig(env);
  return (
    `https://api.github.com/repos/` +
    `${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}`
  );
}

function githubRef(env: Env, requested?: string): string {
  return requested || env.GITHUB_REF || "main";
}

async function githubRequest(
  env: Env,
  path: string,
  init: RequestInit = {}
): Promise<any> {
  const response = await fetch(
    `https://api.github.com${path}`,
    {
      ...init,
      headers: {
        ...githubHeaders(env),
        ...(init.headers || {})
      }
    }
  );

  const text = await response.text();

  let body: any;

  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status}: ${
        typeof body === "string"
          ? body.slice(0, 500)
          : body?.message || "Unknown GitHub error"
      }`
    );
  }

  return body;
}

/* -------------------------------------------------------------------------- */
/* REPOSITORY INFORMATION                                                      */
/* -------------------------------------------------------------------------- */

async function repositoryInfo(
  env: Env,
  branch?: string
) {
  const { owner, repo } = githubConfig(env);
  const ref = githubRef(env, branch);

  const [repository, branchData] = await Promise.all([
    githubRequest(
      env,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}`
    ),
    githubRequest(
      env,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/branches/${encodeURIComponent(ref)}`
    )
  ]);

  return {
    owner: owner,
    repository: repo,
    branch: ref,
    private: repository.private,
    defaultBranch: repository.default_branch,
    description: repository.description,
    language: repository.language,
    size: repository.size,
    openIssues: repository.open_issues_count,
    pushedAt: repository.pushed_at,
    updatedAt: repository.updated_at,
    branchSha: branchData?.commit?.sha || null,
    repositoryUrl: repository.html_url
  };
}

/* -------------------------------------------------------------------------- */
/* REPOSITORY TREE                                                             */
/* -------------------------------------------------------------------------- */

async function repositoryTree(
  env: Env,
  branch?: string
) {
  const { owner, repo } = githubConfig(env);
  const ref = githubRef(env, branch);

  const branchData = await githubRequest(
    env,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo
    )}/branches/${encodeURIComponent(ref)}`
  );

  const sha = branchData?.commit?.sha;

  if (!sha) {
    throw new Error("Unable to determine repository commit SHA");
  }

  const tree = (await githubRequest(
    env,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo
    )}/git/trees/${encodeURIComponent(sha)}?recursive=1`
  )) as GitHubTreeResponse;

  const items = (tree.tree || [])
    .filter((item) => !isSensitivePath(item.path))
    .slice(0, MAX_TREE_RESULTS);

  return {
    branch: ref,
    commit: sha,
    truncated: Boolean(tree.truncated),
    count: items.length,
    tree: items
  };
}

/* -------------------------------------------------------------------------- */
/* READ FILE                                                                   */
/* -------------------------------------------------------------------------- */

async function readFile(
  env: Env,
  path: string,
  branch?: string
) {
  const { owner, repo } = githubConfig(env);
  const normalized = normalizePath(path);

  if (!normalized) {
    throw new Error("File path is required");
  }

  if (isSensitivePath(normalized)) {
    throw new Error("Access to sensitive files is blocked");
  }

  const ref = githubRef(env, branch);

  const result = await githubRequest(
    env,
    `/repos/${encodeURIComponent(owner)}/` +
      `${encodeURIComponent(repo)}/contents/` +
      `${normalized}?ref=${encodeURIComponent(ref)}`
  );

  if (Array.isArray(result)) {
    throw new Error("Requested path is a directory");
  }

  if (result.size && result.size > MAX_FILE_SIZE) {
    throw new Error(
      `File is too large for direct inspection: ${result.size} bytes`
    );
  }

  if (!result.content) {
    throw new Error("GitHub did not return file content");
  }

  const content = atob(
    String(result.content).replace(/\n/g, "")
  );

  return {
    path: normalized,
    branch: ref,
    sha: result.sha,
    size: result.size,
    content: truncateText(content),
    htmlUrl: result.html_url
  };
}

/* -------------------------------------------------------------------------- */
/* CODE SEARCH                                                                 */
/* -------------------------------------------------------------------------- */

async function searchCode(
  env: Env,
  query: string,
  limit = 25
) {
  const { owner, repo } = githubConfig(env);
  const cleanQuery = query?.trim();

  if (!cleanQuery) {
    throw new Error("Search query is required");
  }

  const safeLimit = clampLimit(limit);

  const q =
    `${cleanQuery} ` +
    `repo:${owner}/${repo}`;

  const result = await githubRequest(
    env,
    `/search/code?q=${encodeURIComponent(q)}` +
      `&per_page=${safeLimit}`
  );

  return {
    query: cleanQuery,
    total: result.total_count || 0,
    results: (result.items || [])
      .slice(0, safeLimit)
      .map((item: GitHubSearchItem) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        url: item.html_url
      }))
  };
}

/* -------------------------------------------------------------------------- */
/* MODULE MAP                                                                  */
/* -------------------------------------------------------------------------- */

async function moduleMap(
  env: Env,
  branch?: string
) {
  const treeResult = await repositoryTree(env, branch);

  const sourceFiles = treeResult.tree.filter(
    (item: GitHubTreeItem) =>
      item.type === "blob" &&
      /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(item.path)
  );

  const modules: Record<
    string,
    {
      files: string[];
      count: number;
    }
  > = {};

  for (const item of sourceFiles) {
    const parts = item.path.split("/");

    let moduleName = "root";

    if (parts[0] === "src" && parts.length >= 2) {
      moduleName = parts[1];
    } else if (parts[0] === "functions" && parts.length >= 2) {
      moduleName = `functions/${parts[1]}`;
    } else if (parts[0]) {
      moduleName = parts[0];
    }

    if (!modules[moduleName]) {
      modules[moduleName] = {
        files: [],
        count: 0
      };
    }

    modules[moduleName].files.push(item.path);
    modules[moduleName].count++;
  }

  return {
    branch: treeResult.branch,
    totalSourceFiles: sourceFiles.length,
    modules
  };
}

/* -------------------------------------------------------------------------- */
/* MODULE INSPECTION                                                           */
/* -------------------------------------------------------------------------- */

async function inspectModule(
  env: Env,
  moduleName: string,
  branch?: string
) {
  const requested = moduleName?.trim();

  if (!requested) {
    throw new Error("Module name is required");
  }

  const treeResult = await repositoryTree(env, branch);

  const matchingFiles = treeResult.tree
    .filter(
      (item) =>
        item.type === "blob" &&
        item.path.toLowerCase().includes(requested.toLowerCase()) &&
        !isSensitivePath(item.path)
    )
    .slice(0, 100);

  return {
    module: requested,
    branch: treeResult.branch,
    matchCount: matchingFiles.length,
    files: matchingFiles
  };
}

/* -------------------------------------------------------------------------- */
/* DEPENDENCIES                                                                */
/* -------------------------------------------------------------------------- */

async function dependencies(
  env: Env,
  branch?: string
) {
  const files = [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock"
  ];

  const results: Record<string, unknown> = {};

  for (const file of files) {
    try {
      results[file] = await readFile(env, file, branch);
    } catch {
      // File does not exist; continue.
    }
  }

  return results;
}

/* -------------------------------------------------------------------------- */
/* GIT STATUS                                                                  */
/* -------------------------------------------------------------------------- */

async function gitStatus(
  env: Env,
  branch?: string
) {
  const { owner, repo } = githubConfig(env);
  const ref = githubRef(env, branch);

  const [repository, branchData, commits] =
    await Promise.all([
      githubRequest(
        env,
        `/repos/${encodeURIComponent(owner)}/` +
          `${encodeURIComponent(repo)}`
      ),
      githubRequest(
        env,
        `/repos/${encodeURIComponent(owner)}/` +
          `${encodeURIComponent(repo)}/branches/` +
          `${encodeURIComponent(ref)}`
      ),
      githubRequest(
        env,
        `/repos/${encodeURIComponent(owner)}/` +
          `${encodeURIComponent(repo)}/commits` +
          `?sha=${encodeURIComponent(ref)}&per_page=10`
      )
    ]);

  return {
    repository: repository.full_name,
    branch: ref,
    sha: branchData?.commit?.sha || null,
    protected: Boolean(branchData?.protected),
    latestCommits: (commits || []).map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit?.message,
      author: commit.commit?.author?.name,
      date: commit.commit?.author?.date,
      url: commit.html_url
    }))
  };
}

/* -------------------------------------------------------------------------- */
/* ARCHITECTURE SNAPSHOT                                                       */
/* -------------------------------------------------------------------------- */

async function architectureSnapshot(
  env: Env,
  branch?: string
) {
  const [info, modules, dependenciesResult, status] =
    await Promise.all([
      repositoryInfo(env, branch),
      moduleMap(env, branch),
      dependencies(env, branch),
      gitStatus(env, branch)
    ]);

  return {
    generatedAt: now(),
    repository: info,
    modules,
    dependencies: Object.keys(dependenciesResult),
    git: status
  };
}

/* -------------------------------------------------------------------------- */
/* IMPROVEMENT PROPOSAL                                                        */
/* -------------------------------------------------------------------------- */

function improvementProposal(body: GatewayRequest) {
  /*
   * This operation intentionally does NOT write anything.
   *
   * JARVIS can construct a structured proposal, but the proposal must be
   * returned to the owner and approved before any future write gateway
   * can execute it.
   */

  return {
    status: "PROPOSAL_ONLY",
    requiresOwnerApproval: true,
    proposal: {
      title: body.module || "JARVIS Improvement Proposal",
      requestedAnalysis: body.query || "",
      module: body.module || null,
      path: body.path || null,
      createdAt: now(),
      executionAllowed: false,
      message:
        "JARVIS may analyze and prepare an improvement, but no repository mutation is permitted through this gateway."
    }
  };
}

/* -------------------------------------------------------------------------- */
/* REQUEST VALIDATION                                                          */
/* -------------------------------------------------------------------------- */

function validateAction(action: string): void {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(
      `Unsupported JARVIS gateway action: ${action}`
    );
  }
}

/* -------------------------------------------------------------------------- */
/* MAIN HANDLER                                                                */
/* -------------------------------------------------------------------------- */

export async function onRequestOptions(
  context: any
): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(context.request, context.env)
  });
}

export async function onRequestGet(
  context: any
): Promise<Response> {
  return handleRequest(context);
}

export async function onRequestPost(
  context: any
): Promise<Response> {
  return handleRequest(context);
}

async function handleRequest(
  context: any
): Promise<Response> {
  const request: Request = context.request;
  const env: Env = context.env;

  try {
    /* Authenticate every request. */
    let user: UserContext;
    try {
      user = await getUserContext(request, env);
    } catch (authError: any) {
      return json(request, env, {
        ok: false,
        action: "authentication",
        timestamp: now(),
        error: authError?.message || "Authentication failed"
      }, 401);
    }

    /*
     * JARVIS is currently restricted to the owner.
     *
     * This is intentional. We do not want repository intelligence exposed
     * to ordinary application users.
     */
    if (!user.isOwner) {
      return json(
        request,
        env,
        {
          ok: false,
          action: "authorization",
          timestamp: now(),
          error:
            "JARVIS repository intelligence is restricted to the system owner."
        },
        403
      );
    }

    let body: GatewayRequest = {};

    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch {
        return json(
          request,
          env,
          {
            ok: false,
            action: "request",
            timestamp: now(),
            error: "Invalid JSON request body"
          },
          400
        );
      }
    } else {
      const url = new URL(request.url);

      body = {
        action: url.searchParams.get("action") || "health",
        path: url.searchParams.get("path") || undefined,
        query: url.searchParams.get("query") || undefined,
        module: url.searchParams.get("module") || undefined,
        branch: url.searchParams.get("branch") || undefined,
        limit: Number(
          url.searchParams.get("limit") || "25"
        )
      };
    }

    const action = String(body.action || "").trim();

    validateAction(action);

    let data: unknown;

    switch (action) {
      case "health":
        data = {
          gateway: "JARVIS Repository Intelligence Gateway",
          version: "6.0.0",
          status: "operational",
          authenticatedUser: user.userId,
          owner: user.isOwner,
          capabilities: [
            "repository_info",
            "repository_tree",
            "read_file",
            "search_code",
            "module_map",
            "inspect_module",
            "dependencies",
            "git_status",
            "architecture_snapshot",
            "improvement_proposal"
          ],
          writeAccess: false,
          deploymentAccess: false,
          selfModification: false
        };
        break;

      case "repository_info":
        data = await repositoryInfo(
          env,
          body.branch
        );
        break;

      case "repository_tree":
        data = await repositoryTree(
          env,
          body.branch
        );
        break;

      case "read_file":
        data = await readFile(
          env,
          body.path || "",
          body.branch
        );
        break;

      case "search_code":
        data = await searchCode(
          env,
          body.query || "",
          body.limit
        );
        break;

      case "module_map":
        data = await moduleMap(
          env,
          body.branch
        );
        break;

      case "inspect_module":
        data = await inspectModule(
          env,
          body.module || "",
          body.branch
        );
        break;

      case "dependencies":
        data = await dependencies(
          env,
          body.branch
        );
        break;

      case "git_status":
        data = await gitStatus(
          env,
          body.branch
        );
        break;

      case "architecture_snapshot":
        data = await architectureSnapshot(
          env,
          body.branch
        );
        break;

      case "improvement_proposal":
        data = improvementProposal(body);
        break;

      default:
        throw new Error(
          `Action ${action} is not implemented`
        );
    }

    return json(request, env, {
      ok: true,
      action,
      timestamp: now(),
      data
    });
  } catch (error: any) {
    console.error(
      "JARVIS gateway error:",
      error
    );

    return json(
      request,
      env,
      {
        ok: false,
        action: "error",
        timestamp: now(),
        error:
          error instanceof Error
            ? error.message
            : "JARVIS gateway request failed"
      },
      500
    );
  }
}
