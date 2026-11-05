import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MoneyApp from "./MoneyApp";
import "./money.css";

createRoot(document.getElementById("root")!).render(<StrictMode><MoneyApp /></StrictMode>);

// Own service worker scoped to /money/ so Lifeline installs as a separate Android app and works offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/money/sw.js", { scope: "/money/" }).catch(() => {}); });
}
