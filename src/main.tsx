import { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "./lib/supabase";
import Auth from "./Auth";
import ProfileSetup from "./ProfileSetup";
import PlanSelection from "./PlanSelection";
import App from "./App";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary";
import { loadPrefs, applyDesign } from "./lib/design/ThemeStore";

// Apply the saved theme before React paints. Previously applyDesign() ran only
// when the Design Centre panel mounted, so every normal page load rendered with
// the theme variables undefined — no accent, no canvas colour, no display font.
applyDesign(loadPrefs());

type Screen = "loading" | "auth" | "profile" | "plan" | "app";

function Root() {
  const [screen, setScreen] = useState<Screen>("loading");
  // THE ACTUAL BUG, CONFIRMED: this file has its own separate auth-state
  // listener from Auth.tsx's, and it did not know the difference between
  // "a normal sign-in" and "someone just clicked a password-recovery link."
  // A recovery link can also trigger this listener's SIGNED_IN branch,
  // which calls checkUser() and - finding a valid session - jumps straight
  // to the main app. That is precisely "click the link, get logged in,
  // never asked to set a new password." This ref locks the screen to the
  // reset flow the moment a recovery session is detected, and blocks any
  // later checkUser() call (including one already in flight) from
  // overriding it back to "app" - checkUser() is async and could otherwise
  // resolve after this check runs, re-opening the exact same bug.
  const isRecoveryRef = useRef(false);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) {
      isRecoveryRef.current = true;
      setScreen("auth");
    } else {
      checkUser();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        isRecoveryRef.current = true;
        setScreen("auth");
        return;
      }
      if (event === "SIGNED_OUT") { isRecoveryRef.current = false; setScreen("auth"); }
      if (event === "SIGNED_IN" && !isRecoveryRef.current) checkUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  // The colour walk needs #oiq-root to exist, which it does not at import time.
  // Re-apply once the app screen is mounted.
  useEffect(() => {
    if (screen !== "app") return;
    const id = setTimeout(() => applyDesign(loadPrefs()), 60);
    return () => clearTimeout(id);
  }, [screen]);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setScreen("auth");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("full_name, company_name, trial_login_count, trial_exhausted, plan_id, plan_name, profile_setup_complete")
        .eq("id", user.id)
        .single();

      // A LATE CHECK, NEEDED SEPARATELY FROM THE ONES ABOVE: this function
      // is async and can still be waiting on the two calls above at the
      // exact moment a recovery link is detected elsewhere. Without this,
      // an already-in-flight call could finish afterward and set "app"
      // anyway, silently undoing the fix.
      if (isRecoveryRef.current) return;

      if (!userData) {
        setScreen("auth");
        return;
      }

      // Profile not complete yet — show only once
      if (!userData.profile_setup_complete && (!userData.full_name || !userData.company_name)) {
        setScreen("profile");
        return;
      }

      // Trial exhausted and no paid plan — force plan selection
      if (userData.trial_exhausted && !userData.plan_id) {
        setScreen("plan");
        return;
      }

      // Has paid plan — go straight to app
      if (userData.plan_id && userData.plan_name !== "free") {
        setScreen("app");
        return;
      }

      // Still in free trial — show plan screen (with skip option)
      setScreen("plan");

    } catch (e) {
      setScreen("auth");
    }
  };

  if (screen === "loading") return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0e1a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "Manrope, sans-serif",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 24, color: "#14B8A6", fontWeight: 900, marginBottom: 8 }}>◆ OrchestrIQ</div>
        <div style={{ fontSize: 12, color: "#3A4460" }}>Loading…</div>
      </div>
    </div>
  );

  if (screen === "auth") return <Auth onAuth={checkUser} />;
  if (screen === "profile") return <ProfileSetup onComplete={() => setScreen("plan")} />;
  if (screen === "plan") return <PlanSelection onComplete={() => setScreen("app")} />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>
);
