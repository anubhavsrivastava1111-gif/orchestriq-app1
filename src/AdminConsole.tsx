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
          <div style={{ display: "flex", gap: 22, alignItems: "baseline", marginBottom: 8 }}>
            <div><div style={{ fontSize: 22, fontWeight: 800 }}>{seats.used}</div><div style={S.lbl}>used</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: C.teal }}>{seats.remaining}</div><div style={S.lbl}>remaining</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: C.faint }}>{seats.max_users}</div><div style={S.lbl}>cap</div></div>
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
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: C.panel, color: C.ink }}>
            <thead><tr>
              <th style={S.th}>Email</th><th style={S.th}>Role</th><th style={S.th}>Plan</th>
              <th style={S.th}>Sessions</th><th style={S.th}>Grants</th><th style={S.th}>Actions</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td style={S.td}>
                    <div style={{ fontWeight: 700 }}>{u.email}</div>
                    <div style={{ fontSize: 8.5, color: C.faint }}>{u.full_name}</div>
                  </td>
                  <td style={S.td}>
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
                  <td style={S.td}>{u.sessions_used}{u.session_limit != null ? " / " + u.session_limit : ""}</td>
                  <td style={S.td}>{u.extra_grants || 0}</td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
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
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: C.panel, color: C.ink }}>
            <thead>
              <tr>
                <th style={{ ...S.th, minWidth: 170 }}>Module</th>
                {plans.map(p => (
                  <th key={p.id} style={{ ...S.th, textAlign: "center", minWidth: 92 }}>
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
                  <td style={{ ...S.td, fontWeight: 700 }}>{f.label}</td>
                  {plans.map(p => {
                    const row = pf[p.id + "|" + f.id] || {};
                    const on = row.enabled ?? f.default_on;
                    return (
                      <td key={p.id} style={{ ...S.td, textAlign: "center", cursor: "pointer",
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
                <td style={{ ...S.td, fontWeight: 700, color: C.dim }}>Sessions per month</td>
                {plans.map(p => (
                  <td key={p.id} style={{ ...S.td, textAlign: "center", color: C.teal, fontWeight: 800 }}>
                    {p.sessions_per_month ?? "\u2013"}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ ...S.td, fontWeight: 700, color: C.dim }}>Executives per session</td>
                {plans.map(p => (
                  <td key={p.id} style={{ ...S.td, textAlign: "center", color: C.teal, fontWeight: 800 }}>
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
        <table style={{ width: "100%", borderCollapse: "collapse", background: C.panel, color: C.ink }}>
          <thead><tr><th style={S.th}>Key</th><th style={S.th}>Label</th><th style={S.th}>Category</th><th style={S.th}>Type</th></tr></thead>
          <tbody>{features.map(f => (
            <tr key={f.id}>
              <td style={{ ...S.td, fontFamily: "monospace", fontSize: 9.5, color: C.dim }}>{f.key}</td>
              <td style={S.td}>{f.label}</td>
              <td style={S.td}>
                <span style={{ fontSize: 8.5, color: f.category === "admin" ? C.amber : C.faint }}>{f.category}</span>
              </td>
              <td style={S.td}><span style={{ fontSize: 9, color: C.faint }}>{f.kind}</span></td>
            </tr>
          ))}</tbody>
        </table>
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
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: C.panel, color: C.ink }}>
            <thead><tr>
              <th style={S.th}>User</th><th style={S.th}>Role</th>
              {adminFeatures.map(f => <th key={f.id} style={{ ...S.th, textAlign: "center" }}>{f.label.replace("Staff: ", "")}</th>)}
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id}>
                  <td style={S.td}>{u.email}</td>
                  <td style={S.td}>
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
                    <td key={f.id} style={{ ...S.td, textAlign: "center" }}>
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
