// ─── TIMEOUTS (all values in milliseconds) ────────────────────────────────────
// Change one constant here and every caller uses the new value immediately.
// No more hunting for "90000" and "65000" in 20 different places.

export const TIMEOUTS = {
  // ── AI provider calls ────────────────────────────────────────────────────────
  AI_STANDARD_MS:          120_000,  // 2 min — non-search calls
  AI_SEARCH_MS:            100_000,  // research desk calls with web search
  AI_LARGE_DOC_MS:         180_000,  // PDF / PPTX generation (3 min)
  SELF_REVIEW_MS:           90_000,  // Boardroom quality review hard cap

  // ── Media generation ─────────────────────────────────────────────────────────
  FAL_IMAGE_MS:             90_000,  // fal.ai image generation
  FAL_VIDEO_WAN_MS:        150_000,  // Wan video model (slow, high quality)
  FAL_VIDEO_KLING_MS:       30_000,  // Kling video submit timeout
  FAL_POLL_MS:              15_000,  // Kling queue poll per tick
  MEDIA_DOWNLOAD_MS:       120_000,  // Downloading generated media file

  // ── Retry / wait cycles ──────────────────────────────────────────────────────
  PROVIDER_RETRY_WAIT_MS:   65_000,  // Wait between provider-exhaustion retries
  PROVIDER_RESET_MS:        60_000,  // How long until a rate-limited provider resets
  YIELD_UI_MS:                  10,  // yieldUI(): release main thread briefly

  // ── Project Engine ───────────────────────────────────────────────────────────
  DELIVERABLE_DEADLINE_MS: 240_000,  // 4-min hard cap per deliverable (fail-fast)
} as const;
