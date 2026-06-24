// ═══════════════════════════════════════════════════════════════════════════
// a11y.ts — OrchestrIQ Accessibility Utilities
// ─────────────────────────────────────────────────────────────────────────
// WCAG 2.1 Level AA helpers.
// No React imports — pure DOM utilities, safe to call from useEffect.
// Import where needed: import { announce, trapFocus, initLandmarks } from "./a11y";
// ═══════════════════════════════════════════════════════════════════════════

// ─── LIVE REGION — Screen reader announcements ────────────────────────────
// Screen readers monitor #oiq-live and speak changes automatically.
// polite = waits for user to finish current action (default)
// assertive = interrupts immediately (errors only)

let liveEl: HTMLElement | null = null;

function getLiveRegion(): HTMLElement {
  if (liveEl) return liveEl;
  const el = document.getElementById("oiq-live");
  if (el) { liveEl = el; return el; }

  // Create it if missing (first call before App renders)
  const div = document.createElement("div");
  div.id = "oiq-live";
  div.setAttribute("aria-live", "polite");
  div.setAttribute("aria-atomic", "false");
  div.setAttribute("aria-relevant", "additions text");
  div.className = "sr-only";
  document.body.appendChild(div);
  liveEl = div;
  return div;
}

/**
 * Announce a message to screen readers.
 * @param text    The message to announce (keep under 200 chars)
 * @param urgency "polite" (default) or "assertive" (errors only)
 */
export function announce(text: string, urgency: "polite" | "assertive" = "polite"): void {
  try {
    const el = getLiveRegion();
    el.setAttribute("aria-live", urgency);
    // Clear first so re-announcements of same text trigger a new event
    el.textContent = "";
    // Tiny delay ensures screen reader detects the change
    setTimeout(() => {
      el.textContent = text.slice(0, 300);
    }, 50);
  } catch {
    // Never throw — a11y utilities must never crash the app
  }
}

/**
 * Announce AI response to screen readers after send().
 * Call this after setChats(fin) in App.tsx send() function.
 * Only announces the first sentence to avoid verbosity.
 */
export function announceAIResponse(reply: string, executiveName: string): void {
  if (!reply) return;
  // Extract first meaningful sentence
  const clean = reply
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
  const firstSentence = clean.split(/[.!?]\s/)[0] || clean;
  announce(`${executiveName} responded: ${firstSentence.slice(0, 200)}`, "polite");
}

/**
 * Announce loading state changes.
 */
export function announceLoading(isLoading: boolean, executiveName?: string): void {
  if (isLoading) {
    announce(`${executiveName || "AI"} is thinking, please wait`, "polite");
  }
}

/**
 * Announce boardroom phase changes.
 */
export function announceBoardroomPhase(phase: string): void {
  if (phase) announce(phase, "polite");
}

// ─── FOCUS TRAP — Modal dialogs ───────────────────────────────────────────
// Keeps keyboard focus inside an open modal.
// Returns a cleanup function — call it when modal closes.

const FOCUSABLE_SELECTORS = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]:not([disabled])',
].join(", ");

/**
 * Trap keyboard focus inside a modal element.
 * Returns cleanup function to call when modal closes.
 *
 * Usage in App.tsx:
 *   useEffect(() => {
 *     if (!showSettings) return;
 *     const modal = document.querySelector('[role="dialog"]') as HTMLElement;
 *     if (!modal) return;
 *     return trapFocus(modal);
 *   }, [showSettings]);
 */
