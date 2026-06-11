import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "./lib/supabase";
import Auth from "./Auth";
import ProfileSetup from "./ProfileSetup";
import PlanSelection from "./PlanSelection";
import App from "./App";
import "./index.css";

type Screen = "loading" | "auth" | "profile" | "plan" | "app";

function Root() {
  const [screen, setScreen] = useState<Screen>("loading");

  useEffect(() => {
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setScreen("auth");
      if (event === "SIGNED_IN") checkUser();
    });

    return () => subscription.unsubscribe();
  }, []);

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

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
