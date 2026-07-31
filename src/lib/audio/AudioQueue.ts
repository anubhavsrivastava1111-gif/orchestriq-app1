// AudioQueue — splits long text into speakable chunks at sentence boundaries.
// Web Speech engines choke on very long utterances; chunking keeps playback
// reliable for 100,000+ character responses and enables accurate progress.

export interface TextChunk {
  text: string;
  start: number;   // char offset in the ORIGINAL full text
  end: number;
}

const MAX_CHUNK = 240; // chars — safe for cross-browser Web Speech reliability

export function chunkText(full: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  if (!full) return chunks;
  // Split on sentence enders but keep the delimiter with the sentence.
  const sentenceRe = /[^.!?]+[.!?]+[\])'"`’”]*|\s*[^.!?]+$/g;
  let m: RegExpExecArray | null;
  let pending = "";
  let pendingStart = 0;
  const push = (text: string, start: number) => {
    const t = text.trim();
    if (t) chunks.push({ text: t, start, end: start + text.length });
  };
  while ((m = sentenceRe.exec(full)) !== null) {
    const sentence = m[0];
    const sentenceStart = m.index;
    if ((pending + sentence).length <= MAX_CHUNK) {
      if (!pending) pendingStart = sentenceStart;
      pending += sentence;
    } else {
      if (pending) push(pending, pendingStart);
      if (sentence.length <= MAX_CHUNK) {
        pending = sentence; pendingStart = sentenceStart;
      } else {
        // Sentence itself too long — hard-split on word boundaries.
        let idx = sentenceStart;
        const words = sentence.split(/(\s+)/);
        let buf = "", bufStart = idx;
        for (const w of words) {
          if ((buf + w).length > MAX_CHUNK && buf) {
            push(buf, bufStart); idx += buf.length; buf = w; bufStart = idx;
          } else buf += w;
        }
        pending = buf; pendingStart = bufStart;
      }
    }
  }
  if (pending) push(pending, pendingStart);
  return chunks;
}

// Rough spoken-duration estimate (seconds) at a given rate. ~15 chars/sec at 1x.
export function estimateSeconds(charCount: number, rate: number): number {
  const base = charCount / 15;
  return Math.max(0, Math.round(base / Math.max(0.5, rate)));
}
