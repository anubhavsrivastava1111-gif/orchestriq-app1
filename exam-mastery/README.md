# Exam Mastery: CPA · FRM · CMA (US) · CA (India) · CMA (India)

An offline-first Android study app. Every question has three explanation layers:
**In plain words** (an everyday story for people with no background), **Worked solution**, and **Exam trap**.

## What's inside
| Area | Where | Notes |
|---|---|---|
| Syllabus map (5 exams, 21 papers, 62 topics) | `knowledge-base/exams.json` | Links to each official syllabus |
| Question bank | `knowledge-base/questions.json` | Original questions, not copied from any exam body |
| Beginner lessons | `knowledge-base/lessons.json` | Story → rule → example → self-check |
| Exam-challenge + workplace playbooks | `knowledge-base/guides.json` | Diagnose → act → escalate |
| Quality gate | `scripts/validate-kb.mjs` | Blocks the build on bad data and prints syllabus coverage gaps |
| App | `src/` | React + Capacitor. Spaced repetition, timed mocks, weak-area drills, progress |

## Get the Android app (no coding needed)
1. On GitHub, open the **Actions** tab, then **Exam Mastery – build Android APK**, then **Run workflow**.
2. When the run turns green (about 5 minutes), open it and download **exam-mastery-debug-apk** under *Artifacts*.
3. Unzip it, copy `app-debug.apk` to your phone and open it. Allow "install unknown apps" when Android asks.

## Run on a computer
```bash
cd exam-mastery && npm install && npm run dev
```

## Add a question
Add an object to `knowledge-base/questions.json` (copy an existing one), then run `npm run validate`.
The `topic` must match a topic in `exams.json`. New items start as `"status": "author-draft"`.
Change the status to `"sme-verified"` only after a qualified reviewer signs off.

## Content rules (non-negotiable)
- **No real exam questions.** CPA, FRM and CMA-US live questions are confidential and covered by candidate NDAs. ICAI/ICMAI papers and suggested answers are copyrighted, so get written permission before using them.
- **Tax and law items carry a version risk.** Re-check Companies Act, GST and IRC items every exam cycle.
