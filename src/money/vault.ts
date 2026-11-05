// Lifeline — encrypted vault. All financial data is stored only in encrypted form.
//
//  passcode ──PBKDF2-SHA256 (310k)──▶ KEK ──AES-GCM──▶ wraps a random 256-bit data key (DEK)
//  DEK ──AES-GCM──▶ encrypts the whole app state (fresh 96-bit IV on every save)
//
// Without the passcode (or the phone's fingerprint-protected copy of the DEK) the stored bytes
// are unreadable — including from a stolen backup file or a rooted phone's storage dump.
import type { MoneyState } from "./types";
import { normalize } from "./store";
import { deviceDecrypt, deviceEncrypt, hasDeviceKey } from "./native";

const VAULT_KEY = "lifeline-vault-v1";
const GUARD_KEY = "lifeline-guard-v1";
const ITERATIONS = 310_000;
const AAD = new TextEncoder().encode("lifeline-vault-v1");

interface Box { iv: string; ct: string }
/** wrapDev = the passcode-wrapped key, sealed again with a hardware key that never leaves the phone (Android). */
interface VaultFile { v: 1; kdf: { salt: string; iter: number }; wrap?: Box; wrapDev?: string; data: Box }

export class WrongPasscode extends Error {
  lockedForSec: number;
  attemptsLeft: number;
  constructor(lockedForSec: number, attemptsLeft: number) { super("wrong-passcode"); this.lockedForSec = lockedForSec; this.attemptsLeft = attemptsLeft; }
}

// ─── Encoding helpers ───────────────────────────────────────────────────────
const b64 = (u: Uint8Array) => { let s = ""; u.forEach(c => { s += String.fromCharCode(c); }); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function kekFrom(passcode: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const importDek = (raw: Uint8Array) => crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

async function seal(key: CryptoKey, plain: Uint8Array): Promise<Box> {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: AAD as BufferSource }, key, plain as BufferSource));
  return { iv: b64(iv), ct: b64(ct) };
}
async function open(key: CryptoKey, box: Box): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) as BufferSource, additionalData: AAD as BufferSource }, key, unb64(box.ct) as BufferSource));
}

// Device binding: on Android the wrapped key is additionally sealed by the Keystore.
const utf8b64 = (s: string) => b64(new TextEncoder().encode(s));
const b64utf8 = (s: string) => new TextDecoder().decode(unb64(s));
function storeWrap(file: VaultFile, box: Box) {
  if (hasDeviceKey()) { file.wrapDev = deviceEncrypt(utf8b64(JSON.stringify(box))); delete file.wrap; }
  else { file.wrap = box; delete file.wrapDev; }
}
function loadWrap(file: VaultFile): Box {
  if (file.wrapDev) return JSON.parse(b64utf8(deviceDecrypt(file.wrapDev))) as Box;
  if (file.wrap) return file.wrap;
  throw new Error("corrupt-vault");
}

// ─── Session (the DEK lives only in memory while unlocked) ──────────────────
let dekRaw: Uint8Array | null = null;
let dekKey: CryptoKey | null = null;

function readFile(): VaultFile | null {
  try { const raw = localStorage.getItem(VAULT_KEY); return raw ? (JSON.parse(raw) as VaultFile) : null; } catch { return null; }
}
function writeFile(f: VaultFile) { localStorage.setItem(VAULT_KEY, JSON.stringify(f)); }

export const vaultExists = () => readFile() !== null;
export const isUnlocked = () => dekKey !== null;

export function lock() {
  if (dekRaw) dekRaw.fill(0);
  dekRaw = null;
  dekKey = null;
}

// ─── Brute-force guard ──────────────────────────────────────────────────────
interface Guard { fails: number; until: number }
function guard(): Guard { try { return JSON.parse(localStorage.getItem(GUARD_KEY) || "") as Guard; } catch { return { fails: 0, until: 0 }; } }
function setGuard(g: Guard) { localStorage.setItem(GUARD_KEY, JSON.stringify(g)); }
/** Seconds the user must wait before the next attempt (0 = can try now). */
export function lockoutRemaining(): number { return Math.max(0, Math.ceil((guard().until - Date.now()) / 1000)); }
export const FREE_ATTEMPTS = 5;

// ─── Lifecycle ──────────────────────────────────────────────────────────────
export async function createVault(passcode: string, state: MoneyState): Promise<void> {
  const salt = rand(16);
  const raw = rand(32);
  const kek = await kekFrom(passcode, salt, ITERATIONS);
  const key = await importDek(raw);
  const file: VaultFile = {
    v: 1, kdf: { salt: b64(salt), iter: ITERATIONS },
    data: await seal(key, new TextEncoder().encode(JSON.stringify(state))),
  };
  storeWrap(file, await seal(kek, raw));
  writeFile(file);
  setGuard({ fails: 0, until: 0 });
  dekRaw = raw; dekKey = key;
}