export function trapFocus(container: HTMLElement): () => void {
  const getFocusable = () =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
      (el) => !el.closest('[hidden]') && el.offsetParent !== null
    );

  // Focus first element on open
  const focusable = getFocusable();
  if (focusable.length) {
    setTimeout(() => focusable[0]?.focus(), 50);
  }

  // Remember what had focus before modal opened
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const focusable = getFocusable();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: wrap from first to last
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: wrap from last to first
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // Trigger close — find and click the × button inside the modal
      const closeBtn = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Close"], button[title="Close"], button[title="×"]'
      );
      closeBtn?.click();
    }
  };

  container.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keydown", handleEscape);

  // Cleanup: remove listeners and restore focus
  return () => {
    container.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("keydown", handleEscape);
    // Restore focus to element that had it before modal opened
    setTimeout(() => previouslyFocused?.focus(), 50);
  };
}

// ─── LANDMARKS — Semantic role assignment ─────────────────────────────────
// Assigns ARIA landmark roles to the app's structural divs.
// Call once after app mounts: initLandmarks()
// Runs non-destructively — only adds attributes, never removes.

export function initLandmarks(): void {
  try {
    // Skip link
    const root = document.getElementById("oiq-root");
    if (!root) return;

    // Add skip link as first child of oiq-root (main app view only)
    if (!document.querySelector(".skip-link")) {
      const skip = document.createElement("a");
      skip.href = "#oiq-main";
      skip.className = "skip-link";
      skip.textContent = "Skip to main content";
      root.insertBefore(skip, root.firstChild);
    }

    // Sidebar — role="navigation"
    const sidebar = root.querySelector<HTMLElement>(
      'div[style*="width:210"], div[style*="width: 210"]'
    );
    if (sidebar && !sidebar.getAttribute("role")) {
      sidebar.setAttribute("role", "navigation");
      sidebar.setAttribute("aria-label", "Executive roster and module navigation");
    }

    // Main panel — role="main" + id for skip link target
    const main = root.querySelector<HTMLElement>(
      'div[style*="flex:1"][style*="display:\"flex\""][style*="flexDirection:\"column\""]'
    );
    if (main && !main.getAttribute("role")) {
      main.setAttribute("role", "main");
      main.id = "oiq-main";
    }

    // Status/alert regions
    const toasterEl = document.querySelector<HTMLElement>(
      'div[style*="bottom:20"][style*="right:20"][style*="zIndex:9999"]'
    );
    if (toasterEl && !toasterEl.getAttribute("role")) {
      toasterEl.setAttribute("role", "status");
      toasterEl.setAttribute("aria-live", "polite");
      toasterEl.setAttribute("aria-label", "Notifications");
    }

    // Live region
    getLiveRegion();

  } catch {
    // Never throw
  }
}

// ─── MODAL ARIA SETUP ─────────────────────────────────────────────────────
// Call when a modal opens to add role="dialog" and aria-modal.

export function setupModal(modalEl: HTMLElement, title: string): void {
  try {
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", title);
    modalEl.setAttribute("tabindex", "-1");
  } catch {
    // Never throw
  }
}

// ─── ICON BUTTON LABELS ───────────────────────────────────────────────────
// Scans for icon-only buttons missing aria-label and patches them.
// Maps known emoji to descriptive labels.
// Call after each render: patchIconButtons()

const ICON_LABEL_MAP: Record<string, string> = {
  "🎨": "Export Studio — generate PDF or PowerPoint",
  "⎋":  "Sign out",
  "⚙":  "Settings",
  "×":  "Close",
  "✕":  "Close",
  "📋": "Copy to clipboard",
  "📄": "Export as PDF",
  "📊": "Export as PowerPoint",
  "🔴": "Stop recording",
  "🎤": "Start voice input",
  "🔊": "AI is speaking",
  "🧠": "AI is thinking",
  "↑":  "Send message",
  "▶":  "Resume",
  "⏸":  "Pause",
  "⏹":  "Stop",
  "🕓": "View history",
};

