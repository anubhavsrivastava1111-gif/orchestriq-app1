// src/AdminConsole.tsx
// ─────────────────────────────────────────────────────────────────────────────
// OWNER AND STAFF CONSOLE
//
// Everything here calls database functions that enforce permission THEMSELVES.
// The tabs below hide what you cannot do, but hiding a button is not access
// control - it is courtesy. If someone forged their way into this component the
// database would still refuse every call, because assert_capability() runs
// server-side on each one and reads the role from the profiles table rather
// than from anything the browser sent.
//
// Two tiers:
//   super_admin  the owner. Everything, including appointing other admins.
//   admin        staff. Only the capabilities the owner granted them.
// Role changes, account deletion and the seat cap are owner-only and cannot be
// delegated. Staff who could appoint themselves owner would not be staff.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";
// Shared table styling, so every screen lines up the same way.
import { tableWrap, table as TBL, th as TH, td as TD, statRow, stat, statValue, statLabel, num as NUM } from "./lib/ui";

type Caps = { role: string; is_owner: boolean; caps: Record<string, boolean> };

const C = {
  bg: "#070B14", panel: "#0F1420", line: "#1A2030", ink: "#F1F5F9",
  dim: "#A0AAC0", faint: "#5A6480", teal: "#14B8A6", amber: "#F59E0B",
  red: "#EF4444", green: "#22C55E",
};

const S: Record<string, React.CSSProperties> = {
  // EVERY colour is stated explicitly. The console sits inside the main app,
  // which sets its own colours from a theme, and anything left to inherit came
  // out dark-on-dark or white-on-white - which is why the heading and the table
  // header rows were unreadable in your screenshots.
  // WAS minHeight:"100%" with no scrolling, so anything past the bottom of the
  // window was simply unreachable - you had to zoom the browser out to read it.
  // Every other screen in this app sets flex:1 with its own overflowY; the
  // console did not. Now it does.
  wrap:  { flex: 1, height: "100%", maxHeight: "100vh", overflowY: "auto",
           padding: 16, color: C.ink, background: C.bg,
           fontFamily: "Manrope,system-ui,sans-serif" },
  card:  { background: C.panel, border: "1px solid " + C.line, borderRadius: 8, padding: 14, marginBottom: 14, color: C.ink },
  h:     { fontSize: 13, fontWeight: 800, marginBottom: 3, color: C.ink },
  sub:   { fontSize: 9.5, color: C.faint, marginBottom: 12, lineHeight: 1.55 },
  lbl:   { fontSize: 9, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 4 },
  inp:   { width: "100%", padding: "7px 9px", background: "#0A0E1A", border: "1px solid " + C.line, borderRadius: 5, color: C.ink, fontSize: 11, boxSizing: "border-box" },
  btn:   { padding: "7px 12px", borderRadius: 5, fontSize: 10.5, fontWeight: 700, cursor: "pointer", border: "1px solid " + C.line, background: "#0A0E1A", color: C.ink },
  prim:  { padding: "7px 12px", borderRadius: 5, fontSize: 10.5, fontWeight: 800, cursor: "pointer", border: "1px solid " + C.teal, background: C.teal, color: "#04070F" },
  danger:{ padding: "7px 12px", borderRadius: 5, fontSize: 10.5, fontWeight: 700, cursor: "pointer", border: "1px solid " + C.red, background: "transparent", color: C.red },
  // WAS: no background. The app's stylesheet gave table headers a white
  // background, so grey-on-white made them almost invisible.
  th:    { fontSize: 8.5, fontWeight: 800, color: C.dim, background: "#0A0E1A",
           textTransform: "uppercase", letterSpacing: 0.6, textAlign: "left",
           padding: "7px 8px", borderBottom: "1px solid " + C.line },
  td:    { fontSize: 10.5, padding: "7px 8px", borderBottom: "1px solid " + C.line,
           verticalAlign: "middle", color: C.ink, background: "transparent" },
  tab:   { padding: "8px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: "transparent", color: C.faint, borderBottom: "2px solid transparent" },
  tabOn: { padding: "8px 14px", fontSize: 11, fontWeight: 800, cursor: "pointer", border: "none", background: "transparent", color: C.teal, borderBottom: "2px solid " + C.teal },
};

function Note({ tone = "info", children }: any) {
  const col = tone === "warn" ? C.amber : tone === "bad" ? C.red : C.teal;
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid " + col + "44",
      borderLeft: "3px solid " + col, borderRadius: 5, padding: "8px 11px",
      fontSize: 9.5, color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>{children}</div>
  );
}