export async function unlockWithPasscode(passcode: string): Promise<MoneyState> {
  const file = readFile();
  if (!file) throw new Error("no-vault");
  const wait = lockoutRemaining();
  if (wait > 0) throw new WrongPasscode(wait, 0);
  try {
    const wrap = loadWrap(file);
    const kek = await kekFrom(passcode, unb64(file.kdf.salt), file.kdf.iter);
    const raw = await open(kek, wrap);
    const state = await unlockWithDekRaw(raw, file);
    setGuard({ fails: 0, until: 0 });
    return state;
  } catch (e) {
    if (e instanceof WrongPasscode) throw e;
    const g = guard();
    const fails = g.fails + 1;
    // After 5 wrong tries: 30 s, then doubling, capped at 1 hour.
    const lockSec = fails >= FREE_ATTEMPTS ? Math.min(3600, 30 * 2 ** (fails - FREE_ATTEMPTS)) : 0;
    setGuard({ fails, until: Date.now() + lockSec * 1000 });
    throw new WrongPasscode(lockSec, Math.max(0, FREE_ATTEMPTS - fails));
  }
}

/** Unlock using the data key released by the phone's fingerprint-protected Keystore. */
export async function unlockWithDek(dekB64: string): Promise<MoneyState> {
  const file = readFile();
  if (!file) throw new Error("no-vault");
  const state = await unlockWithDekRaw(unb64(dekB64), file);
  setGuard({ fails: 0, until: 0 });
  return state;
}

async function unlockWithDekRaw(raw: Uint8Array, file: VaultFile): Promise<MoneyState> {
  const key = await importDek(raw);
  const plain = await open(key, file.data);
  dekRaw = raw; dekKey = key;
  return normalize(JSON.parse(new TextDecoder().decode(plain)));
}

let saving: Promise<void> = Promise.resolve();
/** Encrypts and stores the state. Calls are serialised so writes never interleave. */
export function save(state: MoneyState): Promise<void> {
  saving = saving.then(async () => {
    const file = readFile();
    if (!file || !dekKey) return;
    file.data = await seal(dekKey, new TextEncoder().encode(JSON.stringify(state)));
    writeFile(file);
  }).catch(() => { /* keep the chain alive */ });
  return saving;
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const file = readFile();
  if (!file) return false;
  try { await open(await kekFrom(passcode, unb64(file.kdf.salt), file.kdf.iter), loadWrap(file)); return true; } catch { return false; }
}

export async function changePasscode(current: string, next: string): Promise<boolean> {
  const file = readFile();
  if (!file || !dekRaw || !(await verifyPasscode(current))) return false;
  const salt = rand(16);
  file.kdf = { salt: b64(salt), iter: ITERATIONS };
  storeWrap(file, await seal(await kekFrom(next, salt, ITERATIONS), dekRaw));
  writeFile(file);
  return true;
}

/** The data key (base64) — handed to the Android Keystore when fingerprint unlock is turned on. */
export function exportDekForBiometrics(): string | null { return dekRaw ? b64(dekRaw) : null; }

export function wipeVault() {
  lock();
  try { localStorage.removeItem(VAULT_KEY); localStorage.removeItem(GUARD_KEY); } catch { /* ignore */ }
}

// ─── Encrypted backups (portable: protected by a password, not the device) ──
interface BackupFile { type: "lifeline-backup"; v: 1; kdf: { salt: string; iter: number }; data: Box; created: string }

export async function makeBackup(state: MoneyState, password: string): Promise<string> {
  const salt = rand(16);
  const key = await kekFrom(password, salt, ITERATIONS);
  const out: BackupFile = { type: "lifeline-backup", v: 1, kdf: { salt: b64(salt), iter: ITERATIONS }, data: await seal(key, new TextEncoder().encode(JSON.stringify(state))), created: new Date().toISOString() };
  return JSON.stringify(out);
}

export function isEncryptedBackup(text: string): boolean {
  try { return (JSON.parse(text) as { type?: string }).type === "lifeline-backup"; } catch { return false; }
}

export async function readBackup(text: string, password: string): Promise<MoneyState | null> {
  try {
    const f = JSON.parse(text) as BackupFile;
    const key = await kekFrom(password, unb64(f.kdf.salt), f.kdf.iter);
    return normalize(JSON.parse(new TextDecoder().decode(await open(key, f.data))));
  } catch { return null; }
}