export function patchIconButtons(): void {
  try {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      '#oiq-root button:not([aria-label]):not([aria-labelledby])'
    );
    buttons.forEach((btn) => {
      const text = (btn.textContent || "").trim();
      const title = btn.getAttribute("title") || "";
      const label = ICON_LABEL_MAP[text] || title;
      if (label) {
        btn.setAttribute("aria-label", label);
      }
      // Add aria-label from title if missing
      if (title && !btn.getAttribute("aria-label")) {
        btn.setAttribute("aria-label", title);
      }
    });
  } catch {
    // Never throw
  }
}

// ─── KEYBOARD NAVIGATION — Sidebar role list ──────────────────────────────
// Allows arrow-key navigation through the executive list.
// Call once after sidebar renders.

export function initSidebarKeyNav(): void {
  try {
    const sidebar = document.querySelector<HTMLElement>('[role="navigation"]');
    if (!sidebar) return;

    sidebar.addEventListener("keydown", (e: KeyboardEvent) => {
      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>("button, a, select")
      );
      const idx = focusable.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusable[Math.min(idx + 1, focusable.length - 1)]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusable[Math.max(idx - 1, 0)]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        focusable[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        focusable[focusable.length - 1]?.focus();
      }
    });
  } catch {
    // Never throw
  }
}


// ─── DRAGGABLE ELEMENTS ───────────────────────────────────────────────────
// Makes fixed-position elements draggable by touch and mouse.
// Call initDraggable(el) on any fixed element to enable drag repositioning.
// Position is saved to localStorage so it persists across sessions.

export function initDraggable(el: HTMLElement, storageKey: string = "oiq-drag-pos"): void {
  try {
    // Restore saved position
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const { bottom, right } = JSON.parse(saved);
      el.style.bottom = bottom;
      el.style.right = right;
      el.style.top = "auto";
      el.style.left = "auto";
    }
  } catch {}

  let startX = 0, startY = 0, startBottom = 0, startRight = 0;
  let dragging = false;

  const getPos = () => {
    const rect = el.getBoundingClientRect();
    return {
      bottom: window.innerHeight - rect.bottom,
      right: window.innerWidth - rect.right,
    };
  };

  const onMove = (clientX: number, clientY: number) => {
    if (!dragging) return;
    const dx = startX - clientX;
    const dy = startY - clientY;
    const newRight = Math.max(0, Math.min(window.innerWidth - 60, startRight + dx));
    const newBottom = Math.max(0, Math.min(window.innerHeight - 60, startBottom + dy));
    el.style.right = newRight + "px";
    el.style.bottom = newBottom + "px";
    el.style.top = "auto";
    el.style.left = "auto";
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = "grab";
    try {
      const pos = getPos();
      localStorage.setItem(storageKey, JSON.stringify({
        bottom: pos.bottom + "px",
        right: pos.right + "px",
      }));
    } catch {}
  };

  // Mouse events
  el.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const pos = getPos();
    startBottom = pos.bottom;
    startRight = pos.right;
    el.style.cursor = "grabbing";
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  document.addEventListener("mouseup", onEnd);

  // Touch events
  el.addEventListener("touchstart", (e) => {
    dragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    const pos = getPos();
    startBottom = pos.bottom;
    startRight = pos.right;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener("touchmove", (e) => {
    if (dragging) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  document.addEventListener("touchend", onEnd);
}


// ─── FULL INIT ────────────────────────────────────────────────────────────
// Call once from App.tsx useEffect after first render.
// Handles all passive setup that doesn't require props.

export function initA11y(): void {
  initLandmarks();
  patchIconButtons();
  initSidebarKeyNav();

  // Make token badge draggable
  setTimeout(() => {
    const badge = document.querySelector<HTMLElement>(
      '[class*="TokenBadge"], div[style*="token"][style*="fixed"], div[style*="tokens"][style*="9000"]'
    );
    if (badge) initDraggable(badge, "oiq-token-pos");
  }, 800);

  // Re-patch buttons whenever DOM changes (new modals, dynamic content)
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
      patchIconButtons();
      initLandmarks();
    });
    const root = document.getElementById("oiq-root");
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  }
}
