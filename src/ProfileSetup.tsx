import { useState } from "react";
import { supabase } from "./lib/supabase";

const COUNTRY_CODES = [
  { code: "+91", flag: "🇮🇳", name: "India" },
  { code: "+1", flag: "🇺🇸", name: "USA / Canada" },
  { code: "+44", flag: "🇬🇧", name: "UK" },
  { code: "+61", flag: "🇦🇺", name: "Australia" },
  { code: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "+65", flag: "🇸🇬", name: "Singapore" },
  { code: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "+33", flag: "🇫🇷", name: "France" },
  { code: "+81", flag: "🇯🇵", name: "Japan" },
  { code: "+86", flag: "🇨🇳", name: "China" },
  { code: "+55", flag: "🇧🇷", name: "Brazil" },
  { code: "+27", flag: "🇿🇦", name: "South Africa" },
];

export default function ProfileSetup({ onComplete }: { onComplete: () => void }) {
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const digits = phone.replace(/\D/g, "");
    if (!digits || digits.length < 7) {
      setError("Please enter a valid phone number.");
      return;
    }
    setLoading(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Session expired. Please log in again."); setLoading(false); return; }

    const { error: dbError } = await supabase
      .from("users")
      .update({
        phone: countryCode + digits,
        profile_setup_complete: true,
      })
      .eq("id", user.id);

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
      return;
    }

    onComplete();
  };

  const handleSkip = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("users")
        .update({ profile_setup_complete: true })
        .eq("id", user.id);
    }
    onComplete();
  };

  const inputStyle = {
    background: "#0a0e1a",
    border: "1px solid #1a2030",
    borderRadius: 6,
    padding: "10px 12px",
    color: "#F1F5F9",
    fontSize: 13,
    fontFamily: "Manrope, sans-serif",
  };

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0e1a", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Manrope, sans-serif", padding: 20,
    }}>
      <div style={{
        background: "#131825", border: "1px solid #1a2030",
        borderRadius: 14, padding: "32px 28px", width: "100%", maxWidth: 420,
      }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📱</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", marginBottom: 6 }}>
            One last step
          </div>
          <div style={{ fontSize: 12, color: "#8892B0", lineHeight: 1.6 }}>
            Add your phone number so we can reach you for important account updates.
            This is optional — you can skip it.
          </div>
        </div>

        {/* Country Code + Phone Input */}
        <div style={{ marginBottom: 8 }}>
          <label style={{
            fontSize: 9, fontWeight: 700, color: "#5A6480",
            textTransform: "uppercase", letterSpacing: "0.8px",
            display: "block", marginBottom: 6,
          }}>
            Phone Number (optional)
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            {/* Country code dropdown */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                style={{
                  ...inputStyle,
                  paddingRight: 28,
                  appearance: "none",
                  cursor: "pointer",
                  minWidth: 90,
                }}
              >
                {COUNTRY_CODES.map(c => (
                  <option key={c.code} value={c.code} style={{ background: "#0a0e1a" }}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <span style={{
                position: "absolute", right: 8, top: "50%",
                transform: "translateY(-50%)", pointerEvents: "none",
                fontSize: 10, color: "#5A6480",
              }}>▼</span>
            </div>

            {/* Phone number input */}
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/[^\d\s\-]/g, ""))}
              placeholder="98765 43210"
              onKeyDown={e => e.key === "Enter" && handleSave()}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>

          {/* Preview */}
          {phone.replace(/\D/g, "").length > 0 && (
            <div style={{ fontSize: 10, color: "#5A6480", marginTop: 6 }}>
              {selectedCountry.flag} Full number: {countryCode} {phone}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 6, padding: "10px 12px", fontSize: 12,
            color: "#EF4444", marginBottom: 14, lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={loading}
          style={{
            width: "100%", background: "#14B8A6", color: "#0a0e1a",
            border: "none", borderRadius: 7, padding: "12px",
            fontSize: 14, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "Manrope, sans-serif",
            opacity: loading ? 0.6 : 1,
            marginBottom: 10,
          }}
        >
          {loading ? "Saving…" : "Save and Continue"}
        </button>

        {/* Skip Button */}
        <button
          onClick={handleSkip}
          style={{
            width: "100%", background: "none",
            border: "1px solid #1a2030", borderRadius: 7,
            padding: "11px", fontSize: 13, color: "#5A6480",
            cursor: "pointer", fontFamily: "Manrope, sans-serif",
          }}
        >
          Skip for now
        </button>

        <p style={{ fontSize: 10, color: "#3A4060", textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
          You can add or update your phone number later in your profile settings.
        </p>

      </div>
    </div>
  );
}
