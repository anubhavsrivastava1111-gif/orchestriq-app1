// ─── ErrorBoundary ────────────────────────────────────────────────────────────
// Catches any unhandled React render errors and shows a friendly recovery
// screen instead of a blank white page.
//
// HOW TO WIRE (one line in src/main.tsx or index.tsx):
//   import ErrorBoundary from "./components/ErrorBoundary";
//   ReactDOM.createRoot(document.getElementById("root")!).render(
//     <ErrorBoundary>
//       <App />
//     </ErrorBoundary>
//   );
//
// The ErrorFallback UI matches OrchestrIQ's dark theme so it looks intentional,
// not broken, to users.

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorTime: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "", errorTime: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || "Unknown error",
      errorTime: new Date().toLocaleTimeString(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log for future diagnostics panel — errors accumulate here
    console.error("[OrchestrIQ ErrorBoundary]", error, errorInfo);
    try {
      const log = JSON.parse(localStorage.getItem("cos-ui-errors") || "[]");
      log.unshift({
        ts: new Date().toISOString(),
        message: error?.message,
        stack: error?.stack?.slice(0, 400),
        componentStack: errorInfo.componentStack?.slice(0, 400),
      });
      localStorage.setItem("cos-ui-errors", JSON.stringify(log.slice(0, 10)));
    } catch { /* storage full — silent */ }
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: "", errorTime: "" });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          minHeight: "100vh", background: "#0B1120",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Inter', system-ui, sans-serif", color: "#E8EFF8",
          padding: 24,
        }}>
          <div style={{
            maxWidth: 480, textAlign: "center",
            background: "#111827", borderRadius: 16,
            padding: "40px 32px",
            border: "1px solid #1E2D3D",
            boxShadow: "0 0 0 4px rgba(20,184,166,0.08)",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#14B8A6", marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: "#94A3B8", lineHeight: 1.7, marginBottom: 24 }}>
              OrchestrIQ encountered an unexpected error. Your data is safe — this
              only affects the current view. You can try recovering below or reload
              the page.
            </p>
            <div style={{
              background: "#0D1829", borderRadius: 8, padding: "10px 14px",
              marginBottom: 24, fontSize: 11, color: "#4D6A8A",
              textAlign: "left", fontFamily: "monospace",
            }}>
              {this.state.errorMessage || "No message available"} ({this.state.errorTime})
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: "10px 22px", borderRadius: 8, fontSize: 13,
                  fontWeight: 700, cursor: "pointer",
                  background: "rgba(20,184,166,0.12)", color: "#14B8A6",
                  border: "1px solid #14B8A644",
                }}
              >
                Try to recover
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 22px", borderRadius: 8, fontSize: 13,
                  fontWeight: 700, cursor: "pointer",
                  background: "#14B8A6", color: "#0B1120", border: "none",
                }}
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
