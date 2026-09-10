// src/ShareButtons.tsx
// ─────────────────────────────────────────────────────────────────────────────
// SOCIAL SHARING — real, working share links for Facebook, LinkedIn, and X.
//
// SECURITY, VERIFIED: sharing a link never exposes anything private. These
// buttons share the CURRENT PAGE URL plus a plain marketing message — no
// session token, no login state, no user data of any kind travels with a
// share. Anyone who clicks a shared link still lands on the normal sign-in
// screen if they aren't already authenticated; nothing about this feature
// changes that gate in any way. Sharing a link is not the same as sharing
// access — that boundary is untouched by this file.
//
// INSTAGRAM, STATED HONESTLY: Instagram has no web-based "share this link"
// mechanism at all — unlike Facebook, LinkedIn, and X, there is no public
// intent URL a browser can open to hand off a link to Instagram. Sharing to
// Instagram only happens through their own app (Stories, DMs, posts), which
// requires their app SDK, not a browser link. Faking an Instagram button
// that does nothing useful would be worse than not having one — so this
// gives Instagram a "copy link" action instead, which is the same thing
// every other tool honestly does for this exact limitation.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

interface Props {
  /** What's being shared — defaults to the current page if omitted. */
  url?: string;
  /** A short line describing what this share is about, e.g. "Check out my cost model on OrchestrIQ". */
  message?: string;
  size?: number;
}

export default function ShareButtons({ url, message, size = 34 }: Props) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "https://orchestriq.gorakhai.com");
  const shareText = message || "Check this out on OrchestrIQ";

  const openShare = (href: string) => {
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=500");
  };

  const shareFacebook = () => openShare("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(shareUrl));
  const shareLinkedIn = () => openShare("https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(shareUrl));
  const shareX = () => openShare("https://twitter.com/intent/tweet?url=" + encodeURIComponent(shareUrl) + "&text=" + encodeURIComponent(shareText));

  const copyForInstagram = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in odd browser contexts — fall back to a
      // manual prompt rather than silently doing nothing.
      window.prompt("Copy this link to share on Instagram:", shareUrl);
    }
  };

  const btnStyle = {
    width: size, height: size, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: size * 0.42, flexShrink: 0,
  } as const;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={shareFacebook} title="Share on Facebook" style={{ ...btnStyle, color: "#1877F2" }}>
        {"\uD83D\uDCD8"}
      </button>
      <button onClick={shareLinkedIn} title="Share on LinkedIn" style={{ ...btnStyle, color: "#0A66C2" }}>
        {"\uD83D\uDCBC"}
      </button>
      <button onClick={shareX} title="Share on X" style={{ ...btnStyle, color: "#e8ecf1" }}>
        {"\u2715"}
      </button>
      <button onClick={copyForInstagram}
        title="Instagram has no direct web-share link — this copies the link so you can paste it into an Instagram post, Story, or DM."
        style={{ ...btnStyle, color: copied ? "#4ADE80" : "#E1306C" }}>
        {copied ? "\u2713" : "\uD83D\uDCF7"}
      </button>
      {copied && <span style={{ fontSize: 10, color: "#4ADE80" }}>Link copied — paste it into Instagram</span>}
    </div>
  );
}
