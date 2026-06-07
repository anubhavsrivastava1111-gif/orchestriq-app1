import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

const BRAND = "OrchestrIQ";

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  sessions_per_month: number;
  agents_allowed: number;
  features: any;
  is_active: boolean;
}

interface UserStatus {
  trial_login_count: number;
  trial_exhausted: boolean;
  plan_id: string | null;
  plan_name: string;
}

export default function PlanSelection({ onComplete }: { onComplete: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: plansData } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("price_monthly", { ascending: true });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("trial_login_count, trial_exhausted, plan_id, plan_name")
        .eq("id", user.id)
        .single();

      if (userData && !userData.trial_exhausted && !userData.plan_id) {
        await supabase.rpc("increment_trial_login", { user_id: user.id });
        const newCount = (userData.trial_login_count || 0) + 1;
        setUserStatus({
          ...userData,
          trial_login_count: newCount,
          trial_exhausted: newCount >= 3,
        });
      } else {
        setUserStatus(userData);
      }

      setPlans(plansData || []);
    } catch (e) {
      setError("Failed to load plans. Please refresh.");
    }
    setLoading(false);
  };

  const handleSelectPlan = async (plan: Plan) => {
    if (plan.price_monthly === 0) { onComplete(); return; }
    setSelecting(plan.id);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("users").update({
        plan_id: plan.id,
        plan_name: plan.name,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);
      onComplete();
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    }
    setSelecting(null);
  };

  const trialRemaining = userStatus ? Math.max(0, 3 - (userStatus.trial_login_count || 0)) : 3;
  const isTrialExhausted = userStatus?.trial_exhausted || false;
  const hasPaidPlan = !!userStatus?.plan_id && userStatus?.plan_name !== "free";

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope, sans-serif" }}>
      <div style={{ color: "#14B8A6", fontSize: 14 }}>Loading plans…</div>
    </div>
  );

  if (hasPaidPlan) { onComplete(); return null; }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", fontFamily: "Manrope, sans-serif", color: "#A0AAC0", overflowY: "auto" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid #14192a", background: "#0c1120" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20, color: "#14B8A6", fontWeight: 900 }}>◆</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>{BRAND}</span>
        </div>
        {!isTrialExhausted && (
          <button onClick={onComplete} style={{ background: "none", border: "1px solid #1a2030", borderRadius: 6, padding: "7px 16px", color: "#5A6480", fontSize: 12, cursor: "pointer", fontFamily: "Manrope, sans-serif" }}>
            Continue free trial ({trialRemaining} session{trialRemaining !== 1 ? "s" : ""} left)
          </button>
        )}
      </div>

      {isTrialExhausted ? (
        <div style={{ background: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.2)", padding: "14px 32px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: "#EF4444", fontWeight: 600 }}>⚡ Your 3 free trial sessions have been used. Choose a plan to continue.</span>
        </div>
      ) : (
        <div style={{ background: "rgba(20,184,166,0.06)", borderBottom: "1px solid rgba(20,184,166,0.15)", padding: "12px 32px", textAlign: "center" }}>
          <span style={{ fontSize: 12, color: "#14B8A6" }}>✓ Free trial active — <strong>{trialRemaining} session{trialRemaining !== 1 ? "s" : ""}</strong> remaining. Upgrade anytime.</span>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "48px 32px 32px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#14B8A6", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Choose Your Plan</div>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: "#F1F5F9", lineHeight: 1.2, marginBottom: 12 }}>
          Your AI Executive Team.<br />Pay only for what you need.
        </h1>
        <p style={{ fontSize: 14, color: "#8892B0", maxWidth: 500, margin: "0 auto 28px", lineHeight: 1.6 }}>
          From solo founders to enterprise teams — every plan gives you battle-tested AI executives with deep business context.
        </p>
        <div style={{ display: "inline-flex", background: "#131825", border: "1px solid #1a2030", borderRadius: 8, padding: 4, gap: 4 }}>
          {(["monthly", "yearly"] as const).map(b => (
            <button key={b} onClick={() => setBilling(b)} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "Manrope, sans-serif", background: billing === b ? "#14B8A6" : "transparent", color: billing === b ? "#0a0e1a" : "#5A6480" }}>
              {b === "monthly" ? "Monthly" : "Yearly"}
              {b === "yearly" && <span style={{ marginLeft: 6, fontSize: 9, background: "rgba(16,185,129,0.15)", color: "#10B981", padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>Save 17%</span>}
            </button>
          ))}
        </div>
      </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, maxWidth: 1140, margin: "0 auto", padding: "0 32px 60px", justifyContent: "center" }}>
        {plans.map((plan) => {
          const isFree = plan.price_monthly === 0;
          const isPro = plan.name === "Pro";
          const isEnterprise = plan.name === "Enterprise";
          const isStarter = plan.name === "Starter";
          const price = billing === "yearly"
            ? Math.round((plan.price_yearly || plan.price_monthly * 10) / 12)
            : plan.price_monthly;

          const features: string[] = [];
          if (isFree) features.push("3 free trial sessions total");
          features.push(`${plan.agents_allowed} AI executives`);
          features.push(`${plan.sessions_per_month === 999 ? "Unlimited" : plan.sessions_per_month} sessions/month`);
          if (plan.features?.export_pdf) features.push("PDF & PowerPoint export");
          if (plan.features?.boardroom) features.push("AI Boardroom debates");
          if (plan.features?.workflow) features.push("Workflow chains");
          if (plan.features?.autopilot) features.push("Decision Autopilot");
          if (plan.features?.time_machine) features.push("Business Time Machine");
          if (plan.features?.team) features.push("Team collaboration");
          if (plan.features?.priority_support) features.push("Priority support");
          if (plan.features?.dedicated_manager) features.push("Dedicated account manager");
          if (plan.features?.sso) features.push("SSO / SAML");
          if (isEnterprise) features.push("Custom integrations");

          const accentColor = isFree ? "#5A6480" : isPro ? "#14B8A6" : isEnterprise ? "#A855F7" : "#3B82F6";
          const btnBg = isFree ? "#1a2030" : isPro ? "#14B8A6" : isEnterprise ? "#A855F7" : "#3B82F6";
          const btnColor = isFree ? "#A0AAC0" : "#0a0e1a";

          return (
            <div key={plan.id} style={{
              background: isPro ? "linear-gradient(135deg,#0e1a30,#131825)" : "#131825",
              border: `1px solid ${isPro ? "#14B8A6" : isEnterprise ? "#A855F720" : "#1a2030"}`,
              borderRadius: 14, padding: "28px 24px",
              position: "relative", display: "flex", flexDirection: "column",
              boxShadow: isPro ? "0 0 40px rgba(20,184,166,0.08)" : "none",
            }}>

              {isPro && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#14B8A6", color: "#0a0e1a", fontSize: 10, fontWeight: 800, padding: "4px 14px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: 0.5 }}>
                  MOST POPULAR
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                  {plan.name}
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 6 }}>
                  {!isFree && <span style={{ fontSize: 13, color: "#5A6480", fontWeight: 600, marginBottom: 6 }}>₹</span>}
                  <span style={{ fontSize: isFree ? 28 : 36, fontWeight: 900, color: "#F1F5F9", lineHeight: 1 }}>
                    {isFree ? "Free" : price.toLocaleString("en-IN")}
                  </span>
                  {!isFree && <span style={{ fontSize: 12, color: "#5A6480", marginBottom: 6 }}>/mo</span>}
                </div>
                {!isFree && billing === "yearly" && (
                  <div style={{ fontSize: 11, color: "#10B981" }}>
                    Billed ₹{(price * 12).toLocaleString("en-IN")}/year
                  </div>
                )}
                {isFree && (
                  <div style={{ fontSize: 11, color: "#5A6480" }}>No credit card required</div>
                )}
              </div>

              <div style={{ borderTop: "1px solid #1a2030", paddingTop: 20, marginBottom: 24, flex: 1 }}>
                {features.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                    <span style={{ color: accentColor, fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 12, color: "#8892B0", lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleSelectPlan(plan)}
                disabled={selecting === plan.id}
                style={{
                  width: "100%", background: btnBg, color: btnColor,
                  border: isFree ? "1px solid #1a2030" : "none",
                  borderRadius: 8, padding: "12px", fontSize: 13,
                  fontWeight: 700, cursor: selecting === plan.id ? "not-allowed" : "pointer",
                  fontFamily: "Manrope, sans-serif",
                  opacity: selecting === plan.id ? 0.6 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {selecting === plan.id ? "Please wait…" : isFree ? "Continue with Free Trial" : isEnterprise ? "Contact Sales" : `Get ${plan.name}`}
              </button>

            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ textAlign: "center", padding: "0 32px 32px" }}>
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#EF4444", display: "inline-block" }}>
            {error}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", padding: "0 32px 40px", fontSize: 11, color: "#3A4460" }}>
        All plans include SSL security · No hidden fees · Cancel anytime
      </div>

    </div>
  );
}
