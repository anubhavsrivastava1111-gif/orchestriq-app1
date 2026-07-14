// ─── stripMd ──────────────────────────────────────────────────────────────────
// Removes markdown formatting characters from a string.
// Pure function — safe to use in PDF/Excel renderers where markdown breaks layout.
//
// USAGE:
//   import { stripMd } from "../utils/stripMd";
//   const plain = stripMd("## Hello **World**"); // "Hello World"

export function stripMd(s: string): string {
  if(!s)return "";
  return s.replace(/#{1,6} /g,"").replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g,"$1").replace(/`{1,3}([^`]+)`{1,3}/g,"$1").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/^[>\-*+] /gm,"").replace(/\n{3,}/g,"\n\n").trim();
}