export default function AdminConsole({ onClose }: { onClose?: () => void }) {
  const [caps, setCaps] = useState<Caps | null>(null);
  const [tab, setTab] = useState("users");
  const [msg, setMsg] = useState<{ t: string; tone: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const say = (t: string, tone = "info") => { setMsg({ t, tone }); setTimeout(() => setMsg(null), 6000); };

  // Every RPC funnels through here so one error style covers the whole console.
  // Postgres permission errors arrive with readable messages, so they are shown
  // rather than swallowed - a refused action should say why.
  const rpc = useCallback(async (fn: string, args: any = {}) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message || "Request failed");
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      try { setCaps(await rpc("my_admin_capabilities") as Caps); }
      catch (e: any) { say(e.message, "bad"); }
    })();
  }, [rpc]);

  if (!caps) return <div style={S.wrap}><div style={S.sub}>Checking your access…</div></div>;

  if (caps.role !== "super_admin" && caps.role !== "admin") {
    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <div style={S.h}>Not available</div>
          <div style={S.sub}>This area is for administrators. If you need something changed on your account, use Support to send a message.</div>
          {onClose && <button style={S.btn} onClick={onClose}>Back</button>}
        </div>
      </div>
    );
  }

  const can = (k: string) => caps.is_owner || !!caps.caps?.[k];
  const tabs = [
    ["users", "Users", "admin_manage_users"],
    // Two separate screens. Deciding WHICH MODULES a plan includes and deciding
    // WHAT IT COSTS are different jobs done at different times, and putting the
    // long module grid above the price fields meant the prices were pushed off
    // the bottom of the screen.
    ["modules", "Module Access", "admin_manage_plans"],
    ["plans", "Plans & Pricing", "admin_manage_plans"],
    ["features", "Advanced", "admin_manage_plans"],
    ["support", "Support", "admin_manage_support"],
    ["access", "Roles & Access", "__owner"],
    ["nvidia_access", "NVIDIA Access", "__owner"],
    ["jarvis_access", "JARVIS Access", "__owner"],
    // THE FIX: moved here from Settings, as requested - this decides real
    // money and bank details for the whole platform, which belongs with
    // every other owner-level control, not tucked inside personal settings.
    // Owner-only: staff admins can manage users and support without ever
    // seeing where donations are routed.
    ["donation", "Donation", "__owner"],
  ].filter(([, , cap]) => cap === "__owner" ? caps.is_owner : can(cap as string));

  return (
    <div style={S.wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>Admin Console</div>
          <div style={{ fontSize: 10, color: caps.is_owner ? C.amber : C.teal, fontWeight: 700 }}>
            {caps.is_owner ? "OWNER — full control" : "STAFF — limited to what the owner granted you"}
          </div>
        </div>
        {onClose && <button style={S.btn} onClick={onClose}>Close</button>}
      </div>

      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid " + C.line, marginBottom: 14, flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button key={id as string} style={tab === id ? S.tabOn : S.tab} onClick={() => setTab(id as string)}>{label}</button>
        ))}
      </div>

      {msg && <Note tone={msg.tone}>{msg.t}</Note>}

      {tab === "users"    && <UsersTab rpc={rpc} caps={caps} say={say} busy={busy} setBusy={setBusy} />}
      {tab === "modules"  && <PlansTab rpc={rpc} say={say} only="modules" />}
      {tab === "plans"    && <PlansTab rpc={rpc} say={say} only="pricing" />}
      {tab === "features" && <FeaturesTab rpc={rpc} caps={caps} say={say} />}
      {tab === "support"  && <SupportTab rpc={rpc} say={say} />}
      {tab === "access"   && <AccessTab rpc={rpc} say={say} isOwner={caps.is_owner} />}
      {tab === "nvidia_access" && <NvidiaAccessTab rpc={rpc} say={say} />}
      {tab === "jarvis_access" && <JarvisAccessTab rpc={rpc} say={say} />}
      {tab === "donation" && <DonationTab say={say} />}
    </div>
  );
}

