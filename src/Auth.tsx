import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

const BRAND = "OrchestrIQ";

export default function Auth({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  // THE SECOND, MORE SERIOUS BUG FOUND WHILE FIXING THE REPORTED ONE: even
  // once the reset link lands on the right domain, nothing in this file
  // ever detected that a password-recovery session was active, and no
  // screen existed to actually type a new password. Supabase's JS client
  // fires a specific "PASSWORD_RECOVERY" event the moment it recognizes the
  // recovery tokens in the URL - listening for it here is what actually
  // completes the flow the reported bug only got halfway through.
  useEffect(() => {
    // A BACKUP CHECK, added deliberately: real, documented Supabase issues
    // show the PASSWORD_RECOVERY event does not always fire reliably in
    // every browser/timing scenario. Checking the URL hash directly on
    // mount catches the case the event listener below might miss - this
    // fix should not depend on a single mechanism working every time.
    if (window.location.hash.includes("type=recovery")) {
      setMode("reset");
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
        setMessage(null);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setMessage({ text: "Please enter your email and password.", type: "error" });
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage({ text: error.message, type: "error" });
    } else {
      onAuth();
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || !name.trim()) {
      setMessage({ text: "Please fill in all fields.", type: "error" });
      return;
    }
    if (password.length < 6) {
      setMessage({ text: "Password must be at least 6 characters.", type: "error" });
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) {
      setMessage({ text: error.message, type: "error" });
    } else {
      setMessage({
        text: "Account created! Check your email to confirm, then log in.",
        type: "success",
      });
      setMode("login");
    }
    setLoading(false);
  };

  const handleForgot = async () => {
    if (!email.trim()) {
      setMessage({ text: "Please enter your email address.", type: "error" });
      return;
    }
    setLoading(true);
    setMessage(null);
    // THE REPORTED BUG, CONFIRMED: this call had no redirectTo at all, so
    // Supabase fell back entirely to the dashboard's "Site URL" setting -
    // which is set to localhost:3000, a leftover from local development.
    // window.location.origin is whatever domain the app is ACTUALLY running
    // on right now, so this is correct in production, in a preview
    // deployment, and in local development alike - it can never point at
    // the wrong environment. The Supabase dashboard's Site URL should also
    // be updated to the real production domain as a backup default, but
    // this fix does not depend on that being done correctly.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setMessage({ text: error.message, type: "error" });
    } else {
      setMessage({ text: "Password reset email sent! Check your inbox.", type: "success" });
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!password.trim() || !confirmPassword.trim()) {
      setMessage({ text: "Please enter and confirm your new password.", type: "error" });
      return;
    }
    if (password.length < 6) {
      setMessage({ text: "Password must be at least 6 characters.", type: "error" });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage({ text: error.message, type: "error" });
    } else {
      setMessage({ text: "Password updated! You're now signed in.", type: "success" });
      setTimeout(() => onAuth(), 1200);
    }
    setLoading(false);
  };

  const handleSubmit = () => {
    if (mode === "login") handleLogin();
    else if (mode === "signup") handleSignup();
    else if (mode === "reset") handleResetPassword();
    else handleForgot();
  };

  const inputStyle = {
    width: "100%",
    background: "#0a0e1a",
    border: "1px solid #1a2030",
    borderRadius: 6,
    padding: "10px 12px",
    color: "#F1F5F9",
    fontSize: 13,
    fontFamily: "Manrope, sans-serif",
    boxSizing: "border-box" as const,
  };

  const labelStyle = {
    fontSize: 9,
    fontWeight: 700,
    color: "#5A6480",
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
    display: "block",
    marginBottom: 4,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope, sans-serif", padding: 20 }}>
      <div style={{ background: "#131825", border: "1px solid #1a2030", borderRadius: 14, padding: "32px 28px", width: "100%", maxWidth: 420 }}>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 32, color: "#14B8A6", fontWeight: 900, marginBottom: 4 }}>◆</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9" }}>{BRAND}</div>
          <div style={{ fontSize: 11, color: "#5A6480", marginTop: 4 }}>
            {mode === "login" && "Sign in to your workspace"}
            {mode === "signup" && "Create your free account"}
            {mode === "forgot" && "Reset your password"}
            {mode === "reset" && "Choose a new password"}
          </div>
        </div>

        {mode === "signup" && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anubhav Srivastava" style={inputStyle} />
          </div>
        )}

        {mode !== "reset" && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inputStyle} />
          </div>
        )}

        {mode !== "forgot" && mode !== "reset" && (
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "Minimum 6 characters" : "Your password"} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inputStyle} />
          </div>
        )}

        {mode === "reset" && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>New Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Type it again" onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inputStyle} />
            </div>
          </>
        )}

        {message && (
          <div style={{ background: message.type === "error" ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: "1px solid " + (message.type === "error" ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"), borderRadius: 6, padding: "10px 12px", fontSize: 12, color: message.type === "error" ? "#EF4444" : "#10B981", marginBottom: 16, lineHeight: 1.5 }}>
            {message.text}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", background: "#14B8A6", color: "#0a0e1a", border: "none", borderRadius: 7, padding: "12px", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "Manrope, sans-serif", opacity: loading ? 0.6 : 1, marginBottom: 16 }}>
          {loading ? "Please wait…" : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : mode === "reset" ? "Update Password" : "Send Reset Email"}
        </button>

        <div style={{ textAlign: "center", fontSize: 12, color: "#5A6480" }}>
          {mode === "login" && (
            <>
              <span>No account? </span>
              <button onClick={() => { setMode("signup"); setMessage(null); }} style={{ background: "none", border: "none", color: "#14B8A6", fontWeight: 700, cursor: "pointer", fontFamily: "Manrope, sans-serif", fontSize: 12 }}>Sign Up</button>
              <span style={{ margin: "0 8px" }}>·</span>
              <button onClick={() => { setMode("forgot"); setMessage(null); }} style={{ background: "none", border: "none", color: "#5A6480", cursor: "pointer", fontFamily: "Manrope, sans-serif", fontSize: 12 }}>Forgot password?</button>
            </>
          )}
          {mode === "signup" && (
            <>
              <span>Already have an account? </span>
              <button onClick={() => { setMode("login"); setMessage(null); }} style={{ background: "none", border: "none", color: "#14B8A6", fontWeight: 700, cursor: "pointer", fontFamily: "Manrope, sans-serif", fontSize: 12 }}>Sign In</button>
            </>
          )}
          {mode === "forgot" && (
            <button onClick={() => { setMode("login"); setMessage(null); }} style={{ background: "none", border: "none", color: "#14B8A6", fontWeight: 700, cursor: "pointer", fontFamily: "Manrope, sans-serif", fontSize: 12 }}>Back to Sign In</button>
          )}
        </div>

      </div>
    </div>
  );
}