// ── USERS ────────────────────────────────────────────────────────────────────
function UsersTab({ rpc, caps, say, busy, setBusy }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [seats, setSeats] = useState<any>(null);
  const [nu, setNu] = useState({ email: "", password: "", full_name: "" });

  const load = useCallback(async () => {
    try {
      setUsers(await rpc("admin_list_users") || []);
      const { data } = await supabase.from("plans").select("*").order("price_monthly");
      setPlans(data || []);
      if (caps.is_owner) { try { setSeats(await rpc("admin_signup_status")); } catch { /* staff */ } }
    } catch (e: any) { say(e.message, "bad"); }
  }, [rpc, caps.is_owner, say]);
  useEffect(() => { load(); }, [load]);

  // Account creation and password changes cannot run in the browser: they need
  // the Supabase service role key, which must never leave the server. They go
  // to /api/admin, which verifies the session and re-checks the role.
  const adminApi = async (action: string, payload: any) => {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    if (!token) throw new Error("Session expired — sign in again.");
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ action, ...payload }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || "Request failed");
    return d;
  };

  const createUser = async () => {
    if (!nu.email || nu.password.length < 8) { say("Enter an email and a password of at least 8 characters.", "warn"); return; }
    setBusy(true);
    try {
      await adminApi("create_user", nu);
      say("Account created for " + nu.email + ".");
      setNu({ email: "", password: "", full_name: "" });
      load();
    } catch (e: any) { say(e.message, "bad"); } finally { setBusy(false); }
  };

  return (
    <>
      {seats && (
        <div style={S.card}>
          <div style={S.h}>Seats</div>
          <div style={statRow}>
            <div style={stat}><div style={statValue()}>{NUM(seats.used)}</div><div style={statLabel}>used</div></div>
            <div style={stat}><div style={statValue(C.teal)}>{NUM(seats.remaining)}</div><div style={statLabel}>remaining</div></div>
            <div style={stat}><div style={statValue(C.faint)}>{NUM(seats.max_users)}</div><div style={statLabel}>cap</div></div>
          </div>
          <div style={S.sub}>
            The cap is enforced by the database, not by this screen, so it holds even if
            someone calls the signup API directly. Registration is currently{" "}
            <b style={{ color: seats.signups_enabled ? C.green : C.red }}>
              {seats.signups_enabled ? "open" : "closed"}</b>.
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.h}>Create an account</div>
        <div style={S.sub}>
          The account is created with its email already confirmed, so the person can sign in
          immediately. Give them the password by a channel you trust, and ask them to change it.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <div><label style={S.lbl}>Email</label>
            <input style={S.inp} value={nu.email} onChange={e => setNu({ ...nu, email: e.target.value })} placeholder="person@company.com" /></div>
          <div><label style={S.lbl}>Full name</label>
            <input style={S.inp} value={nu.full_name} onChange={e => setNu({ ...nu, full_name: e.target.value })} /></div>
          <div><label style={S.lbl}>Temporary password</label>
            <input style={S.inp} value={nu.password} onChange={e => setNu({ ...nu, password: e.target.value })} placeholder="min 8 characters" /></div>
          <button style={S.prim} disabled={busy} onClick={createUser}>{busy ? "Working…" : "Create"}</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.h}>All users ({users.length})</div>
        {/* Fixed widths so a long email cannot push Role and Plan out of line,
            and the two counts are right-aligned so they read as numbers. */}
        <div style={tableWrap}>
          <table style={{ ...TBL, minWidth: 900 }}>
            <colgroup>
              <col /><col style={{ width: 84 }} /><col style={{ width: 130 }} />
              <col style={{ width: 96 }} /><col style={{ width: 78 }} /><col style={{ width: 230 }} />
            </colgroup>
            <thead><tr>
              <th style={TH("left")}>Email</th>
              <th style={TH("center")}>Role</th>
              <th style={TH("left")}>Plan</th>
              <th style={TH("right")}>Sessions</th>
              <th style={TH("right")}>Grants</th>
              <th style={TH("right")}>Actions</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td style={TD("left")}>
                    <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
                    <div style={{ fontSize: 8.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis" }}>{u.full_name}</div>
                  </td>
                  <td style={TD("center")}>
                    <span style={{ fontSize: 8.5, fontWeight: 800, padding: "2px 6px", borderRadius: 3,
                      background: u.role === "super_admin" ? "rgba(245,158,11,0.15)" : u.role === "admin" ? "rgba(20,184,166,0.15)" : "rgba(90,100,128,0.15)",
                      color: u.role === "super_admin" ? C.amber : u.role === "admin" ? C.teal : C.faint }}>
                      {u.role === "super_admin" ? "OWNER" : u.role === "admin" ? "STAFF" : "USER"}
                    </span>
                  </td>
                  <td style={S.td}>
                    <select style={{ ...S.inp, padding: "4px 6px", fontSize: 10 }} value={plans.find(p => p.name === u.plan_name)?.id || ""}
                      onChange={async e => {
                        try { await rpc("admin_set_user_plan", { p_user_id: u.user_id, p_plan_id: e.target.value });
                          say("Plan changed for " + u.email + "."); load(); }
                        catch (err: any) { say(err.message, "bad"); }
                      }}>
                      <option value="">— none —</option>
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  {/* WAS left-aligned. A column of numbers that does not line up
                      on its digits is the most common reason a table looks
                      unfinished. */}
                  <td style={TD("right")}>{u.sessions_used}{u.session_limit != null ? " / " + u.session_limit : ""}</td>
                  <td style={TD("right")}>{u.extra_grants || 0}</td>
                  <td style={TD("right")}>
                    <div style={{ display: "flex", gap: 5, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                      <button style={{ ...S.btn, padding: "4px 8px", fontSize: 9.5 }}
                        onClick={async () => { try { await rpc("admin_reset_user_sessions", { p_user_id: u.user_id });
                          say("Sessions reset for " + u.email + "."); load(); } catch (e: any) { say(e.message, "bad"); } }}>
                        Reset sessions</button>
                      <button style={{ ...S.btn, padding: "4px 8px", fontSize: 9.5 }}
                        onClick={async () => { try { await adminApi("send_reset", { email: u.email });
                          say("Password reset link sent to " + u.email + "."); } catch (e: any) { say(e.message, "bad"); } }}>
                        Send reset link</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          <b>Send reset link</b> is safer than setting a password yourself: the person chooses
          their own, so you never learn it and there is nothing to leak. Set a password directly
          only when someone has lost access to their email.
        </Note>
      </div>
    </>
  );
}

// ── PLANS ────────────────────────────────────────────────────────────────────
function PlansTab({ rpc, say, only }: any) {
  const [plans, setPlans] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const [pf, setPf] = useState<Record<string, any>>({});
  const [sel, setSel] = useState<string>("");

  const load = useCallback(async () => {
    const [{ data: pl }, { data: ft }, { data: map }] = await Promise.all([
      supabase.from("plans").select("*").order("price_monthly"),
      supabase.from("features").select("*").order("sort_order"),
      supabase.from("plan_features").select("*"),
    ]);
    setPlans(pl || []);
    // Admin capabilities are appointments, not purchases, so they never appear
    // in a plan's feature matrix. The database refuses it too.
    setFeatures((ft || []).filter((f: any) => f.category !== "admin"));
    const m: Record<string, any> = {};
    (map || []).forEach((r: any) => { m[r.plan_id + "|" + r.feature_id] = r; });
    setPf(m);
    if (!sel && pl?.length) setSel(pl[0].id);
  }, [sel]);
  useEffect(() => { load(); }, [load]);

  const plan = plans.find(p => p.id === sel);
  const setFeat = async (f: any, patch: any) => {
    const cur = pf[sel + "|" + f.id] || {};
    try {
      // WAS: a direct table write for the dropdown choice. That table allows
      // no direct writing - every change goes through a protected command so
      // there is only one way in. The write was refused silently, which is why
      // clicking an executive flashed blue and then reverted.
      await rpc("admin_set_plan_feature", {
        p_plan_id: sel, p_feature_key: f.key,
        p_enabled: patch.enabled !== undefined ? patch.enabled : (cur.enabled ?? f.default_on),
        p_limit: patch.limit !== undefined ? patch.limit : (cur.limit_value ?? null),
        p_choice: patch.choice !== undefined ? patch.choice : null,
      });
      load();
    } catch (e: any) { say(e.message, "bad"); }
  };

  const byCat: Record<string, any[]> = {};
  features.forEach(f => { (byCat[f.category] ||= []).push(f); });

  // Every module, every plan, in one grid. This is the table people actually
  // want to look at when deciding what to sell: you can see the whole shape of
  // your product tiers at once, instead of opening each plan in turn and
  // holding the differences in your head.
  // Clicking a cell changes it immediately.
  const modules = features.filter(f => f.category === "modules")
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const toggleCell = async (planId: string, f: any, next: boolean) => {
    try {
      await rpc("admin_set_plan_feature", { p_plan_id: planId, p_feature_key: f.key,
        p_enabled: next, p_limit: null });
      load();
    } catch (e: any) { say(e.message, "bad"); }
  };

  const showModules = only !== "pricing";
  const showPricing  = only !== "modules";

  return (
    <>
      {showModules && (
      <div style={S.card}>
        <div style={S.h}>What each plan includes</div>
        <div style={S.sub}>
          Click any tick or dash to change it. It saves straight away and takes effect
          the next time that user signs in. No deployment, no code.
        </div>
        {/* Every plan column is exactly the same width, so the ticks form clean
            vertical lines instead of drifting with the plan name length. */}
        <div style={tableWrap}>
          <table style={{ ...TBL, minWidth: 240 + plans.length * 110 }}>
            <colgroup>
              <col style={{ width: 240 }} />
              {plans.map(p => <col key={p.id} style={{ width: 110 }} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={TH("left")}>Module</th>
                {plans.map(p => (
                  <th key={p.id} style={TH("center")}>
                    <div style={{ color: C.ink, fontSize: 10 }}>{p.name}</div>
                    <div style={{ color: C.faint, fontWeight: 600, fontSize: 8.5 }}>
                      {Number(p.price_monthly) === 0 ? "free" : "\u20B9" + p.price_monthly + "/mo"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map(f => (
                <tr key={f.id}>
                  <td style={{ ...TD("left"), fontWeight: 700 }}>{f.label}</td>
                  {plans.map(p => {
                    const row = pf[p.id + "|" + f.id] || {};
                    const on = row.enabled ?? f.default_on;
                    return (
                      <td key={p.id} style={{ ...TD("center"), cursor: "pointer",
                        background: on ? "rgba(34,197,94,0.10)" : "transparent" }}
                        title={"Click to " + (on ? "remove from" : "add to") + " " + p.name}
                        onClick={() => toggleCell(p.id, f, !on)}>
                        <span style={{ fontSize: 13, fontWeight: 800,
                          color: on ? C.green : C.faint }}>{on ? "\u2713" : "\u2013"}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td style={{ ...TD("left"), fontWeight: 800, borderTop: "2px solid " + C.line }}>Sessions per month</td>
                {plans.map(p => (
                  <td key={p.id} style={{ ...TD("center"), color: C.teal, fontWeight: 800, borderTop: "2px solid " + C.line }}>
                    {p.sessions_per_month ?? "\u2013"}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ ...TD("left"), fontWeight: 800 }}>Executives per session</td>
                {plans.map(p => (
                  <td key={p.id} style={{ ...TD("center"), color: C.teal, fontWeight: 800 }}>
                    {p.agents_allowed ?? "\u2013"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <Note>
          A green tick means that plan gets that module. A grey dash means it does not
          and the module will not appear in their menu at all.
          <b> You and your staff always see every module</b>, whatever this table says,
          so you can never lock yourself out.
        </Note>
      </div>
      )}

      {showPricing && (
      <div style={S.card}>
        <div style={S.h}>Prices and limits</div>
        <div style={S.sub}>Change a price or a limit here and it takes effect immediately. No deployment.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {plans.map(p => (
            <button key={p.id} onClick={() => setSel(p.id)}
              style={{ ...S.btn, borderColor: sel === p.id ? C.teal : C.line, color: sel === p.id ? C.teal : C.ink }}>
              {p.name} · ₹{p.price_monthly}{p.is_active ? "" : " (hidden)"}
            </button>
          ))}
        </div>
        {plan && <PlanEditor plan={plan} rpc={rpc} say={say} onSaved={load} />}
      </div>
      )}

      {showPricing && plan && (
        <div style={S.card}>
          <div style={S.h}>Everything in “{plan.name}”, in detail</div>
          <div style={S.sub}>
            Tick to include. Numbers take a value — leave a numeric field empty for unlimited.
            Dropdowns pick from the allowed options.
          </div>
          {Object.keys(byCat).map(cat => (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div style={{ ...S.lbl, color: C.teal, marginBottom: 6 }}>{cat}</div>
              {byCat[cat].map(f => {
                const row = pf[sel + "|" + f.id] || {};
                const on = row.enabled ?? f.default_on;
                return (
                  <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid " + C.line }}>
                    <input type="checkbox" checked={!!on} style={{ marginTop: 3, cursor: "pointer" }}
                      onChange={e => setFeat(f, { enabled: e.target.checked })} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{f.label}</div>
                      {f.description && <div style={{ fontSize: 8.5, color: C.faint, lineHeight: 1.5 }}>{f.description}</div>}
                    </div>
                    {f.kind === "numeric" && (
                      <input type="number" style={{ ...S.inp, width: 110 }} defaultValue={row.limit_value ?? ""}
                        placeholder="unlimited"
                        onBlur={e => setFeat(f, { limit: e.target.value === "" ? null : Number(e.target.value) })} />
                    )}
                    {f.kind === "choice" && (
                      <select style={{ ...S.inp, width: 220 }} value={String(row.choice_value ?? "").replace(/"/g, "")}
                        onChange={e => setFeat(f, { choice: e.target.value })}>
                        {(f.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                    {f.kind === "multi_choice" && (
                      <select multiple style={{ ...S.inp, width: 220, height: 74 }}
                        value={Array.isArray(row.choice_value) ? row.choice_value : []}
                        onChange={e => setFeat(f, { choice: Array.from(e.target.selectedOptions).map(o => o.value) })}>
                        {(f.options || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PlanEditor({ plan, rpc, say, onSaved }: any) {
  const [f, setF] = useState({ ...plan });
  useEffect(() => { setF({ ...plan }); }, [plan]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr)) auto", gap: 8, alignItems: "end" }}>
      <div><label style={S.lbl}>Name</label><input style={S.inp} value={f.name || ""} onChange={e => setF({ ...f, name: e.target.value })} /></div>
      <div><label style={S.lbl}>₹ / month</label><input type="number" style={S.inp} value={f.price_monthly ?? 0} onChange={e => setF({ ...f, price_monthly: e.target.value })} /></div>
      <div><label style={S.lbl}>₹ / year</label><input type="number" style={S.inp} value={f.price_yearly ?? 0} onChange={e => setF({ ...f, price_yearly: e.target.value })} /></div>
      <div><label style={S.lbl}>Sessions / month</label><input type="number" style={S.inp} value={f.sessions_per_month ?? 0} onChange={e => setF({ ...f, sessions_per_month: e.target.value })} /></div>
      <div><label style={S.lbl}>Executives</label><input type="number" style={S.inp} value={f.agents_allowed ?? 0} onChange={e => setF({ ...f, agents_allowed: e.target.value })} /></div>
      <div><label style={S.lbl}>Visible</label>
        <select style={S.inp} value={f.is_active ? "1" : "0"} onChange={e => setF({ ...f, is_active: e.target.value === "1" })}>
          <option value="1">Yes</option><option value="0">Hidden</option></select></div>
      <button style={S.prim} onClick={async () => {
        try {
          await rpc("admin_upsert_plan", {
            p_plan_id: f.id, p_name: f.name, p_price_monthly: Number(f.price_monthly),
            p_price_yearly: Number(f.price_yearly), p_sessions: Number(f.sessions_per_month),
            p_agents: Number(f.agents_allowed), p_is_active: !!f.is_active });
          say("Plan saved."); onSaved();
        } catch (e: any) { say(e.message, "bad"); }
      }}>Save plan</button>
    </div>
  );
}

// ── FEATURES ─────────────────────────────────────────────────────────────────
function FeaturesTab({ rpc, caps, say }: any) {
  const [features, setFeatures] = useState<any[]>([]);
  const [nf, setNf] = useState({ key: "", label: "", category: "modules", kind: "boolean", description: "" });
  const load = useCallback(async () => {
    const { data } = await supabase.from("features").select("*").order("sort_order");
    setFeatures(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Note tone="warn">
        <b>You will rarely need this tab.</b> Everything you normally do — deciding which
        plan gets which module — is on the <b>Plans &amp; Pricing</b> tab, in the grid at
        the top.
        <br /><br />
        This tab is only for when a NEW capability is added to the product and it needs a
        name before it can be sold. Creating a name here does nothing on its own: the
        application code has to be changed to check for it. So do not create anything here
        unless a developer has asked you to, and has told you the exact key to type.
      </Note>

      {caps.is_owner && (
        <div style={S.card}>
          <div style={S.h}>Add a name for a new capability</div>
          <div style={S.sub}>
            Only do this if a developer asked you to, and gave you the exact key.
            A name created here does nothing until the application is changed to use it.
            <b> The key can never be changed afterwards.</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
            <div><label style={S.lbl}>Key</label><input style={S.inp} value={nf.key} placeholder="module_forecasting" onChange={e => setNf({ ...nf, key: e.target.value })} /></div>
            <div><label style={S.lbl}>Label</label><input style={S.inp} value={nf.label} placeholder="Forecasting" onChange={e => setNf({ ...nf, label: e.target.value })} /></div>
            <div><label style={S.lbl}>Category</label>
              <select style={S.inp} value={nf.category} onChange={e => setNf({ ...nf, category: e.target.value })}>
                {["limits", "modules", "exports", "providers", "support", "general"].map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><label style={S.lbl}>Type</label>
              <select style={S.inp} value={nf.kind} onChange={e => setNf({ ...nf, kind: e.target.value })}>
                <option value="boolean">Tick box</option>
                <option value="numeric">Number</option>
                <option value="choice">Dropdown</option>
                <option value="multi_choice">Multi-select</option>
              </select></div>
            <button style={S.prim} onClick={async () => {
              if (!/^[a-z][a-z0-9_]{2,}$/.test(nf.key)) { say("Key must be lower_snake_case, at least 3 characters.", "warn"); return; }
              try { await rpc("admin_upsert_feature", { p_key: nf.key, p_label: nf.label || nf.key,
                p_category: nf.category, p_kind: nf.kind, p_default_on: false, p_description: nf.description });
                say("Feature created."); setNf({ key: "", label: "", category: "modules", kind: "boolean", description: "" }); load();
              } catch (e: any) { say(e.message, "bad"); }
            }}>Create</button>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.h}>Everything the system can switch on or off ({features.length})</div>
        <div style={S.sub}>
          A reference list. Nothing here needs changing. Use the Plans &amp; Pricing tab to
          decide who gets what.
        </div>
        <div style={tableWrap}>
        <table style={{ ...TBL, minWidth: 640 }}>
          <colgroup><col style={{ width: 230 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 110 }} /></colgroup>
          <thead><tr>
            <th style={TH("left")}>Key</th><th style={TH("left")}>Label</th>
            <th style={TH("left")}>Category</th><th style={TH("left")}>Type</th>
          </tr></thead>
          <tbody>{features.map(f => (
            <tr key={f.id}>
              <td style={{ ...TD("left", { mono: true, dim: true }), fontSize: 9.5 }}>{f.key}</td>
              <td style={TD("left")}>{f.label}</td>
              <td style={TD("left")}>
                <span style={{ fontSize: 8.5, color: f.category === "admin" ? C.amber : C.faint }}>{f.category}</span>
              </td>
              <td style={TD("left", { dim: true })}>{f.kind}</td>
            </tr>
          ))}</tbody>
        </table>
        </div>
      </div>
    </>
  );
}

// ── SUPPORT ──────────────────────────────────────────────────────────────────
function SupportTab({ rpc, say }: any) {
  const [threads, setThreads] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    try { setThreads(await rpc("admin_list_support") || []); }
    catch (e: any) { say(e.message, "bad"); }
  }, [rpc, say]);
  useEffect(() => { load(); }, [load]);

  const openThread = async (t: any) => {
    setOpen(t);
    const { data } = await supabase.from("support_messages").select("*")
      .eq("thread_id", t.thread_id).order("created_at");
    setMessages(data || []);
    try { await rpc("admin_set_thread_status", { p_thread_id: t.thread_id }); load(); } catch { /* marks read */ }
  };

  const send = async () => {
    if (!reply.trim() || !open) return;
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    // is_admin is set by a database trigger from the author's real role, not
    // from anything sent here - a user cannot post a reply that looks like ours.
    const { error } = await supabase.from("support_messages")
      .insert({ thread_id: open.thread_id, author_id: uid, body: reply.trim() });
    if (error) { say(error.message, "bad"); return; }
    setReply(""); openThread(open);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 2fr", gap: 14 }}>
      <div style={S.card}>
        <div style={S.h}>Inbox ({threads.length})</div>
        {!threads.length && <div style={S.sub}>No messages yet.</div>}
        {threads.map(t => (
          <div key={t.thread_id} onClick={() => openThread(t)}
            style={{ padding: "8px 9px", borderRadius: 5, cursor: "pointer", marginBottom: 5,
              background: open?.thread_id === t.thread_id ? "rgba(20,184,166,0.08)" : "transparent",
              border: "1px solid " + (t.unread ? C.teal + "55" : C.line) }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700 }}>{t.subject}</div>
              {t.unread && <span style={{ fontSize: 8, color: C.teal, fontWeight: 800 }}>NEW</span>}
            </div>
            <div style={{ fontSize: 8.5, color: C.faint }}>{t.user_email} · {t.category} · {t.status}</div>
          </div>
        ))}
      </div>

      <div style={S.card}>
        {!open ? <div style={S.sub}>Select a message to read and reply.</div> : (
          <>
            <div style={S.h}>{open.subject}</div>
            <div style={S.sub}>{open.user_email} · {open.category}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {["open", "in_progress", "resolved", "closed"].map(st => (
                <button key={st} style={{ ...S.btn, padding: "4px 8px", fontSize: 9.5,
                  borderColor: open.status === st ? C.teal : C.line }}
                  onClick={async () => { try { await rpc("admin_set_thread_status", { p_thread_id: open.thread_id, p_status: st });
                    setOpen({ ...open, status: st }); load(); } catch (e: any) { say(e.message, "bad"); } }}>
                  {st.replace("_", " ")}</button>
              ))}
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 10 }}>
              {messages.map(m => (
                <div key={m.id} style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 5,
                  background: m.is_admin ? "rgba(20,184,166,0.07)" : "#0A0E1A",
                  border: "1px solid " + C.line }}>
                  <div style={{ fontSize: 8.5, color: m.is_admin ? C.teal : C.faint, fontWeight: 800, marginBottom: 3 }}>
                    {m.is_admin ? "YOU" : "USER"} · {new Date(m.created_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.body}</div>
                </div>
              ))}
            </div>
            <textarea style={{ ...S.inp, minHeight: 70, resize: "vertical" }} value={reply}
              onChange={e => setReply(e.target.value)} placeholder="Write a reply…" />
            <button style={{ ...S.prim, marginTop: 8 }} onClick={send}>Send reply</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── ROLES & ACCESS (owner only) ──────────────────────────────────────────────
function AccessTab({ rpc, say, isOwner }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [adminFeatures, setAdminFeatures] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);
  const [seatCap, setSeatCap] = useState("");
  const [seats, setSeats] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await rpc("admin_list_users") || []);
      setSeats(await rpc("admin_signup_status"));
      const { data: ft } = await supabase.from("features").select("*").eq("category", "admin").order("sort_order");
      setAdminFeatures(ft || []);
      const { data: g } = await supabase.from("user_feature_grants").select("*");
      setGrants(g || []);
    } catch (e: any) { say(e.message, "bad"); }
  }, [rpc, say]);
  useEffect(() => { load(); }, [load]);

  const hasGrant = (uid: string, fid: string) =>
    !!grants.find(g => g.user_id === uid && g.feature_id === fid && g.enabled);

  return (
    <>
      <Note tone="warn">
        <b>Three roles.</b> <b>OWNER</b> is you — everything, including appointing others.
        <b> STAFF</b> can do only what you tick below. <b>USER</b> is everyone else.
        Changing roles, deleting accounts and moving the seat cap are owner-only and cannot be
        delegated: staff who could appoint themselves owner would not be staff.
      </Note>

      <div style={S.card}>
        <div style={S.h}>Registration</div>
        <div style={S.sub}>
          {seats && <>Currently <b>{seats.used}</b> of <b>{seats.max_users}</b> seats used, {seats.remaining} remaining.</>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <div><label style={S.lbl}>Seat cap</label>
            <input style={{ ...S.inp, width: 120 }} type="number" value={seatCap}
              placeholder={String(seats?.max_users ?? "")} onChange={e => setSeatCap(e.target.value)} /></div>
          <button style={S.prim} onClick={async () => {
            try { const r = await rpc("admin_set_signup_policy", { p_max_users: Number(seatCap), p_enabled: null });
              say("Seat cap is now " + (r as any).max_users + "."); setSeatCap(""); load();
            } catch (e: any) { say(e.message, "bad"); } }}>Save cap</button>
          <button style={S.btn} onClick={async () => {
            try { const r = await rpc("admin_set_signup_policy", { p_max_users: null, p_enabled: !seats?.signups_enabled });
              say("Registration " + ((r as any).signups_enabled ? "opened" : "closed") + "."); load();
            } catch (e: any) { say(e.message, "bad"); } }}>
            {seats?.signups_enabled ? "Close registration" : "Open registration"}</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.h}>Roles and staff capabilities</div>
        <div style={S.sub}>
          Set someone to STAFF, then tick the capabilities they should have. A capability only
          takes effect for someone whose role is STAFF — a stray tick on a normal user grants
          nothing, so one mis-click cannot create an administrator.
        </div>
        <div style={tableWrap}>
          <table style={{ ...TBL, minWidth: 320 + 130 + adminFeatures.length * 120 }}>
            <colgroup>
              <col style={{ width: 320 }} /><col style={{ width: 130 }} />
              {adminFeatures.map(f => <col key={f.id} style={{ width: 120 }} />)}
            </colgroup>
            <thead><tr>
              <th style={TH("left")}>User</th><th style={TH("left")}>Role</th>
              {adminFeatures.map(f => <th key={f.id} style={{ ...TH("center"), whiteSpace: "normal", lineHeight: 1.35 }}>{f.label.replace("Staff: ", "")}</th>)}
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td style={TD("left")}>{u.email}</td>
                  <td style={TD("left")}>
                    <select style={{ ...S.inp, padding: "4px 6px", fontSize: 10, width: 110 }} value={u.role}
                      onChange={async e => {
                        try { await rpc("admin_set_user_role", { p_user_id: u.user_id, p_role: e.target.value });
                          say(u.email + " is now " + e.target.value + "."); load(); }
                        catch (err: any) { say(err.message, "bad"); }
                      }}>
                      <option value="user">USER</option>
                      <option value="admin">STAFF</option>
                      {/* The OWNER option is rendered ONLY for the owner. Staff can
                          already never reach this tab, and the database refuses
                          admin_set_user_role from anyone but the owner - this is a
                          third layer, so the option does not exist even to look at. */}
                      {isOwner && <option value="super_admin">OWNER</option>}
                    </select>
                  </td>
                  {adminFeatures.map(f => (
                    <td key={f.id} style={TD("center")}>
                      <input type="checkbox" disabled={u.role === "super_admin"}
                        checked={u.role === "super_admin" || hasGrant(u.user_id, f.id)}
                        style={{ cursor: u.role === "super_admin" ? "not-allowed" : "pointer" }}
                        onChange={async e => {
                          try {
                            if (e.target.checked) await rpc("admin_grant_feature", { p_user_id: u.user_id, p_feature_key: f.key, p_enabled: true, p_reason: "Staff capability" });
                            else await rpc("admin_revoke_grant", { p_user_id: u.user_id, p_feature_key: f.key });
                            load();
                          } catch (err: any) { say(err.message, "bad"); }
                        }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note tone="bad">
          <b>Be careful with OWNER.</b> Anyone you set to OWNER gets everything you have,
          permanently, including the ability to change your role. There is no undo from their
          side. The database stops you removing your own OWNER role, so the product can never be
          left with no administrator — but it cannot stop you appointing the wrong person.
        </Note>
      </div>
    </>
  );
}

/* ============================================================================
 * NVIDIA ACCESS — decides who can use the shared NVIDIA key, exactly as
 * asked: a toggle per plan (Enterprise, etc.), and a search-and-grant list
 * for individual people regardless of their plan. Both reuse the existing,
 * already-secured admin_set_plan_feature / admin_grant_feature /
 * admin_revoke_grant functions - no new database logic, only a real UI for
 * a control that already existed underneath but had nowhere to be used.
 * ========================================================================== */
function NvidiaAccessTab({ rpc, say }: any) {
  const FEATURE_KEY = "workspace_shared_nvidia";
  const [plans, setPlans] = useState<any[]>([]);
  const [planFeatures, setPlanFeatures] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: pl } = await supabase.from("plans").select("id,name").order("name");
      setPlans(pl || []);
      const { data: feat } = await supabase.from("features").select("id").eq("key", FEATURE_KEY).single();
      if (feat) {
        const { data: pf } = await supabase.from("plan_features").select("*").eq("feature_id", feat.id);
        setPlanFeatures(pf || []);
        const { data: g } = await supabase.from("user_feature_grants").select("*").eq("feature_id", feat.id);
        setGrants(g || []);
      }
      setUsers(await rpc("admin_list_users") || []);
    } catch (e: any) { say(e.message, "bad"); }
    setLoading(false);
  }, [rpc, say]);
  useEffect(() => { load(); }, [load]);

  const planEnabled = (planId: string) => !!planFeatures.find(pf => pf.plan_id === planId && pf.enabled);
  const togglePlan = async (planId: string, enabled: boolean) => {
    try { await rpc("admin_set_plan_feature", { p_plan_id: planId, p_feature_key: FEATURE_KEY, p_enabled: enabled }); load(); }
    catch (e: any) { say(e.message, "bad"); }
  };

  const userGrant = (userId: string) => grants.find(g => g.user_id === userId);
  const toggleUserGrant = async (userId: string, enable: boolean) => {
    try {
      if (enable) await rpc("admin_grant_feature", { p_user_id: userId, p_feature_key: FEATURE_KEY, p_enabled: true, p_reason: "Individual grant — NVIDIA Access tab" });
      else await rpc("admin_revoke_grant", { p_user_id: userId, p_feature_key: FEATURE_KEY });
      load();
    } catch (e: any) { say(e.message, "bad"); }
  };

  const filteredUsers = users.filter((u: any) =>
    !search.trim() || (u.email || "").toLowerCase().includes(search.toLowerCase()) || (u.full_name || "").toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div style={{ color: C.faint, fontSize: 11 }}>Loading…</div>;

  return (
    <>
      <Note tone="warn">
        This controls who can use the shared NVIDIA key you've saved in Cloudflare, at no cost to
        them. It has nothing to do with anyone bringing their own key — that always works
        regardless of what's set here.
      </Note>

      <div style={S.card}>
        <div style={S.h}>Access by plan</div>
        <div style={S.sub}>Anyone on a plan with this switched on gets the shared free tier automatically.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {plans.map(p => (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={planEnabled(p.id)} onChange={e => togglePlan(p.id, e.target.checked)} style={{ accentColor: C.teal }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{p.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.h}>Access for a specific person</div>
        <div style={S.sub}>Grant or remove access for one individual, regardless of their plan — useful for someone on a plan that doesn't normally include it.</div>
        <input style={{ ...S.inp, marginTop: 8, marginBottom: 10, maxWidth: 320 }} placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={TD("left")}>User</th><th style={TD("left")}>Plan</th><th style={TD("center")}>Access</th>
          </tr></thead>
          <tbody>
            {filteredUsers.slice(0, 50).map((u: any) => {
              const fromPlan = plans.find(p => p.name === u.plan_name && planEnabled(p.id));
              const g = userGrant(u.user_id);
              const individuallyOn = g?.enabled;
              return (
                <tr key={u.user_id}>
                  <td style={TD("left")}>{u.full_name || u.email}<div style={{ fontSize: 9.5, color: C.faint }}>{u.email}</div></td>
                  <td style={TD("left")}>{u.plan_name || "—"}{fromPlan && <span style={{ fontSize: 9, color: C.teal, marginLeft: 6 }}>(via plan)</span>}</td>
                  <td style={TD("center")}>
                    <input type="checkbox" checked={!!fromPlan || !!individuallyOn} disabled={!!fromPlan}
                      title={fromPlan ? "Already granted through their plan" : ""}
                      onChange={e => toggleUserGrant(u.user_id, e.target.checked)}
                      style={{ cursor: fromPlan ? "not-allowed" : "pointer", accentColor: C.teal }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredUsers.length > 50 && <div style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>Showing first 50 matches — narrow your search to see more.</div>}
      </div>
    </>
  );
}

/* ============================================================================
 * JARVIS ACCESS — deliberately simpler than NVIDIA Access: individual
 * grants only, no per-plan toggle. JARVIS defaults to owner-only; the only
 * way anyone else gets it is an explicit grant here, exactly as asked.
 * ========================================================================== */
function JarvisAccessTab({ rpc, say }: any) {
  const FEATURE_KEY = "jarvis_access";
  const [users, setUsers] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: feat } = await supabase.from("features").select("id").eq("key", FEATURE_KEY).maybeSingle();
      if (feat) {
        const { data: g } = await supabase.from("user_feature_grants").select("*").eq("feature_id", feat.id);
        setGrants(g || []);
      }
      setUsers(await rpc("admin_list_users") || []);
    } catch (e: any) { say(e.message, "bad"); }
    setLoading(false);
  }, [rpc, say]);
  useEffect(() => { load(); }, [load]);

  const userGrant = (userId: string) => grants.find(g => g.user_id === userId);
  const toggleUserGrant = async (userId: string, enable: boolean) => {
    try {
      if (enable) await rpc("admin_grant_feature", { p_user_id: userId, p_feature_key: FEATURE_KEY, p_enabled: true, p_reason: "Individual grant — JARVIS Access tab" });
      else await rpc("admin_revoke_grant", { p_user_id: userId, p_feature_key: FEATURE_KEY });
      load();
    } catch (e: any) { say(e.message, "bad"); }
  };

  const filteredUsers = users.filter((u: any) =>
    !search.trim() || (u.email || "").toLowerCase().includes(search.toLowerCase()) || (u.full_name || "").toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div style={{ color: C.faint, fontSize: 11 }}>Loading…</div>;

  return (
    <>
      <Note tone="warn">
        JARVIS is owner-only by default — no plan includes it automatically. Grant it to a specific
        person here if they need it; a granted user only ever sees their own account's data through
        JARVIS, never platform-wide numbers.
      </Note>

      <div style={S.card}>
        <div style={S.h}>Access for a specific person</div>
        <input style={{ ...S.inp, marginTop: 8, marginBottom: 10, maxWidth: 320 }} placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={TD("left")}>User</th><th style={TD("left")}>Role</th><th style={TD("center")}>Access</th>
          </tr></thead>
          <tbody>
            {filteredUsers.slice(0, 50).map((u: any) => {
              const g = userGrant(u.user_id);
              const isOwner = u.role === "super_admin";
              return (
                <tr key={u.user_id}>
                  <td style={TD("left")}>{u.full_name || u.email}<div style={{ fontSize: 9.5, color: C.faint }}>{u.email}</div></td>
                  <td style={TD("left")}>{u.role}</td>
                  <td style={TD("center")}>
                    <input type="checkbox" checked={isOwner || !!g?.enabled} disabled={isOwner}
                      title={isOwner ? "The owner always has access" : ""}
                      onChange={e => toggleUserGrant(u.user_id, e.target.checked)}
                      style={{ cursor: isOwner ? "not-allowed" : "pointer", accentColor: C.teal }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredUsers.length > 50 && <div style={{ fontSize: 10, color: C.faint, marginTop: 8 }}>Showing first 50 matches — narrow your search to see more.</div>}
      </div>
    </>
  );
}

/* ============================================================================
 * DONATION — moved here from Settings, exactly as requested. Fully
 * self-contained: reads and writes platform_donation_settings (the single
 * shared row, id=1) directly, the same table and shape the old Settings tab
 * used, so nothing about how the actual donation popup reads this data
 * changes - only where an owner goes to edit it.
 * ========================================================================== */
function DonationTab({ say }: any) {
  const [cfg, setCfg] = useState<any>(null);
  const [local, setLocal] = useState({
    ownerName: "", ownerEmail: "", upiId: "", bankName: "", accountNo: "", ifsc: "",
    accountType: "", paypalMe: "", stripeLink: "", note: "", qrImage: "", enabled: false,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("platform_donation_settings").select("*").eq("id", 1).maybeSingle();
    if (data) {
      setLocal({
        ownerName: data.owner_name || "", ownerEmail: data.owner_email || "", upiId: data.upi_id || "",
        bankName: data.bank_name || "", accountNo: data.account_no || "", ifsc: data.ifsc || "",
        accountType: data.account_type || "", paypalMe: data.paypal_me || "", stripeLink: data.stripe_link || "",
        note: data.note || "", qrImage: data.qr_image || "", enabled: !!data.enabled,
      });
      setCfg(data);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveDetails = async () => {
    const { error } = await supabase.from("platform_donation_settings").update({
      owner_name: local.ownerName, owner_email: local.ownerEmail, upi_id: local.upiId,
      bank_name: local.bankName, account_no: local.accountNo, ifsc: local.ifsc,
      account_type: local.accountType, paypal_me: local.paypalMe, stripe_link: local.stripeLink,
      note: local.note, qr_image: local.qrImage, enabled: local.enabled,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) { say("Could not save: " + error.message, "bad"); return; }
    say("Donation settings saved for every user on the platform", "info");
    load();
  };

  const saveTiming = async (first: number, interval: number) => {
    const { error } = await supabase.from("platform_donation_settings").update({
      first_delay_minutes: first, interval_minutes: interval,
    }).eq("id", 1);
    if (error) { say("Could not save: " + error.message, "bad"); return; }
    setCfg((p: any) => ({ ...p, first_delay_minutes: first, interval_minutes: interval }));
    say("Timing saved", "info");
  };

  if (loading) return <div style={{ color: C.faint, fontSize: 11 }}>Loading…</div>;

  return (
    <div style={S.card}>
      <div style={S.h}>Donation</div>
      <div style={S.sub}>
        Whether the donation button appears on the site, when it shows, and where the money actually goes.
        This is the one shared setting for every user on the platform, not a per-browser preference.
        Users pay you directly — OrchestrIQ never handles money.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, padding: 12,
        background: "rgba(255,255,255,0.02)", border: "1px solid " + C.line, borderRadius: 7 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.dim, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Popup timing
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={S.lbl}>First shown after (minutes)</label>
            <input type="number" style={S.inp} defaultValue={cfg?.first_delay_minutes || 30}
              onBlur={e => saveTiming(Number(e.target.value) || 30, cfg?.interval_minutes || 30)} /></div>
          <div><label style={S.lbl}>Repeats every (minutes)</label>
            <input type="number" style={S.inp} defaultValue={cfg?.interval_minutes || 30}
              onBlur={e => saveTiming(cfg?.first_delay_minutes || 30, Number(e.target.value) || 30)} /></div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {([["ownerName", "Your Name", "e.g. Anubhav Sharma"], ["ownerEmail", "Contact Email", "for enquiries"],
          ["upiId", "UPI ID", "yourname@upi"], ["bankName", "Bank Name", "e.g. HDFC Bank"],
          ["accountNo", "Account Number", "for NEFT/IMPS"], ["ifsc", "IFSC Code", "HDFC0001234"],
          ["accountType", "Account Type", "Savings or Current"], ["paypalMe", "PayPal.me Link", "paypal.me/yourname"],
          ["stripeLink", "Stripe Link", "buy.stripe.com/..."], ["note", "Donation Note", "Thank you message"]] as const)
          .map(([f, lb, ph]) => (
          <div key={f}><label style={S.lbl}>{lb}</label>
            <input style={S.inp} value={(local as any)[f] || ""}
              onChange={e => setLocal(p => ({ ...p, [f]: e.target.value }))} placeholder={ph} /></div>
        ))}
        <div>
          <label style={S.lbl}>Payment QR Code (image)</label>
          {local.qrImage ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8,
              background: "#0a0e1a", border: "1px solid " + C.line, borderRadius: 6 }}>
              <img src={local.qrImage} alt="QR" style={{ width: 56, height: 56, borderRadius: 4, objectFit: "contain", background: "#fff" }} />
              <div style={{ flex: 1, fontSize: 10, color: C.green }}>QR code uploaded ✓</div>
              <button onClick={() => setLocal(p => ({ ...p, qrImage: "" }))} style={S.danger}>Remove</button>
            </div>
          ) : (
            <label style={{ ...S.inp, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.faint, fontSize: 11, padding: 12 }}>
              📷 Upload QR code image (PNG / JPG)
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const file = e.target.files?.[0]; if (!file) return;
                if (file.size > 2 * 1024 * 1024) { say("Image too large (max 2MB)", "bad"); return; }
                const rd = new FileReader();
                rd.onload = ev => setLocal(p => ({ ...p, qrImage: ev.target?.result as string }));
                rd.readAsDataURL(file);
              }} />
            </label>
          )}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 4 }}>
          <input type="checkbox" checked={!!local.enabled} onChange={e => setLocal(p => ({ ...p, enabled: e.target.checked }))} style={{ accentColor: C.teal }} />
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>Enable donation button on landing page</span>
        </label>
        <button onClick={saveDetails} style={{ ...S.prim, marginTop: 4, width: "fit-content" }}>Save Donation Settings</button>
      </div>
    </div>
  );
}
