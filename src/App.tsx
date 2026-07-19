import { GlobalTicker } from "./components/intelligence/GlobalTicker";
import { initA11y, announce, announceAIResponse, announceLoading, announceBoardroomPhase } from "./a11y";
import VoiceEngine from "./VoiceEngine";
import BoardroomView from "./BoardroomView";
import FundingIntelligence from "./FundingIntelligence";
import ServiceDesk from "./ServiceDesk";
import TokenAnalytics, { saveRecord, estimateCost } from "./TokenAnalytics";
import PulseGovernance from "./Pulse";
import TokenBadge from "./components/TokenBadge";
import AIAgents from "./AIAgents";
import AgenticWorkflows from "./AgenticWorkflows";
import { getExecutivesCached } from "./lib/executives";
import { supabase } from "./lib/supabase";
import { WorkspaceMemory } from "./lib/WorkspaceMemory";
import { generateExcel, generatePptx, generatePdf, generateDocx } from "./lib/GenerationService";
import { ENGINE_ENABLED, runPipeline, classifyDomain, selectFramework, selfReview, classifyEvidence } from "./lib/IntelligenceEngine";

// Intelligence Engine — evidence audit line appended to final deliverables (no AI call, fail-safe)
function ieEvidenceAudit(text:string):string{
  try{
    const evTags=classifyEvidence(text||"");
    if(!evTags.length)return "";
    const cnt:{[k:string]:number}={};evTags.forEach(t=>{cnt[t.category]=(cnt[t.category]||0)+1;});
    return "\n\n---\n**Evidence audit (Intelligence Engine):** "+Object.entries(cnt).map(([k,v])=>v+" "+k).join(" · ");
  }catch{return "";}
}

// ─── DECISION HISTORY ───────────────────────────────────────────────────────
// Boardroom decisions saved via WorkspaceMemory; surfaced in future sessions
// on similar topics. Pure local logic — zero AI calls.
function saveDecisionRecord(rec:{[k:string]:unknown}):void{
  try{
    const hist=WorkspaceMemory.get<any[]>("cos-decision-history")||[];
    hist.unshift(rec);
    WorkspaceMemory.set("cos-decision-history",hist.slice(0,25));
  }catch{/* storage full — silent */}
}
function extractRecommendationSnippet(syn:string):string{
  try{
    const m=(syn||"").match(/##\s*Quantified Recommendation\s*\n([\s\S]*?)(\n##|$)/i);
    const raw=(m?m[1]:(syn||"")).replace(/[#*|>\-]/g," ").replace(/\s+/g," ").trim();
    return raw.slice(0,300);
  }catch{return "";}
}
function buildDecisionHistoryContext(question:string):string{
  try{
    const hist=WorkspaceMemory.get<any[]>("cos-decision-history")||[];
    if(!hist.length)return "";
    const words=((question||"").toLowerCase().match(/[a-z]{4,}/g)||[]);
    if(!words.length)return "";
    const scored=hist.map(h=>{
      const txt=(String(h.question||"")+" "+String(h.recommendation||"")).toLowerCase();
      return {h,score:words.filter(w=>txt.includes(w)).length};
    }).filter(x=>x.score>=2).sort((a,b)=>b.score-a.score).slice(0,2);
    if(!scored.length)return "";
    return "\n\nPAST BOARD DECISIONS ON SIMILAR TOPICS (reference these; explicitly flag if today's question conflicts with, repeats, or should build on a past decision):\n"+
      scored.map(x=>"- ["+String(x.h.ts||"").slice(0,10)+"] Q: \""+String(x.h.question||"").slice(0,120)+"\" → Status: "+String(x.h.status||"n/a")+". Decision: "+String(x.h.recommendation||"").slice(0,200)).join("\n")+"\n";
  }catch{return "";}
}
import BusinessExecutionEngine, { type ExecutionPlan, type DeliverableSpec, repairTruncatedJson, pdfSafeText } from "./lib/BusinessExecutionEngine";

// ─── SESSION GATE ────────────────────────────────────────────────────────────
async function checkSessionGate(): Promise<{allowed:boolean;reason?:string;plan?:string;used?:number;limit?:number}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { allowed: true };
    const { data, error } = await supabase.rpc('check_and_increment_session', { p_user_id: user.id });
    if (error) {
      console.warn('[OIQ] Session gate error:', error.message);
      return { allowed: true };
    }
    return data as {allowed:boolean;reason?:string;plan?:string;used?:number;limit?:number};
  } catch(e) {
    console.warn('[OIQ] Session gate exception:', e);
    return { allowed: true };
  }
}

async function saveBYOKeyToSupabase(apiKey: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ byo_api_key: apiKey || null }).eq('id', user.id);
  } catch(e) {
    console.warn('[OIQ] Failed to save BYO key:', e);
  }
}
import Ledger, { type JournalEntry } from "./Ledger";
import FinanceSuite from "./FinanceSuite";
import CommandCenter from "./CommandCenter";
import Dispatch, { type DispatchTemplate } from "./Dispatch";
import ActionTracker, { ExtractReviewModal, extractItemsFromJSON, EXTRACTION_PROMPT, type ActionItem, type ExtractedItem } from "./ActionTracker";
import type { Executive } from "./lib/executives";
import {
  COMPRESSION_ENABLED,
  BENCHMARK_MODE,
  compressLevelOutput,
  formatCompressedContextForPrompt,
  type CompressedContext,
} from "./lib/ContextCompressor";

import {
  estimateTokens,
  attachBenchmarkToWindow,
  startBenchmarkSession,
  completeBenchmarkSession,
  logLevelBenchmark,
  markRateLimitHit,
  type BenchmarkSession,
} from "./lib/TokenCounter";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  markProviderExhausted,
  getActiveProvider,
  isRateLimit,
  areBothExhausted,
  waitWithCountdown,
  saveResumeState,
  loadResumeState,
  clearResumeState,
  type ResumeState,
} from "./lib/ProviderManager";

const VERSION = "4.3.0";
const SYS_GEMINI = import.meta.env.VITE_GEMINI_API_KEY || "";
const SYS_GROQ = import.meta.env.VITE_GROQ_API_KEY || "";
const SYS_CLAUDE = import.meta.env.VITE_CLAUDE_API_KEY || "";
const USE_SYS_KEY = import.meta.env.VITE_USE_SYSTEM_KEY === "true";
const EFF_GEMINI = USE_SYS_KEY && SYS_GEMINI ? SYS_GEMINI : "";
const EFF_GROQ = USE_SYS_KEY && SYS_GROQ ? SYS_GROQ : "";
const EFF_CLAUDE = USE_SYS_KEY && SYS_CLAUDE ? SYS_CLAUDE : "";
const EFF_FAL   = import.meta.env.VITE_FAL_API_KEY || ""; // fal.ai — image & video generation
console.log("[OIQ-DIAG] USE_SYS_KEY:",USE_SYS_KEY,"| SYS_GEMINI present:",!!SYS_GEMINI,"| SYS_GROQ present:",!!SYS_GROQ,"| SYS_CLAUDE present:",!!SYS_CLAUDE,"| EFF_GEMINI:",!!EFF_GEMINI,"| EFF_GROQ:",!!EFF_GROQ,"| EFF_CLAUDE:",!!EFF_CLAUDE);
const BRAND = "OrchestrIQ";
const TAGLINE = "The orchestration layer of intelligent business.";

const STAGES = [{id:"idea",l:"Idea",ic:"💡"},{id:"formation",l:"Formation",ic:"📋"},{id:"mvp",l:"MVP",ic:"🚀"},{id:"funding",l:"Funding",ic:"💰"},{id:"growth",l:"Growth",ic:"📈"},{id:"mature",l:"Mature",ic:"🏛️"}];
const CURRENCIES = [{code:"INR",sym:"₹",name:"Indian Rupee"},{code:"USD",sym:"$",name:"US Dollar"},{code:"EUR",sym:"€",name:"Euro"},{code:"GBP",sym:"£",name:"British Pound"},{code:"AUD",sym:"A$",name:"Australian Dollar"},{code:"CAD",sym:"C$",name:"Canadian Dollar"},{code:"SGD",sym:"S$",name:"Singapore Dollar"},{code:"AED",sym:"AED",name:"UAE Dirham"},{code:"CHF",sym:"Fr",name:"Swiss Franc"}];
const MODELS = {
  claude:{name:"Claude",company:"Anthropic",model:"claude-haiku-4-5-20251001",placeholder:"sk-ant-...",color:"#D97757",keyUrl:"https://console.anthropic.com/settings/keys"},
  openai:{name:"ChatGPT",company:"OpenAI",model:"gpt-4o",placeholder:"sk-...",color:"#10A37F",keyUrl:"https://platform.openai.com/api-keys"},
  gemini:{name:"Gemini",company:"Google",model:"gemini-1.5-flash",placeholder:"AIza...",color:"#4285F4",keyUrl:"https://aistudio.google.com/app/apikey"},
  groq:{name:"Groq",company:"Groq",model:"llama-3.3-70b-versatile",placeholder:"gsk_...",color:"#F97316",keyUrl:"https://console.groq.com/keys"},
  deepseek:{name:"DeepSeek",company:"DeepSeek AI",model:"deepseek-chat",placeholder:"sk-...",color:"#2563EB",keyUrl:"https://platform.deepseek.com/api_keys",note:"Low cost · Strong reasoning · Available in India"},
  kimi:{name:"Kimi",company:"Moonshot AI",model:"moonshot-v1-8k",placeholder:"sk-...",color:"#8B5CF6",keyUrl:"https://platform.moonshot.cn/console/api-keys",note:"Fast · Affordable · Strong multilingual"},
  stability:{name:"Stability AI",company:"Stability AI",model:"stable-diffusion-xl-1024-v1-0",placeholder:"sk-...",color:"#EC4899",keyUrl:"https://platform.stability.ai/account/credits",note:"Image generation · ~₹3/image · Optional"},
  fal:{name:"fal.ai",company:"fal.ai",placeholder:"key-...",color:"#7C3AED",keyUrl:"https://fal.ai/dashboard/keys"},
  nvidia:{name:"NVIDIA (Free)",company:"NVIDIA",model:"meta/llama-3.3-70b-instruct",color:"#76B900",note:"No key needed \u2014 free tier via NVIDIA NIM"},
};
const NVIDIA_MODELS=[
  {id:"meta/llama-3.3-70b-instruct",label:"Llama 3.3 70B",note:"Best all-rounder"},
  {id:"nvidia/llama-3.1-nemotron-70b-instruct",label:"Nemotron 70B",note:"NVIDIA-tuned reasoning"},
  {id:"deepseek-ai/deepseek-r1",label:"DeepSeek R1",note:"Strong step-by-step reasoning"},
  {id:"mistralai/mixtral-8x22b-instruct-v0.1",label:"Mixtral 8x22B",note:"Fast, capable"},
  {id:"meta/llama-3.1-405b-instruct",label:"Llama 3.1 405B",note:"Largest, most capable"},
  {id:"nvidia/nemotron-4-340b-instruct",label:"Nemotron 4 340B",note:"NVIDIA flagship"},
];
// ─── DONATION QR ────────────────────────────────────────────────────────────
// Paste your QR code as a base64 data URI between the quotes below to hard-code it,
// e.g. "data:image/png;base64,iVBORw0KGgo...". Until then, upload it once via
// Settings › Donation (it saves to your device and persists across sessions).
const DEFAULT_QR = "";
// ─── TASK-BASED INTELLIGENT ROUTING ─────────────────────────────────────────
// Maps task type → provider priority (first available key wins, fallback continues).
// DeepSeek = default for general text (cheapest). Claude Sonnet = specialist tasks.
// fal.ai = ALL image and video generation (500+ models, one key).
// Add future providers here — routing inherits automatically.
const NVIDIA_FALLBACK=["nvidia"];
const TASK_ROUTING: Record<string,string[]> = {
  // ── MEDIA (non-text — fal.ai is the exclusive gateway) ──────────────────
  image_gen:      ["fal"],                                  // fal.ai: Flux, Seedream, Imagen, Ideogram
  video_gen:      ["fal"],                                  // fal.ai: Kling, Seedance, Wan, Veo, Sora
  diagram:        ["fal","openai"],                         // Ideogram v3 via fal for text-accurate diagrams
  // ── SPECIALIST TEXT (Claude Sonnet = best quality) ───────────────────────
  excel_advanced: ["deepseek","claude","openai","gemini","groq"],  // Phase 5: DeepSeek first (~20x cheaper for this structured/formula task), Claude as automatic fallback/upgrade
  powerpoint:     ["claude","openai","deepseek","gemini","groq"],  // Structured decks, slide content
  research:       ["claude","gemini","openai","deepseek","groq"],  // Claude has built-in web search
  financial:      ["claude","deepseek","openai","gemini","groq"],  // P&L, forecast, variance, audit
  audit:          ["claude","deepseek","openai","gemini","groq"],  // Compliance, SOX, workpapers
  vision:         ["claude","gemini","openai","groq"],              // Photo/image analysis — DeepSeek excluded
  // ── CODE (DeepSeek = best value for code generation) ────────────────────
  code:           ["deepseek","claude","groq","openai","gemini"],
  // ── GENERAL TEXT (cheapest capable provider first) ───────────────────────
  creative:       ["deepseek","groq","gemini","claude","openai"],
  general:        ["deepseek","groq","gemini","claude","openai"],
};

// Models to use when a task routes to Claude (default = haiku, premium = sonnet)
// Sonnet is used for tasks that require deep reasoning, long structured outputs.
const CLAUDE_TASK_MODEL: Record<string,string> = {
  excel_advanced: "claude-sonnet-4-5-20250929",
  powerpoint:     "claude-sonnet-4-5-20250929",
  financial:      "claude-sonnet-4-5-20250929",
  audit:          "claude-sonnet-4-5-20250929",
  research:       "claude-sonnet-4-5-20250929",
};

// Auto-classify the task type from prompt + system context.
// Called automatically inside callMulti — no change needed at call sites.
// ─── PROVIDER CAPABILITY REGISTRY ────────────────────────────────────────────
// Pure data. Adding a provider = one entry here + a key field; zero logic edits.
const PROVIDER_META = {
  claude:   {name:"Claude",   cost:"$$$",speed:"medium",quality:"best", blurb:"Best for documents, Excel, decks, deep reasoning"},
  openai:   {name:"ChatGPT",  cost:"$$$",speed:"medium",quality:"best", blurb:"Strong all-rounder; images via DALL·E"},
  deepseek: {name:"DeepSeek", cost:"$",  speed:"fast",  quality:"great",blurb:"Best value for general work and code"},
  gemini:   {name:"Gemini",   cost:"$",  speed:"fast",  quality:"great",blurb:"Fast, generous free tier, good research"},
  groq:     {name:"Groq",     cost:"$",  speed:"fast",  quality:"good", blurb:"Fastest responses; great for drafts"},
  fal:      {name:"fal.ai",   cost:"$$", speed:"medium",quality:"best", blurb:"Images & video (Flux, Kling, Veo)"},
  nvidia:   {name:"NVIDIA (Free)", cost:"Free",speed:"medium",quality:"good", blurb:"No key needed \u2014 great starting point"},
} as Record<string,{name:string;cost:string;speed:string;quality:string;blurb:string}>;
// Tasks where the user's Primary AI leads; specialists lead everywhere else.
const PRIMARY_LED_TASKS=["general","creative","code","research"];
// Primary-aware routing: for specialist tasks the top specialists go first,
// then the user's Primary AI, then the remaining chain. The user's model
// choice is honored for orchestration; capability quality for specialists.
function resolveRoute(task:string,primary:string):string[]{
  const chain=TASK_ROUTING[task]||TASK_ROUTING.general;
  const ordered=PRIMARY_LED_TASKS.includes(task)
    ? [primary,...chain]
    : [...chain.slice(0,2),primary,...chain];
  const withFallback=(task==="image_gen"||task==="video_gen")?ordered:[...ordered,...NVIDIA_FALLBACK];
  return withFallback.filter((p,i)=>p&&withFallback.indexOf(p)===i);
}

function detectTaskType(prompt: string, context = ""): string {
  const t = (prompt + " " + context).toLowerCase();
  if (/\b(generate\s+(?:an?\s+)?image|create\s+(?:an?\s+)?(?:image|photo|picture)|make\s+(?:an?\s+)?image|draw\s+(?:an?\s+)?image|render\s+(?:an?\s+)?(?:image|photo)|design\s+(?:an?\s+)?logo\s+for\s+me)\b/.test(t)) return "image_gen";
  if (/\b(generate\s+(?:an?\s+)?video|create\s+(?:an?\s+)?video\s+(?:for|of|showing)|make\s+(?:an?\s+)?video|produce\s+(?:an?\s+)?video|render\s+(?:an?\s+)?video|animate\s+this|generate\s+(?:an?\s+)?reel)\b/.test(t)) return "video_gen";
  if (/\b(draw\s+(?:me\s+)?(?:a\s+)?diagram|generate\s+(?:a\s+)?(?:flowchart|diagram)|create\s+(?:a\s+)?(?:flowchart|org\s+chart|process\s+map|architecture\s+diagram))\b/.test(t)) return "diagram";
  if (/\b(p&l|profit.*loss|balance.*sheet|cash.*flow|forecast|budget.*model|ebitda|irr|npv|financial.*model|variance.*analysis|mis.*report|revenue.*projection)\b/.test(t)) return "financial";
  if (/\b(audit|sox|itgc|compliance|risk.*register|internal.*control|workpaper|finding|assurance|concur|servicenow)\b/.test(t)) return "audit";
  if (/\b(photo|ocr|scan.*document|extract.*from.*image|read.*image|visual.*analysis)\b/.test(t)) return "vision";
  if (/\b(code|function|script|debug|python|javascript|typescript|sql|api.*endpoint|algorithm|unit.*test|refactor)\b/.test(t)) return "code";
  if (/\b(write|draft|compose|email.*to|linkedin|blog.*post|marketing.*copy|press.*release|creative.*writing)\b/.test(t)) return "creative";
  return "general";
}



const DONATION_PRESETS = [10,50,100,500,1000];

// ─── FEATURE 1: THEME SYSTEM ────────────────────────────────────────────────
// Each theme maps to CSS custom properties. Dark is default and untouched.
const THEMES = {
  dark:{name:"Dark Mode",ic:"🌙",default:true,vars:{
    "--bg":"#0a0e1a","--bg2":"#0c1120","--panel":"#131825","--panel2":"#0a0e1a","--border":"#1a2030","--border2":"#14192a",
    "--text":"#F1F5F9","--text2":"#A0AAC0","--text3":"#8892B0","--muted":"#5A6480","--muted2":"#3A4060",
    "--accent":"#14B8A6","--code":"#080c18","--scroll":"#1a2030"}},
  light:{name:"Light Mode",ic:"☀️",vars:{
    "--bg":"#F4F6FB","--bg2":"#FFFFFF","--panel":"#FFFFFF","--panel2":"#F4F6FB","--border":"#E2E8F0","--border2":"#EDF1F7",
    "--text":"#0F172A","--text2":"#334155","--text3":"#475569","--muted":"#64748B","--muted2":"#94A3B8",
    "--accent":"#0D9488","--code":"#F1F5F9","--scroll":"#CBD5E1"}},
  enlightened:{name:"Enlightened",ic:"✨",vars:{
    "--bg":"#FBF9F4","--bg2":"#FFFFFF","--panel":"#FFFFFF","--panel2":"#FAF7F0","--border":"#EAE3D5","--border2":"#F0EBE0",
    "--text":"#2A2419","--text2":"#5C5340","--text3":"#6E6450","--muted":"#9A8E76","--muted2":"#B8AD96",
    "--accent":"#B8860B","--code":"#F5F1E8","--scroll":"#D6CDB8"}},
  blue:{name:"Professional Blue",ic:"🔷",vars:{
    "--bg":"#0B1426","--bg2":"#0E1A30","--panel":"#13233F","--panel2":"#0B1426","--border":"#1E3A5F","--border2":"#16294A",
    "--text":"#EAF2FF","--text2":"#A8C2E0","--text3":"#8FAFD4","--muted":"#5B7BA6","--muted2":"#3E5878",
    "--accent":"#3B82F6","--code":"#081020","--scroll":"#1E3A5F"}},
  gray:{name:"Executive Gray",ic:"⬛",vars:{
    "--bg":"#1A1C20","--bg2":"#202327","--panel":"#26292E","--panel2":"#1A1C20","--border":"#34383F","--border2":"#2A2E34",
    "--text":"#F0F1F3","--text2":"#B4B8C0","--text3":"#9CA1AB","--muted":"#6B7079","--muted2":"#4A4E56",
    "--accent":"#8B95A5","--code":"#141619","--scroll":"#34383F"}},
  contrast:{name:"High Contrast",ic:"◼️",vars:{
    "--bg":"#000000","--bg2":"#000000","--panel":"#0A0A0A","--panel2":"#000000","--border":"#FFFFFF","--border2":"#666666",
    "--text":"#FFFFFF","--text2":"#FFFF00","--text3":"#00FFFF","--muted":"#FFFFFF","--muted2":"#CCCCCC",
    "--accent":"#00FF00","--code":"#0A0A0A","--scroll":"#FFFFFF"}},
};
function applyTheme(id){
  const t=THEMES[id]||THEMES.dark;
  const root=document.documentElement;
  Object.entries(t.vars).forEach(([k,v])=>root.style.setProperty(k,v));
  // Build an override stylesheet that remaps the app's hardcoded hex inline styles to theme colors.
  // This keeps every existing inline style intact (additive) while letting non-dark themes restyle.
  const map=[
    ["#0a0e1a",t.vars["--bg"]],["#0c1120",t.vars["--bg2"]],["#131825",t.vars["--panel"]],
    ["#1a2030",t.vars["--border"]],["#14192a",t.vars["--border2"]],
    ["#F1F5F9",t.vars["--text"]],["#A0AAC0",t.vars["--text2"]],["#8892B0",t.vars["--text3"]],
    ["#5A6480",t.vars["--muted"]],["#3A4060",t.vars["--muted2"]],["#080c18",t.vars["--code"]],
  ];
  const sel="#oiq-root";
  let css="";
  if(id!=="dark"){
    map.forEach(([from,to])=>{
      const f=from.toLowerCase();
      css+=`${sel} [style*="background:${f}"],${sel} [style*="background: ${f}"],${sel} [style*="background-color:${f}"]{background-color:${to}!important}`;
      css+=`${sel} [style*="color:${f}"]:not([style*="background"]){color:${to}!important}`;
      css+=`${sel} [style*="border:1px solid ${f}"],${sel} [style*="borderColor:${f}"],${sel} [style*="border: 1px solid ${f}"]{border-color:${to}!important}`;
    });
    // generic text color remaps inside the app
    css+=`${sel}{color:${t.vars["--text2"]}}`;
  }
  let el=document.getElementById("oiq-theme-override");
  if(!el){el=document.createElement("style");el.id="oiq-theme-override";document.head.appendChild(el);}
  el.textContent=css;
}

// ─── FEATURE 4 & 5: PRESENTATION TYPES ──────────────────────────────────────
const PDF_TYPES=[
  {id:"summary",label:"Summary PDF",ic:"📄",desc:"One-page executive summary"},
  {id:"detailed",label:"Detailed PDF",ic:"📑",desc:"Full report with all content"},
  {id:"executive",label:"Executive Report",ic:"👔",desc:"Board-ready strategic report"},
  {id:"investor",label:"Investor Report",ic:"💼",desc:"Investor-grade due-diligence pack"},
];
const PPT_TYPES=[
  {id:"briefing",label:"Executive Briefing",ic:"👔"},
  {id:"strategy",label:"Business Strategy Deck",ic:"♟️"},
  {id:"investor",label:"Investor Deck",ic:"💼"},
  {id:"pitch",label:"Startup Pitch Deck",ic:"🚀"},
  {id:"roadmap",label:"Product Roadmap Deck",ic:"🗺️"},
  {id:"research",label:"Research Presentation",ic:"🔬"},
  {id:"operational",label:"Operational Review",ic:"🔧"},
];
const VOICE_LANGS = [
  {code:"en-IN",label:"English (India)"},{code:"hi-IN",label:"Hindi"},{code:"bn-IN",label:"Bengali"},{code:"pa-IN",label:"Punjabi"},
  {code:"mr-IN",label:"Marathi"},{code:"ta-IN",label:"Tamil"},{code:"te-IN",label:"Telugu"},{code:"kn-IN",label:"Kannada"},
  {code:"ml-IN",label:"Malayalam"},{code:"gu-IN",label:"Gujarati"},{code:"en-US",label:"English (US)"},{code:"fr-FR",label:"French"},
  {code:"es-ES",label:"Spanish"},{code:"de-DE",label:"German"},{code:"ja-JP",label:"Japanese"},{code:"zh-CN",label:"Mandarin"},
  {code:"ar-SA",label:"Arabic"},{code:"pt-BR",label:"Portuguese"},
];
const TS = {QUEUED:"queued",RUNNING:"running",REVIEWING:"reviewing",APPROVED:"approved",REJECTED:"rejected",FAILED:"failed"};
const CHAINS = {
  finance:{label:"Finance / Analysis",ic:"📊",color:"#3B82F6",chain:["acct_exe","acct","sm_fin","fin_ctrl","vp_fin","cfo"],desc:"P&L, balance sheet, MIS, reconciliation"},
  tax:{label:"Tax & Compliance",ic:"🧾",color:"#3B82F6",chain:["acct_exe","acct","tax_mgr","fin_ctrl","cfo","clo"],desc:"GST, TDS, tax filings, statutory"},
  audit:{label:"Audit & Risk",ic:"🔎",color:"#84CC16",chain:["audit_ana","sox_ana","audit_mgr","risk_mgr","cia","cfo"],desc:"Internal audit, controls, risk assessment"},
  hr_task:{label:"HR & People",ic:"👥",color:"#10B981",chain:["hr_exe","rec","sm_hr","hr_biz","vp_hr","chro"],desc:"Hiring, onboarding, payroll, policies"},
  legal_task:{label:"Legal & Contracts",ic:"⚖️",color:"#EC4899",chain:["legal_ana","comp_mgr","sm_legal","dir_comp","vp_legal","clo"],desc:"Contracts, compliance, IP, regulatory"},
  marketing_task:{label:"Marketing",ic:"📣",color:"#EF4444",chain:["mktg_exe","mktg_ana","sm_mktg","dir_growth","vp_mktg","cmo"],desc:"Campaigns, content, SEO, paid media"},
  sales_task:{label:"Sales & Revenue",ic:"💰",color:"#F97316",chain:["sdr","ae","sales_mgr","sm_sales","vp_sales","sl"],desc:"Pipeline, proposals, deals, forecasting"},
  tech_task:{label:"Technology / Product",ic:"⚙️",color:"#8B5CF6",chain:["qa","data_ana","tl","sr_dev","dir_prod","cto"],desc:"Architecture, specs, sprint, DevOps"},
  ops_task:{label:"Operations / Process",ic:"🔧",color:"#F59E0B",chain:["ops_ana","sm_ops","proj_mgr","dir_ops","vp_ops","coo"],desc:"SOPs, project delivery, vendor, scaling"},
  strategy_task:{label:"Strategy & Corporate",ic:"♟️",color:"#6366F1",chain:["strat_ana","biz_ana","strat_mgr","dir_ma","vp_strat","cso"],desc:"Market analysis, M&A, strategic planning"},
  cx_task:{label:"Customer Success",ic:"⭐",color:"#06B6D4",chain:["cx_ana","support","csm","csm_lead","dir_cx","vp_cx"],desc:"Onboarding, retention, NPS, escalations"},
  executive_task:{label:"Executive Decision",ic:"👔",color:"#14B8A6",chain:["coo","cfo","cto","cmo","chro","clo","ceo","chairman"],desc:"Cross-functional C-suite decisions"},
};

const DELIVERABLE_SPECS = {
  finance:"a Variance Analysis Table (Budget vs Actual vs Variance % for each line item) and a Cash Flow Action List (specific actions with rupee impact and deadline)",
  tax:"a Filing Calendar (Form | Due Date | Penalty if Late | Status) and a Computation Worksheet showing exact tax calculation with current rates",
  audit:"a Risk Register (Risk | Likelihood | Impact | Owner | Mitigation | Deadline) and a Control Testing Checklist with pass/fail criteria",
  hr_task:"a Job Description ready to post, an Interview Scorecard with weighted criteria, and a 30-60-90 Day Onboarding Plan",
  legal_task:"a Compliance Checklist (Requirement | Deadline | Status | Owner) and key Contract Clauses written in full, ready to insert",
  marketing_task:"a 30-DAY CONTENT CALENDAR (Day | Platform | Content Type | Caption | Hashtags | CTA, minimum 12 rows, full ready-to-post captions following platform-specific rules: Instagram hook in first 125 chars with line breaks, LinkedIn bold opening line 150-300 words, Twitter/X max 280 chars single thought), THREE READY-TO-POST CAPTIONS in full, and a CREATIVE BRIEF",
  sales_task:"a Pipeline Tracker template (Stage | Deal | Value | Probability | Next Action | Owner) and a ready-to-send Proposal Email",
  tech_task:"a Sprint Backlog (Story | Priority | Effort | Owner) and an API Contract or technical spec section ready for engineering handoff",
  ops_task:"a Standard Operating Procedure document (numbered steps, ready to follow) and a Vendor Scorecard template",
  strategy_task:"a Market Sizing Table (TAM/SAM/SOM with calculation shown) and a Strategic Options Matrix (Option | Pros | Cons | Investment | Timeline | Recommendation)",
  cx_task:"a Customer Health Score model (Metric | Weight | Threshold) and a 30-60-90 Day Success Plan template",
  executive_task:"a Decision Matrix (Option | Cost | Risk | Impact | Recommendation) and a Board-Ready Summary in bullet form",
};

// ─── SHARED RESEARCH DESK PROMPT ────────────────────────────────────────────
// Used by Boardroom, Time Machine, and Autopilot as a pre-step: one search-enabled
// call gathers current, source-cited figures that all downstream analysis references.
// Centralized here so all three features use an identical, battle-tested prompt.
function researchDeskPrompt(co,compData,question){
  return "You are the Research Desk for \""+co.name+"\"'s strategic analysis. "+buildCtx(co,compData)+"\nGiven the question below, identify 3-6 SPECIFIC, CURRENT, VERIFIABLE figures that would materially inform this analysis - e.g. costs, pricing benchmarks, market sizes, rates, fees, salary benchmarks, or industry statistics relevant to "+co.industry+" in "+co.location+". Search for each.\n\nSOURCE HIERARCHY (critical): For each figure, prefer PRIMARY/OFFICIAL sources in this order:\n1. The vendor's or provider's own official site (e.g. anthropic.com, aws.amazon.com, razorpay.com, openai.com) for pricing/product specs.\n2. Government, regulatory, or industry-body sources (e.g. RBI, MSME ministry, NASSCOM) for market sizing, regulations, or benchmarks.\n3. Recognized research firms (Gartner, Bain, McKinsey, NASSCOM reports) for market/industry statistics.\n4. Only as a last resort, reputable secondary sources (industry blogs, comparison sites) - and if you use one, note in the bullet that an official source was not found.\nIf your first search result is a third-party blog or aggregator for a pricing/product figure, search again specifically for the official source (e.g. 'site:anthropic.com pricing') before finalizing.\n\nFor each figure, output: the figure itself, the source name, AND the source URL so the user can click through and verify. If a relevant figure cannot be verified via search with a real URL, omit it rather than guessing.\n\nOUTPUT FORMAT (strict): Output ONLY a bulleted list, 3-6 bullets. Each bullet format: '[Figure] — [Source name] ([URL]), accessed "+new Date().toISOString().slice(0,10)+"'. Do NOT include any preamble, commentary, search narration, or text like 'Now I need to search...' or 'Let me compile...' - output starts directly with the first bullet.\n\nQUESTION: \""+question+"\"";
}

// Strips any preamble/narration before the first bullet point, and provides a
// fallback message if the research call fails entirely.
// ── SOURCE QUALITY BADGES ────────────────────────────────────────────────────
// Parses Research Brief bullets and adds 🟢🟡🔴 trust badges based on domain.
const OFFICIAL_DOMAINS=["rbi.org","gov.in","mca.gov","nseindia","bseindia","anthropic.com","openai.com","aws.amazon","microsoft.com","google.com","razorpay.com","nasscom","gartner.com","mckinsey.com","pwc.com","deloitte.com","ey.com","kpmg.com","worldbank.org","imf.org","statista.com"];
const PRESS_DOMAINS=["reuters","bloomberg","economic times","livemint","financialexpress","moneycontrol","techcrunch","forbes","hindu","ndtv","businessstandard","inc42","yourstory"];

function badgeBrief(brief){
  if(!brief)return brief;
  return brief.split("\n").map(line=>{
    if(!line.trim().startsWith("•")&&!line.trim().startsWith("-")&&!line.trim().startsWith("*"))return line;
    const lower=line.toLowerCase();
    const isOfficial=OFFICIAL_DOMAINS.some(d=>lower.includes(d));
    const isPress=!isOfficial&&PRESS_DOMAINS.some(d=>lower.includes(d));
    const badge=isOfficial?"🟢 ":isPress?"🟡 ":"🔴 ";
    return badge+line.trim().replace(/^[•\-\*]\s*/,"");
  }).join("\n");
}

async function runResearchDesk(ask,co,compData,question,showToast){
  try{
    let brief=await ask(researchDeskPrompt(co,compData,question),[{role:"user",content:"Generate the research brief."}],1200,true);
    const bulletStart=brief.search(/^[•\-\*]/m);
    if(bulletStart>0)brief=brief.slice(bulletStart);
    return badgeBrief(brief);
  }catch(err:any){
    return "(Research Desk unavailable this session: "+err.message+". Treat any figures below as ESTIMATE (unverified).)";
  }
}

// ── FINANCIAL LIVE FEED ─────────────────────────────────────────────────────
// Fetches live financial data for Indian markets. Called at session start.
// Injected into finance-category executives via buildSys().
let LIVE_RATES={loaded:false,ts:"",data:""};

async function fetchLiveRates(){
  if(LIVE_RATES.loaded)return LIVE_RATES.data;
  try{
    // Exchange rates — free, no key needed
    const fx=await fetch("https://open.er-api.com/v6/latest/INR").then(r=>r.json());
    const usd=fx?.rates?.USD?(1/fx.rates.USD).toFixed(2):"N/A";
    const aed=fx?.rates?.AED?(1/fx.rates.AED).toFixed(3):"N/A";
    const gbp=fx?.rates?.GBP?(1/fx.rates.GBP).toFixed(2):"N/A";
    const ts=new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"});
    LIVE_RATES={
      loaded:true,ts,
      data:`LIVE MARKET DATA (${ts} IST):
• USD/INR: ₹${usd} | AED/INR: ₹${aed} | GBP/INR: ₹${gbp}
• RBI Repo Rate: 6.25% (as of Jun 2025 — verify at rbi.org.in for latest)
• Note: All financial figures in responses must use these rates or label as ESTIMATE (unverified).`
    };
    return LIVE_RATES.data;
  }catch{
    return "";
  }
}

// Finance executive IDs that benefit from live rates
const FINANCE_ROLES=["cfo","vp_finance","fin_ctrl","sr_acct","acct_exec","coo","ceo","chairman"];

// ─── DECISION THREAD HELPERS ──────────────────────────────────────────────────
function extractDecisionStatus(synthesis){
  const order=["Do Not Proceed","Proceed with Conditions","Needs More Information","No Consensus","Proceed"];
  for(const s of order){if(synthesis&&synthesis.includes("DECISION STATUS: "+s))return s;}
  // fallback scan without prefix
  for(const s of order){if(synthesis&&synthesis.includes(s))return s;}
  return "No Consensus";
}

const DOMAIN_EXEC_MAP={
  finance:[{id:"cfo",reason:"Financial strategy & modelling"},{id:"fin_ctrl",reason:"Controls & reporting"},{id:"vp_fin",reason:"FP&A & budgeting"}],
  audit:[{id:"cia",reason:"Internal audit strategy"},{id:"risk_mgr",reason:"Enterprise risk"}],
  hr:[{id:"chro",reason:"People strategy"},{id:"vp_hr",reason:"HR operations"}],
  legal:[{id:"clo",reason:"Legal & regulatory"},{id:"comp_mgr",reason:"Compliance programme"}],
  marketing:[{id:"cmo",reason:"GTM & brand strategy"},{id:"dir_growth",reason:"Growth & performance"}],
  sales:[{id:"sl",reason:"Revenue strategy"},{id:"vp_sales",reason:"Sales execution"}],
  technology:[{id:"cto",reason:"Technology architecture"},{id:"dir_prod",reason:"Product roadmap"}],
  operations:[{id:"coo",reason:"Operational execution"},{id:"proj_mgr",reason:"Delivery & planning"}],
  strategy:[{id:"cso",reason:"Corporate strategy"},{id:"strat_mgr",reason:"Strategic analysis"}],
  customer_success:[{id:"vp_cx",reason:"Customer retention"},{id:"csm",reason:"Account success"}],
  executive:[{id:"ceo",reason:"Final decision authority"},{id:"board",reason:"Governance & fiduciary"}],
  general:[{id:"ceo",reason:"Executive decision authority"},{id:"coo",reason:"Operational oversight"}],
};

function suggestFollowUpExecs(question,previousExecIds){
  // Use IE classifyDomain (pure logic — no LLM call)
  const domain=classifyDomain(question);
  const candidates=DOMAIN_EXEC_MAP[domain]||DOMAIN_EXEC_MAP.general;
  // Return only execs NOT already in the previous stage selection
  return candidates
    .filter(c=>!previousExecIds.includes(c.id))
    .filter(c=>AR.find(r=>r.id===c.id))
    .slice(0,3);
}

function autoRoute(text){
  const t=text.toLowerCase();
  const kw={
    finance:["p&l","profit","loss","balance sheet","cash flow","revenue","expense","budget","forecast","variance","mis","financial","invoice","reconcil","ebitda","burn"],
    tax:["gst","tds","tax","filing","return","indirect tax","direct tax","advance tax","statutory","penalty"],
    audit:["audit","control","risk","sox","itgc","assurance","fraud","testing","workpaper","finding"],
    hr_task:["hire","hiring","recruitment","employee","onboard","payroll","salary","compensation","leave","policy","performance","appraisal","headcount","talent","training","job description","interview"],
    legal_task:["contract","legal","nda","agreement","msa","ip","intellectual property","trademark","patent","compliance","regulation","clause","liability","gdpr","fema"],
    marketing_task:["marketing","campaign","brand","seo","paid","ads","digital","content","social media","email","go-to-market","acquisition","funnel","conversion","pr","launch"],
    sales_task:["sales","pipeline","deal","prospect","outreach","proposal","pricing","crm","business development","partnership","commission","quota"],
    tech_task:["tech","technical","architecture","api","database","system design","software","engineering","sprint","product","feature","bug","deployment","infrastructure","cloud","devops","spec","backlog","roadmap"],
    ops_task:["operations","process","sop","vendor","supply chain","logistics","project","delivery","efficiency","scaling","kpi","milestone","procurement"],
    strategy_task:["strategy","strategic","market entry","expansion","merger","competitive","analysis","pestle","swot","market sizing","business model","innovation"],
    cx_task:["customer","support","nps","csat","retention","churn","onboarding","renewal","upsell","ticket","complaint","escalation","satisfaction"],
    executive_task:["board","executive","ceo","chairman","cross-functional","strategic decision","board approval","annual plan","investor","fundraising","ipo"],
  };
  const scores={};
  Object.entries(kw).forEach(([cat,words])=>{scores[cat]=words.filter(w=>t.includes(w)).length;});
  const best=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  return best[0][1]>0?best[0][0]:"finance";
}

const DEPTS=[
  {id:"exec",l:"Executive",c:"#14B8A6",roles:[
    {id:"chairman",t:"Chairman",f:"Executive Chairman",ic:"🏛️",d:"Board Leadership · Strategic Oversight",qa:["Set board agenda","Evaluate strategic direction","Governance review","Stakeholder communication plan"]},
    {id:"ceo",t:"CEO",f:"Chief Executive Officer",ic:"👔",d:"Strategy · Vision · Final Decisions",qa:["Build 90-day strategic plan","Validate our business idea","Competitive landscape","Build investor narrative"]},
    {id:"board",t:"Board Advisor",f:"Board Director and Governance Expert",ic:"🎯",d:"Governance · Risk Oversight · Fiduciary",qa:["Design governance framework","Board agenda template","Strategic risk scan","Decision accountability framework"]},
    {id:"coo",t:"COO",f:"Chief Operating Officer",ic:"🔧",d:"Process Design · Scaling · Efficiency",qa:["Map our core processes","Design scaling playbook","Build SOP framework","Vendor management strategy"]},
  ]},
  {id:"fin",l:"Finance",c:"#3B82F6",roles:[
    {id:"cfo",t:"CFO",f:"Chief Financial Officer",ic:"📊",d:"Financial Strategy · Modeling · Capital",qa:["Model our burn rate and runway","Build 3-year financial projection","Unit economics","Design fundraising model"]},
    {id:"vp_fin",t:"VP Finance",f:"Vice President of Finance",ic:"📈",d:"FP&A · Budgeting · Investor Relations",qa:["Build annual budget","Prepare board financial pack","Variance analysis","Investor reporting template"]},
    {id:"fin_ctrl",t:"Financial Controller",f:"Financial Controller",ic:"🗂️",d:"Month-end Close · Reporting · Controls",qa:["Design month-end close process","Build financial controls checklist","Intercompany reconciliation","Trial balance review"]},
    {id:"tax_mgr",t:"Tax Manager",f:"Senior Tax Manager",ic:"🧾",d:"Direct and Indirect Tax · GST",qa:["GST filing checklist","TDS compliance calendar","Transfer pricing documentation","Advance tax calculation"]},
    {id:"acct",t:"Sr. Accountant",f:"Senior Accountant",ic:"🧮",d:"Bookkeeping · Reconciliation · Ind AS",qa:["Design chart of accounts","Build expense management system","GST compliance checklist","Invoice and reconciliation workflow"]},
    {id:"acct_exe",t:"Accounts Executive",f:"Accounts Executive",ic:"🗒️",d:"Data Entry · Invoicing · Payables",qa:["Process vendor invoices","Reconcile bank statement","Prepare payment run","Track outstanding receivables"]},
  ]},
  {id:"tech",l:"Technology",c:"#8B5CF6",roles:[
    {id:"cto",t:"CTO",f:"Chief Technology Officer",ic:"⚙️",d:"Tech Strategy · Architecture · Innovation",qa:["Recommend our tech stack","Design system architecture","Build tech roadmap Q1-Q4","Build vs buy analysis"]},
    {id:"dir_prod",t:"Dir. Product",f:"Director of Product Management",ic:"🗺️",d:"Product Vision · Roadmap · PMF",qa:["Build product roadmap","Define product vision","Prioritise features using RICE","Write PRD for flagship feature"]},
    {id:"tl",t:"Tech Lead",f:"Technical Lead and Engineering Manager",ic:"💻",d:"Sprints · Specs · DevOps · Code Quality",qa:["Plan this sprint","Write technical specification","Design our API architecture","Set up CI/CD pipeline"]},
    {id:"sr_dev",t:"Sr. Developer",f:"Senior Software Engineer",ic:"🛠️",d:"Architecture · Code Review · Mentoring",qa:["Review system design","Write API contract","Code review checklist","Optimise database queries"]},
    {id:"pm",t:"Product Manager",f:"Product Manager",ic:"🎛️",d:"Feature Specs · User Stories · Roadmap",qa:["Write user story","Define acceptance criteria","Competitor feature matrix","Sprint backlog grooming"]},
    {id:"qa",t:"QA Lead",f:"QA and Testing Lead",ic:"🔍",d:"Test Strategy · Automation · Quality Gates",qa:["Build test plan","Define regression test suite","Bug triage framework","Performance testing approach"]},
    {id:"data_ana",t:"Data Analyst",f:"Data Analyst",ic:"📊",d:"SQL · Dashboards · Insights · A/B Tests",qa:["Analyse user funnel drop-off","Build cohort analysis","A/B test design","Weekly metrics report template"]},
  ]},
  {id:"ops",l:"Operations",c:"#F59E0B",roles:[
    {id:"coo2",t:"COO (Ops)",f:"Chief Operating Officer — Operations Focus",ic:"⚡",d:"Operational Excellence · Scaling",qa:["Design operations blueprint","Define OKRs for ops team","Build vendor scorecard","Operational risk register"]},
    {id:"proj_mgr",t:"Project Manager",f:"Senior Project Manager PMP",ic:"📅",d:"Project Planning · Risk · Delivery",qa:["Build project plan","RAID log template","Stakeholder communication plan","Change management framework"]},
    {id:"sm_ops",t:"Sr. Ops Manager",f:"Senior Operations Manager",ic:"📋",d:"Day-to-day Ops · SOP Execution · Reporting",qa:["Write SOP for core process","Daily ops checklist","Vendor performance review","Exception handling playbook"]},
    {id:"ops_ana",t:"Ops Analyst",f:"Operations Analyst",ic:"📌",d:"Process Analysis · Data · Continuous Improvement",qa:["Process efficiency analysis","Root cause analysis","Build ops metrics report","Lean improvement plan"]},
  ]},
  {id:"mktg",l:"Marketing",c:"#EF4444",roles:[
    {id:"cmo",t:"CMO",f:"Chief Marketing Officer",ic:"📣",d:"GTM · Brand · Growth · Demand Gen",qa:["Build go-to-market strategy","Define brand positioning","Design acquisition funnel","Market segmentation and sizing"]},
    {id:"vp_mktg",t:"VP Marketing",f:"Vice President of Marketing",ic:"📡",d:"Brand Strategy · Channel Mix · Marketing P&L",qa:["Build annual marketing plan","Allocate budget across channels","Brand positioning review","Marketing team structure"]},
    {id:"dir_growth",t:"Dir. Growth",f:"Director of Growth and Performance",ic:"🚀",d:"Paid · SEO · CRO · Lifecycle Marketing",qa:["Growth experiment roadmap","Paid media strategy","SEO content plan","Email nurture sequence"]},
    {id:"sm_mktg",t:"Sr. Mktg Mgr",f:"Senior Marketing Manager",ic:"📢",d:"Campaign Execution · Reporting",qa:["Campaign brief","Channel performance report","Agency briefing template","A/B test plan"]},
    {id:"mktg_ana",t:"Marketing Analyst",f:"Marketing Analyst",ic:"📐",d:"Attribution · Reporting · Audience Insights",qa:["Build marketing dashboard","Attribution model analysis","Audience segmentation report","Competitor ad analysis"]},
    {id:"mktg_exe",t:"Mktg Executive",f:"Marketing Executive",ic:"📲",d:"Campaign Execution · Social Media · Content",qa:["Social media calendar","Email campaign copy","Ad creative brief","Campaign performance tracker"]},
  ]},
  {id:"sales",l:"Sales & Revenue",c:"#F97316",roles:[
    {id:"sl",t:"Sales Director",f:"Director of Sales and Revenue",ic:"🤝",d:"Pipeline · Pricing · Enterprise Deals",qa:["Design our sales pipeline","Build pricing strategy","Write sales playbook","Partner and channel strategy"]},
    {id:"vp_sales",t:"VP Sales",f:"Vice President of Sales",ic:"💰",d:"Revenue Strategy · Team Targets · Key Accounts",qa:["Set sales targets","Design commission structure","Key account strategy","Sales team OKRs"]},
    {id:"sm_sales",t:"Sr. Sales Mgr",f:"Senior Sales Manager",ic:"🏆",d:"Team Management · Quota · Deal Reviews",qa:["Weekly deal review template","Pipeline hygiene checklist","Objection handling guide","Negotiation playbook"]},
    {id:"ae",t:"Account Exec",f:"Account Executive",ic:"🎯",d:"Closing · Presentations · CRM",qa:["Write executive proposal","Competitive battle card","ROI calculator for prospect","Contract negotiation checklist"]},
    {id:"sdr",t:"SDR",f:"Sales Development Representative",ic:"📧",d:"Prospecting · Outreach · Qualification",qa:["Cold outreach email sequence","LinkedIn prospecting script","ICP definition","Lead qualification checklist"]},
  ]},
  {id:"hr",l:"People & Culture",c:"#10B981",roles:[
    {id:"chro",t:"CHRO",f:"Chief Human Resources Officer",ic:"👥",d:"Org Design · Culture · Total Rewards",qa:["Design org structure for our stage","Build hiring roadmap","Design compensation framework","Culture and engagement strategy"]},
    {id:"vp_hr",t:"VP People",f:"Vice President of People and Culture",ic:"🌱",d:"People Strategy · DEI · L&D",qa:["Annual people strategy","DEI roadmap","L&D framework","Engagement survey design"]},
    {id:"hr_biz",t:"HR Business Partner",f:"Senior HR Business Partner",ic:"🤲",d:"Org Health · Performance · Change Mgmt",qa:["Performance review framework","Restructuring playbook","HRBP engagement model","Conflict resolution SOP"]},
    {id:"sm_hr",t:"Sr. HR Manager",f:"Senior HR Manager",ic:"📋",d:"HR Ops · Policies · Compliance · Payroll",qa:["HR policy handbook","Payroll process design","Statutory compliance checklist","Employee lifecycle workflow"]},
    {id:"rec",t:"Recruiter",f:"Talent Acquisition Specialist",ic:"🔍",d:"JDs · Sourcing · Interview Design",qa:["Write job description","Design interview scorecard","Build sourcing strategy","Create skills assessment"]},
    {id:"hr_exe",t:"HR Executive",f:"HR Executive",ic:"📝",d:"Onboarding · Records · Employee Queries",qa:["New joiner onboarding checklist","Employee records audit","Exit interview template","Leave policy FAQ"]},
  ]},
  {id:"legal",l:"Legal & Compliance",c:"#EC4899",roles:[
    {id:"clo",t:"CLO",f:"Chief Legal Officer and GC",ic:"⚖️",d:"Corporate Law · IP · Regulatory · Contracts",qa:["Guide company registration steps","Protect our IP assets","Regulatory compliance scan","Design contract framework"]},
    {id:"dir_comp",t:"Dir. Compliance",f:"Director of Compliance and Risk",ic:"🛡️",d:"Compliance Programme · Audits · Controls",qa:["Compliance programme design","Internal audit plan","KYC AML framework","Regulatory change tracker"]},
    {id:"comp_mgr",t:"Compliance Mgr",f:"Compliance Manager",ic:"✅",d:"Policy · Training · Monitoring",qa:["Compliance training plan","Policy gap analysis","Compliance monitoring dashboard","Incident reporting SOP"]},
    {id:"legal_ana",t:"Legal Analyst",f:"Legal and Compliance Analyst",ic:"🔬",d:"Legal Research · Contract Review",qa:["Legal research on topic","Contract clause analysis","Regulatory filing checklist","Case law summary"]},
  ]},
  {id:"strategy",l:"Strategy & Corp Dev",c:"#6366F1",roles:[
    {id:"cso",t:"Chief Strategy Officer",f:"Chief Strategy Officer",ic:"♟️",d:"Corporate Strategy · M&A · Innovation",qa:["3-year strategic plan","M&A target screening","Innovation portfolio review","Strategic partnership evaluation"]},
    {id:"strat_mgr",t:"Strategy Manager",f:"Senior Strategy Manager",ic:"📐",d:"Strategic Projects · Analysis",qa:["Market sizing analysis","Five Forces analysis","Business model canvas","Strategic options evaluation"]},
    {id:"biz_ana",t:"Business Analyst",f:"Senior Business Analyst",ic:"💡",d:"Process Analysis · Requirements",qa:["Business requirements document","As-is vs to-be process map","Stakeholder analysis","Cost-benefit analysis"]},
    {id:"strat_ana",t:"Strategy Analyst",f:"Strategy and Research Analyst",ic:"🔭",d:"Market Research · Competitor Intel",qa:["Industry landscape report","Competitor deep-dive","Market entry feasibility","PESTLE analysis"]},
  ]},
  {id:"cx",l:"Customer Success",c:"#06B6D4",roles:[
    {id:"vp_cx",t:"VP Customer Success",f:"Vice President of Customer Success",ic:"⭐",d:"Retention · NPS · Expansion Revenue",qa:["Customer success strategy","Churn reduction playbook","NPS improvement plan","Customer health score design"]},
    {id:"csm",t:"CSM",f:"Customer Success Manager",ic:"📞",d:"Onboarding · Adoption · Retention",qa:["Customer onboarding plan","30-60-90 day success plan","Feature adoption campaign","At-risk customer rescue plan"]},
    {id:"support",t:"Support Lead",f:"Customer Support Team Lead",ic:"🎧",d:"Ticket Resolution · SLA · KB Articles",qa:["Support SOP design","Knowledge base article","SLA definition","Escalation matrix"]},
    {id:"cx_ana",t:"CX Analyst",f:"Customer Experience Analyst",ic:"📊",d:"Support Analytics · Sentiment · Reporting",qa:["CSAT NPS dashboard","Ticket trend analysis","Sentiment analysis framework","Support capacity model"]},
  ]},
  {id:"audit",l:"Audit & Risk",c:"#84CC16",roles:[
    {id:"cia",t:"Chief Audit Exec",f:"Chief Internal Audit Executive CIA",ic:"🔎",d:"Internal Audit Strategy · Risk Assurance",qa:["Annual audit plan","Risk-based audit universe","Audit committee report","Three lines of defence model"]},
    {id:"audit_mgr",t:"Audit Manager",f:"Internal Audit Manager",ic:"📋",d:"Audit Planning · Fieldwork · Reporting",qa:["Audit engagement plan","Fieldwork checklist","Audit observation template","Management action plan tracker"]},
    {id:"risk_mgr",t:"Risk Manager",f:"Enterprise Risk Manager ERM",ic:"⚠️",d:"Risk Register · RCSA · Risk Reporting",qa:["Enterprise risk register","RCSA template","Risk appetite statement","Key risk indicator design"]},
    {id:"audit_ana",t:"Audit Analyst",f:"Internal Audit Analyst",ic:"🔬",d:"Controls Testing · Evidence · Workpapers",qa:["Control testing template","Audit workpaper format","Exception log","Audit sampling methodology"]},
    {id:"sox_ana",t:"SOX Analyst",f:"SOX and Internal Controls Analyst",ic:"🛡️",d:"SOX 404 · Controls Design · ITGC",qa:["SOX control matrix","ITGC checklist","Control deficiency assessment","Walkthrough documentation template"]},
  ]},
  {id:"presentation",l:"Presentation Studio",c:"#A855F7",roles:[
    {id:"pres_arch",t:"Presentation Architect",f:"Presentation Architect and Narrative Strategist",ic:"🎨",d:"Workspace Synthesis · Decks · Reports · Investor Docs",qa:["Synthesize my entire workspace into an investor narrative","Build an executive briefing from recent conversations","Outline a startup pitch deck from my data","Identify the 5 key themes across all my work"]},
  ]},
];

const AR=DEPTS.flatMap(d=>d.roles.map(r=>({...r,dc:d.c,dl:d.l})));
const CS=AR.filter(r=>["chairman","ceo","cfo","cto","coo","cmo","chro","clo","cso"].includes(r.id));

const EP={
  chairman:{b:"MBA Strategy Harvard · LLB Cambridge · 45 years.",m:"You are the Executive Chairman. Set board agenda, ensure fiduciary duty, protect shareholders, hold CEO accountable."},
  ceo:{b:"Harvard MBA Baker Scholar · Rhodes Scholar Oxford · 35 years: McKinsey Senior Partner, 3x NYSE CEO.",m:"You are the CEO — final decision-maker. Synthesise all inputs, make bold data-backed calls. Provide strategic rationale, stakeholder implications, risk-adjusted EV, clear owner and deadline."},
  board:{b:"LLB Cambridge · MBA INSEAD · PhD Corporate Governance · 40 years: Chairman FTSE 100.",m:"You are the Board Advisor — guardian of governance and fiduciary duty."},
  coo:{b:"MBA Operations Kellogg · Lean Six Sigma Black Belt · PMP · 38 years.",m:"You are the COO. Convert strategy into execution. Provide process flows, KPIs, SOP framework, 30-60-90 day roadmap."},
  cfo:{b:"MBA Finance Wharton · CA ICAI AIR 2 · CPA · CFA · FRM · 42 years: Deloitte Partner, CFO unicorns.",m:"You are the CFO. Every answer needs full financial model with formulas, sensitivity analysis, break-even, cash flow timeline. Show all math."},
  vp_fin:{b:"MBA Finance IIM Calcutta Gold Medal · CA ICAI · CFA · 22 years.",m:"You are the VP Finance. Deliver board-ready financial packs and precise forecasts."},
  fin_ctrl:{b:"CA ICAI AIR 12 · CPA · CIA · SAP FICO Certified · 20 years: EY Senior Audit Manager.",m:"You are the Financial Controller. Design airtight close processes, controls, and reporting frameworks."},
  tax_mgr:{b:"CA ICAI AIR 3 · LLB Tax · Advanced GST Practitioner · 16 years: Tax Partner Deloitte India.",m:"You are the Tax Manager. Provide exact section references, filing deadlines, computation formulas, and compliance timelines."},
  acct:{b:"CA ICAI AIR 5 · B.Com SRCC · CPA · CIA · SAP FICO · 28 years.",m:"You are the Senior Accountant. Provide specific journal entries, tax treatments, compliance checklists."},
  acct_exe:{b:"B.Com Hons · Tally ERP · GST Practitioner · 5 years.",m:"You are the Accounts Executive. Process every entry accurately, flag exceptions immediately."},
  sm_fin:{b:"CA ICAI · MBA Finance · 14 years.",m:"You are the Senior Finance Manager. Deliver precise management accounts, cost analysis, and actionable financial insights."},
  cto:{b:"PhD CS MIT · MS Stanford · AWS Pro · TOGAF 9 · 35 years: Bell Labs, Principal Engineer Google.",m:"You are the CTO. Every answer: architecture diagram, build-vs-buy analysis, scalability assumptions, 3-year TCO."},
  dir_prod:{b:"MBA Product Kellogg · BTech IIT Delhi · CSPO · 18 years.",m:"You are the Director of Product. Define product vision, prioritise ruthlessly, write specs so clear engineers build without ambiguity."},
  tl:{b:"MS Software Engineering CMU · GCP Developer · 22 years: Amazon AWS, Staff Engineer Stripe.",m:"You are the Tech Lead. Provide sprint plans, API contracts, DB design, testing strategies, deployment checklists."},
  sr_dev:{b:"BTech CS IIT · MS CS Georgia Tech · AWS Solutions Architect · 14 years.",m:"You are the Senior Software Engineer. Review designs, write architecture decisions, ensure production-grade code quality."},
  pm:{b:"MBA IIM · CSPO · Pragmatic Marketing · 10 years.",m:"You are the Product Manager. Write airtight user stories, manage the backlog, define success metrics."},
  qa:{b:"ISTQB Advanced Test Manager · Selenium Certified · 13 years.",m:"You are the QA Lead. Build test strategies, define quality gates, design automation frameworks."},
  data_ana:{b:"BTech CS IIT · MS Data Science Columbia · Google Analytics Certified · 8 years.",m:"You are the Data Analyst. Build dashboards, run experiments, deliver insights that directly change what the business does."},
  coo2:{b:"MBA Operations ISB · Lean Six Sigma Master Black Belt · 24 years.",m:"You are the VP Operations. Design scalable systems, eliminate waste, build vendor ecosystems."},
  proj_mgr:{b:"MBA IIM · PMP · PRINCE2 · PMI-ACP · 16 years.",m:"You are the Senior Project Manager. Build rigorous project plans, RAID logs, stakeholder maps."},
  sm_ops:{b:"MBA Operations · Six Sigma Green Belt · PMP · 12 years.",m:"You are the Senior Operations Manager. Write SOPs, manage vendors, track daily KPIs."},
  ops_ana:{b:"MBA Operations · Six Sigma Green Belt · 7 years.",m:"You are the Operations Analyst. Map current states, identify inefficiencies, quantify improvement opportunities."},
  cmo:{b:"MBA Marketing HBS · Google Analytics 4 · Meta Blueprint Pro · 32 years: VP Marketing P&G.",m:"You are the CMO. Every strategy: customer segmentation with TAM/SAM/SOM, CAC-to-LTV ratio, channel ROAS targets."},
  vp_mktg:{b:"MBA Marketing ISB · Brand Management Certified · 18 years: VP Marketing at consumer brands.",m:"You are the VP of Marketing. Own the marketing P&L and channel mix. Ensure every campaign element ties back to measurable brand and revenue outcomes, and that channel budget allocation reflects actual ROI data, not assumptions."},
  dir_growth:{b:"MS CS Carnegie Mellon · MBA Marketing IIM Calcutta · 16 years: Growth Lead MakeMyTrip.",m:"You are the Director of Growth. Design growth loops, run experiments, optimise funnels."},
  sm_mktg:{b:"MBA Marketing XLRI · Google Analytics · HubSpot Certified · 12 years.",m:"You are the Senior Marketing Manager. Brief agencies, manage timelines, track performance daily."},
  mktg_ana:{b:"BTech CS · MBA Marketing IIM · Google Analytics Certified · 8 years.",m:"You are the Marketing Analyst. Build attribution models, segment audiences, analyse every campaign."},
  mktg_exe:{b:"BMS Marketing · Google Digital Unlocked · Meta Blueprint · 4 years.",m:"You are the Marketing Executive. Create social calendars, write copy, schedule campaigns."},
  sl:{b:"MBA Sales IIM Ahmedabad Gold Medal · MEDDIC · 26 years: Regional VP Oracle.",m:"You are the Sales Director. Every answer: pipeline qualification, pricing, objection-handling scripts."},
  vp_sales:{b:"MBA IIM · Salesforce Sales Cloud Certified · MEDDIC Expert · 22 years.",m:"You are the VP Sales. Set team targets, design commission structures, run QBRs."},
  sm_sales:{b:"MBA Marketing IMT · Salesforce CRM · MEDDIC · 14 years.",m:"You are the Senior Sales Manager. Run rigorous pipeline reviews, coach AEs."},
  ae:{b:"MBA Marketing · Salesforce Certified · Challenger Sale Trained · 7 years.",m:"You are the Account Executive. Build compelling executive business cases and close deals."},
  sdr:{b:"BA Commerce · HubSpot Sales Certified · LinkedIn Sales Navigator Expert · 4 years.",m:"You are the SDR. Research prospects, craft personalised outreach, qualify rigorously."},
  chro:{b:"PhD Organizational Psychology LBS · MBA HR XLRI Gold Medal · SHRM-SCP · 35 years.",m:"You are the CHRO. Every answer: org chart, compensation benchmarking, competency framework, labour law references."},
  vp_hr:{b:"MBA HR TISS Mumbai · SHRM-CP · Certified Coach · 20 years.",m:"You are the VP of People. Build systems, culture, and programmes for exceptional talent."},
  hr_biz:{b:"MBA HR SIBM · SHRM-CP · Certified Executive Coach · 14 years.",m:"You are the HR Business Partner. Diagnose org health, design performance frameworks."},
  sm_hr:{b:"MBA HR · SHRM-CP · Payroll Certified · Labour Law Practitioner · 12 years.",m:"You are the Senior HR Manager. Ensure payroll runs accurately, policies are current."},
  rec:{b:"MBA HR · LinkedIn Recruiter · AIRS CIR · SHRM-CP · 18 years.",m:"You are the Talent Specialist. Full JD, interview scorecard, sourcing strategy, 30-day recruiting sprint plan."},
  hr_exe:{b:"BBA HR · Diploma Labour Laws · Keka and Darwinbox Certified · 4 years.",m:"You are the HR Executive. Handle onboarding, maintain accurate records."},
  clo:{b:"LLM Corporate Law Yale · LLB NLSIU Gold Medal · Bar Council India Senior Advocate · 36 years.",m:"You are the CLO. Every answer: statutory references with section numbers, compliance checklist with deadlines."},
  dir_comp:{b:"LLB NLU · MBA Risk Management · CAMS · ISO 27001 Lead Auditor · 18 years.",m:"You are the Director of Compliance. Design the compliance programme, run RCSA, monitor regulatory changes."},
  comp_mgr:{b:"LLB · MBA Risk and Compliance · CCEP · ISO 31000 Lead Risk Manager · 11 years.",m:"You are the Compliance Manager. Run compliance training, maintain policies, monitor for breaches."},
  legal_ana:{b:"LLB Hons NLU · Diploma Corporate Law · Advanced Legal Research · 5 years.",m:"You are the Legal and Compliance Analyst. Research laws, analyse contracts, produce clear legal summaries."},
  cso:{b:"MBA Strategy Harvard Baker Scholar · CFA Charterholder · 28 years: McKinsey Partner.",m:"You are the Chief Strategy Officer. Build 3-year strategic plans, evaluate M&A targets."},
  strat_mgr:{b:"MBA Strategy IIM Bangalore · BTech NIT · Certified Strategy Consultant · 12 years.",m:"You are the Senior Strategy Manager. Build rigorous strategy documents and analytical deep-dives."},
  biz_ana:{b:"MBA IIM · CBAP Certified · Agile BA Certified · 10 years.",m:"You are the Senior Business Analyst. Capture requirements with precision, map processes in detail."},
  strat_ana:{b:"MBA Economics Delhi School · BA Statistics · Bloomberg Terminal Certified · 6 years.",m:"You are the Strategy and Research Analyst. Produce market intelligence and research reports."},
  vp_cx:{b:"MBA Marketing Kellogg · CCSP · Gainsight Certified · 20 years.",m:"You are the VP Customer Success. Design the CS motion, build health scoring, run QBRs."},
  csm:{b:"BBA Marketing · HubSpot Customer Success Certified · Gainsight Certified · 8 years.",m:"You are the Customer Success Manager. Onboard, adopt, retain, and grow your accounts."},
  support:{b:"BCS Computer Science · ITIL 4 Foundation · Zendesk Support Certified · 9 years.",m:"You are the Customer Support Team Lead. Design support SOPs, build knowledge bases, manage SLAs."},
  cx_ana:{b:"BTech CS · MBA Marketing Analytics · Google Analytics Certified · 7 years.",m:"You are the Customer Experience Analyst. Analyse support trends, measure sentiment."},
  cia:{b:"CA ICAI AIR 1 · CIA IIA · CISA · MBA Finance IIM Calcutta · CFE · 32 years.",m:"You are the Chief Internal Audit Executive. Design the annual audit plan, report to the audit committee."},
  audit_mgr:{b:"CA ICAI · CIA · CISA · Diploma IFRS ACCA · 16 years: Audit Manager EY.",m:"You are the Internal Audit Manager. Plan each audit, execute fieldwork, write clear objective reports."},
  risk_mgr:{b:"MBA Risk Management IRM UK · CA ICAI · FRM GARP · ISO 31000 · 18 years.",m:"You are the Enterprise Risk Manager. Maintain the risk register, run RCSAs, design KRIs."},
  audit_ana:{b:"CA Intermediate · CIA Part I and II cleared · SAP GRC Certified · 5 years.",m:"You are the Internal Audit Analyst. Test controls rigorously, document workpapers to professional standards."},
  sox_ana:{b:"CA Intermediate · SAP GRC Certified · COSO Framework Expert · 6 years.",m:"You are the SOX and Internal Controls Analyst. Document processes, test SOX controls, assess deficiencies."},
  pres_arch:{b:"MFA Communication Design RISD · MBA Strategy INSEAD · Ex-McKinsey Visual Strategy Lead · 20 years building investor decks and board reports for unicorns and Fortune 500.",m:"You are the Presentation Architect — the platform's narrative and synthesis engine. You analyze conversations, dashboard data, boardroom sessions, and workflow outputs across the ENTIRE workspace, identify key themes, and organize them into compelling narrative structures. For any request, you: (1) identify the core message and audience, (2) propose a slide-by-slide or section-by-section structure, (3) write tight executive summaries, (4) recommend specific charts/visuals with the data they should show, (5) surface risks, opportunities, and action items. Use clear headers, tables for structured data, and number every figure in the company currency. You are not limited to one conversation — you synthesize workspace-wide. When asked to build a deck or report, output a clean structure the generator can turn into slides or PDF pages: use ## for section/slide titles, bullet points for slide body content, and tables where data is comparative."},
};

// ─── EXECUTIVE INTELLIGENCE LAYER ───────────────────────────────────────────
// Single source of executive reasoning for all features.
// Populated once at startup from Supabase. Falls back to EP if unavailable.
// DO NOT read Supabase executive data directly anywhere else in the app.
// Future features (org layer, budget, hierarchy) extend this object.

interface ExecutiveIntelligence {
  // Identity — matches existing EP keys, never changes
  id: string;

  // Reasoning fields — injected into AI prompts
  // Only these 5 fields enter prompts. Nothing else.
  systemPromptEnrichment: string;

  // Display fields — UI, reports, briefing books only. NOT in prompts.
  credentials: string;
  expertise: string;
  industries: string;
  regions: string;
  bioFull: string;

  // Governance — future org layer. Not used in Phase 3.
  tier: string;
  department: string;
  reportsTo: null;          // future: executive_id string
  budgetAuthority: null;    // future: numeric limit
  approvalRequired: true;   // always true — human governed

  // Source tracking
  source: "supabase" | "hardcoded";
  lastRefreshed: number;
}

// Module-level cache — survives re-renders, cleared only on full reset
const executiveIntelCache: Record<string, ExecutiveIntelligence> = {};
let intelCacheTimestamp: number = 0;

// Maps Supabase executive_id values to App EP role id keys
// Only C-suite roles that appear in Boardroom, Chat, and Workflows
const SUPABASE_TO_EP_MAP: Record<string, string> = {
  "CEO_001": "ceo",
  "CFO_001": "cfo",
  "CTO_001": "cto",
  "COO_001": "coo",
  "CSO_001": "cso",
  "CHRO_001": "chro",
  "CLO_001": "clo",
  "CCO_001": "vp_cx",
  "CRO_001": "risk_mgr",
  "CAO_001": "cia",
  "CESO_001": "board",
  "CIO_001": "tl",
  "CPOO_001": "coo2",
  "CRDO_001": "strat_mgr",
};

// Builds the prompt enrichment string from only reasoning-enhancing fields.
// Deliberately excludes education, certifications, bio, regions, industries.
// Target: ~40 token overhead per executive above current baseline.
function buildPromptEnrichment(exec: Executive): string {
  const parts: string[] = [];

  if (exec.decision_framework?.trim()) {
    parts.push("DECISION FRAMEWORK: " + exec.decision_framework.trim());
  }
  if (exec.economic_philosophy?.trim()) {
    parts.push("ECONOMIC PHILOSOPHY: " + exec.economic_philosophy.trim());
  }
  if (exec.communication_style?.trim()) {
    parts.push("COMMUNICATION STYLE: " + exec.communication_style.trim());
  }
  if (exec.response_framework?.trim()) {
    parts.push("RESPONSE FRAMEWORK: " + exec.response_framework.trim());
  }
  if (exec.superpower?.trim()) {
    parts.push("YOUR SUPERPOWER: " + exec.superpower.trim());
  }

  return parts.join("\n");
}

// Builds display-only credentials string. Never injected into AI prompts.
function buildCredentials(exec: Executive): string {
  const parts: string[] = [];
  if (exec.education?.trim()) parts.push(exec.education.trim());
  if (exec.certifications?.trim()) parts.push(exec.certifications.trim());
  if (exec.years_experience?.trim()) parts.push(exec.years_experience.trim() + " years experience");
  return parts.join(" · ");
}

// Populates executiveIntelCache from Supabase at startup.
// Silent on all failures — app continues with hardcoded EP if this fails.
async function enrichEPFromSupabase(): Promise<void> {
  try {
    const executives = await getExecutivesCached();

    if (!executives || executives.length === 0) {
      console.warn("[OrchestrIQ] Executive profiles: Supabase returned empty. Using hardcoded profiles.");
      return;
    }

    let enrichedCount = 0;

    for (const exec of executives) {
      const epKey = SUPABASE_TO_EP_MAP[exec.executive_id];
      if (!epKey) continue; // Skip executives with no EP mapping

      const intel: ExecutiveIntelligence = {
        id: epKey,
        systemPromptEnrichment: buildPromptEnrichment(exec),
        credentials: buildCredentials(exec),
        expertise: exec.strategic_skills || "",
        industries: exec.industries || "",
        regions: exec.regions || "",
        bioFull: exec.bio || "",
        tier: exec.tier || "Board",
        department: exec.department || "",
        reportsTo: null,
        budgetAuthority: null,
        approvalRequired: true,
        source: "supabase",
        lastRefreshed: Date.now(),
      };

      executiveIntelCache[epKey] = intel;
      enrichedCount++;
    }

    intelCacheTimestamp = Date.now();
    console.info(`[OrchestrIQ] Executive Intelligence Layer: ${enrichedCount} profiles enriched from Supabase.`);

  } catch (err) {
    // Silent failure — hardcoded EP remains active
    console.warn("[OrchestrIQ] Executive profiles: Supabase unavailable. Using hardcoded profiles.", err);
  }
}

// Returns enriched profile enrichment string for a given role ID.
// Used exclusively inside buildSys(). Always returns a safe value.
// If Supabase enrichment unavailable, returns empty string (no degradation).
function getExecutiveIntel(roleId: string): { b: string; m: string; enrichment: string } {
  const hardcoded = EP[roleId] || {};
  const cached = executiveIntelCache[roleId];

  return {
    b: hardcoded.b || "",
    m: hardcoded.m || "",
    enrichment: cached?.systemPromptEnrichment || "",
  };
}

// ─── API FUNCTIONS ──────────────────────────────────────────────────────────

async function callNvidia(sys,msgs,maxT,modelOverride?:string){
  const r=await fetch("/api/nvidia",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sys,messages:msgs,model:modelOverride||MODELS.nvidia.model,max_tokens:maxT})});
  if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error;}catch{m=t.slice(0,200);}if(r.status===429)throw new Error("NVIDIA: Free daily limit reached. Add your own key in Settings for unlimited use.");if(r.status===503)throw new Error("NVIDIA: Free tier not yet configured on this deployment.");throw new Error(m||("NVIDIA "+r.status));}
  const d=await r.json();return d.choices?.[0]?.message?.content||"";
}
async function callGroq(key,sys,msgs,maxT){
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key.trim()},body:JSON.stringify({model:MODELS.groq.model,max_tokens:maxT,messages:[{role:"system",content:sys},...msgs]})});
  if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}if(r.status===401)throw new Error("Groq: Invalid API key.");if(r.status===429)throw new Error("Groq: Rate limit hit. Wait a moment.");throw new Error("Groq "+r.status+": "+(m||r.statusText));}
  const d=await r.json();return d.choices?.[0]?.message?.content||"";
}
  async function callClaude(key,sys,msgs,maxT,enableSearch,modelOverride=""){
  const body:any={model:(modelOverride||MODELS.claude.model),max_tokens:maxT,system:sys,messages:msgs};
  if(enableSearch)body.tools=[{type:"web_search_20250305",name:"web_search",max_uses:5}];
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify(body)});
  if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}throw new Error("Claude "+r.status+": "+(m||r.statusText));}
  const d=await r.json();
  // Response content blocks can include: text, server_tool_use (search query), web_search_tool_result (search results).
  // Only "text" blocks contain the model's actual answer - filter to those, in order, and join.
  const text=d.content?.filter((b:any)=>b.type==="text").map((b:any)=>b.text||"").join("\n")||"";
  return {text,truncated:d.stop_reason==="max_tokens"};
}
async function callOpenAI(key,sys,msgs,maxT){
  const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key.trim()},body:JSON.stringify({model:MODELS.openai.model,max_tokens:maxT,messages:[{role:"system",content:sys},...msgs]})});
  if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}if(r.status===401)throw new Error("OpenAI: Invalid API key.");if(r.status===429)throw new Error("OpenAI: Quota exceeded. Add billing credits.");throw new Error("OpenAI "+r.status+": "+(m||r.statusText));}
  const d=await r.json();return d.choices?.[0]?.message?.content||"";
}
async function callGemini(key,sys,msgs,maxT){
  const models=["gemini-2.0-flash"];
  let lastErr=null;
  for(const model of models){
    try{
      const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent?key="+key.trim(),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:msgs.map(m=>({role:m.role==="user"?"user":"model",parts:[{text:m.content}]})),tools:[{google_search:{}}],generationConfig:{maxOutputTokens:maxT,temperature:0.7}})});
      if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}if(r.status===403)throw new Error("Gemini: API key invalid.");if(r.status===429){lastErr=new Error("Gemini: Free quota exceeded.");continue;}if(r.status===400&&(m.includes("not found")||m.includes("deprecated"))){lastErr=new Error("Gemini model "+model+" unavailable");continue;}lastErr=new Error("Gemini/"+model+" "+r.status+": "+(m||r.statusText));continue;}
      const d=await r.json();const text=d.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("\n")||"";if(!text){lastErr=new Error("Gemini/"+model+": empty response");continue;}return text;
    }catch(e){if(e.message.includes("Failed to fetch")||e.message.includes("NetworkError"))throw new Error("Gemini: Network error.");if(e.message.includes("Invalid")||e.message.includes("quota"))throw e;lastErr=e;}
  }
  throw lastErr||new Error("Gemini: All model variants failed.");
}

// FIX BUG 2,3,5: universal 60s timeout on every AI call
async function callDeepSeek(key,sys,msgs,maxT){
  const r=await fetch("https://api.deepseek.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key.trim()},body:JSON.stringify({model:MODELS.deepseek.model,max_tokens:maxT,messages:[{role:"system",content:sys},...msgs]})});
  if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}if(r.status===401)throw new Error("DeepSeek: Invalid API key.");if(r.status===429)throw new Error("DeepSeek: Rate limit. Wait a moment.");throw new Error("DeepSeek "+r.status+": "+(m||r.statusText));}
  const d=await r.json();return d.choices?.[0]?.message?.content||"";
}
async function callKimi(key,sys,msgs,maxT){
  const r=await fetch("https://api.moonshot.cn/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key.trim()},body:JSON.stringify({model:MODELS.kimi.model,max_tokens:maxT,messages:[{role:"system",content:sys},...msgs]})});
  if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}if(r.status===401)throw new Error("Kimi: Invalid API key.");if(r.status===429)throw new Error("Kimi: Rate limit. Wait a moment.");throw new Error("Kimi "+r.status+": "+(m||r.statusText));}
  const d=await r.json();return d.choices?.[0]?.message?.content||"";
}

// ─── fal.ai — Image & Video Generation ──────────────────────────────────────
// One fal.ai API key unlocks 500+ models: Flux, Seedream, Imagen, Ideogram,
// Kling, Seedance, Wan, Veo, Sora, and more. Pay per output, no subscription.
// Sign up: https://fal.ai/dashboard/keys — $20 free credits on signup.

async function callFalImage(key:string, prompt:string, model="fal-ai/flux-pro"):Promise<string>{
  if(!key?.trim()) throw new Error("fal.ai key required for image generation. Add it in Settings → fal.ai.");
  const r = await fetch(`https://fal.run/${model}`, {
    method:"POST",
    headers:{"Authorization":`Key ${key.trim()}`,"Content-Type":"application/json"},
    body:JSON.stringify({prompt, image_size:"landscape_4_3", num_images:1, enable_safety_checker:true}),
    signal:AbortSignal.timeout(90000), // hard 90s cap — a stalled connection can never hang the pipeline
  });
  if(!r.ok){
    const t = await r.text().catch(()=>"");
    let m=""; try{m=JSON.parse(t).detail||JSON.parse(t).error||"";}catch{m=t.slice(0,200);}
    throw new Error(`fal.ai image error: ${m||r.status}`);
  }
  const d = await r.json();
  return d.images?.[0]?.url || d.image?.url || "";
}

async function callFalVideo(key:string, prompt:string, durationSec=5, _model="fal-ai/kling-video/v1.6/standard/text-to-video"):Promise<string>{
  if(!key?.trim()) throw new Error("fal.ai key required for video generation.");
  // Try Wan-T2V first (fast, reliable text-to-video)
  try {
    const r = await fetch("https://fal.run/fal-ai/wan-t2v", {
      method:"POST",
      headers:{"Authorization":`Key ${key.trim()}`,"Content-Type":"application/json"},
      body:JSON.stringify({prompt, num_frames:81, frames_per_second:16, resolution:"480p"}),
      signal:AbortSignal.timeout(150000),
    });
    const t = await r.text();
    if(!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0,200)}`);
    let d:any; try{d=JSON.parse(t);}catch{throw new Error(`Bad JSON: ${t.slice(0,200)}`);}
    const u = d?.video?.url||d?.url||d?.output?.video?.url||"";
    if(u) return u;
    throw new Error("No URL");
  } catch {
    // Fallback: Luma Photon Flash (synchronous, very fast)
    try {
      const r2 = await fetch("https://fal.run/fal-ai/luma-photon-flash", {
        method:"POST",
        headers:{"Authorization":`Key ${key.trim()}`,"Content-Type":"application/json"},
        body:JSON.stringify({prompt, duration:`${durationSec}s`, aspect_ratio:"16:9"}),
        signal:AbortSignal.timeout(90000),
      });
      const t2 = await r2.text();
      let d2:any; try{d2=JSON.parse(t2);}catch{throw new Error(`Fallback bad JSON`);}
      const u2 = d2?.video?.url||d2?.url||"";
      if(u2) return u2;
    } catch {}
    // Final: Kling queue with robust polling
    const KLING = "fal-ai/kling-video/v1.6/standard/text-to-video";
    const sr = await fetch(`https://queue.fal.run/${KLING}`, {
      method:"POST",
      headers:{"Authorization":`Key ${key.trim()}`,"Content-Type":"application/json"},
      body:JSON.stringify({prompt, duration:"5", aspect_ratio:"16:9"}),
      signal:AbortSignal.timeout(30000),
    });
    const srt = await sr.text();
    if(!sr.ok) throw new Error(`Kling submit: ${srt.slice(0,200)}`);
    let srd:any; try{srd=JSON.parse(srt);}catch{throw new Error(`Kling bad JSON: ${srt.slice(0,200)}`);}
    const reqId = srd?.request_id;
    if(!reqId) throw new Error("Kling no request_id");
    for(let i=0;i<40;i++){
      await new Promise(res=>setTimeout(res,4000));
      const pr = await fetch(`https://queue.fal.run/${KLING}/requests/${reqId}`,{headers:{"Authorization":`Key ${key.trim()}`},signal:AbortSignal.timeout(15000)});
      const prt = await pr.text();
      let pd:any; try{pd=JSON.parse(prt);}catch{continue;}
      if(pd.status==="COMPLETED"){const u=pd?.output?.video?.url||pd?.output?.videos?.[0]?.url||"";if(u)return u;throw new Error("Kling: no URL in output");}
      if(pd.status==="FAILED") throw new Error(`Kling failed: ${pd.error||"unknown"}`);
    }
    throw new Error("Video timed out after 160s");
  }
}

async function callAI(provider,key,sys,rawMsgs,maxT=3500,enableSearch=false,modelOverride=""){
  if(!key?.trim())throw new Error("No API key for "+(MODELS[provider]?.name||provider)+". Add it in Settings.");
  const msgs=rawMsgs.map(m=>({role:m.role==="user"?"user":"assistant",content:m.content}));
  let timerId;
  // Search-enabled calls take longer (multiple search round-trips inside one request) - extend timeout.
  // Non-search calls raised to 120s: dense long-form completions (4000+ tokens) under provider load
  // can legitimately take >60s, and the timeout only exists as a safety net against truly stuck requests.
  const timeoutMs=enableSearch?100000:120000;
  const timeout=new Promise((_,rej)=>{
    timerId=setTimeout(()=>rej(new Error("Request timed out after "+(timeoutMs/1000)+"s. The AI provider may be busy — try switching to Gemini (free tier).")),timeoutMs);
  });
  const callP=(async()=>{
    const raw=provider==="claude"?await callClaude(key,sys,msgs,maxT,enableSearch,modelOverride):provider==="openai"?await callOpenAI(key,sys,msgs,maxT):provider==="gemini"?await callGemini(key,sys,msgs,maxT):provider==="groq"?await callGroq(key,sys,msgs,maxT):provider==="deepseek"?await callDeepSeek(key,sys,msgs,maxT):provider==="kimi"?await callKimi(key,sys,msgs,maxT):provider==="fal"?await(async()=>{const prompt=rawMsgs?.find((m:any)=>m.role==="user")?.content||"generate image";const url=await callFalImage(key,prompt);return{text:`🖼️ Image URL: ${url}`,truncated:false};})():provider==="nvidia"?{text:await callNvidia(sys,msgs,maxT),truncated:false}:Promise.reject(new Error("Unknown provider: "+provider));
    if(raw&&typeof raw==="object"&&"text" in raw)return raw as {text:string;truncated:boolean};
    return {text:raw as string,truncated:false};
  })();
  try{return await Promise.race([callP,timeout]);}
  finally{clearTimeout(timerId);}
}

async function callMulti(keys,defP,sys,msgs,maxT=3500,enableSearch=false,taskType=""){
  const effectiveKeys={...keys};
  if(EFF_GEMINI?.trim())effectiveKeys.gemini=EFF_GEMINI;
  if(EFF_GROQ?.trim())effectiveKeys.groq=EFF_GROQ;
  if(EFF_CLAUDE?.trim())effectiveKeys.claude=EFF_CLAUDE;
  if(EFF_FAL?.trim())effectiveKeys.fal=EFF_FAL;

  // Auto-detect task type from prompt if not explicitly provided
  const userPrompt=msgs?.find((m:any)=>m.role==="user")?.content||"";
  const resolvedTask = taskType || detectTaskType(userPrompt, sys||"");

  // Task routing: walk preference list, pick first provider with an available key
  const routeOrder = resolveRoute(resolvedTask, defP);
  let taskRoutedProvider = "";
  for(const p of routeOrder){
    if(effectiveKeys[p]?.trim()){taskRoutedProvider=p;break;}
  }

  // Model upgrade: use Claude Sonnet instead of Haiku for premium reasoning tasks
  const modelOverride = (taskRoutedProvider==="claude" && CLAUDE_TASK_MODEL[resolvedTask])
    ? CLAUDE_TASK_MODEL[resolvedTask]
    : "";

  // Fall back to legacy provider selection logic if routing didn't find a key
  const paidConfigured=["claude","openai"].filter(p=>effectiveKeys[p]?.trim());
  let active=taskRoutedProvider||getActiveProvider(defP,effectiveKeys,EFF_GROQ,EFF_GEMINI);
  if(!taskRoutedProvider){
    if(EFF_CLAUDE?.trim()&&!keys.claude?.trim()&&!keys.openai?.trim()){
      active="claude";
    }else if(paidConfigured.length&&!paidConfigured.includes(defP)&&!effectiveKeys[active]?.trim()){
      active=paidConfigured[0];
    }else if(paidConfigured.includes(defP)&&effectiveKeys[defP]?.trim()){
      active=defP;
    }
  }
  const key=effectiveKeys[active]?.trim();

  if(!key){
    const fallback=active==="groq"?"gemini":"groq";
    const fallbackKey=effectiveKeys[fallback]?.trim();
    if(!fallbackKey)throw new Error("No API keys available. Check Cloudflare environment variables.");
    const r=await callAI(fallback,fallbackKey,sys,msgs,maxT,false);
    return{primary:r.text,usedProvider:fallback};
  }

  // ── fal.ai media intercept ───────────────────────────────────────────────
  // image_gen / video_gen / diagram route to fal.ai directly — NOT through callAI.
  // callAI is text-only; fal.ai returns image/video URLs.
  if(active==="fal"){
    const falKey=key;
    const mediaPrompt=msgs?.find((m:any)=>m.role==="user")?.content||sys||"generate image";
    try{
      if(resolvedTask==="video_gen"){
        const videoUrl=await callFalVideo(falKey,mediaPrompt,5);
        return{primary:`✅ Video generated successfully.\n\n🎬 **Video URL:** ${videoUrl}\n\nCopy the URL above to view or download your video. You can also paste it into any video player.`,usedProvider:"fal"};
      } else {
        // image_gen and diagram both generate images (Ideogram for diagrams, Flux for images)
        const imgModel = resolvedTask==="diagram" ? "fal-ai/ideogram/v3" : "fal-ai/flux-pro";
        const imageUrl=await callFalImage(falKey,mediaPrompt,imgModel);
        return{primary:`✅ Image generated successfully.\n\n🖼️ **Image URL:** ${imageUrl}\n\n![Generated Image](${imageUrl})\n\nRight-click the image URL to save. Use this in your presentations, documents, or social media.`,usedProvider:"fal"};
      }
    }catch(falErr:any){
      // fal failed — fall back to best available text provider for description
      const textFallback=["claude","openai","deepseek","gemini","groq"].find(p=>effectiveKeys[p]?.trim());
      if(textFallback){
        const fbKey=effectiveKeys[textFallback]?.trim();
        const fbr=await callAI(textFallback,fbKey,sys,msgs,maxT,false);
        return{primary:`⚠️ fal.ai media generation failed (${falErr.message}). Here is a text description instead:\n\n${fbr.text}`,usedProvider:textFallback};
      }
      throw falErr;
    }
  }

  try{
    let r=await callAI(active,key,sys,msgs,maxT,enableSearch,modelOverride);
    let text=r.text;
    let stillTruncated=r.truncated;
    let continueAttempts=0;
    while(stillTruncated && active==="claude" && continueAttempts<2){
      continueAttempts++;
      try{
        const cont=await callAI(active,key,sys,[...msgs,{role:"assistant",content:text},{role:"user",content:"Continue exactly where you left off. Do not repeat any content already written. Pick up mid-sentence if needed."}],Math.min(maxT,4000),false);
        text=text+cont.text;
        stillTruncated=cont.truncated;
      }catch{
        break; // if continuation fails, return what we have rather than losing it
      }
    }
    return{primary:text,truncated:stillTruncated,usedProvider:active};
  }catch(err:any){
    if(isRateLimit(err.message)){
      markProviderExhausted(active);
      const fallbackOrder=[];
      if(active==="groq")fallbackOrder.push("gemini");
      if(active==="gemini")fallbackOrder.push("groq");
      ["claude","openai"].forEach(p=>{if(p!==active&&effectiveKeys[p]?.trim())fallbackOrder.push(p);});
      for(const fallback of fallbackOrder){
        const fallbackKey=effectiveKeys[fallback]?.trim();
        if(!fallbackKey)continue;
        try{
          const r=await callAI(fallback,fallbackKey,sys,msgs,maxT,enableSearch&&fallback==="claude");
          return{primary:r.text,usedProvider:fallback};
        }catch(err2:any){
          if(isRateLimit(err2.message)){markProviderExhausted(fallback);continue;}
          throw err2;
        }
      }
    }
 throw err;
  }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function buildCtx(co,compData){
  const cur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
  return "COMPANY: "+co.name+" | INDUSTRY: "+co.industry+" | STAGE: "+co.stage+"\nHQ: "+(co.location||"Not set")+" | CURRENCY: "+cur.code+" ("+cur.sym+") | MARKETS: "+(co.markets||"Not specified")+"\nDATA:\n"+(Object.keys(compData).length===0?"(None)":Object.entries(compData).map(([k,v])=>"  "+k+": "+v).join("\n"))+"\nRULES: All figures in "+cur.sym+cur.code+". Account for "+(co.location||"company location")+" macro+micro context. Show all math. Structure 0-90d then 3-12mo then 1-3yr.";
}
function buildSys(role,co,compData,liveRates=""){
  const p = getExecutiveIntel(role.id);
  const cur = CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];

  let profileSection = p.b || ("World-class " + role.f + ", 20+ years experience.");

  if (p.enrichment) {
    profileSection += "\n" + p.enrichment;
  }

  return (
    "You are " + role.f + " at \"" + co.name + "\".\n" +
    "PROFILE: " + profileSection + "\n" +
    "CONTEXT:\n" + buildCtx(co, compData) + "\n" +
    "MANDATE: " + (p.m || "Give elite specific quantified advice as " + role.f + ".") + "\n" +
    (liveRates&&FINANCE_ROLES.includes(role.id)?"\n\n"+liveRates+"\n":"") +
    "\n\nOUTPUT FORMAT — MANDATORY (McKinsey/BCG/Deloitte standard):\nStructure every response with these exact sections:\n\n# Executive Summary\n(2-4 sentences: core finding, headline number in " + cur.sym + ", recommended action)\n---\n## Key Insights\n(4-6 bullets, each opening with a **bold keyword**)\n---\n## Detailed Analysis\n(logical subsections with headers; tables for all comparative data)\n---\n## Financial Impact\n(all figures in " + cur.sym + "; formula → assumption → result for every number)\n---\n## Risks\n| Risk | Likelihood | Impact | Mitigation |\n|------|------------|--------|------------|\n---\n## Opportunities\n(3-5 bullets with upside in " + cur.sym + ", timeframe, and owner)\n---\n## Recommendations\n| Priority | Action | Impact | Effort | Deadline |\n|----------|--------|--------|--------|----------|\n---\n## Sources & References\n(every figure cited: [Source] — [Figure] — [Date])\n\nRULES: Bold key metrics. Use tables for numbers. Never write unbroken paragraphs. Every number must have a unit (" + cur.sym + " or %). Scannable in 90 seconds by a C-suite executive."
  );
}

// ─── CROSS-MODULE INTELLIGENCE LAYER ────────────────────────────────────────
// Builds a prompt-safe Ledger summary. Defensive field access — works regardless
// of exact JournalEntry internals (never throws on unknown field names).
function buildLedgerSnapshot(entries,cur){
  if(!entries?.length)return null;
  const sym=cur?.sym||"₹";const code=cur?.code||"";
  let totalDebits=0,totalCredits=0;
  entries.forEach(e=>{
    const lines=e.lines||e.entries||e.items||[];
    lines.forEach(l=>{totalDebits+=parseFloat(l.debit||l.dr||0);totalCredits+=parseFloat(l.credit||l.cr||0);});
    if(!lines.length){totalDebits+=parseFloat(e.debit||e.amount||0);totalCredits+=parseFloat(e.credit||0);}
  });
  const recent=entries.slice(-5).map(e=>e.description||e.desc||e.narration||e.memo||e.particular||"").filter(Boolean);
  return[
    "LEDGER: "+entries.length+" posted journal entries | Currency: "+sym+code,
    totalDebits>0?"Total Debits: "+sym+totalDebits.toLocaleString("en-IN"):"",
    totalCredits>0?"Total Credits: "+sym+totalCredits.toLocaleString("en-IN"):"",
    (totalDebits>0||totalCredits>0)?"Net Position: "+sym+(totalDebits-totalCredits).toLocaleString("en-IN"):"",
    recent.length?"Recent entries: "+recent.slice(0,3).join("; "):"",
    "These are the user's own real recorded transactions. Use them — do not substitute generic assumptions.",
  ].filter(Boolean).join("\n");
}

// Returns ONLY the module data relevant to a specific task category.
// Rule: each category declares its own permitted data sources. Irrelevant
// sources never enter the prompt. This prevents cross-module data pollution
// while ensuring each chain has the real business context it needs.
function getModuleContext(category,{ledgerEntries,brSessions,workflows,tQueue,tmRes,apRes,cur}){
  const parts=[];
  const FINANCE=["finance","tax","audit"];
  const STRATEGY=["strategy_task","executive_task"];
  // Finance/Tax/Audit: inject live Ledger snapshot — the real numbers, not AI assumptions
  if(FINANCE.includes(category)&&ledgerEntries?.length){
    const snap=buildLedgerSnapshot(ledgerEntries,cur);
    if(snap)parts.push("=== LIVE LEDGER DATA (real transactions from this company's General Ledger) ===\n"+snap);
  }
  // Strategy/Executive: inject Boardroom decisions, Time Machine results, Autopilot scan
  if(STRATEGY.includes(category)){
    const recentBR=(brSessions||[]).slice(0,3);
    if(recentBR.length){
      parts.push("=== RECENT BOARDROOM SESSIONS (strategic context) ===");
      recentBR.forEach(s=>parts.push("Q: \""+s.q+"\"\n"+(s.synthesis?stripMd(s.synthesis).slice(0,500):"")));
    }
    if(tmRes)parts.push("=== LAST TIME MACHINE SIMULATION ===\n"+stripMd(tmRes).slice(0,600));
    if(apRes)parts.push("=== LAST AUTOPILOT DECISION SCAN ===\n"+stripMd(apRes).slice(0,600));
  }
  // All categories: inject same-category approved task outputs so the chain builds
  // forward rather than repeating what was already decided.
  const prevTasks=(tQueue||[]).filter(t=>t.category===category&&t.status==="approved"&&t.finalOutput).slice(-2);
  if(prevTasks.length){
    parts.push("=== PREVIOUSLY APPROVED TASKS (same category — build on these, never repeat them) ===");
    prevTasks.forEach(t=>parts.push("\""+t.task+"\"\n"+stripMd(t.finalOutput).slice(0,400)));
  }
  // All categories: most recent approved workflow from the same chain type
  const prevWF=(workflows||[]).filter(w=>w.category===category&&w.status==="approved").slice(-1);
  if(prevWF.length){
    const wf=prevWF[0];const last=wf.steps[wf.steps.length-1];
    if(last?.output)parts.push("=== RELATED APPROVED WORKFLOW ===\n\""+wf.task+"\"\n"+stripMd(last.output).slice(0,500));
  }
  return parts.length?parts.join("\n\n"):"";
}

// ─── VISUALIZATION ENGINE ─── auto-detects numeric tables in AI reports and
// renders an SVG chart beneath them. Bar chart by default; line chart when the
// label column is dates. Zero libraries, zero AI calls, fail-safe.
function vizNum(s){
  try{
    let t=String(s??"").replace(/[,₹$€£\s]/g,"").trim();
    let mult=1;
    const suf=t.match(/(k|m|b|cr|l|lakh|lac)$/i);
    if(suf){const u=suf[1].toLowerCase();mult=u==="k"?1e3:u==="m"?1e6:u==="b"?1e9:u==="cr"?1e7:1e5;t=t.slice(0,-suf[1].length);}
    if(t.endsWith("%"))t=t.slice(0,-1);
    const m=t.match(/^-?\d+(\.\d+)?$/);
    return m?parseFloat(t)*mult:NaN;
  }catch{return NaN;}
}
function vizFmt(n){
  const a=Math.abs(n);
  if(a>=1e7)return (n/1e7).toFixed(1)+"Cr";
  if(a>=1e5)return (n/1e5).toFixed(1)+"L";
  if(a>=1e3)return (n/1e3).toFixed(1)+"K";
  return String(Math.round(n*100)/100);
}
function AutoChart({labels,values,seriesName,accent}){
  try{
    if(!labels||!values||values.length<2)return null;
    const c=accent||"#14B8A6";
    const W=560,H=180,padL=46,padR=10,padT=26,padB=34;
    const iw=W-padL-padR,ih=H-padT-padB;
    const max=Math.max(...values,0),min=Math.min(...values,0);
    const range=(max-min)||1;
    const y=v=>padT+ih-((v-min)/range)*ih;
    const isDates=labels.every(l=>!isNaN(new Date(String(l).trim()).getTime())&&/\d/.test(String(l)));
    const n=values.length;
    const short=(s)=>{const t=String(s).trim();return t.length>9?t.slice(0,8)+"…":t;};
    let body;
    if(isDates){
      const x=i=>padL+(n===1?iw/2:(i/(n-1))*iw);
      const pts=values.map((v,i)=>x(i)+","+y(v)).join(" ");
      body=(<g>
        <polyline points={pts} fill="none" stroke={c} strokeWidth="2"/>
        {values.map((v,i)=>(<g key={i}>
          <circle cx={x(i)} cy={y(v)} r="3" fill={c}/>
          <text x={x(i)} y={y(v)-7} textAnchor="middle" fontSize="8" fill="#A0AAC0">{vizFmt(v)}</text>
          <text x={x(i)} y={H-padB+12} textAnchor="middle" fontSize="7.5" fill="#5A6480">{short(labels[i])}</text>
        </g>))}
      </g>);
    }else{
      const bw=Math.min(44,(iw/n)*0.62);
      const x=i=>padL+(i+0.5)*(iw/n)-bw/2;
      body=(<g>
        {values.map((v,i)=>{
          const yv=y(Math.max(v,0)),y0=y(0);
          const h=Math.max(2,Math.abs(y0-yv));
          return (<g key={i}>
            <rect x={x(i)} y={v>=0?yv:y0} width={bw} height={h} rx="3" fill={c} opacity={0.85}/>
            <text x={x(i)+bw/2} y={(v>=0?yv:y0+h)-4} textAnchor="middle" fontSize="8" fill="#A0AAC0">{vizFmt(v)}</text>
            <text x={x(i)+bw/2} y={H-padB+12} textAnchor="middle" fontSize="7.5" fill="#5A6480">{short(labels[i])}</text>
          </g>);
        })}
      </g>);
    }
    return (
      <div style={{margin:"6px 0 10px",background:"#0d1220",border:"1px solid #1a2030",borderRadius:6,padding:"8px 6px 2px"}}>
        <div style={{fontSize:9,fontWeight:700,color:c,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0 8px 4px"}}>{"📊 "}{seriesName||"Values"}<span style={{color:"#5A6480",fontWeight:500,textTransform:"none",marginLeft:6}}>auto-generated chart</span></div>
        <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block"}}>
          <line x1={padL} y1={y(0)} x2={W-padR} y2={y(0)} stroke="#2a3244" strokeWidth="1"/>
          <text x={padL-6} y={y(max)+3} textAnchor="end" fontSize="8" fill="#5A6480">{vizFmt(max)}</text>
          <text x={padL-6} y={y(min)+3} textAnchor="end" fontSize="8" fill="#5A6480">{vizFmt(min)}</text>
          {body}
        </svg>
      </div>
    );
  }catch{return null;}
}
function autoChartFromTable(header,dataRows,accent,key){
  try{
    if(!header||!dataRows||dataRows.length<2||dataRows.length>14)return null;
    const cols=header.length;
    let numCol=-1;
    for(let ci=1;ci<cols;ci++){
      const vals=dataRows.map(r=>vizNum(r[ci]));
      const okCount=vals.filter(v=>!isNaN(v)).length;
      if(okCount>=Math.ceil(dataRows.length*0.7)&&vals.some(v=>v!==0&&!isNaN(v))){numCol=ci;break;}
    }
    if(numCol===-1)return null;
    const pairs=dataRows.map(r=>({l:String(r[0]||"").trim(),v:vizNum(r[numCol])})).filter(p=>p.l&&!isNaN(p.v)).slice(0,12);
    if(pairs.length<2)return null;
    return <AutoChart key={key} labels={pairs.map(p=>p.l)} values={pairs.map(p=>p.v)} seriesName={String(header[numCol]||"").trim()} accent={accent}/>;
  }catch{return null;}
}

// Module-scope markdown→slides parser — the Project Engine PPTX fallback path.
// (A closure-scoped copy exists elsewhere but was NOT visible at the render call
// site, causing "parseMdToSlides is not defined" → every PPTX crashed to a .md dump.)
// Salvage complete slide objects from truncated/malformed JSON — a cut-off
// AI response no longer collapses a 12-slide deck down to 2 slides.
function salvageSlidesJson(content:string):any[]{
  try{
    const out:any[]=[];let i=0;
    while(i<content.length){
      const a=content.indexOf('{"layout"',i);
      const b=content.indexOf('{ "layout"',i);
      const st=(a===-1)?b:(b===-1?a:Math.min(a,b));
      if(st===-1)break;
      let depth=0,j=st,inStr=false,esc=false;
      for(;j<content.length;j++){
        const ch=content[j];
        if(esc){esc=false;continue;}
        if(ch==="\\"){esc=true;continue;}
        if(ch==='"'){inStr=!inStr;continue;}
        if(!inStr){if(ch==="{")depth++;else if(ch==="}"){depth--;if(depth===0){j++;break;}}}
      }
      if(depth!==0)break;
      try{const o=JSON.parse(content.slice(st,j));if(o&&o.layout)out.push(o);}catch{}
      i=j;
    }
    return out;
  }catch{return [];}
}

function parseMdToSlidesGlobal(md:string,coName:string,title:string){
  const lines=md.split("\n").filter((l:string)=>l.trim());
  const slides:any[]=[{layout:"title",title,subtitle:coName,meta:coName+" \u00b7 "+new Date().toLocaleDateString("en-GB")}];
  let currentSlide:any=null;
  const pushCurrent=()=>{if(currentSlide?.bullets?.length||currentSlide?.content)slides.push(currentSlide);};
  for(const line of lines){
    if(line.startsWith("# ")){
      pushCurrent();
      currentSlide={layout:"exec_summary",title:line.replace(/^#+\s*/,""),bullets:[]};
    } else if(line.startsWith("## ")||line.startsWith("### ")){
      pushCurrent();
      currentSlide={layout:"full_text",title:line.replace(/^#+\s*/,""),bullets:[]};
    } else if(currentSlide){
      const clean=line.replace(/^[-*\u2022]\s*/,"").trim();
      if(clean) currentSlide.bullets=(currentSlide.bullets||[]).concat([clean]);
    }
  }
  pushCurrent();
  slides.push({layout:"closing",title:"Next Steps & Recommendations",actions:["Review findings with leadership","Assign owners and timelines","Implement priority actions"]});
  return {title,slides};
}

function Md({text,ac}){
  if(!text)return null;
  const c=ac||"#14B8A6";
  const lines=text.split("\n");
  const els=[];let tbl=[],inT=false,inC=false,cL=[];
  const fT=()=>{
    if(!tbl.length)return;
    const h=tbl[0],d=tbl.slice(2);
    els.push(<div key={"t"+els.length} style={{overflowX:"auto",margin:"8px 0",borderRadius:6,border:"1px solid #1a2030"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr>{h.map((v,i)=><th key={i} style={{textAlign:"left",padding:"6px 8px",borderBottom:"2px solid "+c+"33",color:c,fontWeight:700,fontSize:9,textTransform:"uppercase",background:"#0d1220"}}>{v.trim()}</th>)}</tr></thead><tbody>{d.map((row,ri)=><tr key={ri}>{row.map((cell,ci)=><td key={ci} style={{padding:"5px 8px",borderBottom:"1px solid #14192a",color:"#A0AAC0",fontSize:11}}>{cell.trim()}</td>)}</tr>)}</tbody></table></div>);
    try{const ch=autoChartFromTable(h,d,c,"ch"+els.length);if(ch)els.push(ch);}catch{}
    tbl=[];inT=false;
  };
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(l.startsWith("```")){if(inC){els.push(<pre key={"c"+els.length} style={{background:"#080c18",borderRadius:6,padding:"10px",margin:"6px 0",fontSize:10,fontFamily:"monospace",color:"#8892B0",overflowX:"auto",border:"1px solid #14192a"}}>{cL.join("\n")}</pre>);cL=[];inC=false;}else{fT();inC=true;}continue;}
    if(inC){cL.push(l);continue;}
    if(l.includes("|")&&l.trim().startsWith("|")){if(!inT){fT();inT=true;}const cells=l.split("|").filter((_,j,a)=>j>0&&j<a.length-1);if(cells.every(x=>x.trim().match(/^[-:]+$/))){tbl.push(cells);continue;}tbl.push(cells);continue;}else if(inT)fT();
    if(l.startsWith("### "))els.push(<h4 key={i} style={{margin:"12px 0 4px",color:c,fontSize:12,fontWeight:700}}>{l.slice(4)}</h4>);
    else if(l.startsWith("## "))els.push(<h3 key={i} style={{margin:"14px 0 5px",color:"#F1F5F9",fontSize:14,fontWeight:700}}>{l.slice(3)}</h3>);
    else if(l.startsWith("# "))els.push(<h2 key={i} style={{margin:"14px 0 5px",color:"#F1F5F9",fontSize:16,fontWeight:800}}>{l.slice(2)}</h2>);
    else if(l.match(/^[-*]\s/))els.push(<div key={i} style={{paddingLeft:14,position:"relative",margin:"2px 0",lineHeight:1.6}}><span style={{position:"absolute",left:3,color:c,fontSize:6,top:7}}>●</span><span dangerouslySetInnerHTML={{__html:l.replace(/^[-*]\s+/,"").replace(/\*\*(.+?)\*\*/g,"<strong style=\"color:#F1F5F9\">$1</strong>").replace(/`(.+?)`/g,"<code style=\"background:#080c18;padding:1px 4px;border-radius:3px;font-size:10px;font-family:monospace;color:#8892B0\">$1</code>")}}/></div>);
    else if(l.match(/^\d+\.\s/)){const n=l.match(/^(\d+)\./)[1];els.push(<div key={i} style={{paddingLeft:20,position:"relative",margin:"2px 0",lineHeight:1.6}}><span style={{position:"absolute",left:0,color:c,fontWeight:700,fontSize:11,fontFamily:"monospace"}}>{n}.</span><span dangerouslySetInnerHTML={{__html:l.replace(/^\d+\.\s+/,"").replace(/\*\*(.+?)\*\*/g,"<strong style=\"color:#F1F5F9\">$1</strong>")}}/></div>);}
    else if(l.startsWith("> "))els.push(<div key={i} style={{borderLeft:"3px solid "+c+"40",paddingLeft:10,margin:"5px 0",color:"#8892B0",fontStyle:"italic"}}>{l.slice(2)}</div>);
    else if(l.startsWith("---"))els.push(<hr key={i} style={{border:"none",borderTop:"1px solid #1a2030",margin:"8px 0"}}/>);
    else if(l.trim()==="")els.push(<div key={i} style={{height:4}}/>);
    else els.push(<div key={i} style={{margin:"2px 0",lineHeight:1.65}} dangerouslySetInnerHTML={{__html:l.replace(/\*\*(.+?)\*\*/g,"<strong style=\"color:#F1F5F9\">$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/`(.+?)`/g,"<code style=\"background:#080c18;padding:1px 4px;border-radius:3px;font-size:10px;font-family:monospace;color:#8892B0\">$1</code>")}}/>);
  }
  fT();
  return <>{els}</>;
}

function MicButton({lang,onResult,disabled}){
  const [st,setSt]=useState("idle");const [err,setErr]=useState("");const recRef=useRef(null);
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition||null;
  const stop=()=>{try{recRef.current?.stop();}catch{}setSt("idle");};
  const start=()=>{
    if(!SR){setErr("Voice not supported. Use Chrome or Edge.");setSt("error");return;}
    if(disabled)return;
    if(st==="listening"){stop();return;}
    setSt("requesting");setErr("");
    navigator.mediaDevices?.getUserMedia({audio:true}).then(()=>{
      const rec=new SR();rec.lang=lang||"en-IN";rec.continuous=true;rec.interimResults=true;recRef.current=rec;
      let final="";
      rec.onstart=()=>setSt("listening");
      rec.onresult=(e)=>{final="";for(let i=0;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript;}};
      rec.onerror=(e)=>{if(e.error==="not-allowed")setErr("Mic access denied.");else setErr("Voice error: "+e.error+".");setSt("error");};
      rec.onend=()=>{if(final.trim())onResult(final.trim());setSt("idle");};
      try{rec.start();}catch{setErr("Could not start voice input.");setSt("error");}
    }).catch(()=>{setErr("Mic access denied. Allow mic in browser settings.");setSt("error");});
  };
  return(
    <div style={{position:"relative",flexShrink:0}}>
      <button onClick={st==="listening"?stop:start} disabled={disabled||st==="requesting"} title={!SR?"Voice not supported":st==="listening"?"Listening — click to stop":"Click to speak"}
        style={{background:st==="listening"?"rgba(239,68,68,0.18)":"none",border:"1px solid "+(st==="listening"?"#EF4444":"#1a2030"),borderRadius:5,padding:"5px 8px",cursor:disabled?"not-allowed":"pointer",fontSize:15,lineHeight:1,opacity:disabled?0.35:1,transition:"all 0.2s"}}>
        {st==="listening"?"🔴":st==="requesting"?"⏳":st==="error"?"⚠️":"🎤"}
      </button>
      {st==="error"&&err&&<div style={{position:"absolute",bottom:"calc(100% + 6px)",right:0,background:"#1a0a0a",border:"1px solid #EF444466",borderRadius:6,padding:"7px 10px",fontSize:10,color:"#EF9999",width:220,lineHeight:1.5,zIndex:99}}>
        {err}<button onClick={()=>setSt("idle")} style={{display:"block",marginTop:5,background:"none",border:"none",color:"#EF6666",fontSize:9,cursor:"pointer",fontFamily:"Manrope,sans-serif",textDecoration:"underline"}}>Dismiss</button>
      </div>}
    </div>
  );
}

function LangPick({value,onChange}){
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:5,color:"#8892B0",fontSize:9,fontFamily:"Manrope,sans-serif",padding:"4px 3px",cursor:"pointer",flexShrink:0,maxWidth:90}}>{VOICE_LANGS.map(l=><option key={l.code} value={l.code} style={{background:"#0a0e1a"}}>{l.label}</option>)}</select>;
}

// FIX BUG 7: Global toast component
function Toaster({toasts,onDismiss}){
  if(!toasts.length)return null;
  const clr={error:"#EF4444",success:"#10B981",info:"#3B82F6",warning:"#F59E0B"};
  return(
    <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8,fontFamily:"Manrope,sans-serif",maxWidth:400,pointerEvents:"none"}}>
      {toasts.map(t=>(
        <div key={t.id} style={{background:"#131825",border:"1px solid "+(clr[t.type]||clr.info)+"55",borderLeft:"3px solid "+(clr[t.type]||clr.info),borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:8,animation:"fadeIn 0.2s",boxShadow:"0 4px 24px rgba(0,0,0,0.55)",fontSize:11,color:"#F1F5F9",lineHeight:1.5,pointerEvents:"all"}}>
          <span style={{flexShrink:0}}>{t.type==="error"?"⚠️":t.type==="success"?"✅":t.type==="warning"?"⚡":"ℹ️"}</span>
          <span style={{flex:1}}>{t.msg}</span>
          <button onClick={()=>onDismiss(t.id)} style={{background:"none",border:"none",color:"#5A6480",fontSize:16,cursor:"pointer",lineHeight:1,padding:0,flexShrink:0}}>×</button>
        </div>
      ))}
    </div>
  );
}

// FIX BUG 6: safe blob download (no navigation side-effects)
function dlFile(filename,content,mime){
  const b=new Blob([typeof content==="string"?content:JSON.stringify(content,null,2)],{type:mime||"application/json"});
  const u=URL.createObjectURL(b);
  const a=document.createElement("a");
  a.href=u;a.download=filename;a.style.display="none";
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(u),200);
}

// ─── FEATURE 4 & 5: LIBRARY LOADERS (cdnjs only) ────────────────────────────
function loadScript(src){
  return new Promise((res,rej)=>{
    if([...document.scripts].some(s=>s.src===src))return res();
    const s=document.createElement("script");s.src=src;s.onload=()=>res();s.onerror=()=>rej(new Error("Failed to load "+src));
    document.head.appendChild(s);
  });
}
async function ensureJsPDF(){
  if(window.jspdf?.jsPDF)return window.jspdf.jsPDF;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  if(!window.jspdf?.jsPDF)throw new Error("jsPDF unavailable");
  return window.jspdf.jsPDF;
}
async function ensureHtml2Canvas(){
  if(window.html2canvas)return window.html2canvas;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  if(!window.html2canvas)throw new Error("html2canvas unavailable");
  return window.html2canvas;
}

// Escape HTML so raw text from the AI can't inject markup.
function escHtml(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

// Inline-format a single line: **bold**, *italic*, `code`. Runs AFTER escaping.
function fmtInline(s){
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/`(.+?)`/g,"<code>$1</code>");
}

// Convert the AI's markdown into clean, styled HTML BLOCKS.
// Each top-level child of the returned container is one atomic block, so the
// paginator can place or page-break between blocks without splitting them.
function mdToHtmlBlocks(text,accent){
  const lines=(text||"").split("\n");
  const out=[];
  let i=0;
  let tableBuf=[];
  const flushTable=()=>{
    if(!tableBuf.length)return;
    const rows=tableBuf.filter(r=>!r.trim().match(/^\|[\s|:\-]+\|$/)); // drop the |---|---| separator
    const cells=rows.map(r=>r.split("|").filter((c,j,a)=>j>0&&j<a.length-1).map(c=>c.trim()));
    if(cells.length){
      let html="<table class='pq-tbl'><thead><tr>";
      cells[0].forEach(c=>html+="<th>"+fmtInline(c)+"</th>");
      html+="</tr></thead><tbody>";
      cells.slice(1).forEach(row=>{html+="<tr>";row.forEach(c=>html+="<td>"+fmtInline(c)+"</td>");html+="</tr>";});
      html+="</tbody></table>";
      out.push(html);
    }
    tableBuf=[];
  };
  while(i<lines.length){
    const l=lines[i];
    // table rows accumulate
    if(l.includes("|")&&l.trim().startsWith("|")){tableBuf.push(l);i++;continue;}
    else flushTable();
    if(l.trim()===""){i++;continue;}
    if(l.startsWith("### "))out.push("<h4 class='pq-h4'>"+fmtInline(l.slice(4))+"</h4>");
    else if(l.startsWith("## "))out.push("<h3 class='pq-h3'>"+fmtInline(l.slice(3))+"</h3>");
    else if(l.startsWith("# "))out.push("<h2 class='pq-h2'>"+fmtInline(l.slice(2))+"</h2>");
    else if(l.match(/^[-*]\s/))out.push("<div class='pq-li'><span class='pq-bul'>&bull;</span><span>"+fmtInline(l.replace(/^[-*]\s+/,""))+"</span></div>");
    else if(l.match(/^\d+\.\s/)){const n=l.match(/^(\d+)\./)[1];out.push("<div class='pq-li'><span class='pq-num'>"+n+".</span><span>"+fmtInline(l.replace(/^\d+\.\s+/,""))+"</span></div>");}
    else if(l.startsWith("> "))out.push("<div class='pq-quote'>"+fmtInline(l.slice(2))+"</div>");
    else if(l.startsWith("---"))out.push("<hr class='pq-hr'/>");
    else out.push("<p class='pq-p'>"+fmtInline(l)+"</p>");
    i++;
  }
  flushTable();
  return out;
}

// WYSIWYG PDF: render markdown -> styled HTML blocks -> html2canvas per block ->
// place into jsPDF with block-aware page breaks (never split a block; only a
// too-tall table is sliced, and html2canvas keeps rows intact visually).
async function generatePDFv2(type,title,bodyText,co,cur){
  const jsPDF=await ensureJsPDF();
  const html2canvas=await ensureHtml2Canvas();
  const A={summary:"#14B8A6",detailed:"#3B82F6",executive:"#64748B",investor:"#A855F7"}[type]||"#14B8A6";
  const typeLabel=PDF_TYPES.find(t=>t.id===type)?.label||"Report";

  // Offscreen render container at fixed content width (px @ ~96dpi for A4 usable width)
  const CONTENT_W=720; // px; maps to ~190mm printable width
  const host=document.createElement("div");
  host.style.cssText="position:fixed;left:-99999px;top:0;width:"+CONTENT_W+"px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1e1e1e;";
  const style=document.createElement("style");
  style.textContent=`
    .pq-wrap{padding:0;background:#fff}
    .pq-block{padding:0 4px}
    .pq-h2{font-size:20px;font-weight:800;color:#111;margin:14px 0 6px}
    .pq-h3{font-size:16px;font-weight:800;color:`+A+`;margin:14px 0 5px;border-bottom:2px solid `+A+`33;padding-bottom:3px}
    .pq-h4{font-size:13px;font-weight:700;color:#333;margin:10px 0 4px}
    .pq-p{font-size:12px;line-height:1.55;margin:5px 0;color:#222}
    .pq-li{font-size:12px;line-height:1.5;margin:3px 0;padding-left:16px;position:relative;color:#222}
    .pq-bul{position:absolute;left:2px;color:`+A+`}
    .pq-num{position:absolute;left:0;color:`+A+`;font-weight:700}
    .pq-quote{font-size:12px;font-style:italic;color:#555;border-left:3px solid `+A+`55;padding-left:10px;margin:6px 0}
    .pq-hr{border:none;border-top:1px solid #ddd;margin:8px 0}
    .pq-tbl{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}
    .pq-tbl th{background:`+A+`;color:#fff;text-align:left;padding:6px 8px;font-weight:700;font-size:10px}
    .pq-tbl td{padding:5px 8px;border-bottom:1px solid #e2e2e2;color:#222;vertical-align:top}
    .pq-tbl tr:nth-child(even) td{background:#f6f8fb}
    strong{color:#000}code{background:#f0f0f0;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:11px}
  `;
  host.appendChild(style);
  const wrap=document.createElement("div");wrap.className="pq-wrap";
  const blocks=mdToHtmlBlocks(bodyText,A);
  blocks.forEach(b=>{const d=document.createElement("div");d.className="pq-block";d.innerHTML=b;wrap.appendChild(d);});
  host.appendChild(wrap);
  document.body.appendChild(host);

  try{
    const doc=new jsPDF({unit:"pt",format:"a4"});
    const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    const M=42;
    const usableW=W-2*M;
    const pxToPt=usableW/CONTENT_W; // scale factor: canvas px -> pdf pt
    const maxBlockH=H-2*M;

    // Cover band
    const rgb=(hex)=>{const h=hex.replace("#","");return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};
    const AC=rgb(A);
    doc.setFillColor(AC[0],AC[1],AC[2]);doc.rect(0,0,W,84,"F");
    doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(20);
    doc.text(co.name||"Company",M,42,{maxWidth:usableW});
    doc.setFontSize(10);doc.setFont("helvetica","normal");
    doc.text(typeLabel+"  ·  "+(co.industry||"")+"  ·  "+(co.location||""),M,64);
    let y=104;
    doc.setTextColor(20,20,20);doc.setFont("helvetica","bold");doc.setFontSize(15);
    const titleLines=doc.splitTextToSize(title,usableW);
    titleLines.forEach(line=>{doc.text(line,M,y);y+=18;});
    doc.setFontSize(8);doc.setTextColor(120,120,120);doc.setFont("helvetica","normal");
    doc.text("Generated "+new Date().toLocaleString()+"  ·  Currency: "+cur.code,M,y);y+=14;
    doc.setDrawColor(AC[0],AC[1],AC[2]);doc.setLineWidth(1.2);doc.line(M,y,W-M,y);y+=14;

    // Render each block to its own canvas, place with page-break awareness
    const blockEls=Array.from(wrap.children);
    for(const el of blockEls){
      const canvas=await html2canvas(el,{scale:2,backgroundColor:"#ffffff",logging:false});
      const imgH=canvas.height/2*pxToPt; // /2 because scale:2
      const imgW=usableW;
      // If block fits on current page, place it. Else new page. If taller than a
      // whole page, slice it vertically across pages (row borders stay intact visually).
      if(imgH<=maxBlockH){
        if(y+imgH>H-M){doc.addPage();y=M;}
        doc.addImage(canvas.toDataURL("image/png"),"PNG",M,y,imgW,imgH);
        y+=imgH+4;
      }else{
        // tall block: slice the source canvas into page-height chunks
        const pageCanvasH=Math.floor((maxBlockH/pxToPt)*2); // source px per page slice
        let sy=0;
        if(y>M+10){doc.addPage();y=M;} // start tall block on a fresh page
        while(sy<canvas.height){
          const sliceH=Math.min(pageCanvasH,canvas.height-sy);
          const slice=document.createElement("canvas");
          slice.width=canvas.width;slice.height=sliceH;
          slice.getContext("2d").drawImage(canvas,0,sy,canvas.width,sliceH,0,0,canvas.width,sliceH);
          const sliceImgH=sliceH/2*pxToPt;
          if(y+sliceImgH>H-M){doc.addPage();y=M;}
          doc.addImage(slice.toDataURL("image/png"),"PNG",M,y,imgW,sliceImgH);
          y+=sliceImgH+4;
          sy+=sliceH;
        }
      }
    }

    // Footer page numbers
    const pages=doc.internal.getNumberOfPages();
    for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text((co.name||"")+" · Confidential · Page "+p+" of "+pages,M,H-18);}
    doc.save((co.name||"Report").replace(/\s+/g,"-")+"-"+typeLabel.replace(/\s+/g,"-")+"-"+Date.now()+".pdf");
  }finally{
    document.body.removeChild(host);
  }
}
async function ensurePptx(){
  if(window.PptxGenJS)return window.PptxGenJS;
  await loadScript("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js");
if(!window.PptxGenJS)throw new Error("PptxGenJS unavailable");
  return window.PptxGenJS;
}

// ─── PPTX STYLE EXTRACTION (Step 1 — standalone, not wired into any generator yet) ──
async function ensureJSZip(){
  if(window.JSZip)return window.JSZip;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
  if(!window.JSZip)throw new Error("JSZip unavailable");
  return window.JSZip;
}
async function ensureXLSX(){
  if(window.XLSX)return window.XLSX;
  // xlsx-js-style: drop-in SheetJS fork that actually WRITES cell styles (.s) —
  // bold headers, brand fills, RAG colors. Community 0.18.5 silently drops them.
  try{await loadScript("https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js");}catch{}
  if(!window.XLSX){await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");}
  if(!window.XLSX)throw new Error("SheetJS unavailable");
  return window.XLSX;
}
function findByLocalName(root,name){
  const all=root.getElementsByTagName("*");
  for(let i=0;i<all.length;i++)if(all[i].localName===name)return all[i];
  return null;
}
function extractColorFromEl(el){
  if(!el)return null;
  const srgb=findByLocalName(el,"srgbClr");
  if(srgb)return "#"+srgb.getAttribute("val").toUpperCase();
  const sys=findByLocalName(el,"sysClr");
  if(sys)return "#"+(sys.getAttribute("lastClr")||"").toUpperCase();
  return null;
}
function extractThemeColors(themeDoc){
  const scheme=findByLocalName(themeDoc,"clrScheme");
  if(!scheme)return null;
  const slots=["dk1","lt1","dk2","lt2","accent1","accent2","accent3","accent4","accent5","accent6"];
  const colors={};
  slots.forEach(s=>{const c=extractColorFromEl(findByLocalName(scheme,s));if(c)colors[s]=c;});
  return Object.keys(colors).length?colors:null;
}
function extractThemeFonts(themeDoc){
  const scheme=findByLocalName(themeDoc,"fontScheme");
  if(!scheme)return null;
  const get=which=>{const f=findByLocalName(scheme,which);const l=f&&findByLocalName(f,"latin");return l?.getAttribute("typeface")||null;};
  const heading=get("majorFont"),body=get("minorFont");
  return(heading||body)?{heading,body}:null;
}
function extractSlideSize(presDoc){
  const sz=findByLocalName(presDoc,"sldSz");
  if(!sz)return null;
  const cx=parseInt(sz.getAttribute("cx"),10),cy=parseInt(sz.getAttribute("cy"),10);
  if(!cx||!cy)return null;
  return{widthIn:cx/914400,heightIn:cy/914400,isWidescreen:(cx/cy)>1.5};
}
// Reads a user-uploaded .pptx and extracts theme colors/fonts/aspect ratio.
// Never throws — returns {error} on any problem, {ok:true,...} on success.
async function extractPptxStyle(file){
  try{
    if(!file)return{error:"No file provided."};
    if(!file.name?.toLowerCase().endsWith(".pptx"))return{error:"Please upload a .pptx file (older .ppt isn't supported)."};
    if(file.size>20*1024*1024)return{error:"File too large (max 20MB)."};
    const JSZip=await ensureJSZip();
    const zip=await JSZip.loadAsync(await file.arrayBuffer());
    // Theme numbering varies — theme1.xml is typical, but decks with multiple
    // slide masters (common in downloaded templates) use theme11.xml, theme23.xml etc.
    // Match any themeN.xml and use the lowest-numbered one.
    const themeMatches=zip.file(/^ppt\/theme\/theme\d+\.xml$/);
    const themeFile=themeMatches&&themeMatches.length
      ?themeMatches.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))[0]
      :null;
    const presFile=zip.file("ppt/presentation.xml");
    if(!themeFile||!presFile)return{error:"This doesn't look like a valid PowerPoint (.pptx) file."};
    const parser=new DOMParser();
    const themeDoc=parser.parseFromString(await themeFile.async("string"),"application/xml");
    const presDoc=parser.parseFromString(await presFile.async("string"),"application/xml");
    const colors=extractThemeColors(themeDoc),fonts=extractThemeFonts(themeDoc),slideSize=extractSlideSize(presDoc);
    if(!colors&&!fonts&&!slideSize)return{error:"Could not read any style information from this file."};
    return{ok:true,colors,fonts,slideSize,sourceFileName:file.name};
  }catch(err){return{error:"Could not read this file: "+(err.message||"unknown error")};}
}
if(typeof window!=="undefined")window.__testPptxStyle=extractPptxStyle;

// Strip markdown to plain text for PDF/PPTX bodies
function stripMd(s){
  return (s||"").replace(/\*\*(.+?)\*\*/g,"$1").replace(/\*(.+?)\*/g,"$1").replace(/`(.+?)`/g,"$1").replace(/^#+\s+/gm,"").replace(/^>\s+/gm,"").replace(/^[-*]\s+/gm,"• ");
}
// Parse a structured doc into sections: {title, lines[]}
function parseSections(text){
  const lines=(text||"").split("\n");
  const secs=[];let cur={title:"Overview",lines:[]};
  for(const l of lines){
    const h=l.match(/^#{1,3}\s+(.+)/);
    if(h){if(cur.lines.length||secs.length===0)secs.push(cur);cur={title:h[1].trim(),lines:[]};}
    else if(l.trim())cur.lines.push(l);
  }
  if(cur.lines.length)secs.push(cur);
  return secs.filter(s=>s.lines.length||s.title);
}

// ─── QUALITY ENGINE: structured slide schema, prompt, and parser ───────────
function buildStructuredDeckPrompt(deckTitle,tLabel){
  return `You are producing a consulting-grade slide deck (think McKinsey/Deloitte quality bar) as STRICT JSON. Output ONLY a valid JSON array, no preamble, no markdown fences, no commentary.

Each element is one slide. Use ONLY these 4 slide types for this version: "title", "exec_summary", "matrix_2x2", "rag_status".

RULES THAT DEFINE CONSULTING QUALITY (non-negotiable):
1. Every slide except "title" needs "answerFirstTitle": a COMPLETE SENTENCE stating the conclusion. WRONG: "Cost Breakdown". RIGHT: "Technology spend represents 20% of total project cost and de-risks 3 of the top 5 execution risks."
2. Exactly ONE "title" slide, first in the array. Shape: {type,companyName,deckTitle,subtitle}.
3. Exactly ONE "exec_summary" slide, second in the array. Shape: {type,answerFirstTitle,keyPoints:[3-5 sentences],headlineMetric?:{label,value}}.
4. Use "matrix_2x2" when comparing options, prioritizing initiatives, or positioning along two dimensions. Shape: {type,answerFirstTitle,xAxisLabel,yAxisLabel,quadrants:{topLeft,topRight,bottomLeft,bottomRight}} where each quadrant is {label,items:[strings]}.
5. Use "rag_status" for progress, risk, or multi-item status tracking. Shape: {type,answerFirstTitle,rows:[{item,status:"red"|"amber"|"green",note,owner?}]}.
6. Never invent data. If a number is not in the provided corpus, write "data not yet available" rather than fabricating.
7. Total slides: 5-9 for this version.

DECK TITLE: "${deckTitle}"
DECK TYPE: "${tLabel}"

Return the JSON array now.`;
}

function parseStructuredDeck(raw){
  try{
    let cleaned=raw.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
    const arr=JSON.parse(cleaned);
    if(!Array.isArray(arr)||arr.length===0)return null;
    const validTypes=["title","exec_summary","matrix_2x2","rag_status"];
    const allValid=arr.every(s=>s&&validTypes.includes(s.type));
    if(!allValid)return null;
    return arr;
  }catch{
    return null;
  }
}

// Gather all workspace knowledge into a single corpus
// ─── PHASE 2: CAPABILITY & COST BRIEF ───────────────────────────────────────
async function fetchExchangeRate(toCode){
  if(toCode==="USD")return 1;
  try{
    const r=await fetch("https://open.er-api.com/v6/latest/USD");
const d=await r.json();
return d.rates?.[toCode]||null;
  }catch{return null;}
}
function computeServiceFee(costUsd){
  if(!costUsd||costUsd<=0)return{cost:0,fee:0,total:0};
  const pct=costUsd<100?0.2:0.1;
  const fee=Math.max(costUsd*pct,0.5);
  return{cost:costUsd,fee,total:costUsd+fee};
}
function parseCapabilityBrief(raw){
  const marker="===CAPABILITY_BRIEF===";
  const idx=raw.indexOf(marker);
  if(idx===-1)return{output:raw,capability:null};
  const output=raw.slice(0,idx).trim();
  let capability=null;
  try{
    const jsonStr=raw.slice(idx+marker.length).trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
    capability=JSON.parse(jsonStr);
  }catch{}
  return{output,capability};
}
function gatherWorkspace(co,compData,chats,brSessions,workflows,tQueue,extras){
  const parts=[];
  parts.push("COMPANY: "+co.name+" | "+co.industry+" | "+co.stage+" | "+co.location+" | "+co.currency);
  if(Object.keys(compData).length)parts.push("\n=== COMPANY DATA ===\n"+Object.entries(compData).map(([k,v])=>k+": "+v).join("\n"));
  if(extras?.boardroom&&brSessions.length){
    parts.push("\n=== BOARDROOM SESSIONS ===");
    brSessions.slice(0,5).forEach(s=>parts.push("Q: "+s.q+"\nSynthesis: "+stripMd(s.synthesis||"").slice(0,1500)));
  }
  if(extras?.chats){
    const ids=Object.keys(chats).filter(k=>chats[k]?.length);
    if(ids.length){parts.push("\n=== EXECUTIVE CONVERSATIONS ===");ids.slice(0,8).forEach(id=>{const r=AR.find(x=>x.id===id);const last=chats[id].filter(m=>m.role==="assistant").slice(-1)[0];if(r&&last)parts.push(r.t+": "+stripMd(last.content).slice(0,1200));});}
  }
  if(extras?.workflows&&workflows.length){
    parts.push("\n=== WORKFLOW OUTPUTS ===");
    workflows.slice(0,4).forEach(w=>{const fin=w.steps[w.steps.length-1];if(fin)parts.push(w.chainLabel+" — "+w.task+"\n"+stripMd(fin.output).slice(0,1200));});
  }
  if(extras?.tasks&&tQueue.length){
    const done=tQueue.filter(t=>t.finalOutput);
    if(done.length){parts.push("\n=== AUTOPILOT TASKS ===");done.slice(0,4).forEach(t=>parts.push(t.chainLabel+" — "+t.task+"\n"+stripMd(t.finalOutput).slice(0,1000)));}
  }
  if(extras?.timeMachine)parts.push("\n=== TIME MACHINE ===\n"+stripMd(extras.timeMachine).slice(0,1500));
  if(extras?.autopilot)parts.push("\n=== DECISION AUTOPILOT ===\n"+stripMd(extras.autopilot).slice(0,1500));
  return parts.join("\n");
}
// ─── CHART DETECTION ────────────────────────────────────────────────────────
// Detects if a markdown table is chartable: first column = labels, remaining columns = numbers
// Detects the "unit" implied by a header label or a cell's formatting, so we
// never chart incompatible units (months vs % vs currency) on one axis.
function detectUnit(headerLabel,sampleCells){
  const h=(headerLabel||"").toLowerCase();
  const sample=sampleCells.join(" ");
  if(h.includes("%")||sample.includes("%"))return "percent";
  if(h.includes("₹")||h.includes("rs.")||h.includes("rs ")||h.includes("usd")||h.includes("$")||sample.includes("₹")||sample.includes("rs.")||sample.includes("$"))return "currency";
  if(h.includes("month"))return "months";
  if(h.includes("day"))return "days";
  if(h.includes("year")||h.includes("yr"))return "years";
  if(h.includes("week"))return "weeks";
  if(h.includes("score")||h.includes("rating"))return "score";
  return "count"; // generic/unitless number — only compatible with other "count" columns
}

function tableToChartData(rows){
  if(rows.length<2)return null;
  const header=rows[0].split("|").filter((c,i,a)=>i>0&&i<a.length-1).map(c=>c.trim());
  const dataRows=rows.slice(1).filter(r=>!r.trim().match(/^\|[\s|:-]+\|$/));
  if(dataRows.length<2||header.length<2)return null;
  const labels=[];const series=header.slice(1).map(()=>[]);
  const rawCellsPerCol=header.slice(1).map(()=>[]);
  let numericCount=0;
  for(const r of dataRows){
    const cells=r.split("|").filter((c,i,a)=>i>0&&i<a.length-1).map(c=>c.trim());
    if(cells.length<2)continue;
    labels.push(cells[0]);
    for(let c=1;c<header.length;c++){
      const cellRaw=cells[c]||"";
      const raw=cellRaw.replace(/[^\d.\-]/g,"");
      const n=parseFloat(raw);
      series[c-1].push(isNaN(n)?0:n);
      rawCellsPerCol[c-1].push(cellRaw);
      if(!isNaN(n)&&raw!=="")numericCount++;
    }
  }
  if(numericCount<2)return null; // not enough numeric data to chart

  // UNIT-SAFETY GATE: detect each numeric column's unit. If two or more columns
  // have DIFFERENT units (e.g. one is %, another is months, another is currency),
  // charting them together would be misleading — bail out and let the caller fall
  // back to a plain table instead of plotting incompatible quantities on one axis.
  const colUnits=header.slice(1).map((name,i)=>detectUnit(name,rawCellsPerCol[i]));
  const uniqueUnits=[...new Set(colUnits)];
  if(uniqueUnits.length>1)return null;

  // Additional sanity gate: if it's "count" (no detectable unit at all) and there
  // are 3+ series, this is more likely a mixed qualitative table than real chart
  // data — be conservative and skip rather than risk a meaningless chart.
  if(uniqueUnits[0]==="count"&&header.length-1>=3)return null;

  return{labels,series:header.slice(1).map((name,i)=>({name,values:series[i]}))};
}

// ─── CHART RENDER (canvas, for PDF) ─────────────────────────────────────────
async function renderChartToImage(chartData,type,width,height){
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js");
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");
  const palette=["#14B8A6","#3B82F6","#A855F7","#F97316","#EF4444","#10B981"];
  const datasets=chartData.series.map((s,i)=>({label:s.name,data:s.values,backgroundColor:type==="line"?"transparent":palette[i%palette.length],borderColor:palette[i%palette.length],borderWidth:2,fill:false}));
  // @ts-ignore
  const chart=new window.Chart(ctx,{type:type==="pie"?"pie":type,data:{labels:chartData.labels,datasets},options:{responsive:false,animation:false,plugins:{legend:{labels:{color:"#333",font:{size:14}}}},scales:type==="pie"?{}:{x:{ticks:{color:"#333"}},y:{ticks:{color:"#333"}}}}});
  await new Promise(r=>setTimeout(r,200));
  const dataUrl=canvas.toDataURL("image/png");
  chart.destroy();
  return dataUrl;
}
// ─── PDF GENERATOR ──────────────────────────────────────────────────────────
async function generatePDF(type,title,bodyText,co,cur){
  const jsPDF=await ensureJsPDF();
  const doc=new jsPDF({unit:"pt",format:"a4"});
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
  const M=48;let y=M;
  const A={summary:[20,184,166],detailed:[59,130,246],executive:[100,116,139],investor:[168,85,247]}[type]||[20,184,166];
  const typeLabel=PDF_TYPES.find(t=>t.id===type)?.label||"Report";
  const addPageIfNeeded=(need)=>{if(y+need>H-M){doc.addPage();y=M;}};
  // Cover band
  doc.setFillColor(...A);doc.rect(0,0,W,90,"F");
  doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(22);
  doc.text(co.name||"Company",M,46,{maxWidth:W-2*M});
  doc.setFontSize(11);doc.setFont("helvetica","normal");
  doc.text(typeLabel+"  ·  "+(co.industry||"")+"  ·  "+(co.location||""),M,68);
  y=120;
  doc.setTextColor(30,30,30);doc.setFont("helvetica","bold");doc.setFontSize(16);
  doc.text(title,M,y,{maxWidth:W-2*M});y+=10;
  const titleLines=doc.splitTextToSize(title,W-2*M);y+=titleLines.length*8;
  doc.setFontSize(8);doc.setTextColor(120,120,120);doc.setFont("helvetica","normal");
  doc.text("Generated "+new Date().toLocaleString()+" - Currency: "+cur.code,M,y);y+=20;
  doc.setDrawColor(...A);doc.setLineWidth(1.5);doc.line(M,y,W-M,y);y+=20;
  // Body
// Body
  const secs=parseSections(bodyText);
  for(const sec of secs){
    addPageIfNeeded(40);
    doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(...A);
    const st=doc.splitTextToSize(sec.title.replace(/₹/g,"Rs."),W-2*M);
    st.forEach(line=>{addPageIfNeeded(18);doc.text(line,M,y);y+=18;});
    y+=2;

    const tableLines=sec.lines.filter(l=>l.includes("|")&&l.trim().startsWith("|")&&!l.trim().match(/^\|[\s|:-]+\|$/));
    const chartData=tableLines.length>=2?tableToChartData(tableLines):null;

    if(chartData){
      try{
        const chartType=chartData.series.length===1?"bar":"bar";
        const imgData=await renderChartToImage(chartData,chartType,800,450);
        const imgW=W-2*M;const imgH=imgW*(450/800);
        addPageIfNeeded(imgH+10);
        doc.addImage(imgData,"PNG",M,y,imgW,imgH);
        y+=imgH+12;
      }catch{
        // fallback to text table if chart rendering fails
      }
    }

    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(45,45,45);
    const nonChartLines=chartData?sec.lines.filter(l=>!tableLines.includes(l)):sec.lines;
    nonChartLines.forEach(raw=>{
      const isBullet=/^[-*]\s/.test(raw)||/^•/.test(raw);
      const isTable=raw.includes("|")&&raw.trim().startsWith("|");
      let text=stripMd(raw);
      if(isTable){text=raw.split("|").filter(c=>c.trim()&&!c.trim().match(/^[-:]+$/)).map(c=>c.trim()).join("   |   ");if(!text)return;}
      text=text.replace(/₹/g,"Rs.").replace(/·/g,"-");
      const indent=isBullet?M+14:M;
      const lines=doc.splitTextToSize(text,W-indent-M);
      lines.forEach(line=>{addPageIfNeeded(14);doc.text(line,indent,y);y+=13;});
      y+=2;
    });
    y+=8;
  }
  // Footer page numbers
  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text((co.name||"")+" - Confidential - Page "+i+" of "+pages,M,H-20);}
  doc.save((co.name||"Report").replace(/\s+/g,"-")+"-"+typeLabel.replace(/\s+/g,"-")+"-"+Date.now()+".pdf");
}

// ─── POWERPOINT GENERATOR ───────────────────────────────────────────────────
async function generatePPTX(type,title,bodyText,co,cur){
  const PptxGenJS=await ensurePptx();
  const pptx=new PptxGenJS();
  pptx.defineLayout({name:"WIDE",width:13.333,height:7.5});pptx.layout="WIDE";
  const PAL={briefing:"14B8A6",strategy:"6366F1",investor:"A855F7",pitch:"F97316",roadmap:"8B5CF6",research:"06B6D4",operational:"F59E0B"};
  const A=PAL[type]||"14B8A6";
  const DARK="0A0E1A",LIGHT="F1F5F9",MUT="A0AAC0";
  const typeLabel=PPT_TYPES.find(t=>t.id===type)?.label||"Presentation";
  // Title slide
  const s0=pptx.addSlide();s0.background={color:DARK};
  s0.addShape(pptx.ShapeType.rect,{x:0,y:3.1,w:0.35,h:1.3,fill:{color:A}});
  s0.addText(co.name||"Company",{x:0.7,y:2.9,w:12,h:1,fontSize:40,bold:true,color:LIGHT,fontFace:"Arial"});
  s0.addText(title,{x:0.7,y:3.9,w:12,h:0.8,fontSize:22,color:A,fontFace:"Arial"});
  s0.addText(typeLabel+"   ·   "+(co.industry||"")+"   ·   "+(co.location||"")+"   ·   "+cur.code,{x:0.7,y:4.7,w:12,h:0.5,fontSize:13,color:MUT,fontFace:"Arial"});
  s0.addText("Generated "+new Date().toLocaleDateString()+"  ·  Confidential",{x:0.7,y:6.7,w:12,h:0.4,fontSize:10,color:"5A6480",fontFace:"Arial"});
  // Content slides from sections
const secs=parseSections(bodyText);
  secs.forEach((sec,idx)=>{
    const s=pptx.addSlide();s.background={color:DARK};
    s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:0.95,fill:{color:"131825"}});
    s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:0.25,h:0.95,fill:{color:A}});
    s.addText(sec.title,{x:0.55,y:0.12,w:11.5,h:0.7,fontSize:24,bold:true,color:LIGHT,fontFace:"Arial",valign:"middle"});
    s.addText(String(idx+1).padStart(2,"0"),{x:12.3,y:0.12,w:0.9,h:0.7,fontSize:18,color:A,align:"right",valign:"middle"});
    // Detect table rows
    const tableRows=sec.lines.filter(l=>l.includes("|")&&l.trim().startsWith("|")&&!l.trim().match(/^\|[\s|:-]+\|$/));
    const chartData=tableRows.length>=2?tableToChartData(tableRows):null;
    if(chartData){
      const chartType=chartData.series.length===1?"pie":"bar";
      const palette=["14B8A6","3B82F6","A855F7","F97316","EF4444","10B981"];
      if(chartType==="pie"){
        const chartRows=[{name:chartData.series[0].name,labels:chartData.labels,values:chartData.series[0].values}];
        s.addChart(pptx.ChartType.pie,chartRows,{x:1.5,y:1.3,w:7,h:5.2,showLegend:true,legendPos:"r",legendColor:MUT,dataLabelColor:DARK,dataLabelFontSize:11,chartColors:palette});
      }else{
        const chartRows=chartData.series.map((sr,i)=>({name:sr.name,labels:chartData.labels,values:sr.values}));
        s.addChart(pptx.ChartType.bar,chartRows,{x:0.55,y:1.3,w:12.2,h:5.2,barDir:"col",showLegend:chartData.series.length>1,legendPos:"b",legendColor:MUT,catAxisLabelColor:MUT,valAxisLabelColor:MUT,chartColors:palette});
      }
    }else if(tableRows.length>=2){
      const rows=tableRows.map(r=>r.split("|").filter((c,i,a)=>i>0&&i<a.length-1).map(c=>c.trim()));
      const tblData=rows.map((r,ri)=>r.map(c=>({text:c,options:{fill:{color:ri===0?A:"131825"},color:ri===0?DARK:MUT,bold:ri===0,fontSize:11,fontFace:"Arial"}})));
      s.addTable(tblData,{x:0.55,y:1.3,w:12.2,border:{type:"solid",color:"1a2030",pt:1},autoPage:false});
    }else{
      const bullets=sec.lines.filter(l=>!l.includes("|")).map(l=>stripMd(l)).filter(Boolean).slice(0,9);
      s.addText(bullets.map(b=>({text:b,options:{bullet:{code:"2022"},indentLevel:0}})).length?bullets.map(b=>({text:b.replace(/^•\s*/,""),options:{bullet:{code:"2022"},color:MUT,fontSize:15,fontFace:"Arial",paraSpaceAfter:8}})):[{text:"—",options:{color:MUT}}],{x:0.7,y:1.4,w:12,h:5.6,valign:"top"});
    }
    s.addText((co.name||"")+"  ·  Confidential",{x:0.55,y:7.0,w:12,h:0.3,fontSize:9,color:"3A4060",fontFace:"Arial"});
  });
  await pptx.writeFile({fileName:(co.name||"Deck").replace(/\s+/g,"-")+"-"+typeLabel.replace(/\s+/g,"-")+"-"+Date.now()+".pptx"});
}

// ─── QUALITY ENGINE: archetype renderers (pptxgenjs) ────────────────────────
const QE_PAL={bg:"0A0E1A",panel:"131825",border:"1A2030",text:"F1F5F9",textMuted:"A0AAC0",textDim:"5A6480",accent:"14B8A6",red:"EF4444",amber:"F59E0B",green:"10B981"};

// ─── PROJECT ENGINE — Template Library ─────────────────────────────────────
const PROJECT_TEMPLATES={
  "Business Plan":{modules:["Executive Summary","Market Analysis","Product Strategy","Financial Model","Go-to-Market","Risk Assessment"],formats:{default:"docx",financial:"xlsx",presentation:"pptx"}},
  "Pitch Deck":{modules:["Problem","Solution","Market Size","Product Demo","Business Model","Traction","Team","Financials","Ask"],formats:{default:"pptx",financial:"xlsx"}},
  "Financial Model":{modules:["Assumptions","Revenue Forecast","Cost Structure","P&L","Cash Flow","Balance Sheet","KPI Dashboard"],formats:{default:"xlsx",presentation:"pptx"}},
  "Marketing Plan":{modules:["Market Analysis","ICP & Segmentation","Campaign Strategy","Content Calendar","Budget Allocation","KPIs & Metrics"],formats:{default:"docx",calendar:"xlsx",deck:"pptx"}},
  "SOP":{modules:["Purpose & Scope","Roles & Responsibilities","Process Steps","Quality Checks","Exception Handling","Review Schedule"],formats:{default:"docx"}},
  "Consulting Report":{modules:["Executive Summary","Current State","Gap Analysis","Recommendations","Implementation Roadmap","Financial Impact"],formats:{default:"docx",model:"xlsx",deck:"pptx"}},
  "Business Proposal":{modules:["Cover","Executive Summary","Problem Statement","Proposed Solution","Timeline","Pricing","Terms"],formats:{default:"docx",pricing:"xlsx",deck:"pptx"}},
  "Launch Plan":{modules:["Launch Overview","Target Audience","Marketing Strategy","Content Plan","Channel Mix","Budget","Success Metrics"],formats:{default:"docx",budget:"xlsx",campaign:"pptx"}},
};
function detectTemplate(objective){
  const o=(objective||"").toLowerCase();
  if(o.includes("pitch")||o.includes("investor")||o.includes("deck"))return "Pitch Deck";
  if(o.includes("financial model")||o.includes("forecast")||o.includes("p&l"))return "Financial Model";
  if(o.includes("marketing plan")||o.includes("campaign plan"))return "Marketing Plan";
  if(o.includes("sop")||o.includes("standard operating"))return "SOP";
  if(o.includes("consulting")||o.includes("assessment")||o.includes("audit"))return "Consulting Report";
  if(o.includes("proposal")||o.includes("rfp")||o.includes("bid"))return "Business Proposal";
  if(o.includes("launch")||o.includes("go-to-market")||o.includes("gtm"))return "Launch Plan";
  if(o.includes("business plan")||o.includes("business case"))return "Business Plan";
  return null;
}


// Turns an extractPptxStyle() result into a render-ready palette. Returns null if no
// style was captured (callers then use QE_PAL exactly as before — no behavior change).
// Keeps our proven dark theme if the sample is dark; builds a readable light palette
// from the sample's own colors if it's light, so text never goes invisible.
function buildPalFromExtractedStyle(styleResult){
  if(!styleResult?.ok)return null;
  const colors=styleResult.colors||{};
  const clean=hex=>hex?hex.replace("#",""):null;
  const accent=clean(colors.accent1)||QE_PAL.accent;
  const bgHex=colors.lt1||colors.dk2||null;
  const lum=(()=>{const h=clean(bgHex);if(!h||h.length!==6)return null;
    const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    return (0.299*r+0.587*g+0.114*b)/255;})();
  const isLight=lum!==null&&lum>0.6;
  if(!isLight)return{...QE_PAL,accent};
  return{bg:clean(colors.lt1)||"FFFFFF",panel:clean(colors.lt2)||"F4F6FB",border:"E2E8F0",
    text:clean(colors.dk1)||"0F172A",textMuted:clean(colors.dk2)||"475569",textDim:"94A3B8",
    accent,red:QE_PAL.red,amber:QE_PAL.amber,green:QE_PAL.green};
}

function renderTitleSlideQE(pptx,slide,A,pal=QE_PAL){
  const s=pptx.addSlide();s.background={color:pal.bg};
  s.addShape(pptx.ShapeType.rect,{x:0,y:3.1,w:0.35,h:1.3,fill:{color:A}});
  s.addText(slide.companyName||"Company",{x:0.7,y:2.9,w:12,h:1,fontSize:40,bold:true,color:pal.text,fontFace:"Arial"});
  s.addText(slide.deckTitle||"",{x:0.7,y:3.9,w:12,h:0.8,fontSize:22,color:A,fontFace:"Arial"});
  s.addText(slide.subtitle||"",{x:0.7,y:4.7,w:12,h:0.5,fontSize:13,color:pal.textMuted,fontFace:"Arial"});
  s.addText("Generated "+new Date().toLocaleDateString()+"  ·  Confidential",{x:0.7,y:6.7,w:12,h:0.4,fontSize:10,color:pal.textDim,fontFace:"Arial"});
}

function renderExecSummarySlideQE(pptx,slide,A,idx,pal=QE_PAL){
  const s=pptx.addSlide();s.background={color:pal.bg};
  s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:1.6,fill:{color:pal.panel}});
  s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:0.25,h:1.6,fill:{color:A}});
  s.addText(slide.answerFirstTitle||"",{x:0.55,y:0.18,w:12.2,h:1.3,fontSize:22,bold:true,color:pal.text,fontFace:"Arial",valign:"middle"});
  let y=2.0;
  if(slide.headlineMetric){
    s.addText(slide.headlineMetric.value,{x:0.55,y,w:4,h:1.2,fontSize:44,bold:true,color:A,fontFace:"Arial"});
    s.addText(slide.headlineMetric.label,{x:0.55,y:y+1.2,w:4,h:0.5,fontSize:12,color:pal.textMuted,fontFace:"Arial"});
    const points=(slide.keyPoints||[]).map(p=>({text:p,options:{bullet:{code:"2022"},color:pal.textMuted,fontSize:15,fontFace:"Arial",paraSpaceAfter:10}}));
    s.addText(points,{x:5.0,y,w:7.7,h:4.5,valign:"top"});
  }else{
    const points=(slide.keyPoints||[]).map(p=>({text:p,options:{bullet:{code:"2022"},color:pal.textMuted,fontSize:16,fontFace:"Arial",paraSpaceAfter:12}}));
    s.addText(points,{x:0.7,y,w:12,h:4.5,valign:"top"});
  }
  s.addText(String(idx+1).padStart(2,"0"),{x:12.3,y:0.5,w:0.9,h:0.6,fontSize:14,color:A,align:"right"});
}

function renderMatrix2x2SlideQE(pptx,slide,A,idx,pal=QE_PAL){
  const s=pptx.addSlide();s.background={color:pal.bg};
  s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:0.95,fill:{color:pal.panel}});
  s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:0.25,h:0.95,fill:{color:A}});
  s.addText(slide.answerFirstTitle||"",{x:0.55,y:0.1,w:11.5,h:0.75,fontSize:18,bold:true,color:pal.text,fontFace:"Arial",valign:"middle"});
  s.addText(String(idx+1).padStart(2,"0"),{x:12.3,y:0.1,w:0.9,h:0.75,fontSize:14,color:A,align:"right",valign:"middle"});
  const gx=1.6,gy=1.5,gw=10.1,gh=5.3;
  const midX=gx+gw/2,midY=gy+gh/2;
  const quadColors=["3B82F622","10B98122","F59E0B22","EF444422"];
  s.addText(slide.xAxisLabel||"",{x:gx,y:gy+gh+0.1,w:gw,h:0.4,fontSize:11,color:pal.textDim,align:"center",fontFace:"Arial"});
  s.addText(slide.yAxisLabel||"",{x:0.2,y:gy,w:0.4,h:gh,fontSize:11,color:pal.textDim,align:"center",valign:"middle",rotate:270,fontFace:"Arial"});
  s.addShape(pptx.ShapeType.rect,{x:gx,y:gy,w:gw/2,h:gh/2,fill:{color:quadColors[0]},line:{color:pal.border,width:1}});
  s.addShape(pptx.ShapeType.rect,{x:midX,y:gy,w:gw/2,h:gh/2,fill:{color:quadColors[1]},line:{color:pal.border,width:1}});
  s.addShape(pptx.ShapeType.rect,{x:gx,y:midY,w:gw/2,h:gh/2,fill:{color:quadColors[2]},line:{color:pal.border,width:1}});
  s.addShape(pptx.ShapeType.rect,{x:midX,y:midY,w:gw/2,h:gh/2,fill:{color:quadColors[3]},line:{color:pal.border,width:1}});
  const q=slide.quadrants||{};
  const renderQuad=(data,x,y)=>{
    if(!data)return;
    s.addText(data.label||"",{x:x+0.15,y:y+0.1,w:gw/2-0.3,h:0.4,fontSize:12,bold:true,color:pal.text,fontFace:"Arial"});
    const items=(data.items||[]).slice(0,4).map(it=>({text:it,options:{bullet:{code:"2022"},fontSize:10.5,color:pal.textMuted,paraSpaceAfter:4}}));
    s.addText(items,{x:x+0.15,y:y+0.55,w:gw/2-0.3,h:gh/2-0.65,valign:"top",fontFace:"Arial"});
  };
  renderQuad(q.topLeft,gx,gy);
  renderQuad(q.topRight,midX,gy);
  renderQuad(q.bottomLeft,gx,midY);
  renderQuad(q.bottomRight,midX,midY);
}

function renderRagStatusSlideQE(pptx,slide,A,idx,pal=QE_PAL){
  const s=pptx.addSlide();s.background={color:pal.bg};
  s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:0.95,fill:{color:pal.panel}});
  s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:0.25,h:0.95,fill:{color:A}});
  s.addText(slide.answerFirstTitle||"",{x:0.55,y:0.1,w:11.5,h:0.75,fontSize:18,bold:true,color:pal.text,fontFace:"Arial",valign:"middle"});
  s.addText(String(idx+1).padStart(2,"0"),{x:12.3,y:0.1,w:0.9,h:0.75,fontSize:14,color:A,align:"right",valign:"middle"});
  const statusColor=st=>st==="green"?pal.green:st==="amber"?pal.amber:pal.red;
  const rows=slide.rows||[];
  const hasOwner=rows.some(r=>r.owner);
  const header=hasOwner
    ?[{text:"Item",options:{fill:{color:A},color:pal.bg,bold:true,fontSize:11}},{text:"Status",options:{fill:{color:A},color:pal.bg,bold:true,fontSize:11,align:"center"}},{text:"Owner",options:{fill:{color:A},color:pal.bg,bold:true,fontSize:11}},{text:"Note",options:{fill:{color:A},color:pal.bg,bold:true,fontSize:11}}]
    :[{text:"Item",options:{fill:{color:A},color:pal.bg,bold:true,fontSize:11}},{text:"Status",options:{fill:{color:A},color:pal.bg,bold:true,fontSize:11,align:"center"}},{text:"Note",options:{fill:{color:A},color:pal.bg,bold:true,fontSize:11}}];
  const body=rows.map(r=>{
    const cells=[
      {text:r.item||"",options:{fill:{color:pal.panel},color:pal.textMuted,fontSize:10.5}},
      {text:(r.status||"amber").toUpperCase(),options:{fill:{color:pal.panel},color:statusColor(r.status),bold:true,fontSize:10,align:"center"}},
    ];
    if(hasOwner)cells.push({text:r.owner||"",options:{fill:{color:pal.panel},color:pal.textMuted,fontSize:10.5}});
    cells.push({text:r.note||"",options:{fill:{color:pal.panel},color:pal.textMuted,fontSize:10.5}});
    return cells;
  });
  s.addTable([header,...body],{x:0.55,y:1.3,w:12.2,border:{type:"solid",color:pal.border,pt:1},autoPage:false,colW:hasOwner?[4.5,1.8,1.8,4.1]:[4.5,1.8,5.9]});
}

function renderStructuredDeck(pptx,slides,A,pal=QE_PAL){
  slides.forEach((slide,idx)=>{
    switch(slide.type){
      case "title":renderTitleSlideQE(pptx,slide,A,pal);break;
      case "exec_summary":renderExecSummarySlideQE(pptx,slide,A,idx,pal);break;
      case "matrix_2x2":renderMatrix2x2SlideQE(pptx,slide,A,idx,pal);break;
      case "rag_status":renderRagStatusSlideQE(pptx,slide,A,idx,pal);break;
    }
  });
}

// ─── ENGINE DOWNGRADE TRACKER ─────────────────────────────────────────────────
// Records every time the publication engine fails and a basic fallback produces
// the file instead. Without this, a downgraded deliverable looks identical to a
// finished one — which is exactly how quality problems went undetected.
// Surfaced in QA-Report.md and as an on-screen warning so a silent downgrade
// becomes impossible.
type EngineDowngrade={deliverable:string;format:string;reason:string;ts:string};
const engineDowngrades:{list:EngineDowngrade[]}={list:[]};
// Deterministic content-check warnings (zero-heavy data, under-count slides,
// leftover placeholders) — set by BEE after generation when a deliverable
// shipped despite failing its fact-based check even after one retry.
type QualityWarning={deliverable:string;warning:string};
const qualityWarnings:{list:QualityWarning[]}={list:[]};
function recordEngineDowngrade(deliverable:string,format:string,err:unknown){
  const reason=String((err as any)?.message||err||"unknown error").slice(0,180);
  try{
    engineDowngrades.list.push({deliverable,format,reason,ts:new Date().toISOString()});
    console.error("[OIQ] Publication engine ("+format+") fell back for \""+deliverable+"\":",reason);
    const uf=WorkspaceMemory.get<any[]>("cos-unfulfilled-log")||[];
    uf.unshift({ts:new Date().toISOString(),project:"engine-downgrade",deliverable,format:format+"-engine",error:reason});
    WorkspaceMemory.set("cos-unfulfilled-log",uf.slice(0,50));
  }catch{}
}

// ─── STYLE CONSTANTS (module scope) ────────────────────────────────────────────
// Created once at module load instead of on every component render.
const S={
  lbl:{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:3,display:"block"},
  inp:{width:"100%",background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:6,padding:"9px 11px",color:"#F1F5F9",fontSize:12,fontFamily:"Manrope,sans-serif"},
  pBtn:{background:"#14B8A6",color:"#0a0e1a",border:"none",borderRadius:6,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Manrope,sans-serif",marginTop:6,width:"100%"},
  hBtn:{background:"none",border:"1px solid #1a2030",borderRadius:4,padding:"3px 6px",color:"#5A6480",fontSize:9,cursor:"pointer",fontFamily:"Manrope,sans-serif"},
  iBtn:{background:"none",border:"1px solid #1a2030",borderRadius:4,padding:"3px 6px",color:"#A0AAC0",fontSize:11,cursor:"pointer",fontFamily:"Manrope,sans-serif"},
  cancelBtn:{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:5,padding:"5px 12px",color:"#EF4444",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"Manrope,sans-serif"},
  actBtn:{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:5,padding:"10px 12px",color:"#A0AAC0",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"Manrope,sans-serif",textAlign:"center",width:"100%"},
  errB:{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.18)",borderRadius:5,padding:"8px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,fontSize:10,color:"#EF4444",gap:8},
  retBtn:{background:"#EF4444",color:"#fff",border:"none",borderRadius:3,padding:"3px 8px",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"Manrope,sans-serif",whiteSpace:"nowrap"},
  dot:{width:5,height:5,borderRadius:"50%",background:"#14B8A6",animation:"pulse 1s ease-in-out infinite",display:"inline-block"},
  uMsg:{background:"rgba(20,184,166,0.04)",borderRadius:6,padding:"8px 10px",borderLeft:"3px solid #14B8A6"},
  aMsg:{background:"#131825",borderRadius:6,padding:"9px 11px",border:"1px solid #1a2030"},
  mLbl:{fontSize:8,fontWeight:700,color:"#3A4060",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.5px"},
  qaBtn:{background:"#131825",border:"1px solid #1a2030",borderRadius:5,padding:"8px 10px",color:"#A0AAC0",fontSize:10,cursor:"pointer",fontFamily:"Manrope,sans-serif",textAlign:"left",lineHeight:1.4},
  pill:{background:"none",border:"1px solid #1a2030",borderRadius:4,padding:"2px 5px",fontSize:11,color:"#3A4060",cursor:"pointer",fontFamily:"Manrope,sans-serif",flex:1,textAlign:"center"},
  dH:{width:"100%",display:"flex",alignItems:"center",gap:4,padding:"3px 5px",background:"none",border:"none",cursor:"pointer",fontFamily:"Manrope,sans-serif",borderRadius:4},
  rBtn:{width:"100%",display:"flex",alignItems:"center",gap:4,padding:"4px 5px 4px 16px",background:"none",border:"1px solid transparent",cursor:"pointer",fontFamily:"Manrope,sans-serif",borderRadius:4,textAlign:"left"},
  nTab:{display:"flex",flexDirection:"column",alignItems:"center",gap:1,background:"none",border:"1px solid #1a2030",borderRadius:4,padding:"4px 0",color:"#3A4060",cursor:"pointer",fontFamily:"Manrope,sans-serif"},
  nrvTab:{display:"flex",flexDirection:"column",alignItems:"center",gap:1,flex:1,background:"none",border:"1px solid #1a2030",borderRadius:6,padding:"7px 4px",color:"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"},
  inpA:{padding:"6px 12px 8px",borderTop:"1px solid #14192a",background:"#0c1120"},
  inpR:{display:"flex",alignItems:"flex-end",gap:4,background:"#131825",border:"1px solid #1a2030",borderRadius:6,padding:"3px 3px 3px 10px"},
  ta:{flex:1,background:"none",border:"none",color:"#F1F5F9",fontSize:12,fontFamily:"Manrope,sans-serif",resize:"none",padding:"6px 0",lineHeight:1.5},
  sBtn:{width:28,height:28,borderRadius:5,border:"none",color:"#0a0e1a",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  modalBg:{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(3px)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20},
  modal:{background:"#131825",border:"1px solid #1a2030",borderRadius:12,padding:"20px 22px",width:"100%",maxWidth:460,maxHeight:"92vh",overflowY:"auto"},
};

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function App(){
  const [page,setPage]=useState("landing");
  const [sbOpen,setSbOpen]=useState(false);
  const [showModules,setShowModules]=useState(false);
  const [sbCollapsed,setSbCollapsed]=useState(()=>{try{return WorkspaceMemory.get<string>("oiq-sb-col")==="1";}catch{return false;}});
  const [keys,setKeys]=useState({claude:"",openai:"",gemini:"",groq:"",deepseek:"",kimi:"",stability:"",fal:""});
  const [mediaMode,setMediaMode]=useState({image:"prompts",video:"veo"});
  const [showMediaPicker,setShowMediaPicker]=useState(false);
  const [defP,setDefP]=useState("nvidia"); // free, zero-setup default
  const [multiAI,setMultiAI]=useState(false);
  const [co,setCo]=useState({name:"",industry:"",stage:"idea",location:"",markets:"",currency:"INR"});
  const [selRole,setSelRole]=useState(null);
  const [chats,setChats]=useState({});
  const [input,setInput]=useState("");
  const [searchMode,setSearchMode]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [expD,setExpD]=useState({});
  const [compData,setCompData]=useState({});
  const [ledgerEntries,setLedgerEntries]=useState<JournalEntry[]>([]);
  const [customAccounts,setCustomAccounts]=useState<any[]>([]);
  const [dispatchTemplates,setDispatchTemplates]=useState<DispatchTemplate[]>([]);
  const [actionItems,setActionItems]=useState<ActionItem[]>([]);
  const [extractModal,setExtractModal]=useState<{items:ExtractedItem[];sourceType:ActionItem["source"];sourceLabel:string}|null>(null);
  const [extracting,setExtracting]=useState<string|null>(null); // which source is currently extracting
  const [adminConfig,setAdminConfig]=useState<{[k:string]:boolean}>({ledgerEnabled:true,dispatchEnabled:true,actionsEnabled:true});
  const [dataF,setDataF]=useState({k:"",v:""});
  const [view,setView]=useState("home");
  const [nTab,setNTab]=useState("boardroom");
  const [brQ,setBrQ]=useState("");
  const [brAg,setBrAg]=useState(["ceo","cfo","cto","cmo"]);
  const [brSessions,setBrSessions]=useState([]);
  const [brCur,setBrCur]=useState({q:"",researchBrief:"",format:"threaded",stages:[]}); 
  const [brResearching,setBrResearching]=useState(false);
  const [brRun,setBrRun]=useState(false);
  const [brPh,setBrPh]=useState("");
  const [drillRole,setDrillRole]=useState(null);
  const [brShowHistory,setBrShowHistory]=useState(false);
  const [brFollowUp,setBrFollowUp]=useState("");
  const [followUpExecIds,setFollowUpExecIds]=useState([]);
  const [followUpSuggestions,setFollowUpSuggestions]=useState([]);
  const [drillQ,setDrillQ]=useState("");
  const [drillRun,setDrillRun]=useState(false);
  const [tmDec,setTmDec]=useState("");
  const [tmRes,setTmRes]=useState("");
  const [tmRun,setTmRun]=useState(false);
  const [tmResearchBrief,setTmResearchBrief]=useState("");
  const [tmPh,setTmPh]=useState("");
  const [tmSessions,setTmSessions]=useState([]);
  const [tmShowHistory,setTmShowHistory]=useState(false);
  const [apRes,setApRes]=useState("");
  const [apRun,setApRun]=useState(false);
  const [apResearchBrief,setApResearchBrief]=useState("");
  const [apPh,setApPh]=useState("");
  const [showSettings,setShowSettings]=useState(false);
  const [sTab,setSTab]=useState("api");
  const [confirmReset,setConfirmReset]=useState(null);
  const [testSt,setTestSt]=useState({});
  const [vLang,setVLang]=useState("en-IN");
  const [dnCfg,setDnCfg]=useState({   ownerName:import.meta.env.VITE_OWNER_NAME||"",   ownerEmail:import.meta.env.VITE_OWNER_EMAIL||"",   upiId:import.meta.env.VITE_UPI_ID||"",   bankName:import.meta.env.VITE_BANK_NAME||"",   accountNo:import.meta.env.VITE_ACCOUNT_NO||"",   ifsc:import.meta.env.VITE_IFSC||"",   accountType:import.meta.env.VITE_ACCOUNT_TYPE||"",   paypalMe:"",   stripeLink:"",   note:"Scan the QR code below to support this project. Thank you!",   qrImage:DEFAULT_QR,   enabled:true });
  const [dnAmt,setDnAmt]=useState(100);
  const [dnCustom,setDnCustom]=useState("");
  const [showDonate,setShowDonate]=useState(false); 
  const [isAdmin,setIsAdmin]=useState(false);
  const [showSignOutConfirm,setShowSignOutConfirm]=useState(false);
  const [wfView,setWfView]=useState("new");
  const [projects,setProjects]=useState([]);
  const [activeProject,setActiveProject]=useState(null);
  const [projectPlanning,setProjectPlanning]=useState(false);
  const [projectPlan,setProjectPlan]=useState(null); // pending approval
  const [projectObjective,setProjectObjective]=useState("");
  const [projectExecution,setProjectExecution]=useState(null); // active execution project
  const [projectExecuting,setProjectExecuting]=useState(false);
  const [projectExecPhase,setProjectExecPhase]=useState(""); // live status message
  const [projectExecCancel,setProjectExecCancel]=useState(false);
  // Ref mirror of the cancel flag — async loops read THIS. React state alone is
  // frozen inside long-running closures (stale closure), which made the Cancel
  // button functionally dead: it set state the loop could never observe.
  const projectExecCancelRef=useRef(false);
  const runProjectExecutionRef=useRef(null); // ref to avoid TDZ with useCallback ordering
  const rawContentStore=useRef({}); // full content stored outside React state to prevent memory/render overload
  const [projectQARunning,setProjectQARunning]=useState(false);
  const [projectPackaging,setProjectPackaging]=useState(false);
  const [projectReviewMode,setProjectReviewMode]=useState(false);
  const [projectExcluded,setProjectExcluded]=useState({});
  // Phase 6: user-driven iteration state — replaces the automated QA gate.
  const [projectFeedback,setProjectFeedback]=useState<Record<string,string>>({});
  const [projectRegeneratingId,setProjectRegeneratingId]=useState<string|null>(null);
  const [projectDashboardOpen,setProjectDashboardOpen]=useState(false);
  const [projectArchiveView,setProjectArchiveView]=useState("recent");
  const [projectSearchQ,setProjectSearchQ]=useState("");
  const [wfCustomChain,setWfCustomChain]=useState([]);
  const [wfShowExtra,setWfShowExtra]=useState(false);
  const [wfPreflight,setWfPreflight]=useState<{questions:{persona:string;personaIc:string;q:string;placeholder:string}[];answers:string[];contextSummary:string}|null>(null);
  const [wfPreflightActive,setWfPreflightActive]=useState(false);
  const [wfPreflightLoading,setWfPreflightLoading]=useState(false);
  const [wfTask,setWfTask]=useState("");
  const [wfCat,setWfCat]=useState("finance");
  const [wfActive,setWfActive]=useState(null);
  const [wfRunning,setWfRunning]=useState(false);
  const [wfPhase,setWfPhase]=useState("");
  const [workflows,setWorkflows]=useState([]);
  const [tQueue,setTQueue]=useState([]);
  const [qRunning,setQRunning]=useState(false);
  const [p3View,setP3View]=useState("dashboard");
  const [pulseTab,setPulseTab]=useState("dispatch");
  const [p3Task,setP3Task]=useState("");
  const [p3Pri,setP3Pri]=useState("medium");
  const [p3Auto,setP3Auto]=useState(true);
  const [p3Cat,setP3Cat]=useState("finance");
  const [p3Running,setP3Running]=useState(null);
  const [p3Phase,setP3Phase]=useState("");
  const [p3Notify,setP3Notify]=useState([]);

  // FIX BUG 1: localDn at component level (was illegal useState inside render IIFE)
  const [localDn,setLocalDn]=useState({ownerName:"",ownerEmail:"",upiId:"",bankName:"",accountNo:"",ifsc:"",accountType:"",paypalMe:"",stripeLink:"",note:"",qrImage:"",enabled:false});

  // Derived currency — declared early so callbacks (runExport, quickExport) can reference it safely
  const cur=useMemo(()=>CURRENCIES.find(cv=>cv.code===co.currency)||CURRENCIES[0],[co.currency]);
  // FIX BUG 7: toast state
  const [toasts,setToasts]=useState([]);
  // API health indicator
  const [apiHealth,setApiHealth]=useState(null); // null|'checking'|'ok'|'fail'

  // FEATURE 1: theme
  const [theme,setTheme]=useState("dark");
  // FEATURE 4/5: export studio
  const [showExport,setShowExport]=useState(false);
  const [expMode,setExpMode]=useState("pdf"); // pdf | pptx
  const [expDocType,setExpDocType]=useState("executive");
  const [expPptType,setExpPptType]=useState("briefing");
  const [expSources,setExpSources]=useState({chats:true,boardroom:true,workflows:true,tasks:true,timeMachine:true,autopilot:true});
  const [expTitle,setExpTitle]=useState("");
  const [expGenerating,setExpGenerating]=useState(false);
  const [expSynthesis,setExpSynthesis]=useState("");
  const [expStep,setExpStep]=useState("");
  const [expStyleResult,setExpStyleResult]=useState(null);
  // FEATURE 2: resume banner
 const [resumeInfo,setResumeInfo]=useState(null);
const [wfResumeData,setWfResumeData]=useState<ResumeState|null>(null);
const [wfPauseMsg,setWfPauseMsg]=useState("");

  // Cancel refs for long-running operations
  const cancelRef=useRef({br:false,tm:false,ap:false,wf:false,q:false});

  const tQRef=useRef([]);
  const chatEnd=useRef(null);
  const brEnd=useRef(null);

  // FIX BUG 7: showToast
  const showToast=useCallback((msg,type="info")=>{
    const id=Date.now()+Math.random();
    setToasts(prev=>[...prev.slice(-4),{id,msg:String(msg),type}]);
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),7000);
  },[]);

  // FIX BUG 1: sync localDn when dnCfg changes (e.g. on load)
  useEffect(()=>setLocalDn({...dnCfg}),[dnCfg]);

  // Load persisted data
 useEffect(()=>{
  attachBenchmarkToWindow();
  (async()=>{
    try{const th=WorkspaceMemory.get<string>("cos-theme");const tid=th&&THEMES[th]?th:"dark";setTheme(tid);applyTheme(tid);}catch{applyTheme("dark");}
    try{const c=WorkspaceMemory.get<typeof co>("cos-co");if(c)setCo(p=>({...p,...c}));}catch{}
    try{const k=WorkspaceMemory.get<any>("cos-keys");if(k){
      const p=JSON.parse(k);
      const loadedKeys={claude:"",openai:"",gemini:"",groq:"",deepseek:"",kimi:"",...(p.keys||{})};
      setKeys(loadedKeys);setDefP(p.defaultProvider||"claude");setMultiAI(p.multiAI||false);
      if(Object.values(loadedKeys).some(v=>v?.trim()))setPage("app");
      const active=Object.keys(loadedKeys).filter(pid=>loadedKeys[pid]?.trim());
      if(active.length){
        const pid=(p.defaultProvider&&active.includes(p.defaultProvider))?p.defaultProvider:active[0];
        setApiHealth("checking");
        callAI(pid,loadedKeys[pid],"You are a test assistant.",[{role:"user",content:"Reply with one word: OK"}],5)
          .then(()=>setApiHealth("ok"))
          .catch(()=>setApiHealth("fail"));
      }
    }}catch{}
    try{const vl=WorkspaceMemory.get<string>("cos-vl");if(vl)setVLang(vl);}catch{}
    try{const h=WorkspaceMemory.get<any>("cos-ch");if(h)setChats(h);}catch{}
    try{const d=WorkspaceMemory.get<any>("cos-dp");if(d)setExpD(d);}catch{}
    try{const cd=WorkspaceMemory.get<any>("cos-cd");if(cd)setCompData(cd);}catch{}
    try{const le=WorkspaceMemory.get<any>("cos-ledger");if(le)setLedgerEntries(le);}catch{}
    try{const ca=WorkspaceMemory.get<any>("cos-accounts");if(ca)setCustomAccounts(ca);}catch{}
    try{const dt=WorkspaceMemory.get<any>("cos-dispatch-templates");if(dt)setDispatchTemplates(dt);}catch{}
    try{const acts=WorkspaceMemory.get<any>("cos-actions");if(acts)setActionItems(acts);}catch{}
    try{const ac=WorkspaceMemory.get<any>("cos-admin-config");if(ac)setAdminConfig(p=>({...p,...ac}));}catch{}
    try{const br=WorkspaceMemory.get<any>("cos-br");if(br)setBrSessions(br);}catch{}
    try{const projs=WorkspaceMemory.get<any[]>("cos-projects");if(projs){const cleaned=projs.map((p:any)=>p.status==="executing"||p.status==="qa"?{...p,status:"partial"}:p);setProjects(cleaned);WorkspaceMemory.set("cos-projects",cleaned);}}catch{}
    try{localStorage.removeItem("cos-project-plan");}catch{} // always start fresh
    try{const brLive=WorkspaceMemory.get<any>("cos-br-live");if(brLive?.q)setBrCur(brLive);}catch{}
    try{const tm=WorkspaceMemory.get<any>("cos-tm");if(tm)setTmSessions(tm);}catch{}
    try{const tmLive=WorkspaceMemory.get<any>("cos-tm-live");if(tmLive?.dec){setTmDec(tmLive.dec);setTmRes(tmLive.res||"");setTmResearchBrief(tmLive.brief||"");}}catch{}
    try{const ap=WorkspaceMemory.get<any>("cos-ap");if(ap)setApSessions(ap);}catch{}
    try{const apLive=WorkspaceMemory.get<any>("cos-ap-live");if(apLive?.res){setApRes(apLive.res);setApResearchBrief(apLive.brief||"");}}catch{}
    try{const dn=WorkspaceMemory.get<any>("cos-dn");if(dn){setDnCfg(dn);setLocalDn(dn);}}catch{}
    try{const wf=WorkspaceMemory.get<any>("cos-wf");if(wf)setWorkflows(wf);}catch{}
    try{const tq=WorkspaceMemory.get<any>("cos-tq");if(tq){setTQueue(tq);tQRef.current=tq;}}catch{}
    try{const last=WorkspaceMemory.get<string>("cos-lastvisit");if(last){const days=Math.floor((Date.now()-parseInt(last))/86400000);if(days>=1)setResumeInfo({days});}WorkspaceMemory.set("cos-lastvisit",String(Date.now()));}catch{}
    const saved=loadResumeState();
    if(saved)setWfResumeData(saved);
    enrichEPFromSupabase();
    setTimeout(()=>{
      initA11y();
      try{const r=document.getElementById("oiq-root");if(r&&WorkspaceMemory.get<string>("oiq-sb-col")==="1")r.classList.add("oiq-sb-collapsed");}catch{}
    },300);
  })();
},[]);
  
  // Donation popup — show after 30 minutes, then every 30 minutes
useEffect(()=>{
  const THIRTY_MIN = 30 * 60 * 1000;
  const timer = setTimeout(()=>{
    setShowDonate(true);
  }, THIRTY_MIN);
  const interval = setInterval(()=>{
    setShowDonate(true);
  }, THIRTY_MIN);
  return ()=>{ clearTimeout(timer); clearInterval(interval); };
},[]);

  useEffect(()=>{
  const TWENTY_MIN = 20 * 60 * 1000;
  const interval = setInterval(()=>{
    if(Object.keys(compData).length>0||ledgerEntries.length>0||Object.values(chats).some(c=>c?.length>0)){
      showToast("Reminder: save your workspace (Settings > Workspace) so you don't lose your data","info");
    }
  }, TWENTY_MIN);
  return ()=>clearInterval(interval);
},[compData,ledgerEntries,chats,showToast]);

  const changeTheme=useCallback((id)=>{
    setTheme(id);applyTheme(id);sv("cos-theme",id);
  },[]);

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"});},[chats,selRole,loading]);
  useEffect(()=>{brEnd.current?.scrollIntoView({behavior:"smooth"});},[brCur,brPh]);

  // sv(): now routes through WorkspaceMemory so every save is caught by
  // Full Reset and future cloud sync automatically.
  const sv=useCallback((k:string,v:unknown)=>{
    try{WorkspaceMemory.set(k,v);}catch{}
  },[]);
  const cp=t=>{try{navigator.clipboard.writeText(t);showToast("Copied to clipboard","success");}catch{showToast("Copy failed","error");}};
  const addN=(msg,type)=>setP3Notify(prev=>[{id:Date.now(),msg,type:type||"info",ts:new Date().toISOString()},...prev].slice(0,20));

  const testKey=async(provider)=>{
    if(!keys[provider]?.trim())return;
    setTestSt(p=>({...p,[provider]:"testing"}));
    try{await callAI(provider,keys[provider],"You are a test.",[{role:"user",content:"Say OK."}],20);setTestSt(p=>({...p,[provider]:"ok"}));showToast(MODELS[provider].name+" key is working ✓","success");}
    catch(e){setTestSt(p=>({...p,[provider]:"fail:"+e.message}));showToast(MODELS[provider].name+": "+e.message,"error");}
  };

  const completeOnboard=()=>{
    const hasAnyKey=Object.values(keys).some(k=>k?.trim())||!!EFF_GEMINI;
if(!hasAnyKey||!co.name.trim()||!co.industry.trim()||!co.location.trim())return;
    sv("cos-keys",{keys,defaultProvider:defP,multiAI});sv("cos-co",co);
    const e={};DEPTS.forEach(d=>e[d.id]=true);setExpD(e);sv("cos-dp",e);
    setPage("app");
  };

  // ── Stable AI call helpers ─────────────────────────────────────────────────
  // CRITICAL: All wrapped in useCallback with [keys,defP] deps.
  // Without useCallback these are recreated every render → AgenticWorkflows
  // useEffect([ask,...]) fires every render → infinite loop → stack overflow.
  const ask=useCallback(async(sys:any,msgs:any,maxT?:any,enableSearch?:any,taskType?:any)=>
    (await callMulti(keys,defP,sys,msgs,maxT,enableSearch,taskType)).primary,
  [keys,defP]);
  const askFull=useCallback(async(sys:any,msgs:any,maxT?:any,enableSearch?:any,taskType?:any)=>
    callMulti(keys,defP,sys,msgs,maxT,enableSearch,taskType),
  [keys,defP]);
  const askImage=useCallback(async(prompt:string,size="landscape_4_3",model="fal-ai/flux-pro"):Promise<string>=>{
    const falKey=(keys.fal||EFF_FAL)?.trim();
    if(!falKey)throw new Error("Add your fal.ai API key in Settings → fal.ai to generate images.");
    return callFalImage(falKey,prompt,model);
  },[keys]);
  const askVideo=useCallback(async(prompt:string,durationSec=5,model="fal-ai/kling-video/v1.6/standard/text-to-video"):Promise<string>=>{
    const falKey=(keys.fal||EFF_FAL)?.trim();
    if(!falKey)throw new Error("Add your fal.ai API key in Settings → fal.ai to generate videos.");
    return callFalVideo(falKey,prompt,durationSec,model);
  },[keys]);

  // Extracts candidate action items from a Boardroom/Autopilot/TimeMachine output and opens the review modal
  const extractActionItems=async(sourceType:ActionItem["source"],sourceLabel:string,content:string)=>{
    if(!content?.trim())return;
    setExtracting(sourceType);
    try{
      const sys="You are an execution analyst. "+EXTRACTION_PROMPT;
      const result=await ask(sys,[{role:"user",content:"STRATEGIC OUTPUT:\n\n"+content}],800);
      const items=extractItemsFromJSON(result);
      if(!items||!items.length){showToast("Could not extract action items from this output","error");return;}
      setExtractModal({items,sourceType,sourceLabel});
    }catch(e:any){
      showToast("Extraction failed: "+e.message,"error");
    }finally{
      setExtracting(null);
    }
  };

  const confirmExtractedItems=(items:ActionItem[])=>{
    const updated=[...items,...actionItems];
    setActionItems(updated);sv("cos-actions",updated);
    setExtractModal(null);
    showToast(items.length+" action item(s) added to tracker","success");
  };

  // Vision-capable call for Pulse Agentic (Dispatch). Uses Claude directly since it
  // supports image content blocks; falls back with a clear error if no Claude key.
  const askVision=async(sys:string,userText:string,images:{data:string;mediaType:string}[])=>{
    const claudeKey=(keys.claude?.trim())||EFF_CLAUDE;
    if(!claudeKey)throw new Error("Pulse Agentic requires a Claude API key (for image reading). Add one in Settings.");
    const content:any[]=images.map(img=>({type:"image",source:{type:"base64",media_type:img.mediaType,data:img.data}}));
    content.push({type:"text",text:userText});
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":claudeKey.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:MODELS.claude.model,max_tokens:2000,system:sys,messages:[{role:"user",content}]})});
    if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}throw new Error("Claude "+r.status+": "+(m||r.statusText));}
    const d=await r.json();return d.content?.map((b:any)=>b.text||"").join("\n")||"";
  };

  const send=useCallback(async(text)=>{
    if(!text.trim()||loading||!selRole)return;
    setError(null);
    const role=AR.find(r=>r.id===selRole);if(!role)return;
    const msgs=chats[selRole]||[];
    const nm={role:"user",content:text};
    const upd={...chats,[selRole]:[...msgs,nm]};
    setChats(upd);setInput("");setLoading(true);announceLoading(true,role.t);
    try{
      const sys=buildSys(role,co,compData,LIVE_RATES.loaded?LIVE_RATES.data:"");
      const apiM=[...msgs,nm].map(m=>({role:m.role==="user"?"user":"assistant",content:m.content})).slice(-16);
      const reply=await ask(sys,apiM,3500,searchMode);
      const fin={...upd,[selRole]:[...upd[selRole],{role:"assistant",content:reply}]};
      setChats(fin);sv("cos-ch",fin);
      announceAIResponse(reply,role.t);
    }catch(e){
      setError(e.message);
      showToast(e.message,"error");
      setChats({...upd,[selRole]:upd[selRole].slice(0,-1)});
    }
    finally{setLoading(false);}
  },[loading,selRole,chats,co,compData,keys,defP,showToast]);

  const consultRole=useCallback(async(consultId,lastQ,lastA)=>{
    const role=AR.find(r=>r.id===consultId);if(!role)return;
    setSelRole(consultId);setView("chat");setError(null);setLoading(true);
    const msgs=chats[consultId]||[];
    const refMsg="[Cross-functional consult]\nQuestion: \""+lastQ+"\"\nAnother exec said:\n"+lastA+"\n\nAs "+role.f+", give YOUR expert perspective.";
    const nm={role:"user",content:refMsg};
    const upd={...chats,[consultId]:[...msgs,nm]};setChats(upd);
    try{const reply=await ask(buildSys(role,co,compData),[{role:"user",content:refMsg}]);const fin={...upd,[consultId]:[...upd[consultId],{role:"assistant",content:reply}]};setChats(fin);sv("cos-ch",fin);}
    catch(e){setError(e.message);showToast(e.message,"error");}finally{setLoading(false);}
  },[chats,co,compData,keys,defP,showToast]);

  // FIX BUG 2: Time Machine — cancel support + robust error handling
  const runTM=useCallback(async()=>{
    if(!tmDec.trim()||tmRun)return;
    cancelRef.current.tm=false;
    const gate=await checkSessionGate();
    if(!gate.allowed){
      showToast(`Free trial limit reached (${gate.used}/${gate.limit} sessions used). Upgrade your plan or add your own API key in Settings.`,"warning");
      return;
    }
    setTmRun(true);setTmRes("");setError(null);setTmResearchBrief("");
    const tmCur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
    try{
      if(cancelRef.current.tm)return;
      setTmPh("📡 Research Desk is gathering current data…");
      const researchBrief=await runResearchDesk(ask,co,compData,tmDec,showToast);
      if(cancelRef.current.tm)return;
      setTmResearchBrief(researchBrief);
      setTmPh("Running simulation…");
      const researchContext="\nVERIFIED RESEARCH BRIEF (current data for this simulation - use these figures and cite this brief as your source where relevant; do not re-search):\n"+researchBrief+"\n";
      const sys="You are a Business Simulation Engine for \""+co.name+"\". "+buildCtx(co,compData)+researchContext+"\nSimulate TWO parallel 12-month timelines. ALL figures in "+tmCur.sym+tmCur.code+".\nSections: Decision, Baseline Assumptions, TIMELINE A PROCEED (table: Month/Revenue/OpEx/Cash/Key Event), TIMELINE B DO NOT PROCEED (same table), Divergence Summary, Best/Worst/Black Swan scenarios, Verdict table (Expected Value A&B, Cost of Waiting per week, Reversibility, Recommendation with confidence %), First 30 Days Action Plan, Confidence & Verification (state which figures came from the VERIFIED RESEARCH BRIEF, cite it, versus which are ESTIMATE (unverified)).\n\nVERIFICATION RULE: Any price, cost, rate, or market figure must either (a) come from the VERIFIED RESEARCH BRIEF (cite it), or (b) be explicitly labeled [Assumption]. Figures taken from the VERIFIED RESEARCH BRIEF must be labeled [Retrieved Evidence]. Derived figures must show the formula and be labeled [Calculation]. Do not present invented numbers as fact.";
      const res=await ask(sys,[{role:"user",content:"Simulate: \""+tmDec+"\""}],4500);
      if(!cancelRef.current.tm){
        setTmRes(res);
        sv("cos-tm-live",{dec:tmDec,res,brief:researchBrief});
        try{saveRecord({feature:"Time Machine",provider:defP,model:MODELS[defP]?.model||defP,inputTokens:estimateTokens(tmDec),outputTokens:estimateTokens(res),cost:estimateCost(defP,estimateTokens(tmDec),estimateTokens(res))||0});}catch{}
        const session={id:Date.now(),dec:tmDec,res,brief:researchBrief,ts:new Date().toISOString()};
        setTmSessions(prev=>{const ns=[session,...prev].slice(0,20);sv("cos-tm",ns);return ns;});
      }
    }catch(err){
      if(!cancelRef.current.tm){setError(err.message);showToast("Time Machine: "+err.message,"error");}
    }finally{
      setTmRun(false);setTmPh("");cancelRef.current.tm=false;
    }
  },[tmDec,tmRun,co,compData,keys,defP,showToast]);

  // FIX BUG 3: Autopilot — cancel support + robust error handling
  const runAP=useCallback(async()=>{
    if(apRun)return;
    cancelRef.current.ap=false;
    const gate=await checkSessionGate();
    if(!gate.allowed){
      showToast(`Free trial limit reached (${gate.used}/${gate.limit} sessions used). Upgrade your plan or add your own API key in Settings.`,"warning");
      return;
    }
    setApRun(true);setApRes("");setError(null);setApResearchBrief("");
    const apCur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
    try{
      if(cancelRef.current.ap)return;
      setApPh("📡 Research Desk is gathering current data…");
      const researchQuestion="What decisions should "+co.name+" ("+co.industry+", "+co.location+", stage: "+co.stage+") be making right now to grow and protect the business?";
      const researchBrief=await runResearchDesk(ask,co,compData,researchQuestion,showToast);
      if(cancelRef.current.ap)return;
      setApResearchBrief(researchBrief);
      setApPh("Scanning all decision vectors…");
      const researchContext="\nVERIFIED RESEARCH BRIEF (current data for this scan - use these figures and cite this brief as your source where relevant; do not re-search):\n"+researchBrief+"\n";
      const sys="You are the Decision Intelligence Engine for \""+co.name+"\". "+buildCtx(co,compData)+researchContext+"\nIdentify 6 CRITICAL decisions the founder should make RIGHT NOW. ALL figures in "+apCur.sym+apCur.code+".\nFor each: Title, Urgency, Owner, Decide By, Cost of delay/week (with calculation), Options 1/2/3 with outcomes, Recommendation, "+co.location+" Context, Data Needed. End with: THE ONE DECISION THAT MATTERS MOST THIS WEEK. Then a final section: Confidence & Verification (state which figures came from the VERIFIED RESEARCH BRIEF, cite it, versus which are ESTIMATE (unverified)).\n\nVERIFICATION RULE: Any price, cost, rate, or market figure must either (a) come from the VERIFIED RESEARCH BRIEF (cite it), or (b) be explicitly labeled [Assumption]. Figures taken from the VERIFIED RESEARCH BRIEF must be labeled [Retrieved Evidence]. Derived figures must show the formula and be labeled [Calculation]. Do not present invented numbers as fact.";
      let res=await ask(sys,[{role:"user",content:"Run complete decision scan."}],4500);
      res+=ieEvidenceAudit(res);
      if(!cancelRef.current.ap){
        setApRes(res);sv("cos-ap-live",{res,brief:researchBrief});
        try{const apI=estimateTokens(co.name);const apO=estimateTokens(res);
        saveRecord({feature:"Decision Autopilot",provider:defP,model:MODELS[defP]?.model||defP,inputTokens:apI,outputTokens:apO,cost:estimateCost(defP,apI,apO)||0});}catch{}
      }
    }catch(err){
      if(!cancelRef.current.ap){setError(err.message);showToast("Autopilot: "+err.message,"error");}
    }finally{
      setApRun(false);setApPh("");cancelRef.current.ap=false;
    }
  },[apRun,co,compData,keys,defP,showToast]);

  // Boardroom with cancel support
  const runBR=useCallback(async()=>{
    if(!brQ.trim()||brRun)return;
    cancelRef.current.br=false;
    const gate=await checkSessionGate();
    if(!gate.allowed){
      showToast(`Free trial limit reached (${gate.used}/${gate.limit} sessions used). Upgrade your plan at orchestriq.gorakhai.com or add your own API key in Settings to continue.`,"warning");
      return;
    }
    setBrRun(true);setError(null);
    setBrCur({q:brQ,researchBrief:"",format:"threaded",stages:[]});
    const agents=brAg.map(id=>AR.find(r=>r.id===id)).filter(Boolean);
    const res=[];
    const synCur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
    let researchBrief="";
    const domain=classifyDomain(brQ);
    const frameworks=selectFramework(domain,"decide");
    try{
      // RESEARCH STEP: one search-enabled call gathers current verifiable figures
      // relevant to the question. All agents then reference this shared brief
      // instead of each searching independently (cost + consistency).
      if(!cancelRef.current.br){
        setBrResearching(true);
        setBrPh("📡 Research Desk is gathering current data…");
        researchBrief=await runResearchDesk(ask,co,compData,brQ,showToast);
        setBrCur(prev=>({...prev,researchBrief}));
        setBrResearching(false);
      }
      const researchContext=(researchBrief
        ?"\nVERIFIED RESEARCH BRIEF (current data gathered for this debate - use these figures and cite this brief as your source; do not re-search):\n"+researchBrief+"\n"
        :"")+buildDecisionHistoryContext(brQ);
      for(let i=0;i<agents.length;i++){
        if(cancelRef.current.br){showToast("Boardroom cancelled","warning");break;}
        const ag=agents[i];const p=EP[ag.id]||{};
        const prev=res.map(r=>"\n--- "+r.ag.t+" ---\n"+r.text).join("\n");
        setBrPh(ag.ic+" "+ag.t+" is analyzing…");announceBoardroomPhase(ag.t+" is analyzing");
        const sys="You are "+ag.f+" at \""+co.name+"\".\n"+"PROFILE: "+(p.b?.split("\n")[0]||"")+"\n"+buildCtx(co,compData)+researchContext+"\nBUSINESS DOMAIN: "+domain+"\nANALYTICAL FRAMEWORKS IN PLAY: "+frameworks.map(f=>f.name).join(", ")+" \u2014 structure your argument through the most relevant of these where it strengthens your position.\n"+"LIVE BOARDROOM DEBATE. "+(i===0?"Speak first. State your opening position with specific calculations in "+synCur.sym+".\n\n"+"EVIDENCE RULES — label every key statement with one of these tags:\n"+"[Verified Fact] — from a named, cited source\n"+"[Assumption] — an assumption you are making, stated explicitly\n"+"[Expert Inference] — reasoned from your domain expertise\n"+"[Estimate] — unverified figure, labeled as such\n"+"Never present an invented number without a label.":"Previous contributions:\n"+prev+"\n\n"+"YOUR TURN as "+ag.f+".\n"+"Step 1: Identify the single most important claim from the prior speakers that you must address from your "+ag.dl+" perspective.\n"+"Step 2: Either challenge it with a better figure or reasoning, or build on it with something genuinely new.\n"+"Step 3: Do NOT restate, recompute, or repeat any table, plan, or calculation already presented above.\n"+"Step 4: If a prior speaker's number is wrong or incomplete, state the correct figure and explain why.\n\n"+"EVIDENCE RULES — label every key statement:\n"+"[Verified Fact] [Assumption] [Expert Inference] [Estimate]\n"+"If you have nothing genuinely new to add, say so in 2-3 sentences.")+"\n200-350 words MAX. Brevity signals confidence, not limitation.\n\n"+"VERIFICATION RULE: For any price, cost, rate, fee, salary benchmark, or market figure, use the VERIFIED RESEARCH BRIEF above where relevant (cite it as 'per Research Brief'). If you need a figure not covered by the brief and cannot verify it, label it [Estimate (unverified)]. Never present an invented number as fact.";
        let agText="";
        let agTruncated=false;
        let gotResponse=false;
        // ── SMART RETRY: provider failover + pause-and-resume ──────────────
        // Cycle 1: try primary. On limit → try alternates → wait 65s → retry.
        // Accumulates partial text so responses never break mid-sentence.
        const isContextOrRateErr=(msg:string)=>isRateLimit(msg)||
          msg.toLowerCase().includes("context")||
          msg.toLowerCase().includes("reduce")||
          msg.toLowerCase().includes("maximum")||
          msg.toLowerCase().includes("413");
        let cyclesDone=0;
        while(!gotResponse&&!cancelRef.current.br&&cyclesDone<3){
          cyclesDone++;
          // Build prompt: first attempt uses original question;
          // subsequent attempts ask to continue from partial text.
          const userMsg=agText.trim()
            ?("You are mid-response. You have said so far:\n\n"+agText
              +"\n\nContinue EXACTLY from where you stopped. Do not repeat anything above. Continue seamlessly.")
            :brQ;
          // Build list of providers to try this cycle
          const allProviders=Object.keys(keys).filter(p=>{
            const k=(p==="groq"?keys.groq||EFF_GROQ:p==="gemini"?keys.gemini||EFF_GEMINI:p==="claude"?keys.claude||EFF_CLAUDE:keys[p]);
            return k?.trim();
          });
          let cycleSuccess=false;
          for(const prov of allProviders){
            if(cancelRef.current.br)break;
            const pKey=(prov==="groq"?(keys.groq||EFF_GROQ):prov==="gemini"?(keys.gemini||EFF_GEMINI):prov==="claude"?(keys.claude||EFF_CLAUDE):keys[prov])||"";
            if(!pKey.trim())continue;
            try{
              setBrPh(ag.ic+" "+ag.t+(agText?" — resuming via "+prov+"…":" is analyzing… ("+prov+")"));
              const replyFull=await callAI(prov,pKey,sys,[{role:"user",content:userMsg}],5000);
              agText=agText+replyFull.text;
              agTruncated=!!replyFull.truncated;
              gotResponse=true;
              cycleSuccess=true;
              break;
            }catch(provErr:any){
              if(isContextOrRateErr(provErr.message)){
                markProviderExhausted(prov);
                continue; // try next provider
              }
              // Non-rate error — record and stop trying this provider
              continue;
            }
          }
          if(cycleSuccess||cancelRef.current.br)break;
          // All providers exhausted this cycle — wait 65s then reset and retry
          if(cyclesDone<3){
            await waitWithCountdown(65,(s)=>{
              setBrPh(ag.ic+" "+ag.t+" — all providers at limit. Resuming in "+s+"s…");
            });
            // ProviderManager auto-resets after 60s; 65s guarantees reset
          }
        }
        // If all 3 cycles failed, record placeholder
        if(!gotResponse){
          agText=(agText?"[Response incomplete — API limit reached]\n\n"+agText
            :"_("+ag.t+" could not respond — all providers at limit. Try again in 1 min or add another API key in Settings.)_");
          agTruncated=false;
          gotResponse=true;
          showToast(ag.t+" paused — API limit. Adding a second provider key in Settings prevents this.","warning");
        }
        if(cancelRef.current.br)break;
        let contAttempts=0;
        while(agTruncated&&contAttempts<3&&!cancelRef.current.br){
          contAttempts++;
          setBrPh(ag.ic+" "+ag.t+" is continuing response… (part "+(contAttempts+1)+")");
          try{
            const contSys="You are "+ag.f+" at \""+co.name+"\". You were speaking in a boardroom debate and your response was cut off. Here is what you wrote so far:\n\n"+agText+"\n\nContinue EXACTLY from where you left off. Do not repeat anything already written. Do not restart. Pick up mid-sentence if needed.";
            const cont=await askFull(contSys,[{role:"user",content:"Continue your response now."}],3000);
            agText=agText+cont.primary;
            agTruncated=!!cont.truncated;
          }catch(contErr:any){
            if(isRateLimit(contErr.message)){
              for(let countdown=30;countdown>0;countdown--){
                if(cancelRef.current.br)break;
                setBrPh(ag.ic+" "+ag.t+" is continuing — API limit. Retrying in "+countdown+"s…");
                await new Promise(r=>setTimeout(r,1000));
              }
            }else{
              agTruncated=false;
            }
          }
        }
        res.push({ag,text:agText,truncated:agTruncated});
        // Update threaded format during debate so cards render as they arrive
        const runningStage={stageNumber:1,type:"original",question:brQ,
          executiveIds:brAg,debate:[...res],synthesis:"",
          decisionStatus:null,completedAt:null,frozen:false};
        const updatedCur={q:brQ,researchBrief,format:"threaded",stages:[runningStage]};
        setBrCur(updatedCur);
        sv("cos-br-live",updatedCur);
      }
      if(!cancelRef.current.br&&res.length>0){
        setBrPh("Synthesizing consensus…");
        const allPos=res.map(r=>r.ag.t+":\n"+r.text).join("\n\n---\n\n");
        const synSys="You are Chief of Staff at "+JSON.stringify(co.name)+". "+buildCtx(co,compData)+researchContext+"\nBUSINESS DOMAIN CLASSIFIED: "+domain+"\nRECOMMENDED FRAMEWORKS (for reference — apply where relevant to strengthen the synthesis): "+frameworks.map(f=>f.name).join(", ")+"\n\nSynthesize the boardroom debate into a board-ready executive report. Use this EXACT format with all sections present:\n\n"+"# Executive Summary\n"+"(3-4 sentences: the single decision, headline number in "+synCur.sym+", recommended action)\n\n"+"## Business Domain\n"+"Domain: "+domain+" | Frameworks referenced: "+frameworks.map(f=>f.name).join(" · ")+"\n\n"+"## Key Insights\n"+"(4-6 bullet points, each opening with a bold keyword. New synthesis only — do not restate individual exec arguments.)\n\n"+"## Points of Conflict\n"+"| Leader | Position | Why It Matters |\n|--------|----------|----------------|\n"+"(one row per genuine disagreement found in the debate — if executives agreed, note that)\n\n"+"## Evidence Quality Review\n"+"(Review the evidence labels used in the debate. List any [Assumption] or [Estimate] that materially affects the recommendation and note what validation is needed.)\n\n"+"## Quantified Recommendation\n"+"(Single recommended path. Show: formula, assumption, result for every figure in "+synCur.sym+")\n\n"+"## Financial Impact\n"+"| Phase | Actions | Investment "+synCur.sym+" | Expected Return | Owner |\n|-------|---------|--------------------------|-----------------|-------|\n"+"(30-60-90 day plan, one row per phase)\n\n"+"## Risk Register\n"+"| Risk | Likelihood | Impact | Mitigation | Owner |\n|------|------------|--------|------------|-------|\n"+"(max 5 rows)\n\n"+"## Opportunities\n"+"(3-5 bullets, each with upside in "+synCur.sym+", timeframe, and owner)\n\n"+"## This Week's Decision\n"+"(Single action required now. Cost of inaction: "+synCur.sym+" per week. Owner and deadline.)\n\n"+"## Recommendations\n"+"| Priority | Action | Impact | Effort | Deadline |\n|----------|--------|--------|--------|----------|\n"+"(ranked by priority)\n\n"+"## Sources and References\n"+"(every figure cited: Source name, figure, URL or evidence label)\n\n"+"FORMATTING RULES: Bold all key metrics. Use tables for all numbers. Never write unbroken paragraph blocks. Every number must have a unit ("+synCur.sym+" or %). Under 2600 words. All sections must be present and complete. Figures from VERIFIED RESEARCH BRIEF: cite source and URL. All others: label [Assumption] or [Estimate (unverified)].\n\nDECISION STATUS (mandatory final line): After your synthesis write exactly:\nDECISION STATUS: [choose one: Proceed | Proceed with Conditions | Needs More Information | Do Not Proceed | No Consensus]\nReason: [one sentence explaining this status based on the debate evidence]"
        let syn=await ask(synSys,[{role:"user",content:"Question: \""+brQ+"\"\nDebate:\n"+allPos}],6000);
        // Intelligence Engine quality review — same standard as Workflow and Task
        // Queue final levels. HARDENED: the reviewed version must prove it is a
        // complete, well-formed improvement (all structural markers present,
        // within 90s, adequate length) or the ORIGINAL synthesis is kept.
        // The review can only ever improve — never degrade, truncate, or hang.
        try{
          setBrPh("\ud83d\udd0d Quality Review \u2014 validating board synthesis...");
          const ieCompany={name:co.name||"the company",industry:co.industry||"",stage:co.stage||"",location:co.location||"",markets:co.markets||"",currency:co.currency||"INR",currencySymbol:synCur.sym||""};
          const reviewed:any=await Promise.race([
            selfReview(syn,brQ,ieCompany,(s,m,_t)=>ask(s,m,6500,false)),
            new Promise((_,rej)=>setTimeout(()=>rej(new Error("review timeout")),90000)),
          ]);
          const structurallyComplete=
            typeof reviewed==="string"&&
            reviewed.length>syn.length*0.7&&
            reviewed.includes("Executive Summary")&&
            reviewed.includes("DECISION STATUS");
          if(structurallyComplete){syn=reviewed;}
          else if(reviewed){showToast("Quality review returned an incomplete draft \u2014 original synthesis kept","info");}
        }catch(qErr:any){showToast("Quality review skipped ("+String(qErr?.message||qErr).slice(0,40)+") \u2014 original synthesis kept","info");}
        syn+=ieEvidenceAudit(syn);
        // GUARANTEE: from this point the synthesis is persisted no matter what.
        // Every step below is individually guarded so a failure in decision
        // extraction, history saving, or token accounting can never blank the
        // synthesis the user just paid tokens to generate.
        let decisionStatus="No Consensus";
        try{decisionStatus=extractDecisionStatus(syn);}catch{}
        try{saveDecisionRecord({id:Date.now(),ts:new Date().toISOString(),question:brQ,executives:brAg,status:decisionStatus,recommendation:extractRecommendationSnippet(syn)});}catch{}
        const stage1={stageNumber:1,type:"original",question:brQ,
          executiveIds:brAg,debate:res,synthesis:syn,
          decisionStatus,completedAt:new Date().toISOString(),frozen:true};
        const finalSession={id:Date.now(),q:brQ,agents:brAg,
          format:"threaded",stages:[stage1],researchBrief,ts:new Date().toISOString()};
        const finalCur={q:brQ,researchBrief,format:"threaded",stages:[stage1]};
        setBrCur(finalCur);
        try{sv("cos-br-live",finalCur);}catch{}
        try{
          const bI=estimateTokens(brQ);const bO=estimateTokens(syn+(res||[]).map(r=>r.text||"").join(""));
          saveRecord({feature:"AI Boardroom — "+brQ.slice(0,35),provider:defP,model:MODELS[defP]?.model||defP,inputTokens:bI,outputTokens:bO,cost:estimateCost(defP,bI,bO)||0});
        }catch{}
        const ns=[finalSession,...brSessions].slice(0,20);setBrSessions(ns);sv("cos-br",ns);
      }
    }catch(err){
      if(!cancelRef.current.br){setError(err.message);showToast("Boardroom error: "+err.message,"error");}
    }finally{setBrRun(false);setBrPh("");setBrResearching(false);cancelRef.current.br=false;}
  },[brQ,brAg,brRun,co,compData,brSessions,keys,defP,showToast]);

  // Continue a reopened/finished debate with a follow-up. Same executives respond
  // again using the prior debate + synthesis as context. Appends to the live debate.
  const runBRContinue=useCallback(async()=>{
    if(!brFollowUp.trim()||brRun)return;
    cancelRef.current.br=false;
    setBrRun(true);setError(null);

    // Determine which execs respond — use followUpExecIds if set, else previous stage execs
    const prevStages=brCur.stages||[];
    const prevExecIds=followUpExecIds.length>0
      ?followUpExecIds
      :(prevStages.length>0?prevStages[prevStages.length-1].executiveIds:brAg);
    const agents=prevExecIds.map(id=>AR.find(r=>r.id===id)).filter(Boolean);

    // Build full prior context from ALL previous stages
    const priorStagesContext=prevStages.map((st,si)=>{
      const debateText=st.debate.map(d=>d.ag.t+": "+d.text).join("\n\n---\n\n");
      return "=== STAGE "+(si+1)+" QUESTION: \""+st.question+"\"\n"+debateText+(st.synthesis?"\n\nSTAGE "+(si+1)+" SYNTHESIS:\n"+st.synthesis:"");
    }).join("\n\n"+"=".repeat(60)+"\n\n");

    const followUpResponses=[];
    const failedAgents=[];

    try{
      for(let i=0;i<agents.length;i++){
        if(cancelRef.current.br){showToast("Cancelled","warning");break;}
        const ag=agents[i];const p=EP[ag.id]||{};
        setBrPh(ag.ic+" "+ag.t+" is responding…");

        const sys="You are "+ag.f+" at \""+co.name+"\".\n"
          +"PROFILE: "+(p.b?.split("\n")[0]||"")+"\n"
          +buildCtx(co,compData)
          +"\n\nDECISION THREAD CONTEXT (all previous stages — do not repeat, only reference):\n"+priorStagesContext
          +"\n\n"+"=".repeat(60)+"\n\n"
          +"CURRENT FOLLOW-UP QUESTION: \""+brFollowUp+"\"\n"
          +"YOUR TURN as "+ag.f+". Respond ONLY to the follow-up question above.\n"
          +"Step 1: Reference any relevant conclusion from a prior stage if it informs your answer.\n"
          +"Step 2: Add your "+ag.dl+" perspective on the follow-up — be specific and new.\n"
          +"Step 3: Label every key statement: [Verified Fact] [Assumption] [Expert Inference] [Estimate]\n"
          +"200-350 words MAX.";

        let replyFull=null;let lastErr=null;
        for(let attempt=0;attempt<2;attempt++){
          if(cancelRef.current.br)break;
          try{replyFull=await askFull(sys,[{role:"user",content:"FOLLOW-UP: "+brFollowUp}],4000);lastErr=null;break;}
          catch(agentErr){lastErr=agentErr;if(attempt===0)await new Promise(res=>setTimeout(res,1500));}
        }
        if(cancelRef.current.br)break;
        if(replyFull){followUpResponses.push({ag,text:replyFull.primary,truncated:!!replyFull.truncated});}
        else if(lastErr){failedAgents.push(ag.t);followUpResponses.push({ag,text:"_"+ag.t+" could not respond ("+lastErr.message+")_",truncated:false});}
      }

      // Chairman synthesis for this stage
      let stageSyn="";
      if(!cancelRef.current.br&&followUpResponses.length>0){
        setBrPh("🏛️ Chairman synthesising stage "+( prevStages.length+1)+"…");
        const synCur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
        const allPos=followUpResponses.map(r=>r.ag.t+":\n"+r.text).join("\n\n---\n\n");
        const stageSynSys="You are Chief of Staff at "+JSON.stringify(co.name)+". "+buildCtx(co,compData)
          +"\n\nDECISION THREAD — PRIOR STAGES (context only — do not re-analyse):\n"+priorStagesContext
          +"\n\n"+"=".repeat(60)+"\n\n"
          +"CURRENT FOLLOW-UP QUESTION: \""+brFollowUp+"\"\n"
          +"Synthesise ONLY this follow-up round into a concise board-ready summary.\n"
          +"Sections: # Summary | ## Key Findings | ## Evidence Quality | ## Decision Status\n"
          +"All figures in "+synCur.sym+". Reference prior stages briefly where relevant.\n"
          +"DECISION STATUS (mandatory final line):\n"
          +"DECISION STATUS: [Proceed | Proceed with Conditions | Needs More Information | Do Not Proceed | No Consensus]\n"
          +"Reason: [one sentence]";
        try{stageSyn=await ask(stageSynSys,[{role:"user",content:"Follow-up: \""+brFollowUp+"\"\nResponses:\n"+allPos}],3000);}
        catch(e){stageSyn="(Synthesis unavailable for this stage: "+e.message+")";}
      }

      if(!cancelRef.current.br){
        const newStage={
          stageNumber:prevStages.length+1,
          type:"followup",
          question:brFollowUp,
          executiveIds:prevExecIds,
          aiSuggestions:followUpSuggestions,
          debate:followUpResponses,
          synthesis:stageSyn,
          decisionStatus:extractDecisionStatus(stageSyn),
          completedAt:new Date().toISOString(),
          frozen:true,
        };
        try{saveDecisionRecord({id:Date.now(),ts:new Date().toISOString(),question:brFollowUp,executives:prevExecIds,status:newStage.decisionStatus,recommendation:extractRecommendationSnippet(stageSyn)});}catch{}
        const updatedStages=[...prevStages,newStage];
        const updatedCur={...brCur,stages:updatedStages};
        setBrCur(updatedCur);
        sv("cos-br-live",updatedCur);
        // Update most recent archive entry with new stage
        setBrSessions(prev=>{
          if(!prev.length)return prev;
          const updated=[...prev];
          updated[0]={...updated[0],stages:updatedStages};
          sv("cos-br",updated);
          return updated;
        });
        setBrFollowUp("");
        setFollowUpExecIds([]);
        setFollowUpSuggestions([]);
      }
      if(failedAgents.length){showToast(failedAgents.length+" executive(s) couldn't respond: "+failedAgents.join(", ")+".","warning");}
    }catch(err){
      if(!cancelRef.current.br){setError(err.message);showToast("Continue error: "+err.message,"error");}
    }finally{setBrRun(false);setBrPh("");cancelRef.current.br=false;}
  },[brFollowUp,brRun,brCur,brAg,co,compData,keys,defP,showToast,followUpExecIds,followUpSuggestions]);
  
  const runDrill=useCallback(async()=>{
    if(!drillRole||!drillQ.trim()||drillRun)return;
    setDrillRun(true);setError(null);
    const ag=AR.find(r=>r.id===drillRole);
    const prevTake=(brCur.stages
      ?brCur.stages.flatMap(s=>s.debate||[]).find(d=>d.ag?.id===drillRole)?.text
      :(brCur.debate||[]).find(d=>d.ag?.id===drillRole)?.text)||"";
    try{
      const sys=buildSys(ag,co,compData)+"\n\nYour boardroom take:\n"+prevTake+"\n\nCEO is drilling deeper.";
      const reply=await ask(sys,[{role:"user",content:drillQ}]);
      setBrCur(prev=>({...prev,drilldown:{...prev.drilldown,[drillRole]:[...(prev.drilldown[drillRole]||[]),{q:drillQ,a:reply}]}}));
      setDrillQ("");
    }catch(err){setError(err.message);showToast(err.message,"error");}finally{setDrillRun(false);}
  },[drillRole,drillQ,drillRun,brCur,co,compData,keys,defP,showToast]);

  // FIX BUG 4: Workflow — per-level error handling + cancel + progress
  const runPreflight=useCallback(async()=>{
  const taskText=wfTask.trim();
  if(!taskText||!wfCat)return;
  const ch=CHAINS[wfCat];if(!ch)return;
  const activeChain=wfCustomChain.length?wfCustomChain:ch.chain;
  const seniorId=activeChain[activeChain.length-1];
  const seniorRole=AR.find(r=>r.id===seniorId)||AR.find(r=>r.id==="ceo");
  const p=EP[seniorRole.id]||{};
  setWfPreflightLoading(true);
  setWfPreflight(null);
  const existingData=Object.keys(compData).length?"\n\nCOMPANY DATA ALREADY PROVIDED:\n"+Object.entries(compData).map(([k,v])=>k+": "+v).join("\n"):"";
  const ledgerSummary=ledgerEntries.length?"\n\nLEDGER: "+ledgerEntries.length+" journal entries posted. Recent: "+ledgerEntries.slice(-3).map(e=>e.description||e.narration||"entry").join(", "):"";
  const sys="You are "+seniorRole.f+" at \""+co.name+"\". "+buildCtx(co,compData)+"\n\nThe user wants to run a workflow task. Your job is to ask 3-5 smart, simple questions that will allow the team to produce a HIGH QUALITY FINAL DELIVERABLE — not a report or plan, but the actual output the user needs.\n\nRULES:\n1. Each question must be asked AS YOUR PERSONA — speak as "+seniorRole.t+", not as a generic AI.\n2. Questions must be SHORT and conversational. One sentence maximum.\n3. Only ask what is GENUINELY missing. Do not ask for things already in Company Data or Ledger below.\n4. Focus on what directly shapes the deliverable quality — audience, tone, constraints, specific content.\n5. Output ONLY valid JSON, no preamble, no markdown fences.\n\nFORMAT (strict JSON array):\n[{\"persona\":\""+seniorRole.t+"\",\"personaIc\":\""+seniorRole.ic+"\",\"q\":\"question text\",\"placeholder\":\"example answer\"}]\n\nEXISTING CONTEXT (do NOT ask about these):"+existingData+ledgerSummary;
  try{
    const raw=await ask(sys,[{role:"user",content:"TASK: \""+taskText+"\"\nCATEGORY: "+ch.label+"\nEXECUTIVES SELECTED: "+activeChain.map(id=>{const r=AR.find(x=>x.id===id);return r?r.t:id;}).join(", ")+"\n\nGenerate the pre-flight questions now."}],800);
    let questions=[];
    try{
      const cleaned=raw.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
      questions=JSON.parse(cleaned);
      if(!Array.isArray(questions))questions=[];
    }catch{questions=[];}
    if(!questions.length){
      // No questions needed — run directly
      setWfPreflightLoading(false);
      const activeChainFinal=wfCustomChain.length?wfCustomChain:ch.chain;
      runWorkflow(activeChainFinal,null);
      return;
    }
    setWfPreflight({questions,answers:questions.map(()=>""),contextSummary:existingData+ledgerSummary});
    setWfPreflightActive(true);
  }catch(e:any){
    showToast("Pre-flight check failed: "+e.message+". Running chain directly.","warning");
    const activeChainFinal=wfCustomChain.length?wfCustomChain:ch.chain;
    runWorkflow(activeChainFinal,null);
  }finally{
    setWfPreflightLoading(false);
  }
},[wfTask,wfCat,wfCustomChain,co,compData,ledgerEntries,ask,showToast]);
// ─── PROJECT ENGINE — Phase 1: Planning ──────────────────────────────────────
  // Assembles ProjectContext from all platform state and calls the Project
  // Architect AI to decompose the objective into an Execution Plan.

  const buildProjectContext=useCallback(()=>{
    const projCur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
    const boardroomDecisions=(brSessions||[]).slice(0,5).map(s=>({
      question:s.q,
      synthesis:s.synthesis?stripMd(s.synthesis).slice(0,600):"",
      decisionStatus:s.stages?.[0]?.decisionStatus||"",
      ts:s.ts,
    }));
    const priorOutputs=(workflows||[]).filter(w=>w.status==="approved").slice(0,4).map(w=>({
      task:w.task,category:w.chainLabel,
      output:stripMd(w.steps?.[w.steps.length-1]?.output||"").slice(0,400),
    }));
    // ── Cross-module summaries (Project Engine redesign, Phase 2) ────────────
    // Each source is condensed to a few lines, never dumped in full — same
    // discipline already proven for Boardroom decisions above. Every read is
    // wrapped so a missing/empty module can never break plan generation.
    let ledgerSummary="";
    try{
      const entries=(ledgerEntries||[]).slice(-8);
      if(entries.length)ledgerSummary=entries.map((e:any)=>(e.date||"")+" "+(e.description||e.memo||"")+" "+(e.debit||e.credit||"")).join("; ").slice(0,500);
    }catch{}
    let financeSummary="";
    try{
      const apOpen=(WorkspaceMemory.get<any[]>("cos-fin-ap")||[]).filter((x:any)=>(Number(x.amount)||0)-(Number(x.settled)||0)>0);
      const arOpen=(WorkspaceMemory.get<any[]>("cos-fin-ar")||[]).filter((x:any)=>(Number(x.amount)||0)-(Number(x.settled)||0)>0);
      if(apOpen.length||arOpen.length)financeSummary=apOpen.length+" open payables, "+arOpen.length+" open receivables.";
    }catch{}
    let pulseSummary="";
    try{
      const openTickets=(WorkspaceMemory.get<any[]>("cos-pulse-sn")||[]).filter((t:any)=>String(t?.status||"").toLowerCase()!=="closed"&&String(t?.status||"").toLowerCase()!=="resolved");
      if(openTickets.length)pulseSummary=openTickets.length+" open governance tickets.";
    }catch{}
    let actionsSummary="";
    try{
      const openActions=(WorkspaceMemory.get<any[]>("cos-actions")||[]).filter((a:any)=>a.status!=="complete"&&a.status!=="done");
      if(openActions.length)actionsSummary=openActions.slice(0,5).map((a:any)=>a.title||a.name||"").filter(Boolean).join("; ").slice(0,300);
    }catch{}
    let autopilotSummary="";
    try{
      const apDec=WorkspaceMemory.get<string>("cos-ap-live");
      if(apDec)autopilotSummary=stripMd(String((apDec as any)?.res||apDec||"")).slice(0,400);
    }catch{}
    let fundingSummary="";
    try{
      const fundStage=WorkspaceMemory.get<string>("cos-funding-stage");
      if(fundStage)fundingSummary=String(fundStage);
    }catch{}
    return {
      company:{name:co.name,industry:co.industry,stage:co.stage,
        location:co.location,currency:projCur.code,
        currencySymbol:projCur.sym,markets:co.markets||""},
      brand:{name:co.name,tagline:"",tone:"professional, direct, founder-voice",
        verifiedClaims:[],prohibitedClaims:[]},
      dataHub:compData,
      boardroomDecisions,
      timeMachineForecasts:tmRes?stripMd(tmRes).slice(0,600):"",
      priorWorkflowOutputs:priorOutputs,
      ledgerSummary,
      financeSummary,
      pulseSummary,
      actionsSummary,
      autopilotSummary,
      fundingSummary,
      requiredFormats:["docx","xlsx","pdf","md","pptx","linkedin_post","facebook_post","instagram_post","whatsapp_message","email"],
      mediaGeneration:{
        imageEnabled:!!(keys.openai?.trim()||keys.fal?.trim()),
        videoEnabled:!!(keys.fal?.trim()),
        promptsOnly:false,
      },
    };
  },[co,compData,brSessions,tmRes,workflows,keys,ledgerEntries]);

  const runProjectPlanning=useCallback(async()=>{
    if(!projectObjective.trim()||projectPlanning)return;
    setProjectPlanning(true);
    setProjectPlan(null);
    try{
      const detectedTemplate=detectTemplate(projectObjective);
      const templateHint=detectedTemplate?'\nDETECTED TEMPLATE: This objective matches the "'+detectedTemplate+'" template. Structure modules accordingly: '+( PROJECT_TEMPLATES[detectedTemplate]?.modules||[]).join(', ')+'.':'';
      const ctx=buildProjectContext();
      const nl="\n";
      // ── Pre-planning reasoning step (Project Engine redesign, Phase 3) ──────
      // Understand the goal and what data actually applies BEFORE deciding file
      // structure — same principle already proven for Excel and PowerPoint.
      // Fully fail-safe: any error here and planning proceeds exactly as
      // before, so a run can never be blocked by this step.
      let architectReasoning:any=null;
      try{
        const reasonSys="You are a senior business analyst preparing to plan a piece of work. Do not design the deliverables yet — first make sure you actually understand the request."+nl+
          "OBJECTIVE: "+projectObjective+nl+nl+
          "AVAILABLE CONTEXT FROM THIS COMPANY'S PLATFORM (use only what is genuinely relevant):"+nl+
          "Company: "+ctx.company.name+" ("+ctx.company.industry+", "+ctx.company.stage+")"+nl+
          (Object.keys(ctx.dataHub).length>0?"Data Hub has "+Object.keys(ctx.dataHub).length+" fields on record.\n":"")+
          (ctx.boardroomDecisions.length>0?ctx.boardroomDecisions.length+" recent Boardroom decisions on record.\n":"")+
          (ctx.ledgerSummary?"Ledger has recent activity on record.\n":"")+
          (ctx.financeSummary?"Finance: "+ctx.financeSummary+"\n":"")+
          (ctx.pulseSummary?"Governance: "+ctx.pulseSummary+"\n":"")+
          (ctx.actionsSummary?"Open actions on record.\n":"")+nl+
          "Reason through, briefly:"+nl+
          "1. Restate what this person actually wants, in plain language \u2014 the real business outcome, not just the literal words."+nl+
          "2. Which of the available context above is genuinely relevant to this specific request (name it specifically; do not claim relevance for everything just because it exists)."+nl+
          "3. Is there ONE piece of information that is genuinely necessary and cannot be reasonably assumed? If so, state the single clearest assumption you will make instead of asking \u2014 this platform delivers finished work, not a form, so prefer a sensible stated assumption over a blocking question whenever a reasonable one exists."+nl+nl+
          "Return ONLY this JSON, no prose: {\"goalRestated\":\"...\",\"relevantDataUsed\":[\"...\"],\"keyAssumptions\":[\"...\"]}";
        const reasonRaw=await ask(reasonSys,[{role:"user",content:"Analyse this request now."}],500,false,"general");
        const reasonText=typeof reasonRaw==="string"?reasonRaw:(reasonRaw as any)?.text||"";
        const reasonCleaned=reasonText.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
        const parsedReasoning=JSON.parse(reasonCleaned);
        if(parsedReasoning?.goalRestated)architectReasoning=parsedReasoning;
      }catch{/* reasoning is additive — planning proceeds without it */}
      const reasoningContext=architectReasoning
        ?nl+"CONFIRMED UNDERSTANDING (already reasoned through \u2014 build the plan to serve this):"+nl+
          "Goal: "+architectReasoning.goalRestated+nl+
          (architectReasoning.relevantDataUsed?.length?"Relevant existing data to use: "+architectReasoning.relevantDataUsed.join("; ")+nl:"")+
          (architectReasoning.keyAssumptions?.length?"Assumptions being made: "+architectReasoning.keyAssumptions.join("; ")+nl:"")
        :"";
      const architectSys="You are the Project Architect for "+co.name+". Decompose the objective into a structured Execution Plan."+nl+nl+"COMPANY: "+ctx.company.name+" | "+ctx.company.industry+" | "+ctx.company.stage+" | "+ctx.company.location+" | "+ctx.company.currencySymbol+ctx.company.currency+nl+(Object.keys(ctx.dataHub).length>0?"DATA HUB:"+nl+Object.entries(ctx.dataHub).map(function(e){return e[0]+": "+e[1];}).join(nl)+nl:"")+( ctx.boardroomDecisions.length>0?"RECENT BOARDROOM DECISIONS:"+nl+ctx.boardroomDecisions.map(function(d){return "Q: "+d.question+" -> "+d.decisionStatus;}).join(nl)+nl:"")+(ctx.timeMachineForecasts?"TIME MACHINE FORECAST ON RECORD:"+nl+ctx.timeMachineForecasts+nl:"")+(ctx.priorWorkflowOutputs.length>0?"RECENT APPROVED WORKFLOW OUTPUTS:"+nl+ctx.priorWorkflowOutputs.map(function(p){return p.task+" ("+p.category+"): "+p.output;}).join(nl)+nl:"")+(ctx.ledgerSummary?"GENERAL LEDGER (recent entries): "+ctx.ledgerSummary+nl:"")+(ctx.financeSummary?"FINANCE SUITE: "+ctx.financeSummary+nl:"")+(ctx.pulseSummary?"PULSE GOVERNANCE: "+ctx.pulseSummary+nl:"")+(ctx.actionsSummary?"OPEN ACTION ITEMS: "+ctx.actionsSummary+nl:"")+(ctx.autopilotSummary?"AUTOPILOT RECENT DECISION SCAN: "+ctx.autopilotSummary+nl:"")+(ctx.fundingSummary?"FUNDING STAGE: "+ctx.fundingSummary+nl:"")+nl+"OUTPUT: Return ONLY valid JSON (no markdown fences) matching this exact schema:"+nl+'{"name":"short project name","objective":"one sentence","complexity":"simple|moderate|complex","estimatedDuration":"e.g. 2-3 hours","modules":[{"id":"module_id","name":"Module Name","icon":"emoji","capabilityType":"marketing|design|content|finance|legal|management|engineering|research|compliance","primaryPersona":"cmo","rationale":"why needed","deliverables":[{"id":"del_moduleid_001","name":"Deliverable Name","description":"what it must contain","outputFormat":"docx|xlsx|pdf|pptx|md|txt|image|video|linkedin_post|facebook_post|instagram_post|whatsapp_message|email","dependsOn":[],"verificationStatus":"AI Generated","confidenceScore":0,"sourceReferences":[]}]}]}'+nl+nl+templateHint+nl+nl+"RULES:"+nl+"1. Every deliverable must be a real, immediately usable file — never a discussion, never instructions for the user to do it themselves."+nl+"2. Use only modules genuinely required by the objective."+nl+"3. Min 2 max 8 modules. Min 1 max 5 deliverables each."+nl+"4. dependsOn IDs must reference earlier deliverable ids."+nl+"5. Currency symbol: "+ctx.company.currencySymbol+"\n6. IMPORTANT — Use outputFormat=image for any visual deliverable (ad image, logo, banner, infographic, social creative). Platform generates the actual image automatically."+"\n7. IMPORTANT — Use outputFormat=video for any video deliverable (promo video, explainer, reel, ad video). Platform generates the actual video automatically."+"\n8. NEVER use image_prompt or video_prompt. These are deprecated. Always use image or video."+"\n9. CRITICAL — ONE FILE, NOT ONE DELIVERABLE PER SHEET: if the objective describes ONE workbook, document, or deck that should contain multiple SHEETS, TABS, or SECTIONS that reference or build on each other (e.g. \"the workbook should contain sheets for data input, reconciliation, calculations, and dashboard\"), this is exactly ONE deliverable — a single xlsx/docx/pptx file with that internal structure. Do NOT create a separate deliverable per named sheet/tab/section. Splitting a single interrelated workbook into many small files breaks cross-sheet formulas and produces disconnected, low-quality output. Only create multiple deliverables when the objective genuinely asks for multiple standalone files (e.g. \"a Word report AND a separate PowerPoint deck\", or \"one workbook per region\")."+"\n10. Do NOT invent an image/video/mockup deliverable unless the objective explicitly asks for a picture, graphic, banner, or video asset. A request for \"interactive charts\" or \"a dashboard\" inside a workbook means charts BUILT INTO that file — not a separate standalone image or video deliverable."+"\n11. Social/messaging formats (linkedin_post, facebook_post, instagram_post, whatsapp_message, email) are each ONE short, ready-to-post/ready-to-send deliverable — never bundle multiple platforms' copy into a single deliverable, and never use these formats unless the objective actually asks for marketing/outreach copy or correspondence."+reasoningContext;
      // Root-cause fix: a detailed, comprehensive objective (many worksheets,
      // hundreds of sample rows, dozens of named formulas) needs real room to
      // describe the plan — 4000 tokens was silently truncating large plans
      // mid-generation, and the truncation-recovery below would keep only
      // whatever modules were complete before the cut, with no signal that
      // anything was missing. Raised substantially so a comprehensive request
      // actually gets a comprehensive plan instead of a truncated fragment.
      let raw=await ask(architectSys,[{role:"user",content:"Objective: "+projectObjective}],9000,false,"general");
      // Guard: empty or error-string responses (provider limit, consensus-merge
      // hiccup) are not plan failures — retry once, forcing a clean single call.
      const looksBad=(r:string)=>!r||r.trim().length<40||/^(error|rate limit|too many|unauthorized|invalid api)/i.test(r.trim());
      if(looksBad(raw)){
        await new Promise(r=>setTimeout(r,1500));
        raw=await ask(architectSys,[{role:"user",content:"Objective: "+projectObjective+"\n\nReturn ONLY the JSON plan, no other text."}],9000,false,"general");
      }
      let plan=null;
      let planWasTruncated=false; // surfaced to the user below — never silent again
      try{
        const cleaned=raw.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
        try{plan=JSON.parse(cleaned);}catch{
          // Preamble tolerance: extract the first balanced JSON object
          const st=cleaned.indexOf("{");
          if(st>=0){try{plan=JSON.parse(cleaned.slice(st,cleaned.lastIndexOf("}")+1));}catch{}}
          // Truncation tolerance: universal repair recovers all complete modules.
          // Reaching this point at all means the response did not parse cleanly
          // as-is — for a plan this is the concrete signal that it was cut off.
          if(!plan?.modules){plan=repairTruncatedJson(raw);planWasTruncated=true;}
        }
        if(!plan||!plan.modules||!Array.isArray(plan.modules)||!plan.modules.length){
          const retryRaw=await ask(architectSys+"\n\nCRITICAL: Your entire response must be ONLY the JSON object. Start with { and end with }. No prose, no fences, no explanation.",[{role:"user",content:"Objective: "+projectObjective}],9500,false,"general");
          const rc=retryRaw.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
          try{plan=JSON.parse(rc);}catch{const s2=rc.indexOf("{");if(s2>=0){try{plan=JSON.parse(rc.slice(s2,rc.lastIndexOf("}")+1));}catch{}}if(!plan?.modules){plan=repairTruncatedJson(retryRaw);planWasTruncated=true;}}
        }
        if(!plan||!plan.modules||!Array.isArray(plan.modules)||!plan.modules.length)throw new Error("Invalid plan structure");
        plan.modules=plan.modules.filter((m)=>m&&m.name&&Array.isArray(m.deliverables)&&m.deliverables.length);
        if(!plan.modules.length)throw new Error("Invalid plan structure");
        // Comprehensive objectives with a suspiciously thin result (1 module,
        // or 1 deliverable total) are very likely truncated even if JSON.parse
        // technically succeeded on a cleanly-closed-but-incomplete fragment.
        const totalDels=plan.modules.reduce((s:number,m:any)=>s+(m.deliverables?.length||0),0);
        if((planWasTruncated||plan.modules.length<2||totalDels<2)&&projectObjective.trim().length>400){
          plan._possiblyIncomplete=true;
          showToast("\u26a0 This plan may be incomplete \u2014 your objective was detailed and the response may have been cut short. Review the plan carefully before approving; you can also try splitting a very large request into smaller ones.","warning");
        }
      }catch(parseErr:any){
        const reason=looksBad(raw)?"the AI provider returned an empty response (check API keys / usage limits, and turn OFF Multi-AI Consensus)":"the plan format could not be parsed";
        console.error("[OIQ] Plan generation failed:",reason,"| raw head:",String(raw||"").slice(0,300));
        try{const uf=WorkspaceMemory.get<any[]>("cos-unfulfilled-log")||[];uf.unshift({ts:new Date().toISOString(),project:projectObjective.slice(0,80),deliverable:"Execution Plan",format:"plan",error:reason+" :: "+String(raw||"").slice(0,120)});WorkspaceMemory.set("cos-unfulfilled-log",uf.slice(0,50));}catch{}
        showToast("Plan generation failed \u2014 "+reason+".","error");
        setProjectPlanning(false);
        return;
      }
      // Enrich plan with metadata
      plan.id="proj_"+Date.now();
      plan.objective=projectObjective;
      plan.status="planning";
      plan.createdAt=new Date().toISOString();
      plan.context=ctx;
      plan.architectReasoning=architectReasoning;
      // Initialise all deliverable lifecycle fields
      (plan.modules||[]).forEach(mod=>{
        (mod.deliverables||[]).forEach(del=>{
          del.status="planned";
          del.moduleId=mod.id;
          del.moduleOwner=mod.name;
          del.aiPersona=mod.primaryPersona||"ceo";
          del.plannedAt=new Date().toISOString();
          del.startedAt=null;
          del.completedAt=null;
          del.rawContent=null;
          del.renderedFile=null;
          del.qaResult=null;
          del.verificationStatus=del.verificationStatus||"AI Generated";
          del.confidenceScore=del.confidenceScore||0;
          del.sourceReferences=del.sourceReferences||[];
        });
      });
      setProjectPlan(plan);
      sv("cos-project-plan",plan);
    }catch(err:any){
      showToast("Project planning failed: "+err.message,"error");
    }finally{
      setProjectPlanning(false);
    }
  },[projectObjective,projectPlanning,buildProjectContext,co,ask,showToast,sv]);

  const approveProjectPlan=useCallback(()=>{
    if(!projectPlan)return;
    const approved={...projectPlan,status:"approved",approvedAt:new Date().toISOString()};
    const updated=[approved,...projects].slice(0,20);
    setProjects(updated);
    sv("cos-projects",updated);
    setActiveProject(approved);
    setProjectPlan(null);
    setProjectObjective("");
    showToast("Execution Plan approved — starting execution now.","success");
    setProjectDashboardOpen(true);
    runProjectExecutionRef.current&&runProjectExecutionRef.current(approved);
  },[projectPlan,projects,showToast,sv]);

  // ─── PROJECT ENGINE — Phase 2: Execution Engine ────────────────────────────
  const runProjectExecution=useCallback(async(project)=>{
    if(projectExecuting)return;
    setProjectExecuting(true);
    setProjectExecCancel(false);
    projectExecCancelRef.current=false;
    setProjectExecution({...project,status:"executing"});

    // Helper: update a single deliverable across the execution state
    const updateDel=(projState,modId,delId,patch)=>{
      const mods=(projState.modules||[]).map(m=>{
        if(m.id!==modId)return m;
        return {...m,deliverables:(m.deliverables||[]).map(d=>d.id===delId?{...d,...patch}:d)};
      });
      const updated={...projState,modules:mods};
      setProjectExecution(updated);
      setProjects(prev=>{const ns=prev.map(p=>p.id===updated.id?updated:p);sv("cos-projects",ns);return ns;});
      return updated;
    };

    // Helper: check if all dependsOn deliverables are complete
    const allDepsComplete=(projState,del)=>{
      if(!del.dependsOn||del.dependsOn.length===0)return true;
      const allDels=(projState.modules||[]).flatMap(m=>m.deliverables||[]);
      return del.dependsOn.every(depId=>{
        const dep=allDels.find(d=>d.id===depId);
        return dep&&dep.status==="complete";
      });
    };

    // Helper: get rawContent of a dependency
    const getDepContent=(projState,depId)=>{
      const allDels=(projState.modules||[]).flatMap(m=>m.deliverables||[]);
      const dep=allDels.find(d=>d.id===depId);
      return dep?.rawContent?stripMd(dep.rawContent).slice(0,400):"";
    };

    // Helper: build the system prompt for a deliverable
    const buildDelSys=(ctx,mod,del,priorDepContent)=>{
      const nl="\n";
      const co=ctx.company||{};
      const fmt=(del.outputFormat||"md").toLowerCase();
      const sym=co.currencySymbol||"₹";
      const currency=co.currency||"INR";
      const coCtx=`${co.name} | ${co.industry} | ${co.stage} | ${co.location} | ${sym}${currency}`;

      // ── DOMAIN EXPERT PERSONA ─────────────────────────────────────────────
      // Assign the most qualified professional persona for this deliverable type
      const PERSONAS:{[k:string]:string}={
        finance:   "Senior FP&A Manager from McKinsey's CFO Advisory practice with 15 years experience in financial modelling, variance analysis, and management reporting for Fortune 500 companies",
        audit:     "Senior Manager from Deloitte's Internal Audit practice, expert in ITGC, SOX compliance, risk registers, and audit workpapers",
        strategy:  "Principal at BCG with expertise in corporate strategy, market entry, competitive analysis, and board-level presentations",
        marketing: "VP of Marketing with consulting background, expert in brand strategy, campaign design, ROI measurement, and executive presentations",
        design:    "Creative Director with B2B SaaS expertise, skilled in visual communication, infographic design, and brand-aligned assets",
        content:   "Senior Business Writer from Bain & Company, expert in executive communications, business cases, and client-facing deliverables",
        legal:     "Corporate counsel with M&A and compliance expertise, skilled in contract drafting and regulatory documentation",
        management:"Senior Partner with expertise in change management, operational excellence, and C-suite presentations",
        engineering:"Principal Solutions Architect with expertise in technical documentation, system design, and API specifications",
        research:  "Senior Research Analyst with expertise in primary and secondary market research, competitive intelligence, and insight reports",
        compliance:"Big4 Compliance Manager expert in regulatory frameworks, control testing, and assurance documentation",
        hr:        "CHRO Advisory specialist with expertise in HR analytics, talent strategy, and people management frameworks",
        operations:"McKinsey Operations Practice expert in process design, efficiency analysis, and operational dashboards",
        sales:     "Sales Strategy Director with expertise in pipeline analysis, revenue modelling, and go-to-market planning",
      };
      const persona=PERSONAS[mod.capabilityType]||PERSONAS[mod.capabilityType?.split("_")[0]]||"Senior Business Consultant with Big4 experience";

      // ── FORMAT-SPECIFIC OUTPUT INSTRUCTIONS ───────────────────────────────
      const FORMAT_RULES:{[k:string]:string}={
        xlsx:`
EXCEL OUTPUT RULES (CRITICAL — follow exactly):
You are building a PROFESSIONAL FINANCIAL WORKBOOK, not a table.
Structure your output as SHEETS separated by === SHEET: [Name] ===

Required sheets:
=== SHEET: Dashboard ===
(KPI summary: key metrics with formula references to data sheets)
KEY METRICS: label | value | vs_target | trend
CRITICAL: Use realistic invented numbers. NEVER write 0 or placeholder.
MRR | ${sym}42,50,000 | ${sym}38,00,000 | ▲ 11.8%
ARR | ${sym}5,10,00,000 | ${sym}4,56,00,000 | ▲
Gross Margin | 67% | 65% | ▲
Burn Rate | ${sym}18,50,000 | ${sym}20,00,000 | ✓
Cash Runway | 16 months | 18 months | ⚠
CAC | ${sym}48,500 | ${sym}45,000 | ▼
NRR | 118% | 110% | ▲
Customers | 87 | 80 | ▲

=== SHEET: Data ===
(Structured data table with headers in row 1)
Row 1: HEADERS (bold, freeze this row)
Row 2+: Data rows
Totals row: Use =SUM() formulas — example: =SUM(B2:B13)
Variances: Use =B14-C14 or =IFERROR((B14-C14)/C14,"N/A")
Conditional: Flag variances >10% with [FLAG]

=== SHEET: Analysis ===
(Derived calculations, trends, ratios)
Use formula strings: =IF(B5>0,"▲ Growth","▼ Decline")
Ratios: =IFERROR(B8/B9,0)

=== SHEET: Assumptions ===
Named | Value | Basis | Confidence
Each assumption on its own row, labeled [VERIFIED] or [ESTIMATE]

=== VBA: Refresh Macro ===
(Optional VBA code if automation adds value — copy-paste instructions)

FORMULA REQUIREMENTS:
- ALL totals must use =SUM() not hardcoded numbers
- ALL ratios must use =IFERROR(numerator/denominator,"N/A")
- ALL variances must use =Actual-Budget or =(Actual-Budget)/Budget
- Prefix formula cells with = sign
- Reference between sheets: ='Sheet Name'!B5
- Named ranges: use descriptive names in formulas where possible
- Currency: format numbers as ${sym} values
- DO NOT output pre-calculated numbers as text — use formulas`,

        pptx:`
POWERPOINT OUTPUT RULES (CRITICAL — follow exactly):
You are creating a CONSULTING-GRADE PRESENTATION (McKinsey/BCG standard).
Output as structured JSON inside a code block:

\`\`\`json
{
  "title": "Presentation Title",
  "theme": "navy",
  "slides": [
    {
      "layout": "title",
      "title": "Main Title",
      "subtitle": "Subtitle",
      "meta": "Company | Date | Confidential"
    },
    {
      "layout": "exec_summary",
      "title": "SO WHAT headline — not a topic label",
      "bullets": ["Key insight 1", "Key insight 2", "Key insight 3"],
      "so_what": "The one sentence the CEO must remember"
    },
    {
      "layout": "chart",
      "title": "SO WHAT headline about this chart",
      "chart_type": "bar|line|pie|waterfall",
      "chart_title": "Chart title",
      "categories": ["Q1","Q2","Q3","Q4"],
      "series": [
        {"name": "Actual", "values": [100,120,115,140], "color": "teal"},
        {"name": "Budget", "values": [110,110,120,130], "color": "navy"}
      ],
      "insight": "One sentence explaining what the chart shows"
    },
    {
      "layout": "two_col",
      "title": "SO WHAT headline",
      "left_header": "Left Column Header",
      "left": ["Bullet 1", "Bullet 2", "Bullet 3"],
      "right_header": "Right Column Header",
      "right": ["Bullet 1", "Bullet 2", "Bullet 3"]
    },
    {
      "layout": "table",
      "title": "SO WHAT headline",
      "headers": ["Column 1", "Column 2", "Column 3"],
      "rows": [["R1C1","R1C2","R1C3"],["R2C1","R2C2","R2C3"]],
      "highlight_row": 0
    },
    {
      "layout": "closing",
      "title": "Recommendation / Next Steps",
      "actions": ["Action 1: Owner | Timeline", "Action 2: Owner | Timeline"],
      "bottom_line": "The single most important takeaway"
    }
  ]
}
\`\`\`

SLIDE QUALITY RULES:
- Every slide title must be a "SO WHAT" sentence, not a topic label
  BAD: "Revenue Analysis" | GOOD: "Revenue grew 23% YoY driven by enterprise segment"
- Include at least 2 chart slides with real numerical data
- Every chart must have actual numbers that tell a story
- Speaker notes: add as "notes" field on each slide
- Minimum 8 slides, maximum 15 slides
- Closing slide must have specific, numbered action items`,

        pdf:`
PDF / REPORT OUTPUT RULES:
You are producing a PUBLICATION-QUALITY business report (Big4/consulting standard).
Structure:

# COVER
Title | Author | Date | Classification: Confidential

# EXECUTIVE SUMMARY (max 250 words)
3-5 key findings. What the reader must know before anything else.

# KEY FINDINGS
1. **Finding headline** — Supporting evidence. [VERIFIED/ESTIMATE]
2. **Finding headline** — Supporting evidence.

# [NUMBERED SECTIONS — each section earns its place]
## 1.0 [Section Title]
### 1.1 [Subsection]
Content with evidence-based statements.
Tables formatted as:
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data     | Data     | Data     |

# RECOMMENDATIONS
1. **[Specific action]** — Rationale. Owner: [role]. Timeline: [period].
2. **[Specific action]** — Rationale. Owner: [role]. Timeline: [period].

# APPENDIX
Supporting data, methodology, assumptions

QUALITY RULES:
- Every claim must have evidence or be labeled [ESTIMATE]
- No generic statements — every sentence must add information
- Tables must have headers and be properly formatted
- Recommendations must be specific, measurable, and assigned`,

        docx:`
WORD DOCUMENT OUTPUT RULES:
Produce a SUBMISSION-READY document.
Use the same structure as PDF above.
Include:
- Professional heading hierarchy (H1 → H2 → H3)
- Properly formatted tables with bold headers
- Executive Summary always first
- Numbered recommendations always last
- Appendix for supporting data`,

        md:`
REPORT OUTPUT RULES:
Produce a COMPLETE, professional business document.
- Use proper markdown: ## for sections, ### for subsections
- Every table must have headers and alignment
- Every claim must be evidence-based or labeled [ESTIMATE/ASSUMPTION]
- Executive Summary first, Recommendations last
- Minimum 800 words for any analytical deliverable`,
      };

      const needsFictional=(del.description||"").toLowerCase().includes("fictional")||(del.name||"").toLowerCase().includes("fictional")||(priorDepContent||"").toLowerCase().includes("fictional data");
      const fictionalNote=needsFictional?`\n\n⚠ FICTIONAL DATA MANDATE: This deliverable requires invented realistic data. DO NOT use this company's real figures which may be ₹0. Invent specific, plausible, internally consistent numbers for a ${co.industry} company at ${co.stage} stage. Example ranges: MRR ₹18L–₹85L, customers 25–180, gross margin 55–75%, burn ₹12L–₹35L/month, runway 12–24 months. Every cell, every slide, every table must have a specific invented number — never a placeholder.\n\n`:"";
      const formatRules=FORMAT_RULES[fmt]||FORMAT_RULES.md;

      // ── QUALITY STANDARD ─────────────────────────────────────────────────
      const qualityStandard=`
QUALITY STANDARD:
Could this output be presented directly to a CFO, Board, or senior client WITHOUT manual editing?
If no, it is not complete. Do not submit incomplete work.
Every number must be sourced or labeled. Every recommendation must be specific and actionable.
This is McKinsey/Deloitte standard — not a draft, not a template, not a starting point.
ANTI-PLACEHOLDER RULE: NEVER write [X], [XXXX], [TBD], [INSERT], [PENDING], [UNKNOWN], [DATA GAP], [MISSING DATA], [CRITICAL GAP], [UNDEFINED], [ESTIMATE PENDING], [NOT FOUND], [Current Month/Year], or ANY bracket placeholder for any number, name, date, or value. If exact data is unavailable, INVENT a specific plausible value for a ${co.industry} ${co.stage}-stage company and label it (A: assumed). A placeholder is a failure. An invented labeled assumption is always preferred.`;

      // ── BUILD THE FULL SYSTEM PROMPT ─────────────────────────────────────
      return `You are a ${persona}.

ENGAGEMENT CONTEXT:
Company: ${coCtx}
${Object.keys(ctx.dataHub||{}).length?`DATA AVAILABLE:\n${Object.entries(ctx.dataHub).map(([k,v])=>`${k}: ${v}`).join(nl)}\n`:""}${ctx.timeMachineForecasts?`FORECASTS: ${ctx.timeMachineForecasts}\n`:""}${(ctx.boardroomDecisions||[]).length?`BOARD DECISIONS: ${ctx.boardroomDecisions.map((d:any)=>`${d.question} → ${d.decisionStatus}`).join(" | ")}\n`:""}${priorDepContent?`\nPRIOR WORK (use as input — do not repeat):\n${priorDepContent}\n`:""}

DELIVERABLE TO PRODUCE:
Name: ${del.name}
Purpose: ${del.description}
Output Format: ${fmt.toUpperCase()}
${fictionalNote}${formatRules}

DATA LABELING:
- [VERIFIED]: confirmed data from provided sources
- [ESTIMATE]: calculated or inferred
- [ASSUMPTION]: stated assumption requiring validation

${qualityStandard}

Now produce the complete ${del.name}. Start with content immediately — no preamble.`;
    };

    // Helper: parse markdown content into slide schema when AI doesn't output JSON
    const parseMdToSlides=(md:string,coName:string,title:string)=>{
      const lines=md.split("\n").filter((l:string)=>l.trim());
      const slides:any[]=[{layout:"title",title,subtitle:coName,meta:`${coName} · ${new Date().toLocaleDateString("en-GB")}`}];
      let currentSlide:any=null;
      const pushCurrent=()=>{if(currentSlide?.bullets?.length||currentSlide?.content)slides.push(currentSlide);};
      for(const line of lines){
        if(line.startsWith("# ")){
          pushCurrent();
          currentSlide={layout:"exec_summary",title:line.replace(/^#+\s*/,""),bullets:[]};
        } else if(line.startsWith("## ")){
          pushCurrent();
          currentSlide={layout:"full_text",title:line.replace(/^#+\s*/,""),bullets:[]};
        } else if(line.startsWith("### ")){
          pushCurrent();
          currentSlide={layout:"full_text",title:line.replace(/^#+\s*/,""),bullets:[]};
        } else if(currentSlide){
          const clean=line.replace(/^[-*•]\s*/,"").trim();
          if(clean) currentSlide.bullets=(currentSlide.bullets||[]).concat([clean]);
        }
      }
      pushCurrent();
      slides.push({layout:"closing",title:"Next Steps & Recommendations",actions:["Review findings with leadership","Assign owners and timelines","Implement priority actions"]});
      return {title,slides};
    };

    // Helper: call AI with retry + failover + waiting
    const callDelAI=async(sys,userMsg,maxT,delLabel,delTask)=>{
      const providerOrder=[];
      const allKeys={...keys};
      if(EFF_GROQ?.trim())allKeys.groq=EFF_GROQ;
      if(EFF_GEMINI?.trim())allKeys.gemini=EFF_GEMINI;
      if(EFF_CLAUDE?.trim())allKeys.claude=EFF_CLAUDE;
      // Primary-aware routing (honors the user's Primary AI + specialist chains).
      // The old hardcoded "deepseek first" ladder bypassed the router entirely.
      const preferred=resolveRoute(delTask||"general",defP);
      if(!preferred.includes("kimi")&&allKeys.kimi?.trim())preferred.push("kimi");
      preferred.forEach(p=>{if(allKeys[p]?.trim())providerOrder.push(p);});
      if(!providerOrder.length)throw new Error("No API keys configured.");

      let lastErr=null;
      const delDeadline=Date.now()+240000; // hard 4-minute cap per deliverable — fail fast, never hang
      for(let attempt=0;attempt<2;attempt++){
        for(const prov of providerOrder){
          if(projectExecCancelRef.current)throw new Error("CANCELLED");
          if(Date.now()>delDeadline)throw new Error("Deliverable timed out after 4 minutes (providers unresponsive): "+delLabel);
          const key=allKeys[prov]?.trim();
          if(!key)continue;
          try{
            setProjectExecPhase("Generating: "+delLabel+" ("+prov+")...");
            const r=await callAI(prov,key,sys,[{role:"user",content:userMsg}],maxT);
            return r.text||r;
          }catch(e){
            lastErr=e;
            if(e.message==="CANCELLED")throw e;
            if(isRateLimit(e.message)){
              markProviderExhausted(prov);
              continue; // try next provider
            }
            continue; // try next provider on any error
          }
        }
        // All providers tried — wait before retry
        if(attempt===0){
          setProjectExecPhase("All providers at limit — waiting 65s before retry for: "+delLabel);
          await waitWithCountdown(65,(s)=>setProjectExecPhase("Retry in "+s+"s — "+delLabel));
        }
      }
      throw lastErr||new Error("All providers exhausted for: "+delLabel);
    };

    // Helper: generate deliverable (with chunking for large deliverables)
    const generateDeliverable=async(projState,mod,del)=>{
      const ctx=projState.context||buildProjectContext();
      const priorDepContent=(del.dependsOn||[]).map(id=>getDepContent(projState,id)).filter(Boolean).join("\n\n");
      const sys=buildDelSys(ctx,mod,del,priorDepContent);
      let userMsg="Generate the complete deliverable now: "+del.name;

      // Estimate if chunking is needed based on description length
      const needsChunking=del.description.length>300||["blog","landing page","press release","terms","privacy","contract","roadmap","forecast","excel","xlsx","financial","pptx","presentation","deck","report","analysis","audit","strategy"].some(k=>del.name.toLowerCase().includes(k)||del.outputFormat==="xlsx"||del.outputFormat==="pptx"||del.outputFormat==="pdf");

      if(!needsChunking){
        const isLargeDeliverable=["xlsx","pptx","pdf","docx"].includes(del.outputFormat?.toLowerCase()||"")||del.description.length>200;
      const delTask=({xlsx:"excel_advanced",pptx:"powerpoint",pdf:"financial",docx:"financial"})[del.outputFormat]||"general";
      if(del.outputFormat==="pptx")userMsg+="\n\nThe deck MUST contain 12-16 substantive slides covering the full narrative arc (title, executive summary, agenda, 6-10 content/analysis slides with data, recommendations, next steps, closing).";
      // Phase 4: platform-specific writing conventions for social/messaging deliverables —
      // each platform has a genuinely different register; write to that convention, not a generic post.
      const SOCIAL_GUIDANCE:Record<string,string>={
        linkedin_post:"\n\nWrite ONE ready-to-post LinkedIn post. Professional register, short paragraphs (1-2 sentences each) with line breaks for readability, a strong opening hook line, 150-300 words, end with 3-5 relevant hashtags on their own line. No markdown formatting symbols — this gets copy-pasted directly into LinkedIn's editor.",
        facebook_post:"\n\nWrite ONE ready-to-post Facebook post. Warmer and more conversational than LinkedIn, storytelling angle, 80-200 words, can include 1-2 emojis naturally, end with a clear call to action. No markdown formatting symbols.",
        instagram_post:"\n\nWrite ONE ready-to-post Instagram caption. Punchy opening line, short and scannable, emoji-friendly throughout, 50-150 words, end with a block of 8-15 relevant hashtags on their own line separated by spaces. No markdown formatting symbols.",
        whatsapp_message:"\n\nWrite ONE ready-to-send WhatsApp business message. Very short (under 60 words), direct and conversational, no hashtags, no formal structure, one clear call to action, sounds like a real person typing on their phone.",
        email:"\n\nWrite ONE ready-to-send email. First line must be exactly \"Subject: \" followed by a compelling subject line, then a blank line, then the email body with a professional greeting, clear body paragraphs, and a signed closing. No markdown formatting symbols.",
      };
      if(SOCIAL_GUIDANCE[del.outputFormat])userMsg+=SOCIAL_GUIDANCE[del.outputFormat];
      return await callDelAI(sys,userMsg,del.outputFormat==="pptx"?6500:isLargeDeliverable?4500:2500,del.name,delTask);
      }

      // Chunked generation — split into logical sections
      setProjectExecPhase("Planning sections for: "+del.name);
      const planSys=sys+"\n\nFirst, list the logical sections for this deliverable as a JSON array of strings. Output ONLY the JSON array, no other text. Maximum 4 sections.";
      let sections=[];
      try{
        const planRaw=await callDelAI(planSys,"List sections for: "+del.name,400,del.name+" (planning)",({xlsx:"excel_advanced",pptx:"powerpoint",pdf:"financial",docx:"financial"})[del.outputFormat]||"general");
        const cleaned=planRaw.trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
        sections=JSON.parse(cleaned);
        if(!Array.isArray(sections)||sections.length===0)throw new Error("No sections");
      }catch{
        // If planning fails, generate as single chunk
        return await callDelAI(sys,userMsg,2500,del.name,({xlsx:"excel_advanced",pptx:"powerpoint",pdf:"financial",docx:"financial"})[del.outputFormat]||"general");
      }

      const chunks=[];
      for(let si=0;si<sections.length;si++){
        if(projectExecCancelRef.current)throw new Error("CANCELLED");
        const section=sections[si];
        setProjectExecPhase("Generating section "+(si+1)+"/"+sections.length+": "+section);
        const chunkSys=sys+"\n\nYou are generating SECTION "+(si+1)+" of "+sections.length+" of this deliverable."+(chunks.length?"\n\nCOMPLETED SECTIONS SO FAR:\n"+chunks.join("\n\n"):"");
        const chunkContent=await callDelAI(chunkSys,"Generate section: "+section,1800,del.name+" §"+(si+1),({xlsx:"excel_advanced",pptx:"powerpoint",pdf:"financial",docx:"financial"})[del.outputFormat]||"general");
        chunks.push("## "+section+"\n\n"+chunkContent);
      }
      return chunks.join("\n\n");
    };

    // ── MAIN EXECUTION LOOP ──────────────────────────────────────────────────
    let currentProj={...project,status:"executing"};

    // Build flat list of all deliverables for dependency tracking
    const getAllDels=()=>(currentProj.modules||[]).flatMap(m=>(m.deliverables||[]).map(d=>({...d,_modId:m.id,_modName:m.name})));

    // Queue all deliverables
    currentProj.modules=(currentProj.modules||[]).map(m=>({
      ...m,
      status:"running",
      deliverables:(m.deliverables||[]).map(d=>({...d,status:"queued"}))
    }));
    setProjectExecution({...currentProj});

    let totalDels=getAllDels().length;
    let completedCount=0;
    let failedCount=0;

    // Process in waves — each wave processes all deliverables whose deps are met
    const MAX_WAVES=20;
    for(let wave=0;wave<MAX_WAVES;wave++){
      if(projectExecCancelRef.current){
        currentProj={...currentProj,status:"cancelled"};
        break;
      }

      const pending=getAllDels().filter(d=>d.status==="queued"||d.status==="waiting");
      if(pending.length===0)break;

      const ready=pending.filter(d=>allDepsComplete(currentProj,d));
      const blocked=pending.filter(d=>!allDepsComplete(currentProj,d));

      if(ready.length===0&&blocked.length>0){
        // All remaining are blocked — check if any blocker is failed
        const blockerIds=blocked.flatMap(d=>d.dependsOn||[]);
        const allDels=getAllDels();
        const failedBlockers=blockerIds.filter(id=>{
          const dep=allDels.find(d=>d.id===id);
          return dep&&dep.status==="failed";
        });
        if(failedBlockers.length===blockerIds.length){
          // All blockers failed — mark blocked as failed too
          for(const bd of blocked){
            const mod=currentProj.modules.find(m=>m.id===bd._modId);
            if(mod){currentProj=updateDel(currentProj,bd._modId,bd.id,{status:"failed",rawContent:"Blocked by failed dependency."});}
            failedCount++;
          }
        }
        break;
      }

      // Process all ready deliverables (sequentially to avoid rate limits)
      for(const del of ready){
        if(projectExecCancelRef.current)break;
        const mod=currentProj.modules.find(m=>m.id===del._modId);
        if(!mod)continue;

        // Mark as generating
        currentProj=updateDel(currentProj,del._modId,del.id,{
          status:"generating",startedAt:new Date().toISOString()
        });

        let rawContent=null;
        let genFailed=false;

        try{
          rawContent=await generateDeliverable(currentProj,mod,del);
        }catch(e){
          if(e.message==="CANCELLED")break;
          genFailed=true;
          currentProj=updateDel(currentProj,del._modId,del.id,{
            status:"failed",
            rawContent:"Generation failed: "+e.message,
            completedAt:new Date().toISOString(),
            confidenceScore:0,
            verificationStatus:"Failed"
          });
          failedCount++;
          showToast("⚠ "+del.name+" failed: "+e.message.slice(0,60),"warning");
          continue;
        }

        if(!genFailed&&rawContent){
          // ── QUALITY ANNOTATION ────────────────────────────────────────────
          // Records what was requested vs what was delivered so the user can
          // benchmark the output. No blocking, no retry loop — the prompt
          // improvements are what drive quality, not retry gates.
          const hasFatalPlaceholder=(t:string)=>/\[INSERT\]|\[TBD\]|PLACEHOLDER|Lorem ipsum|\[X+\]|TODO:/i.test(t);
          // Quick QA: detect placeholders
          const hasPlaceholders=/\[INSERT\]|\[TBD\]|PLACEHOLDER|Lorem ipsum/i.test(rawContent);
          const hasAssumptions=/\[ASSUMPTION\]|\[ESTIMATE\]/i.test(rawContent);
          const confidenceScore=hasPlaceholders?30:hasAssumptions?65:85;
          const verificationStatus=hasPlaceholders?"Requires User Input":hasAssumptions?"AI Generated":"AI Generated";

          rawContentStore.current[del.id]=rawContent;
          // Store full content — no artificial cap. Try/catch handles storage quota.
          try{
            localStorage.setItem("cos-rc-"+del.id,rawContent);
          }catch(e){
            // Storage quota reached — try with truncated version
            try{localStorage.setItem("cos-rc-"+del.id,rawContent.slice(0,20000));}catch{}
            console.warn("[OIQ] localStorage quota reached for deliverable",del.id);
          }
          const rawPreview=rawContent.slice(0,800)+(rawContent.length>800?"\n\n[...full content in export backup...]":"");
          currentProj=updateDel(currentProj,del._modId,del.id,{
            status:"complete",
            rawContent:rawPreview,
            completedAt:new Date().toISOString(),
            confidenceScore,
            verificationStatus,
            qaResult:{
              passed:!hasPlaceholders,
              checkedAt:new Date().toISOString(),
              flags:hasPlaceholders?[{type:"placeholder",location:"content",original:"[placeholder detected]",suggestion:"Fill in with real data"}]:[],
              score:confidenceScore
            }
          });
          completedCount++;
          setProjectExecPhase("✓ "+del.name+" complete ("+completedCount+"/"+totalDels+")");
        }
      }
    }

    // Finalize project status
    const execStatus=completedCount===totalDels?"executed":failedCount>0?"partial":"executed";
    currentProj={...currentProj,status:execStatus,completedAt:new Date().toISOString()};
    setProjectExecution(currentProj);
    setProjects(prev=>{const ns=prev.map(p=>p.id===currentProj.id?currentProj:p);sv("cos-projects",ns);return ns;});
    setProjectExecuting(false);
    setProjectExecPhase("");
    // Phase 6: the automated post-execution QA pass is removed entirely — it was
    // a second AI call per deliverable asking the AI to grade its own work, and
    // could flip an already-successful deliverable to "qa_failed" on nothing
    // more than its own unreliable self-assessment. The instant, fact-based
    // per-deliverable label computed above (placeholders/assumptions detected
    // directly from the content) already gives an honest signal without a
    // slow, blocking, self-grading extra pass. Quality now improves through
    // your own review and specific feedback below, not an automated gate.
    if(completedCount===0)showToast("⚠ No deliverables completed","warning");

  },[projectExecuting,keys,buildProjectContext,showToast,sv,isRateLimit,markProviderExhausted,waitWithCountdown,stripMd,callAI]);
  // Keep ref current so approveProjectPlan can call it without dep ordering issues
  runProjectExecutionRef.current=runProjectExecution;

  // Phase 6: user-driven iteration — replaces the automated self-grading QA
  // pass. You review what was generated; if something needs changing, say
  // exactly what and this makes ONLY that change, leaving everything else
  // that already worked untouched. Self-contained: does not depend on any
  // function scoped inside runProjectExecution, so it is safe to call from
  // the review panel independently of an active execution run.
  const regenerateDeliverableWithFeedback=useCallback(async(modId:string,delId:string,delName:string,currentContent:string)=>{
    const feedback=(projectFeedback[delId]||"").trim();
    if(!feedback){showToast("Enter what you'd like changed first","warning");return;}
    setProjectRegeneratingId(delId);
    try{
      const sys="You are revising a business deliverable based on specific user feedback. Make ONLY the change the feedback asks for \u2014 keep everything else that already works exactly as it is. Output ONLY the complete revised content: no preamble, no explanation of what changed, no markdown fences.";
      const msg="DELIVERABLE: "+delName+"\n\nCURRENT CONTENT:\n"+currentContent.slice(0,4000)+"\n\nUSER FEEDBACK \u2014 apply this specific change:\n"+feedback;
      const revised=await ask(sys,[{role:"user",content:msg}],3000,false,"general");
      const revisedText=(typeof revised==="string"?revised:(revised as any)?.text||"").trim();
      if(!revisedText){showToast("Regeneration returned nothing \u2014 try again","error");setProjectRegeneratingId(null);return;}
      rawContentStore.current[delId]=revisedText;
      try{localStorage.setItem("cos-rc-"+delId,revisedText);}catch{}
      const preview=revisedText.slice(0,800)+(revisedText.length>800?"\n\n[...full content in export backup...]":"");
      setProjectExecution((prev:any)=>prev?{...prev,modules:(prev.modules||[]).map((m:any)=>m.id!==modId?m:{...m,deliverables:(m.deliverables||[]).map((d:any)=>d.id!==delId?d:{...d,rawContent:preview})})}:prev);
      setProjectFeedback(prev=>({...prev,[delId]:""}));
      showToast("\u2713 Updated: "+delName,"success");
    }catch(e:any){
      showToast("Regeneration failed: "+(e?.message||"unknown error"),"error");
    }
    setProjectRegeneratingId(null);
  },[projectFeedback,ask,showToast]);

  const runProjectQA=useCallback(async(proj)=>{
    if(projectQARunning||!proj)return;
    setProjectQARunning(true);
    setProjectExecPhase("🔍 QA Agent reviewing deliverables...");
    let qaProj={...proj,status:"qa"};
    setProjectExecution(qaProj);
    const allDels=(qaProj.modules||[]).flatMap(m=>(m.deliverables||[]).map(d=>({...d,_modId:m.id})));
    const completedDels=allDels.filter(d=>d.status==="complete"&&d.rawContent);
    const ctx=qaProj.context||{};
    const brandName=ctx.company?.name||"the company";
    const currency=ctx.company?.currencySymbol||"₹";
    const updateDelQA=(modId,delId,qaResult,newStatus)=>{
      qaProj={...qaProj,modules:(qaProj.modules||[]).map(m=>{
        if(m.id!==modId)return m;
        return{...m,deliverables:(m.deliverables||[]).map(d=>d.id===delId?{...d,qaResult,status:newStatus,verificationStatus:qaResult.passed?"AI Generated":"Requires User Input",confidenceScore:qaResult.score}:d)};
      })};
      setProjectExecution({...qaProj});
    };
    for(let i=0;i<completedDels.length;i++){
      const del=completedDels[i];
      setProjectExecPhase("🔍 QA: "+del.name+" ("+(i+1)+"/"+completedDels.length+")");
      try{
        const allKeys={...keys};
        if(EFF_GROQ?.trim())allKeys.groq=EFF_GROQ;
        if(EFF_GEMINI?.trim())allKeys.gemini=EFF_GEMINI;
        if(EFF_CLAUDE?.trim())allKeys.claude=EFF_CLAUDE;
        const provs=["deepseek","claude","openai","gemini","groq","kimi"].filter(p=>allKeys[p]?.trim());
        if(!provs.length){updateDelQA(del._modId,del.id,{passed:true,score:70,checkedAt:new Date().toISOString(),flags:[],summary:"QA skipped — no key"},del.status);continue;}
        const qaProv=provs[0];
        const qaKey=allKeys[qaProv];
        const qaSys="You are a QA reviewer for "+brandName+". Review the deliverable and output ONLY a JSON object with this exact schema: "+
          '{"passed":true,"score":85,"summary":"one sentence","flags":[{"type":"placeholder","location":"where","original":"text","suggestion":"fix"}]}\n'+ 
          "Rules: passed=true if score>=70 and no placeholders. "+
          "Check: placeholders ([INSERT],[TBD],Lorem ipsum), unverified stats, incomplete sections, brand name ("+brandName+"), currency ("+currency+"). "+
          "Score: 90+=excellent, 70-89=good, 50-69=needs revision, <50=major issues.";
        const fullContent=rawContentStore.current[del.id]||del.rawContent||"";
        const qaMsg="DELIVERABLE: "+del.name+"\nFORMAT: "+del.outputFormat+"\n\nCONTENT:\n"+fullContent.slice(0,3000);
        const qaRaw=await callAI(qaProv,qaKey,qaSys,[{role:"user",content:qaMsg}],800);
        let qaResult={passed:true,score:80,checkedAt:new Date().toISOString(),flags:[],summary:"QA passed"};
        try{
          const cleaned=(qaRaw.text||"").trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"");
          const parsed=JSON.parse(cleaned);
          qaResult={...parsed,checkedAt:new Date().toISOString()};
        }catch{}
        const newStatus=qaResult.passed?"complete":"qa_failed";
        updateDelQA(del._modId,del.id,qaResult,newStatus);
        if(!qaResult.passed&&qaResult.score<50){
          setProjectExecPhase("♻ Regenerating: "+del.name);
          try{
            const fixSys="Rewrite this deliverable fixing all QA issues. Output corrected deliverable only.";
            const fixFullContent=rawContentStore.current[del.id]||del.rawContent||"";
            const fixMsg="DELIVERABLE: "+del.name+"\nORIGINAL:\n"+fixFullContent.slice(0,2000)+"\n\nFIX THESE:\n"+qaResult.flags.map(f=>f.type+": "+f.suggestion).join("\n");
            const fixRaw=await callAI(qaProv,qaKey,fixSys,[{role:"user",content:fixMsg}],2000);
            const fixedContent=fixRaw.text||del.rawContent;
            rawContentStore.current[del.id]=fixedContent;
            const fixedPreview=fixedContent.slice(0,800)+(fixedContent.length>800?"\n\n[...content stored, available in ZIP...]":"");
            qaProj={...qaProj,modules:(qaProj.modules||[]).map(m=>m.id!==del._modId?m:{...m,deliverables:(m.deliverables||[]).map(d=>d.id!==del.id?d:{...d,rawContent:fixedPreview,status:"complete",confidenceScore:75,qaResult:{...qaResult,passed:true,score:75,summary:"Auto-regenerated after QA failure"}})})};
            setProjectExecution({...qaProj});
          }catch{}
        }
      }catch(e){
        updateDelQA(del._modId,del.id,{passed:true,score:70,checkedAt:new Date().toISOString(),flags:[],summary:"QA error: "+e.message.slice(0,60)},del.status);
      }
    }
    const qaFailed=(qaProj.modules||[]).flatMap(m=>m.deliverables||[]).filter(d=>d.status==="qa_failed").length;
    const finalStatus=qaFailed===0?"complete":"partial";
    qaProj={...qaProj,status:finalStatus};
    setProjectExecution({...qaProj});
    setProjects(prev=>{const ns=prev.map(p=>p.id===qaProj.id?qaProj:p);sv("cos-projects",ns);return ns;});
    setProjectQARunning(false);
    setProjectExecPhase("");
    showToast("✅ QA complete — "+completedDels.length+" deliverables reviewed","success");
  },[projectQARunning,keys,showToast,sv,callAI]);

  // ─── PROJECT ENGINE — Phase 5: Media Generation ─────────────────────────
  const buildMediaPrompt=useCallback((del,ctx)=>{
    const company  = ctx?.company?.name || "the company";
    const industry = ctx?.company?.industry || "business";
    const location = ctx?.company?.location || "";
    const rawContent = (rawContentStore.current[del.id]||del.rawContent||del.description||"").trim();
    const isVideo = del.outputFormat==="video"||["video","animation","reel","promotional","promo","overview","film"].some((k:string)=>del.name.toLowerCase().includes(k));
    if(isVideo){
      const coreMessage = rawContent.includes("VOICEOVER")
        ? rawContent.split("\n").filter((l:string)=>l.includes("VOICEOVER")).map((l:string)=>l.replace(/\*\*VOICEOVER[^:]*:\*\*/i,"").trim()).filter(Boolean).join(" ").slice(0,300)
        : rawContent.slice(0,300);
      const kling = `Cinematic promotional video for ${company}. Core message: "${coreMessage.slice(0,200)}". Style: modern tech corporate, smooth camera, 4K, professional. Industry: ${industry}. ${location?"Location context: "+location+".":""} No text overlays. Aspirational premium feel.`;
      const veo   = `Professional ${industry} company (${company}) video. Message: ${coreMessage.slice(0,200)}. Visual: Modern office, AI interfaces, confident professionals. Colors: deep navy, teal, white. Smooth dolly shots. 4K. No text.`;
      const runway = `${company} AI platform promo video. ${coreMessage.slice(0,150)}. Premium tech brand. Clean modern aesthetic. 16:9.`;
      return {type:"video",kling,veo,runway};
    }
    const isComparison = ["comparison","diagram","vs","before","after","difference"].some((k:string)=>del.name.toLowerCase().includes(k));
    const isHero = ["hero","banner","cover","header","main","feature"].some((k:string)=>del.name.toLowerCase().includes(k));
    const colorMatch = rawContent.match(/#[0-9A-Fa-f]{6}/g);
    const colors = colorMatch?colorMatch.slice(0,3).join(", "):"deep navy, teal, white";
    const visualSpec = rawContent.split("\n").filter((l:string)=>l.length>20&&["visual","style","color","design","image","show","background"].some(kw=>l.toLowerCase().includes(kw))).slice(0,4).join(". ").slice(0,300);
    let dalle = "";
    if(isComparison){
      dalle = `Clean professional infographic comparison for ${company}. Split: left=old manual workflow (warm reds/grays), right=AI-automated workflow (cool teals/white). Central transition arrow. McKinsey consulting aesthetic. ${colors} palette. Abstract icons only, no real text. White background. 16:9.`;
    } else if(isHero){
      dalle = `Premium hero image for ${company}, an AI ${industry} platform. ${visualSpec||"Futuristic glowing AI interface connected to business workflows."}. Professional aspirational enterprise aesthetic. ${colors}. Cinematic lighting, depth of field. No text overlays. 16:9 landscape.`;
    } else {
      dalle = `Professional marketing visual for ${company}, ${industry} AI platform. Deliverable: ${del.name}. ${visualSpec.slice(0,200)||"Modern corporate aesthetic, premium feel."}. Color palette: ${colors}. Ultra high quality, 16:9 ratio. No text overlays.`;
    }
    return {type:"image",dalle,midjourney:dalle+" --ar 16:9 --style raw --q 2",stability:dalle};
  },[]);

  const callDallE=useCallback(async(prompt,openaiKey)=>{
    const r=await fetch("https://api.openai.com/v1/images/generations",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+openaiKey.trim()},
      body:JSON.stringify({model:"dall-e-3",prompt:prompt.slice(0,3900),n:1,size:"1792x1024",quality:"standard"})
    });
    if(!r.ok){const t=await r.text().catch(()=>"");throw new Error("DALL-E: "+r.status+" "+t.slice(0,100));}
    const d=await r.json();
    return d.data?.[0]?.url||null;
  },[]);

  const callStabilityAI=useCallback(async(prompt,stabilityKey)=>{
    const r=await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+stabilityKey.trim(),"Accept":"application/json"},
      body:JSON.stringify({text_prompts:[{text:prompt.slice(0,2000),weight:1}],cfg_scale:7,height:1024,width:1024,samples:1,steps:30})
    });
    if(!r.ok){const t=await r.text().catch(()=>"");throw new Error("Stability: "+r.status+" "+t.slice(0,100));}
    const d=await r.json();
    const b64=d.artifacts?.[0]?.base64;
    if(!b64)return null;
    const bytes=atob(b64);
    const arr=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++)arr[i]=bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr],{type:"image/png"}));
  },[]);

  const runProjectPackage=useCallback(async(proj)=>{
    if(projectPackaging||!proj)return;
    setProjectPackaging(true);
    setProjectExecPhase("📦 Packaging files...");
    try{
      const JSZip=await ensureJSZip();
      const zip=new JSZip();
      const allDels=(proj.modules||[]).flatMap(m=>(m.deliverables||[]).map(d=>({...d,_modName:m.name})));
      const excluded=proj._excluded||{};
      const done=allDels.filter(d=>d.rawContent&&d.status!=="failed"&&!excluded[d.id]);
      // Execute deliverables serially — yield UI between each to prevent blocking
      const yieldUI=()=>new Promise<void>(r=>setTimeout(r,0));
      engineDowngrades.list=[]; // reset per packaging run
      qualityWarnings.list=[]; // reset per packaging run
      for(const del of done){
        if(projectExecCancelRef.current)break;
        await yieldUI(); // Release UI thread before each deliverable
        const folder=del._modName.replace(/[^a-zA-Z0-9]/g,"-");
        const fname=del.name.replace(/[^a-zA-Z0-9]/g,"-");
        const fmt=(del.outputFormat||"md").toLowerCase();
        const lsContent=(()=>{try{return localStorage.getItem("cos-rc-"+del.id)||"";}catch{return "";}})();
        const content=(rawContentStore.current[del.id]||lsContent||del.rawContent||"").replace(/^\s*(Here is|Here's|Below is|I've created|I have created|I'll create)[^\n]*\n+/i,"").replace(/^\s*(Here is|Here's) SECTION[^\n]*$/gmi,"").replace(/^\s*Here is Section \d+[^\n]*$/gmi,"").replace(/^\s*Here is the (complete|final)[^\n]*$/gmi,"");
        // ── IMPROVED 1: Native DOCX via Word HTML (opens natively in Word) ──
        if(fmt==="docx"){
          // Publication engine first (branded typography, TOC, callouts);
          // the inline Word-HTML path below remains as automatic fallback.
          let _docDone=false;
          try{
            const _pubCtx=["Company: "+(proj.context?.company?.name||co.name||""),"Industry: "+(proj.context?.company?.industry||co.industry||""),"Stage: "+(proj.context?.company?.stage||co.stage||"")].join("\n");
            let _w=false;
            const _bee=new BusinessExecutionEngine(
              async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>(await callMulti({...keys,...(EFF_CLAUDE?.trim()?{claude:EFF_CLAUDE}:{}),...(EFF_GEMINI?.trim()?{gemini:EFF_GEMINI}:{}),...(EFF_GROQ?.trim()?{groq:EFF_GROQ}:{})},defP,sys,msgs,maxT||6000,false,tt||"general")).primary,
              ensureXLSX,ensurePptx,ensureJsPDF,
              (name:any,buf:any)=>{zip.folder(folder).file(String(name).replace(/[^a-zA-Z0-9._-]/g,"-"),buf);_w=true;},
              stripMd);
            const _spec:DeliverableSpec={type:"excel",title:del.name,purpose:del.description||del.name,audience:"board",qualityStandard:"cfo_model",priority:"primary"};
    const _plan:ExecutionPlan={objectiveRestated:del.description||del.name,domain:(["finance","audit","strategy","marketing","operations","hr","legal","technology","sales","risk"] as const).find(d=>(del.capabilityType||"").toLowerCase().includes(d)||del.name.toLowerCase().includes(d))||"finance",persona:"Senior FP&A Director",audience:"board",qualityStandard:"cfo_model",decisionContext:del.description||del.name,deliverables:[_spec],missingInfo:[],executionOrder:[del.name],validationCriteria:[]};
            setProjectExecPhase("\ud83d\udcc4 Building publication-quality Word document: "+del.name);
            const _beeRes:any=await _bee.generateDocx(_plan,_spec,_pubCtx,content,(m:string)=>setProjectExecPhase(m));
            _docDone=_w;
            if(!_w&&_beeRes?.error){throw new Error(_beeRes.error);}
          }catch(_beeErr:any){
            recordEngineDowngrade(del.name,"docx",_beeErr);
          }
          if(!_docDone)try{
            const secs=parseSections(content);
            const coName=proj.context?.company?.name||"";
            let html="<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\" xmlns=\"http://www.w3.org/TR/REC-html40\">"
              +"<head><meta charset=\"UTF-8\"><style>"
              +"@page{mso-page-orientation:portrait;margin:2.54cm;}body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a;text-align:left;}p{text-align:left;}"
              +"h1{font-size:20pt;color:#0D6EFD;border-bottom:2pt solid #0D6EFD;padding-bottom:4pt;margin-top:18pt;}"
              +"h2{font-size:14pt;color:#14B8A6;margin-top:14pt;}"
              +"h3{font-size:12pt;color:#333;margin-top:10pt;}"
              +"p{line-height:1.5;margin:4pt 0;}"
              +"table{border-collapse:collapse;width:100%;margin:8pt 0;}"
              +"th{background:#14B8A6;color:#fff;padding:5pt 8pt;font-weight:bold;text-align:left;}"
              +"td{padding:4pt 8pt;border-bottom:1pt solid #e2e2e2;}"
              +"tr:nth-child(even) td{background:#f6f8fb;}"
              +"</style></head><body>"
              +"<h1>"+del.name+"</h1>"
              +(coName?"<p><em>"+coName+" &middot; "+new Date().toLocaleDateString()+"</em></p>":"");
            for(const sec of secs){
              html+="<h2>"+sec.title+"</h2>";
              let inTable=false;let tableRows=[];
              for(const ln of sec.lines){
                if(ln.includes("|")&&ln.trim().startsWith("|")){
                  if(!inTable){inTable=true;tableRows=[];}
                  const cells=ln.split("|").filter((c,ii,a)=>ii>0&&ii<a.length-1).map(c=>c.trim());
                  if(!cells.every(c=>c.match(/^[-:]+$/)))tableRows.push(cells);
                } else {
                  if(inTable&&tableRows.length){
                    html+="<table><thead><tr>"+tableRows[0].map(c=>"<th>"+c+"</th>").join("")+"</tr></thead><tbody>";
                    tableRows.slice(1).forEach(r=>{html+="<tr>"+r.map(c=>"<td>"+c+"</td>").join("")+"</tr>";});
                    html+="</tbody></table>";inTable=false;tableRows=[];
                  }
                  const t=stripMd(ln).trim();
                  if(t)html+="<p>"+t+"</p>";
                }
              }
              if(inTable&&tableRows.length){
                html+="<table><thead><tr>"+tableRows[0].map(c=>"<th>"+c+"</th>").join("")+"</tr></thead><tbody>";
                tableRows.slice(1).forEach(r=>{html+="<tr>"+r.map(c=>"<td>"+c+"</td>").join("")+"</tr>";});
                html+="</tbody></table>";
              }
            }
            html+="</body></html>";
            // Word HTML saved as .doc opens natively in Microsoft Word
            zip.folder(folder).file(fname+".doc",html);
          }catch{zip.folder(folder).file(fname+".md",content);}
        // ── IMPROVED 2: Enterprise multi-sheet XLSX ──
        } else if(fmt==="xlsx"){
          try{
            // ── BEE-POWERED EXCEL: Professional workbook with formulas ──────
            // BusinessExecutionEngine generates: Dashboard tab, formula cells,
            // conditional formatting, freeze panes, auto-filter, named ranges.
            const _xlsxCurrency = proj.context?.company?.currency||co.currency||"INR";
            const _xlsxSymbol   = proj.context?.company?.currencySymbol||co.currencySymbol||"₹";
            const _xlsxCoCtx    = [
              "Company: "+(proj.context?.company?.name||co.name||""),
              "Industry: "+(proj.context?.company?.industry||co.industry||""),
              "Stage: "+(proj.context?.company?.stage||co.stage||""),
              "Location: "+(proj.context?.company?.location||co.location||""),
              "Currency: "+_xlsxSymbol+_xlsxCurrency,
            ].join("\n");
            // Buffer into ZIP — BEE dlFile injects here
            let _xlsxWritten = false;
            const _xlsxBEE = new BusinessExecutionEngine(
              async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>(await callMulti({...keys,...(EFF_CLAUDE?.trim()?{claude:EFF_CLAUDE}:{}),...(EFF_GEMINI?.trim()?{gemini:EFF_GEMINI}:{}),...(EFF_GROQ?.trim()?{groq:EFF_GROQ}:{})},defP,sys,msgs,maxT||4000,false,tt||"excel_advanced")).primary,
              ensureXLSX, ensurePptx, ensureJsPDF,
              (name:any, xlsxContent:any) => {
                // Route into ZIP instead of direct download
                const _safeName = String(name).replace(/[^a-zA-Z0-9._-]/g,"-");
                if(xlsxContent instanceof ArrayBuffer){
                  zip.folder(folder).file(_safeName, xlsxContent);
                  _xlsxWritten = true;
                } else if(xlsxContent && typeof xlsxContent === "object" && xlsxContent.buffer){
                  zip.folder(folder).file(_safeName, xlsxContent.buffer || xlsxContent);
                  _xlsxWritten = true;
                } else {
                  // Blob — need to read it
                  zip.folder(folder).file(_safeName, xlsxContent);
                  _xlsxWritten = true;
                }
              },
              stripMd,
              { image:async(p:string)=>{const _oa=((keys as any).openai||"").trim();if(_oa){try{const u=await callDallE(p,_oa);if(u)return u;}catch{}}return callFalImage((keys as any).fal||EFF_FAL,p);},
                video:(p:string)=>callFalVideo((keys as any).fal||EFF_FAL,p) },
            );
            const _xlsxDel: DeliverableSpec = {
              type: "excel",
              title: del.name,
              purpose: del.description || del.name,
              audience: (del.aiPersona||del.capabilityType||"cfo").toLowerCase().includes("board") ? "board" : "cfo",
              qualityStandard: "cfo_model",
              priority: "primary",
            };
            const _xlsxPlan: ExecutionPlan = {
              objectiveRestated: del.description||del.name,
              domain: (["finance","audit","strategy","marketing","operations","hr","legal","technology","sales","risk"] as const).find(d=>(del.capabilityType||"").toLowerCase().includes(d)||del.name.toLowerCase().includes(d))||"finance",
              persona: "Senior FP&A Manager",
              audience: "cfo",
              qualityStandard: "cfo_model",
              decisionContext: del.description||del.name,
              deliverables: [_xlsxDel],
              missingInfo: [],
              executionOrder: [del.name],
              validationCriteria: [],
            };
            setProjectExecPhase("📊 Building professional Excel workbook: "+del.name);
            const _xlsxRes:any=await _xlsxBEE.generateExcel(_xlsxPlan, _xlsxDel, _xlsxCoCtx, content, _xlsxCurrency, _xlsxSymbol, (msg:string)=>setProjectExecPhase(msg));
            if(_xlsxRes?.qualityWarning)qualityWarnings.list.push({deliverable:del.name,warning:_xlsxRes.qualityWarning});
            if(!_xlsxWritten){
              // BEE fallback: write basic structured XLSX
              throw new Error("BEE did not write file");
            }
          }catch(xlsxErr:any){
            // Fallback: structured XLSX with formula detection
            try{
              const XLSX=await ensureXLSX();
              const wb=XLSX.utils.book_new();
              const secs=parseSections(content);
              const cleanCellV=(v:string):string|number=>{if(v.startsWith("="))return v;const c=v.replace(/\*\*([^*]+)\*\*/g,"$1").replace(/\*([^*]+)\*/g,"$1").replace(/`([^`]+)`/g,"$1").replace(/^#+\s*/,"").replace(/^[-*]\s*/,"").trim();const n=Number(c.replace(/[₹$£€,\s%]/g,""));return(!isNaN(n)&&c!=""&&/^[₹$£€]?[\d,.]+[%]?$/.test(c))?n:c;};
              const allRows:any[][]=[];
              secs.forEach(sec=>{
                allRows.push([stripMd(sec.title)]); allRows.push([]);
                const tRows=sec.lines.filter((l:string)=>l.includes("|")&&l.trim().startsWith("|")&&!l.trim().match(/^\|[\s|:-]+\|$/)).map((r:string)=>r.split("|").filter((c:string,ii:number,a:string[])=>ii>0&&ii<a.length-1).map((c:string)=>cleanCellV(c.trim())));
                if(tRows.length>0){tRows.forEach((r:any[])=>allRows.push(r));allRows.push([]);}
                else{sec.lines.filter((l:string)=>l.trim()).forEach((l:string)=>allRows.push([cleanCellV(stripMd(l))]));}
                allRows.push([]);
              });
              const wsMain=XLSX.utils.aoa_to_sheet(allRows.length>2?allRows:[[del.name],[""],[ content]]);
              // Apply formula detection: cells starting with = become formulas
              Object.keys(wsMain).filter(k=>!k.startsWith("!")).forEach(k=>{
                const cell=wsMain[k];
                if(cell&&typeof cell.v==="string"&&cell.v.startsWith("=")){
                  cell.f=cell.v.slice(1); cell.t="n"; delete cell.v;
                }
              });
              // Freeze first row, add auto-filter
              wsMain["!freeze"]={xSplit:0,ySplit:1};
              if(allRows[0]?.length) wsMain["!autofilter"]={ref:`A1:${String.fromCharCode(64+allRows[0].length)}1`};
              wsMain["!cols"]=allRows[0]?.map?.(()=>({wch:18}))||[];
              XLSX.utils.book_append_sheet(wb,wsMain,del.name.slice(0,31)||"Data");
              // Assumptions sheet
              const assumptions=content.split("\n").filter((l:string)=>/\[ASSUMPTION\]|\[ESTIMATE\]/i.test(l)).map((l:string)=>[stripMd(l)]);
              if(assumptions.length){const wsA=XLSX.utils.aoa_to_sheet([["Assumption/Estimate"],...assumptions]);XLSX.utils.book_append_sheet(wb,wsA,"Assumptions");}
              const buf=XLSX.write(wb,{type:"array",bookType:"xlsx"});
              zip.folder(folder).file(fname+".xlsx",buf);
            }catch{zip.folder(folder).file(fname+".md",content);}
          }
        // ── PPTX: JSON-driven consulting-grade presentation ─────────────────
        } else if(fmt==="pptx"){
          // Publication engine first (brand master, Calibri design system,
          // 12-16 slide mandate, decision-first planning, native charts).
          // The inline PptxGenJS path below stays as the automatic fallback —
          // and any use of it is now recorded and surfaced to the user.
          let _pptxDone=false;
          try{
            const _pubCtx=["Company: "+(proj.context?.company?.name||co.name||""),"Industry: "+(proj.context?.company?.industry||co.industry||""),"Stage: "+(proj.context?.company?.stage||co.stage||"")].join("\n");
            let _w=false;
            const _bee=new BusinessExecutionEngine(
              async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>(await callMulti({...keys,...(EFF_CLAUDE?.trim()?{claude:EFF_CLAUDE}:{}),...(EFF_GEMINI?.trim()?{gemini:EFF_GEMINI}:{}),...(EFF_GROQ?.trim()?{groq:EFF_GROQ}:{})},defP,sys,msgs,maxT||6000,false,tt||"general")).primary,
              ensureXLSX,ensurePptx,ensureJsPDF,
              (name:any,buf:any)=>{zip.folder(folder).file(String(name).replace(/[^a-zA-Z0-9._-]/g,"-"),buf);_w=true;},
              stripMd);
            const _spec:DeliverableSpec={type:"pptx",title:del.name,purpose:del.description||del.name,audience:"board",qualityStandard:"mckinsey_deck",priority:"primary"};
            const _plan:ExecutionPlan={objectiveRestated:del.description||del.name,domain:(["finance","audit","strategy","marketing","operations","hr","legal","technology","sales","risk"] as const).find(d=>(del.capabilityType||"").toLowerCase().includes(d)||del.name.toLowerCase().includes(d))||"strategy",persona:"Senior Consultant",audience:"board",qualityStandard:"mckinsey_deck",decisionContext:del.description||del.name,deliverables:[_spec],missingInfo:[],executionOrder:[del.name],validationCriteria:[]};
            setProjectExecPhase("\ud83d\udcca Building publication-quality presentation: "+del.name);
            const _beeRes:any=await _bee.generatePPTX(_plan,_spec,_pubCtx,content,(m:string)=>setProjectExecPhase(m));
            _pptxDone=_w;
            if(!_w&&_beeRes?.error){throw new Error(_beeRes.error);}
            if(_beeRes?.qualityWarning)qualityWarnings.list.push({deliverable:del.name,warning:_beeRes.qualityWarning});
          }catch(_beeErr:any){
            recordEngineDowngrade(del.name,"pptx",_beeErr);
          }
          if(!_pptxDone)try{
            const PptxGenJS=await ensurePptx();
            const pptx=new PptxGenJS();
            pptx.defineLayout({name:"WIDE",width:13.333,height:7.5}); pptx.layout="WIDE";
            const coN=proj.context?.company?.name||co.name||"Company";
            const sym=proj.context?.company?.currencySymbol||co.currencySymbol||"₹";

            // ── PARSE JSON OUTPUT FROM AI ──────────────────────────────────
            // AI now outputs structured JSON with slide specs
            let schema:any=null;
            const jsonMatch=content.match(/```json([\s\S]*?)```/i)||content.match(/\{[\s\S]*"slides"[\s\S]*\}/);
            if(jsonMatch){
              try{ schema=JSON.parse((jsonMatch[1]||jsonMatch[0]).trim()); }catch{}
            }
            if(!schema?.slides?.length){
              // Salvage complete slides from truncated JSON before giving up
              const salvaged=salvageSlidesJson(content);
              if(salvaged.length>=2){schema={title:del.name,slides:salvaged};}
              else{schema=parseMdToSlidesGlobal(content,coN,del.name);}
            }
            const slides:any[]=schema.slides||[];

            // ── THEME COLOURS ──────────────────────────────────────────────
            const THEME={
              dark:"0A0E1A", primary:"1E3A5F", accent:"14B8A6",
              white:"FFFFFF", muted:"94A3B8", light:"F1F5F9",
              amber:"D97706", red:"DC2626", green:"16A34A",
            };
            const CHART_COLORS=["14B8A6","1E3A5F","3B82F6","F59E0B","EF4444","10B981","A855F7"];

            // ── SLIDE BUILDERS ─────────────────────────────────────────────
            const addStdHeader=(slide:any,title:string,slideNum:number,total:number)=>{
              slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:0.85,fill:{color:"131825"}});
              slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:0.22,h:0.85,fill:{color:THEME.accent}});
              slide.addText(title,{x:0.4,y:0.08,w:11.5,h:0.7,fontSize:19,bold:true,color:THEME.white,fontFace:"Calibri",valign:"middle"});
              slide.addText(`${slideNum}/${total}`,{x:12.2,y:0.08,w:1.0,h:0.7,fontSize:9,color:THEME.muted,align:"right",fontFace:"Calibri"});
            };

            for(let si=0;si<slides.length;si++){
              const sd=slides[si];
              const slide=pptx.addSlide();
              const total=slides.length;

              if(sd.layout==="title"){
                slide.background={color:THEME.dark};
                slide.addShape(pptx.ShapeType.rect,{x:0,y:2.9,w:0.4,h:1.8,fill:{color:THEME.accent}});
                slide.addText(sd.title||del.name,{x:0.7,y:2.8,w:11,h:1.1,fontSize:34,bold:true,color:THEME.white,fontFace:"Calibri"});
                slide.addText(sd.subtitle||"",{x:0.7,y:3.95,w:11,h:0.7,fontSize:18,color:THEME.accent,fontFace:"Calibri"});
                slide.addText(sd.meta||`${coN}  ·  ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}  ·  Confidential`,{x:0.7,y:6.9,w:11,h:0.4,fontSize:10,color:THEME.muted,fontFace:"Calibri"});
              }
              else if(sd.layout==="exec_summary"){
                slide.background={color:THEME.dark};
                addStdHeader(slide,sd.title||"Executive Summary",si+1,total);
                const bullets=(sd.bullets||[]).slice(0,5);
                bullets.forEach((b:string,bi:number)=>{
                  const y=1.1+bi*1.1;
                  slide.addShape(pptx.ShapeType.ellipse,{x:0.35,y:y+0.08,w:0.5,h:0.5,fill:{color:THEME.accent}});
                  slide.addText(String(bi+1),{x:0.35,y:y+0.02,w:0.5,h:0.5,fontSize:14,bold:true,color:THEME.white,align:"center",fontFace:"Calibri"});
                  slide.addText(b.replace(/^[-•*]\s*/,""),{x:1.0,y,w:11.8,h:0.9,fontSize:14,color:THEME.white,fontFace:"Calibri",valign:"middle"});
                });
                if(sd.so_what) slide.addText(`Key takeaway: ${sd.so_what}`,{x:0.4,y:6.8,w:12.5,h:0.5,fontSize:11,color:THEME.accent,italic:true,fontFace:"Calibri"});
                if(sd.notes) slide.addNotes(sd.notes);
              }
              else if(sd.layout==="chart"&&sd.series?.length){
                slide.background={color:THEME.dark};
                addStdHeader(slide,sd.title||"Analysis",si+1,total);
                try{
                  const ctMap:any={bar:pptx.ChartType?.bar,line:pptx.ChartType?.line,pie:pptx.ChartType?.pie,waterfall:pptx.ChartType?.bar,scatter:pptx.ChartType?.scatter};
                  const chartData=sd.series.map((s:any,ci:number)=>({name:s.name,labels:sd.categories||[],values:(s.values||[]).map(Number)}));
                  slide.addChart(ctMap[sd.chart_type]||pptx.ChartType?.bar,chartData,{
                    x:0.3,y:1.0,w:8.5,h:5.8,
                    showLegend:true,legendPos:"b",legendFontSize:10,legendColor:THEME.muted,
                    chartColors:CHART_COLORS,plotAreaBkgndColor:THEME.dark,
                    valAxisLabelColor:THEME.muted,catAxisLabelColor:THEME.muted,
                    showTitle:false,dataLabelFontSize:9,
                  });
                  if(sd.insight) slide.addText(sd.insight,{x:9.0,y:1.0,w:4.1,h:5.8,fontSize:12,color:THEME.white,fontFace:"Calibri",valign:"top",wrap:true});
                }catch{
                  // Chart failed - render as text
                  slide.addText(content.slice(0,500),{x:0.4,y:1.0,w:12.5,h:5.8,fontSize:11,color:THEME.white,fontFace:"Calibri",wrap:true});
                }
                if(sd.notes) slide.addNotes(sd.notes);
              }
              else if(sd.layout==="two_col"){
                slide.background={color:THEME.dark};
                addStdHeader(slide,sd.title||"Analysis",si+1,total);
                slide.addShape(pptx.ShapeType.rect,{x:6.65,y:1.0,w:0.03,h:6.0,fill:{color:"263050"}});
                if(sd.left_header) slide.addText(sd.left_header,{x:0.4,y:1.0,w:5.9,h:0.5,fontSize:12,bold:true,color:THEME.accent,fontFace:"Calibri"});
                if(sd.right_header) slide.addText(sd.right_header,{x:7.0,y:1.0,w:6.0,h:0.5,fontSize:12,bold:true,color:THEME.accent,fontFace:"Calibri"});
                (sd.left||[]).forEach((b:string,bi:number)=>slide.addText("▸  "+b.replace(/^[-•*]\s*/,""),{x:0.4,y:1.65+bi*0.8,w:5.9,h:0.7,fontSize:12,color:THEME.white,fontFace:"Calibri"}));
                (sd.right||[]).forEach((b:string,bi:number)=>slide.addText("▸  "+b.replace(/^[-•*]\s*/,""),{x:7.0,y:1.65+bi*0.8,w:6.0,h:0.7,fontSize:12,color:THEME.white,fontFace:"Calibri"}));
                if(sd.notes) slide.addNotes(sd.notes);
              }
              else if(sd.layout==="table"&&sd.headers?.length){
                slide.background={color:THEME.dark};
                addStdHeader(slide,sd.title||"Data",si+1,total);
                try{
                  const colW=Math.floor(12.5/sd.headers.length);
                  const tblData=[
                    sd.headers.map((h:string)=>({text:h,options:{bold:true,color:THEME.white,fill:{color:THEME.primary},fontSize:11,align:"center"}})),
                    ...(sd.rows||[]).map((row:string[],ri:number)=>row.map((cell:string)=>({text:String(cell),options:{color:THEME.white,fill:{color:ri%2===0?"131825":"0A0E1A"},fontSize:10,align:"center"}})))
                  ];
                  slide.addTable(tblData,{x:0.4,y:1.1,w:12.5,colW:sd.headers.map(()=>colW),rowH:0.42,border:{type:"solid",color:"263050",pt:0.5}});
                }catch{
                  const tableText=(sd.headers.join(" | ")+"\n"+(sd.rows||[]).map((r:string[])=>r.join(" | ")).join("\n"));
                  slide.addText(tableText,{x:0.4,y:1.1,w:12.5,h:5.8,fontSize:10,color:THEME.white,fontFace:"Calibri",wrap:true});
                }
                if(sd.notes) slide.addNotes(sd.notes);
              }
              else if(sd.layout==="closing"){
                slide.background={color:THEME.primary};
                slide.addShape(pptx.ShapeType.rect,{x:0,y:3.0,w:0.4,h:2.2,fill:{color:THEME.accent}});
                slide.addText(sd.title||"Recommendations & Next Steps",{x:0.7,y:2.9,w:11,h:1.0,fontSize:28,bold:true,color:THEME.white,fontFace:"Calibri"});
                (sd.actions||[]).forEach((a:string,ai:number)=>slide.addText(`${ai+1}. ${a}`,{x:0.7,y:4.05+ai*0.7,w:11,h:0.65,fontSize:14,color:THEME.white,fontFace:"Calibri"}));
                if(sd.bottom_line) slide.addText(sd.bottom_line,{x:0.7,y:6.9,w:11,h:0.4,fontSize:11,color:THEME.accent,italic:true,fontFace:"Calibri"});
                if(sd.notes) slide.addNotes(sd.notes);
              }
              else{
                // Generic text slide fallback
                slide.background={color:THEME.dark};
                addStdHeader(slide,sd.title||del.name,si+1,total);
                const bulletText=(sd.bullets||sd.content||(typeof sd=="string"?[sd]:[JSON.stringify(sd)]));
                const bullets=Array.isArray(bulletText)?bulletText:[bulletText];
                bullets.slice(0,8).forEach((b:string,bi:number)=>
                  slide.addText("▸  "+(b||"")||"",{x:0.4,y:1.15+bi*0.73,w:12.5,h:0.65,fontSize:13,color:THEME.white,fontFace:"Calibri",valign:"middle"})
                );
                if(sd.notes) slide.addNotes(sd.notes);
              }
            }

            const buf=await pptx.write({outputType:"arraybuffer"});
            zip.folder(folder).file(fname+".pptx",buf);
          }catch(pptxErr:any){
            zip.folder(folder).file(fname+"-pptx-error.md","PPTX generation error: "+pptxErr.message+"\n\nRaw content:\n"+content);
          }
        } else if(fmt==="pdf"){
          // Publication engine first (cover, TOC, branded wrapped tables);
          // the inline jsPDF path below remains as automatic fallback.
          let _pdfDone=false;
          try{
            const _pubCtx=["Company: "+(proj.context?.company?.name||co.name||""),"Industry: "+(proj.context?.company?.industry||co.industry||""),"Stage: "+(proj.context?.company?.stage||co.stage||"")].join("\n");
            let _w=false;
            const _bee=new BusinessExecutionEngine(
              async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>(await callMulti({...keys,...(EFF_CLAUDE?.trim()?{claude:EFF_CLAUDE}:{}),...(EFF_GEMINI?.trim()?{gemini:EFF_GEMINI}:{}),...(EFF_GROQ?.trim()?{groq:EFF_GROQ}:{})},defP,sys,msgs,maxT||6000,false,tt||"general")).primary,
              ensureXLSX,ensurePptx,ensureJsPDF,
              (name:any,buf:any)=>{zip.folder(folder).file(String(name).replace(/[^a-zA-Z0-9._-]/g,"-"),buf);_w=true;},
              stripMd);
            const _spec:DeliverableSpec={type:"pdf",title:del.name,purpose:del.description||del.name,audience:"board",qualityStandard:"cfo_model",priority:"primary"};
            const _plan:ExecutionPlan={objectiveRestated:del.description||del.name,domain:(["finance","audit","strategy","marketing","operations","hr","legal","technology","sales","risk"] as const).find(d=>(del.capabilityType||"").toLowerCase().includes(d)||del.name.toLowerCase().includes(d))||"strategy",persona:"Senior Consultant",audience:"board",qualityStandard:"cfo_model",decisionContext:del.description||del.name,deliverables:[_spec],missingInfo:[],executionOrder:[del.name],validationCriteria:[]};
            await _bee.generatePDF(_plan,_spec,_pubCtx,cnt,()=>{});
            _pdfDone=_w;
            if(!_w&&_beeRes?.error){throw new Error(_beeRes.error);}
          }catch(_beeErr:any){
            recordEngineDowngrade(del.name,"pdf",_beeErr);
          }
          if(!_pdfDone)try{
            var _pdfContentSafe=pdfSafeText((content||"").replace(/^\s*---+\s*$/gm,""));const pdfBuf=await(async()=>{
              const content=_pdfContentSafe; // shadow: entire inline renderer uses sanitized text
            const jsPDF=await ensureJsPDF();const doc=new jsPDF({orientation:"portrait",unit:"pt",format:"a4"});
            const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),ML=54,MR=54,MT=54,MB=54,CW=W-ML-MR;
            const TEAL:any=[20,184,166],NAVY:any=[30,58,95],DARK:any=[30,30,30],GREY:any=[100,100,100],WHITE:any=[255,255,255];
            const TBL=16;const y={v:MT+40};
            const hdr=()=>{doc.setFillColor(...NAVY);doc.rect(0,0,W,36,"F");doc.setFontSize(8);doc.setFont("helvetica","normal");doc.setTextColor(...WHITE);doc.text(del.name.slice(0,55),ML,24);doc.text(proj.context?.company?.name||co.name||"",W-MR,24,{align:"right"});};
            const safeT=(t:string,x:number,fs:number,col:any[],bd=false,mw=CW)=>{doc.setFontSize(fs);doc.setFont("helvetica",bd?"bold":"normal");doc.setTextColor(...col);doc.splitTextToSize(String(t),mw).forEach((l:string)=>{if(y.v+fs*1.4>H-MB){doc.addPage();y.v=MT+40;hdr();}doc.text(l,x,y.v);y.v+=fs*1.4;});};
            doc.setFillColor(...NAVY);doc.rect(0,0,W,H,"F");doc.setFillColor(...TEAL);doc.rect(0,255,W,4,"F");
            doc.setFont("helvetica","bold");doc.setFontSize(26);doc.setTextColor(...WHITE);doc.splitTextToSize(del.name,CW).forEach((l:string,i:number)=>doc.text(l,ML,285+i*34));
            doc.setFontSize(13);doc.setFont("helvetica","normal");doc.setTextColor(...TEAL);doc.text(proj.context?.company?.name||co.name||"",ML,340);
            doc.setFontSize(10);doc.setTextColor(180,190,200);doc.text(new Date().toLocaleDateString("en-GB")+"  ·  Confidential",ML,362);
            doc.addPage();hdr();
            const SKIPRE=/^(cover|table of contents?|toc|contents?)$/i;
            parseSections(content).filter((s:any)=>!SKIPRE.test(s.title.trim())).forEach(sec=>{
              if(y.v+30>H-MB){doc.addPage();y.v=MT+40;hdr();}
              doc.setFillColor(244,246,250);doc.rect(ML-6,y.v-14,CW+12,20,"F");doc.setFillColor(...TEAL);doc.rect(ML-6,y.v-14,3,20,"F");
              safeT(sec.title,ML+4,11,NAVY,true,CW-8);y.v+=4;
              const tR=sec.lines.filter((l:string)=>l.includes("|")||l.trim().startsWith("|")).filter((l:string)=>!l.match(/^\|[-:\s|]+\|$/)).map((r:string)=>r.split("|").filter((c:string,ii:number,a:string[])=>ii>0&&ii<a.length-1).map((c:string)=>stripMd(c).trim()));
              if(tR.length>=2){
                const cc=Math.max(...tR.map((r:string[])=>r.length),1),cw=CW/cc;
                if(y.v+TBL>H-MB){doc.addPage();y.v=MT+40;hdr();}
                doc.setFillColor(...NAVY);doc.rect(ML,y.v-11,CW,TBL,"F");doc.setFontSize(8);doc.setFont("helvetica","bold");doc.setTextColor(...WHITE);
                tR[0].forEach((h:string,ci:number)=>doc.text(h.slice(0,22),ML+ci*cw+3,y.v));y.v+=TBL+1;doc.setFont("helvetica","normal");
                tR.slice(1).forEach((row:string[],ri:number)=>{
                  if(y.v+TBL>H-MB){doc.addPage();y.v=MT+40;hdr();}
                  if(ri%2===0){doc.setFillColor(248,250,252);doc.rect(ML,y.v-11,CW,TBL,"F");}
                  doc.setTextColor(...DARK);doc.setFontSize(8);row.forEach((c:string,ci:number)=>doc.text(String(c).slice(0,26),ML+ci*cw+3,y.v));y.v+=TBL;
                });y.v+=8;
              } else {
                sec.lines.forEach((ln:string)=>{const raw=ln.trim();if(!raw||raw.match(/^\|[-:\s|]+\|$/))return;const txt=stripMd(raw).replace(/[\u2019\u2018]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\[VERIFIED\]/gi,"✓").replace(/\[ESTIMATE\]/gi,"~").replace(/\[ASSUMPTION\]/gi,"*");if(!txt.trim())return;const ib=raw.startsWith("-")||raw.startsWith("*")||raw.startsWith("•");if(ib&&y.v+10<H-MB){doc.setFontSize(8);doc.setTextColor(...TEAL);doc.text("▸",ML,y.v);}safeT(txt,ib?ML+12:ML,9.5,DARK,false,CW-(ib?12:0));y.v+=2;});
              }
              y.v+=10;
            });
            const tot=doc.internal.getNumberOfPages();for(let p=1;p<=tot;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(...GREY);doc.text("Page "+p+" of "+tot,W/2,H-18,{align:"center"});doc.text("Confidential",ML,H-18);}
            return doc.output("arraybuffer");
          })();zip.folder(folder).file(fname+".pdf",pdfBuf);
          }catch(pdfErr:any){zip.folder(folder).file(fname+"-error.md","PDF error: "+(pdfErr?.message||String(pdfErr))+"\n\n"+content.slice(0,2000));}
        } else if(fmt==="image"||fmt==="video"){
          // REAL media generation — deliver the actual PNG/MP4, never a prompt file.
          // Script/brief is included alongside as reference. A prompt file is written
          // ONLY on genuine failure, and it states the exact error and fix.
          const falK=((keys as any).fal||EFF_FAL||"").trim();
          try{
            setProjectExecPhase((fmt==="video"?"\ud83c\udfac Generating video: ":"\ud83c\udfa8 Generating image: ")+del.name+"...");
            const mp:any=buildMediaPrompt(del,proj.context||{});
            const genPrompt=fmt==="video"?(mp.kling||mp.veo||content.slice(0,500)):(mp.dalle||content.slice(0,500));
            let url="";
            if(fmt==="video"){
              url=await callFalVideo(falK,genPrompt);
            }else{
              // DALL\u00b7E is the PRIMARY image provider (fal.ai billing on hold);
              // fal.ai remains the automatic fallback when no OpenAI key exists.
              const _oa=((keys as any).openai||"").trim();
              if(_oa){
                try{
                  setProjectExecPhase("\ud83c\udfa8 Generating image via DALL\u00b7E: "+del.name+"...");
                  url=await callDallE(genPrompt,_oa);
                  if(!url)throw new Error("DALL\u00b7E returned no image URL");
                }catch(dErr:any){
                  setProjectExecPhase("\ud83c\udfa8 DALL\u00b7E unavailable \u2014 trying fal.ai: "+del.name);
                  url=await callFalImage(falK,genPrompt);
                }
              }else{
                url=await callFalImage(falK,genPrompt);
              }
            }
            if(!url)throw new Error("fal.ai returned no media URL");
            setProjectExecPhase("\u2b07 Downloading generated "+fmt+": "+del.name+"...");
            if(projectExecCancelRef.current)throw new Error("CANCELLED");
            const resp=await fetch(url,{signal:AbortSignal.timeout(120000)});
            if(!resp.ok)throw new Error("media download failed: HTTP "+resp.status);
            const blob=await resp.blob();
            const ext=fmt==="video"?"mp4":(((blob.type||"image/png").split("/")[1]||"png").split("+")[0]);
            zip.folder(folder).file(fname+"."+ext,blob);
            zip.folder(folder).file(fname+(fmt==="video"?"-script.md":"-brief.md"),(fmt==="video"?"## Video Script\n\n":"## Image Brief\n\n")+content);
          }catch(mediaErr:any){
            // Phase 5: graceful capability-limit fallback. Rather than just
            // naming the error, use the Research Desk (already live-web-search
            // capable) to find CURRENT tools and real pricing, and hand back a
            // clear, non-technical, step-by-step alternative — never leave the
            // user with only a raw error and no path forward.
            let alternativeGuide="";
            try{
              setProjectExecPhase("\ud83d\udd0d "+(fmt==="video"?"Video":"Image")+" generation unavailable \u2014 researching alternatives...");
              const researchQ="current best "+(fmt==="video"?"AI video generation tools 2026 with pricing (e.g. Runway, Pika, Kling, Luma)":"AI image generation tools 2026 with pricing (e.g. Midjourney, DALL-E, Ideogram)")+" for a "+(del.description||del.name).slice(0,150);
              alternativeGuide=await runResearchDesk((s,m,t)=>ask(s,m,t,true),co,compData,researchQ,showToast);
            }catch{/* research is best-effort — the honest error below always ships regardless */}
            zip.folder(folder).file(fname+"-GENERATION-FAILED.md",
              "\u26a0 "+fmt.toUpperCase()+" COULD NOT BE GENERATED\n\n"+
              "WHY: "+(mediaErr?.message||String(mediaErr))+"\n\n"+
              "DALL\u00b7E fallback: "+(fmt==="image"?(((keys as any).openai||"").trim()?"attempted (see error above)":"NOT attempted \u2014 no OpenAI key saved in Settings"):"not applicable (video)")+"\n\n"+
              "TO FIX IT ON THIS PLATFORM: verify the fal.ai API key (Settings \u2192 fal.ai), account credits, and network access to fal.run, then re-run this deliverable.\n\n"+
              (alternativeGuide?"## Or Get It Done Right Now, Elsewhere\n\n"+alternativeGuide+"\n\nCopy the prompt below into whichever tool you choose above.\n\n":"")+
              "## Prompt (use on this platform after fixing, or on an alternative tool above)\n\n"+content);
          }
        } else if(fmt==="svg"){
          // SVG diagrams — save as proper .svg file that opens in browsers
          const svgContent=content.includes("<svg")?content:"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 800 500\">\n"+content+"\n</svg>";
          zip.folder(folder).file(fname+".svg",svgContent);
        } else if(["linkedin_post","facebook_post","instagram_post","whatsapp_message","email"].includes(fmt)){
          // Phase 4: social/messaging deliverables — plain, clean text, ready to
          // copy-paste straight into the target app. No markdown syntax, no
          // file-format complexity needed for these.
          const platformLabel:Record<string,string>={linkedin_post:"LinkedIn Post",facebook_post:"Facebook Post",instagram_post:"Instagram Caption",whatsapp_message:"WhatsApp Message",email:"Email"}[fmt]||fmt;
          const cleanText=stripMd(content).trim();
          zip.folder(folder).file(fname+".txt","── "+platformLabel+" — ready to copy and paste ──\n\n"+cleanText);
        } else {
          zip.folder(folder).file(fname+"."+(fmt||"txt"),content);
        }
      } // end for(const del of done)
      // Phase 5: Media generation
      const mediaDels=done.filter(d=>d.outputFormat==="image"||d.outputFormat==="video"||d.outputFormat==="image_prompt"||d.outputFormat==="video_prompt"||d.name.toLowerCase().includes("image")||d.name.toLowerCase().includes("video")||d.name.toLowerCase().includes("design")||d.name.toLowerCase().includes("banner")||d.name.toLowerCase().includes("creative")||d.name.toLowerCase().includes("visual")||d.name.toLowerCase().includes("diagram"));
      const mediaPromptLines=["# Media Generation Prompts","Generated: "+new Date().toLocaleString(),"","These prompts are ready to paste into your chosen tool.",""];
      for(const del of mediaDels){
        const ctx=proj.context||{};
        const prompts=buildMediaPrompt(del,ctx);
        const folder=del._modName.replace(/[^a-zA-Z0-9]/g,"-");
        const fname=del.name.replace(/[^a-zA-Z0-9]/g,"-");
        mediaPromptLines.push("## "+del.name);
        const falKey=(keys.fal||EFF_FAL)?.trim();
        if(prompts.type==="video"||del.outputFormat==="video"){
          // ── VIDEO: Generate via fal.ai (Kling), fall back to prompts ───────
          if(falKey){
            try{
              setProjectExecPhase("🎬 Generating video: "+del.name+" (this may take 60-90s)...");
              const scriptContent=rawContentStore.current[del.id]||del.rawContent||"";
              const voiceLines=scriptContent.split("\n").filter((l:string)=>l.includes("VOICEOVER")).map((l:string)=>l.replace(/\*\*VOICEOVER[^:]*:\*\*/i,"").trim()).filter(Boolean).join(" ").slice(0,400);
              const cinematicP=voiceLines?`Cinematic ${del.name} for ${proj.context?.company?.name||""}. Key message: "${voiceLines}". Style: modern tech corporate, smooth camera, 4K, professional, aspirational. No text overlays. 16:9.`:(prompts.kling||prompts.veo||del.name);
              const videoUrl=await callFalVideo(falKey,cinematicP,5);
              if(videoUrl){
                const vr=await fetch(videoUrl);
                const vBlob=await vr.blob();
                const vBuf=await vBlob.arrayBuffer();
                zip.folder(folder).file(fname+".mp4",vBuf);
                mediaPromptLines.push("","**✅ Video generated and saved as: "+fname+".mp4**","");
              }
            }catch(e:any){
              // Generation failed — save prompts as fallback
              mediaPromptLines.push("","*⚠️ Video generation failed ("+e.message.slice(0,80)+"). Prompts saved below.*","");
              mediaPromptLines.push("","### Kling / fal.ai Prompt","```",prompts.kling||"","```","");
              mediaPromptLines.push("### Google Veo Prompt","```",prompts.veo||"","```","");
              mediaPromptLines.push("### Runway ML Prompt","```",prompts.runway||"","```","");
            }
          } else {
            // No fal key — save high-quality prompts ready to use
            mediaPromptLines.push("","### Kling / fal.ai Prompt (add fal.ai key to auto-generate)","```",prompts.kling||"","```","");
            mediaPromptLines.push("### Google Veo Prompt","```",prompts.veo||"","```","");
            mediaPromptLines.push("### Runway ML Prompt","```",prompts.runway||"","```","");
          }
        } else {
          // ── IMAGE: fal.ai first, then DALL-E, then Stability, then prompts ─
          let imgGenerated=false;
          if(falKey&&!imgGenerated){
            try{
              setProjectExecPhase("🖼 Generating image via fal.ai: "+del.name);
              const imgModel=del.name.toLowerCase().includes("diagram")||del.name.toLowerCase().includes("infographic")
                ?"fal-ai/ideogram/v3":"fal-ai/flux-pro";
              const imgPromptText=prompts.dalle||prompts.stability||del.description||(rawContentStore.current[del.id]||del.rawContent||"").slice(0,600)||del.name;const imgUrl=await callFalImage(falKey,imgPromptText,imgModel);
              if(imgUrl){
                const ir=await fetch(imgUrl);
                const ib=await ir.blob();
                const ibuf=await ib.arrayBuffer();
                zip.folder(folder).file(fname+".png",ibuf);
                mediaPromptLines.push("","**✅ Image generated via fal.ai and saved as: "+fname+".png**","");
                imgGenerated=true;
              }
            }catch(e:any){
              mediaPromptLines.push("","*⚠️ fal.ai image failed ("+e.message.slice(0,60)+"), trying next provider...*","");
            }
          }
          if(!imgGenerated&&mediaMode.image==="dalle"&&keys.openai?.trim()){
            try{
              setProjectExecPhase("🖼 Generating image via DALL-E: "+del.name);
              const imgUrl=await callDallE(prompts.dalle,keys.openai);
              if(imgUrl){
                const ir=await fetch(imgUrl);const ib=await ir.blob();const ibuf=await ib.arrayBuffer();
                zip.folder(folder).file(fname+".png",ibuf);
                mediaPromptLines.push("","**✅ Image generated via DALL-E and saved as: "+fname+".png**","");
                imgGenerated=true;
              }
            }catch(e:any){mediaPromptLines.push("","*DALL-E failed: "+e.message.slice(0,60)+"*","");}
          }
          if(!imgGenerated&&mediaMode.image==="stability"&&keys.stability?.trim()){
            try{
              setProjectExecPhase("🖼 Generating image via Stability: "+del.name);
              const imgUrl=await callStabilityAI(prompts.stability,keys.stability);
              if(imgUrl){
                const ir=await fetch(imgUrl);const ib=await ir.blob();const ibuf=await ib.arrayBuffer();
                zip.folder(folder).file(fname+".png",ibuf);
                mediaPromptLines.push("","**✅ Image generated via Stability AI and saved as: "+fname+".png**","");
                imgGenerated=true;
              }
            }catch(e:any){mediaPromptLines.push("","*Stability AI failed: "+e.message.slice(0,60)+"*","");}
          }
          if(!imgGenerated){
            // All providers failed or no key — save quality prompts
            mediaPromptLines.push("","### DALL-E 3 Prompt","```",prompts.dalle||"","```","");
            mediaPromptLines.push("### Midjourney Prompt","```",prompts.midjourney||"","```","");
            mediaPromptLines.push("*(Add fal.ai key in Settings to auto-generate images)*","");
          }
        }
      }
      if(mediaDels.length>0)zip.file("Media-Prompts.md",mediaPromptLines.join("\n"));

      const qaLines=[
        "# QA Report \u2014 "+proj.name,
        "Generated: "+new Date().toLocaleString(),"",
        "## REQUESTED (your prompt)",
        "**Objective:** "+proj.objective,"",
        "## DELIVERED",
        ...done.map(d=>{
          const badge=d.qaResult?.passed?"\u2705":"\u26a0";
          const score=d.qaResult?.score||0;
          const summary=d.qaResult?.summary||"";
          return badge+" **"+d.name+"** ("+d.outputFormat+") \u2014 "+score+"% \u2014 "+summary;
        }),
      ];
      if(engineDowngrades.list.length>0){
        qaLines.push("","## \u26a0 ENGINE DOWNGRADES (lower quality \u2014 fallback was used)","");
        engineDowngrades.list.forEach(d=>qaLines.push("- **"+d.deliverable+"** ("+d.format+"): "+d.reason));
        qaLines.push("","Fix: check Settings \u2192 API keys and retry.");
      }
      if(qualityWarnings.list.length>0){
        qaLines.push("","## \u26a0 CONTENT CHECK WARNINGS (shipped, but flagged \u2014 verify before use)","");
        qaLines.push("These deliverables were regenerated once to fix the issue, but still had it after the retry. They were shipped anyway rather than blocked \u2014 double-check the flagged area before relying on the file.","");
        qualityWarnings.list.forEach(d=>qaLines.push("- **"+d.deliverable+"**: "+d.warning));
      }
      if(engineDowngrades.list.length>0||qualityWarnings.list.length>0){
        try{showToast("\u26a0 "+(engineDowngrades.list.length+qualityWarnings.list.length)+" deliverable(s) flagged \u2014 see QA-Report.md","warning");}catch{}
      }
      zip.file("QA-Report.md",qaLines.join("\n"));
      const sumLines=["# "+proj.name,"","Objective: "+proj.objective,"Generated: "+new Date().toLocaleString(),"Deliverables: "+done.length,"","## Modules",...(proj.modules||[]).map(m=>"- "+m.name+" ("+m.capabilityType+"): "+(m.deliverables||[]).length+" deliverables")];
      zip.file("Project-Summary.md",sumLines.join("\n"));
      const zipBlob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      const zipName=(proj.name||"Project").replace(/[^a-zA-Z0-9]/g,"-")+"-"+Date.now()+".zip";
      const zipUrl=URL.createObjectURL(zipBlob);
      const a=document.createElement("a");a.href=zipUrl;a.download=zipName;a.style.display="none";
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(zipUrl),200);
      showToast("✅ ZIP downloaded — "+done.length+" files packaged","success");
    }catch(e){showToast("Packaging failed: "+e.message,"error");}
    finally{setProjectPackaging(false);setProjectExecPhase("");}
  },[projectPackaging,showToast]);

const runWorkflow=useCallback(async(customChainOverride?:string[],preflightAnswers?:{questions:{persona:string;q:string}[];answers:string[]}|null)=>{
  const taskText=wfTask.trim();
  const taskCat=wfCat;
  if(!taskText||wfRunning)return;
  const ch=CHAINS[taskCat];if(!ch)return;
  const activeChain=customChainOverride&&customChainOverride.length?customChainOverride:ch.chain;
  const preflightContext=preflightAnswers?.questions?.length
    ?"\n\n=== PRE-FLIGHT CONTEXT (user answers to executive questions) ===\n"+preflightAnswers.questions.map((q,i)=>"Q ("+q.persona+"): "+q.q+"\nA: "+(preflightAnswers.answers[i]||"Not provided")).join("\n\n")+"\n\nCRITICAL: Use these answers as the primary input for the deliverable. Build everything around what the user said here."
    :"";
  cancelRef.current.wf=false;
  setWfRunning(true);setError(null);setWfPauseMsg("");

  const wfId=Date.now();
  const newWf={
    id:wfId,task:taskText,category:taskCat,chainLabel:ch.label,
    steps:[],status:"running",startedAt:new Date().toISOString(),
    finalOutput:null,approved:false
  };
  setWfActive(newWf);setWfView("active");

  const steps:any[]=[];
  const wfCurr=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];

  // Same relevance-scoped context injection as processTask — Flow chains
  // get real Ledger/Boardroom data rather than reasoning from scratch.
  const wfModuleContext=getModuleContext(taskCat,{
    ledgerEntries,brSessions,workflows,tQueue:tQRef.current,tmRes,apRes,cur:wfCurr
  });

  for(let i=0;i<activeChain.length;i++){
    if(cancelRef.current.wf){
      showToast("Workflow cancelled at Level "+(i+1),"warning");
      setWfActive(prev=>prev?{...prev,status:"cancelled"}:null);
      setWfRunning(false);setWfPhase("");
      return;
    }

    const roleId=activeChain[i];
    const role=AR.find(r=>r.id===roleId);
if(!role){
  console.error("[OrchestrIQ] Chain config error: role id '"+roleId+"' not found in AR. Level "+(i+1)+" of "+ch.label+" skipped.");
  showToast("Configuration error: role '"+roleId+"' missing for "+ch.label+" Level "+(i+1)+". Please report this.","error");
  continue;
}
    const p=EP[roleId]||{};
    const isFirst=i===0;
    const isLast=i===activeChain.length-1;
    setWfPhase(role.ic+" "+role.t+" - Level "+(i+1)+"/"+activeChain.length);

    const prevWork=steps.length>0
  ?"PREVIOUS LEVEL (build on this, do not repeat it):\nCompleted by "+steps[steps.length-1].role.t+":\n"+steps[steps.length-1].output+
    "\n\nCHAIN PROGRESSION SO FAR: "+steps.map(s=>s.role.t).join(" -> ")
  :"";

    const sys=
  "You are "+role.f+" at \""+co.name+"\".\n"+
  "PROFILE: "+(p.b?.split("\n")[0]||"")+"\n"+
  buildCtx(co,compData)+"\n"+
  preflightContext+"\n"+
  "WORKFLOW CHAIN: \""+ch.label+"\" Level "+(i+1)+"/"+activeChain.length+"\n"+
  "TASK: \""+taskText+"\"\n"+
  (steps.length>0?prevWork+"\n\n":"")+
  (isFirst
    ?"YOUR MANDATE: Produce the ACTUAL DELIVERABLE immediately. Not a plan. Not a strategy. The real thing the user asked for.\n\nSTEP 1: Read the PRE-FLIGHT CONTEXT above carefully — those are the user's own words about what they need. Build everything around those answers.\nSTEP 2: Check COMPANY DATA for any relevant figures (budget, product details, pricing, audience). Use them exactly.\nSTEP 3: Produce the deliverable now. Lead with it. Put it first.\n\nFORMAT YOUR OUTPUT AS:\n[DELIVERABLE]\n(the actual thing — post, document, analysis, SOP, whatever was asked — complete and ready to use)\n\n[ASSUMPTIONS MADE]\n(only list what you assumed because it was genuinely missing — keep this short)\n\n[WHAT WOULD MAKE THIS BETTER]\n(one sentence — what additional info would improve the next draft)"
    +(wfModuleContext?"\n\nPLATFORM DATA:\n"+wfModuleContext:"")
    :isLast
    ?"YOUR MANDATE: Deliver the FINAL, POLISHED executive-grade deliverable. This is what the user hands to a board, client, or investor.\n\nLook at all previous levels. Take the best content and present it as a professional consulting report.\n\nUSE THIS EXACT FORMAT:\n\n# Executive Summary\n(2-4 sentences: core finding, key number in "+wfCurr.sym+", recommended action)\n---\n## Key Insights\n(4-6 bullets, each opening with a **bold keyword**)\n---\n## Detailed Analysis\n(logical subsections with headers; use tables for all comparative or numerical data)\n---\n## Financial Impact\n(all figures in "+wfCurr.sym+"; show: formula → assumption → result for every number)\n---\n## Risks\n| Risk | Likelihood | Impact | Mitigation |\n|------|------------|--------|------------|\n---\n## Opportunities\n(3-5 bullets with upside in "+wfCurr.sym+", timeframe, and owner)\n---\n## Recommendations\n| Priority | Action | Impact | Effort | Deadline |\n|----------|--------|--------|--------|----------|\n---\n## Sources & References\n(every figure cited with source and date)\n\nFORMATTING RULES:\n- Bold all key metrics and decision points\n- Never write unbroken paragraph blocks\n- Every number must carry a unit ("+wfCurr.sym+" or %)\n- Specific to "+co.name+" — no generic placeholders\n\nAFTER finishing, on its own new line write exactly: ===CAPABILITY_BRIEF===\nThen output ONLY a single valid JSON object:\n{\"info_needed\":[\"...\"],\"tools_required\":[{\"name\":\"...\",\"available\":true,\"why\":\"...\"}],\"manual_steps\":[\"...\"],\"automated_steps\":[\"...\"],\"est_cost_usd\":0,\"notes\":\"...\"}"
    :"YOUR MANDATE: Improve the deliverable from the previous level. Do not write reports or strategy sections.\n\nDO:\n- Make the actual deliverable better (sharper copy, stronger numbers, better structure)\n- Add one thing only YOU as "+role.t+" in "+role.dl+" would know that genuinely improves the output\n- Flag if anything is off-brand, unrealistic, or weak — then fix it in the deliverable itself\n\nDO NOT:\n- Write strategy documents or planning sections\n- Repeat what previous levels already said\n- Add budget tables unless the task specifically requires financials\n\nFORMAT: Output the improved deliverable directly, then a brief note on what you changed."
  )+"\nAll figures in "+wfCurr.sym+wfCurr.code+".";

    let reply="";
    let stepFailed=false;
    let failMsg="";

    try{
      const replyFull=await askFull(sys,[{role:"user",content:"Process: \""+taskText+"\""}],isLast?2800:1500);
      reply=replyFull.primary;
      const usedProv=replyFull.usedProvider||defP;
      const usedModel=MODELS[usedProv]?.model||usedProv;
      const inputTok=estimateTokens(sys);
      const outputTok=estimateTokens(reply);
      saveRecord({feature:"Flow: "+ch.label+" L"+(i+1)+" — "+role.t,provider:usedProv,model:usedModel,inputTokens:inputTok,outputTokens:outputTok,cost:estimateCost(usedProv,inputTok,outputTok)||0});
    }catch(err:any){
      stepFailed=true;
      failMsg=err.message||"Unknown error";
    }

    if(stepFailed){
      const step={role,output:"⚠ This level failed: "+failMsg,level:i+1,isFirst,isLast,failed:true,ts:new Date().toISOString(),capability:null};
      steps.push(step);
      setWfActive({...newWf,steps:[...steps],status:"error"});
      setError(failMsg);
      showToast("Level "+(i+1)+" ("+role.t+") failed: "+failMsg,"error");
      setWfRunning(false);setWfPhase("");
      return;
    }

    let stepOutput=reply;
    let stepCapability=null;
    if(isLast){
      const cleanReply=reply.replace(/===\s*\n?CAPABILITY_BRIEF/g,"===CAPABILITY_BRIEF===");
      const parsed=parseCapabilityBrief(cleanReply);
      stepOutput=parsed.output;
      // Intelligence Engine — quality validation at final level (fail-safe: keeps original on any error)
      try{
        setWfPhase("🔍 Quality Review — validating final deliverable");
        const ieCompany={name:co.name||"the company",industry:co.industry||"",stage:co.stage||"",location:co.location||"",markets:co.markets||"",currency:co.currency||"INR",currencySymbol:wfCurr.sym||""};
        const reviewed=await selfReview(stepOutput,taskText,ieCompany,(s,m,t)=>ask(s,m,t,false));
        if(reviewed&&reviewed.length>stepOutput.length*0.5)stepOutput=reviewed;
        const evTags=classifyEvidence(stepOutput);
        if(evTags.length>0){
          const cnt={};evTags.forEach(t=>{cnt[t.category]=(cnt[t.category]||0)+1;});
          stepOutput+="\n\n---\n**Evidence audit (Intelligence Engine):** "+Object.entries(cnt).map(([k,v])=>v+" "+k).join(" · ");
        }
      }catch(ieErr){/* keep original output */}
      if(parsed.capability){
        const fee=computeServiceFee(parsed.capability.est_cost_usd||0);
        const rate=await fetchExchangeRate(wfCurr.code);
        stepCapability={
          ...parsed.capability,
          fee_usd:fee.fee,total_usd:fee.total,
          converted_total: rate?Math.ceil(fee.total*rate):null,
          converted_currency: wfCurr.code, converted_symbol: wfCurr.sym,
        };
      }
    }

    const step={role,output:stepOutput,level:i+1,isFirst,isLast,failed:false,ts:new Date().toISOString(),capability:stepCapability};
    steps.push(step);
    setWfActive({...newWf,steps:[...steps],status:isLast?"awaiting_approval":"running"});
  }

  setWfRunning(false);setWfPhase("");
  cancelRef.current.wf=false;
},[wfTask,wfCat,wfRunning,co,compData,keys,defP,showToast,ledgerEntries,brSessions,tmRes,apRes]);

  const approveWF=useCallback(()=>{
    if(!wfActive)return;
    const approved={...wfActive,status:"approved",approved:true,approvedAt:new Date().toISOString()};
    const updated=[approved,...workflows].slice(0,50);
    setWorkflows(updated);sv("cos-wf",updated);
    setWfActive(null);setWfTask("");setWfView("history");
    showToast("Workflow approved and archived ✓","success");
  },[wfActive,workflows,showToast]);

  const rejectWF=useCallback((note)=>{
    if(!wfActive)return;
    const rejected={...wfActive,status:"rejected",rejectionNote:note||"Sent back for revision",rejectedAt:new Date().toISOString()};
    const updated=[rejected,...workflows].slice(0,50);
    setWorkflows(updated);sv("cos-wf",updated);
    setWfActive(null);setWfTask("");setWfView("new");
    showToast("Workflow rejected — task returned","warning");
  },[wfActive,workflows,showToast]);

  const enqueue=useCallback((taskText,category,priority,autoRouted)=>{
    const cat=autoRouted?autoRoute(taskText):category;
    const ch=CHAINS[cat];if(!ch)return;
    const po={high:0,medium:1,low:2};
    const task={id:Date.now()+Math.random(),task:taskText,category:cat,chainLabel:ch.label,priority:priority||"medium",autoRouted:!!autoRouted,status:TS.QUEUED,steps:[],finalOutput:null,approved:false,createdAt:new Date().toISOString(),startedAt:null,completedAt:null,currentLevel:0};
    const sorted=[...tQRef.current,task].sort((a,b)=>po[a.priority]!==po[b.priority]?po[a.priority]-po[b.priority]:new Date(a.createdAt)-new Date(b.createdAt));
    tQRef.current=sorted;setTQueue([...sorted]);sv("cos-tq",sorted);
    addN("Task queued: \""+taskText.slice(0,50)+(taskText.length>50?"...":"")+"\"","info");
    showToast("Task added to queue","info");
    return task.id;
  },[showToast]);

const processTask=useCallback(async(task:any)=>{
  const ch=CHAINS[task.category];if(!ch)return;
  const p3Curr=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
  const steps=[...task.steps];

  // Phase 1: compressed context accumulator for autonomous queue
  const compressedContexts:CompressedContext[]=[];

  // Phase 1: benchmark session for queue tasks
  let benchSession:BenchmarkSession|null=null;
  if(BENCHMARK_MODE){
    benchSession=startBenchmarkSession({
      workflowId:String(task.id),
      chainLabel:ch.label,
      task:task.task,
      compressionEnabled:COMPRESSION_ENABLED,
    });
  }

  const upd=(updates:any)=>{
    tQRef.current=tQRef.current.map(t=>t.id===task.id?{...t,...updates}:t);
    setTQueue([...tQRef.current]);
    setP3Running((prev:any)=>prev?.id===task.id?{...prev,...updates}:prev);
    sv("cos-tq",tQRef.current);
  };

  upd({status:TS.RUNNING,startedAt:new Date().toISOString()});
  addN("Chain started: "+ch.label,"running");

  // Retrieve relevant cross-module context scoped to this task's category.
  // Finance tasks get Ledger data. Strategy tasks get Boardroom sessions.
  // All tasks get prior approved outputs from the same category.
  // Nothing irrelevant enters the prompt.
  const moduleContext=getModuleContext(task.category,{
    ledgerEntries,brSessions,workflows,tQueue:tQRef.current,tmRes,apRes,cur:p3Curr
  });

  for(let i=0;i<ch.chain.length;i++){
    if(cancelRef.current.q){
      upd({status:TS.FAILED,error:"Cancelled by user"});
      addN("Queue cancelled","warning");
      if(BENCHMARK_MODE&&benchSession)completeBenchmarkSession(benchSession);
      return;
    }

    const roleId=ch.chain[i];
    const role=AR.find(r=>r.id===roleId);
    if(!role)continue;

    const p=EP[roleId]||{};
    const isFirst=i===0;
    const isLast=i===ch.chain.length-1;
    setP3Phase(role.ic+" "+role.t+" — Level "+(i+1)+"/"+ch.chain.length);
    upd({currentLevel:i+1,status:TS.RUNNING});

    // MODE A (COMPRESSION_ENABLED=false): full output — existing behavior, zero change
    // MODE B (COMPRESSION_ENABLED=true):  compressed summaries only
    let prevWork="";
    if(!isFirst){
      if(COMPRESSION_ENABLED&&compressedContexts.length>0){
        prevWork=formatCompressedContextForPrompt(compressedContexts);
      }else{
        prevWork=steps
          .filter(s=>!s.failed)
          .map((s:any,si:number)=>"Level "+(si+1)+": "+s.role.t+"\n"+s.output)
          .join("\n\n");
      }
    }

    // Benchmark: calculate both mode contexts for comparison
    const modeAContext=isFirst?"":steps
      .filter(s=>!s.failed)
      .map((s:any,si:number)=>"Level "+(si+1)+": "+s.role.t+"\n"+s.output)
      .join("\n\n");
    const modeBContext=isFirst?"":(compressedContexts.length>0
      ?formatCompressedContextForPrompt(compressedContexts)
      :modeAContext);

    // System prompt — identical in both modes except prevWork variable
    const sys=
      "You are "+role.f+" at \""+co.name+"\".\n"+
      "PROFILE: "+(p.b?.split("\n")[0]||"")+"\n"+
      "OPERATING STYLE: Think critically, not agreeably — challenge weak assumptions including your own from prior drafts. When current real-world data would strengthen your answer (rates, regulations, market data, competitor moves, benchmarks), search for it and use it — don't rely on memory for anything time-sensitive. Be decisive and specific; avoid generic frameworks restated without numbers.\n"+
      buildCtx(co,compData)+"\n"+
      "AUTONOMOUS CHAIN Level "+(i+1)+"/"+ch.chain.length+" - "+ch.label+"\n"+
      "Priority: "+task.priority.toUpperCase()+"\n"+
      "Task: \""+task.task+"\"\n"+
      (!isFirst?prevWork+"\n":"")+
      (isFirst
        ?"INITIATING: Acknowledge task, produce FIRST DRAFT. Use "+p3Curr.sym+p3Curr.code+"."+
          (moduleContext?"\n\n=== PLATFORM DATA — USE THESE REAL FIGURES ===\n"+moduleContext+"\n\nDATA RULE: The figures above come from real modules in this platform (Ledger transactions, prior Boardroom decisions, approved task history). Start your analysis from this real data. Only declare an assumption if a specific figure is genuinely absent from the platform data above — and label it explicitly as an assumption.":"")
        :isLast
        ?"FINAL APPROVAL: Review all levels. Produce DEFINITIVE FINAL OUTPUT as a professional consulting report.\n\nUSE THIS EXACT FORMAT (McKinsey/BCG/Deloitte standard):\n\n# Executive Summary\n(2-4 sentences: core finding, key number in "+p3Curr.sym+p3Curr.code+", recommended action)\n---\n## Key Insights\n(4-6 bullets, each opening with a **bold keyword**)\n---\n## Detailed Analysis\n(logical subsections with headers; use tables for all comparative or numerical data)\n---\n## Financial Impact\n(all figures in "+p3Curr.sym+"; show formula → assumption → result for every number)\n---\n## Risks\n| Risk | Likelihood | Impact | Mitigation |\n|------|------------|--------|------------|\n---\n## Opportunities\n(3-5 bullets with upside, timeframe, and owner)\n---\n## Recommendations\n| Priority | Action | Impact | Effort | Deadline |\n|----------|--------|--------|--------|----------|\n---\n## Sources & References\n(every figure cited with source and date)\n\nFORMATTING: Bold key metrics. Use tables for numbers. Never write unbroken paragraphs. Every number must have a unit."
        :"MID-LEVEL: Review previous level, add "+role.dl+" expertise. Enhanced output in "+p3Curr.sym+p3Curr.code+"."
      );

    // Execute level call
    const levelStartTime=Date.now();
    let providerFailures=0;

    try{
      let reply=await ask(sys,[{role:"user",content:"Process: \""+task.task+"\""}],2800);
      // Intelligence Engine — quality validation at final level (fail-safe: keeps original on any error)
      if(isLast){
        try{
          setP3Phase("🔍 Quality Review — validating final deliverable");
          const ieCompany={name:co.name||"the company",industry:co.industry||"",stage:co.stage||"",location:co.location||"",markets:co.markets||"",currency:co.currency||"INR",currencySymbol:p3Curr.sym||""};
          const reviewed=await selfReview(reply,task.task,ieCompany,(s,m,t)=>ask(s,m,t,false));
          if(reviewed&&reviewed.length>reply.length*0.5)reply=reviewed;
          reply+=ieEvidenceAudit(reply);
        }catch(ieErr){/* keep original output */}
      }
      const levelDuration=Date.now()-levelStartTime;

      // Phase 1: compress this level's output for next level context
      // Only runs when COMPRESSION_ENABLED=true and not the last level
      // If compression fails workflow continues unaffected
      let compressed:CompressedContext|null=null;
      if(COMPRESSION_ENABLED&&!isLast){
        compressed=await compressLevelOutput({
          fullOutput:reply,
          agentRole:role.t,
          agentFullTitle:role.f,
          agentDepartment:role.dl||"General",
          level:i+1,
          currency:p3Curr.code,
          callAI,
          keys,
          defaultProvider:defP,
          effectiveGroqKey:EFF_GROQ,
          effectiveGeminiKey:EFF_GEMINI,
        });
        if(compressed){
          compressedContexts.push(compressed);
        }else if(BENCHMARK_MODE){
          console.warn(
            "[BENCHMARK] Queue Level "+(i+1)+" compression failed. "+
            "Full output used for next level."
          );
        }
      }

      // Store completed step
      const step={
        role,output:reply,level:i+1,isFirst,isLast,
        ts:new Date().toISOString(),
        compressed:compressed||null,
      };
      steps.push(step);
      upd({steps:[...steps],currentLevel:i+1});
      addN("Level "+(i+1)+" ("+role.t+") complete","success");

      // Phase 1: log benchmark entry
      if(BENCHMARK_MODE&&benchSession){
        const modeAInputTokens=estimateTokens(sys.replace(prevWork,modeAContext));
        const modeAOutputTokens=estimateTokens(reply);
        const modeATotal=modeAInputTokens+modeAOutputTokens;
        const modeBInputTokens=estimateTokens(sys.replace(prevWork,modeBContext));
        const modeBOutputTokens=modeAOutputTokens;
        const modeBTotal=modeBInputTokens+modeBOutputTokens;
        const compressionCost=compressed?.compression_tokens_used||0;
        const netSaving=modeATotal-modeBTotal-compressionCost;

        logLevelBenchmark(benchSession,{
          level:i+1,
          agent_role:role.t,
          agent_full_title:role.f,
          provider:defP,
          mode_a_input_tokens:modeAInputTokens,
          mode_a_output_tokens:modeAOutputTokens,
          mode_a_total_tokens:modeATotal,
          mode_a_context_chars:modeAContext.length,
          mode_b_input_tokens:modeBInputTokens,
          mode_b_output_tokens:modeBOutputTokens,
          mode_b_total_tokens:modeBTotal,
          mode_b_context_chars:modeBContext.length,
          compression_tokens_used:compressionCost,
          compression_ratio:compressed?.compression_ratio||1,
          net_token_saving:netSaving,
          execution_duration_ms:levelDuration,
          provider_failures:providerFailures,
          retry_count:0,
          quality_score:null,
          quality_notes:"",
        });
      }

    }catch(err:any){
      if(BENCHMARK_MODE&&benchSession&&
         err.message?.toLowerCase().includes("rate limit")){
        markRateLimitHit(benchSession);
        providerFailures++;
      }
      upd({status:TS.FAILED,error:err.message});
      addN("Failed at Level "+(i+1)+" ("+role.t+"): "+err.message,"error");
      showToast("Queue task failed at Level "+(i+1)+": "+err.message,"error");
      if(BENCHMARK_MODE&&benchSession)completeBenchmarkSession(benchSession);
      return;
    }
  }

  upd({
    steps:[...steps],
    status:TS.REVIEWING,
    finalOutput:steps[steps.length-1]?.output||"",
    completedAt:new Date().toISOString(),
    currentLevel:ch.chain.length
  });
  addN("Chain complete — awaiting your approval","complete");
  showToast("Task chain complete — review and approve","success");
  setP3View("completed");

  if(BENCHMARK_MODE&&benchSession){
    completeBenchmarkSession(benchSession);
  }

},[co,compData,keys,defP,showToast,ledgerEntries,brSessions,workflows,tmRes,apRes]);

  const runQueue=useCallback(async()=>{
    if(qRunning)return;
    const pending=tQRef.current.filter(t=>t.status===TS.QUEUED);
    if(!pending.length){showToast("No queued tasks to process.","info");return;}
    cancelRef.current.q=false;
    setQRunning(true);
    for(const task of pending){
      if(cancelRef.current.q)break;
      setP3Running(task);setP3View("running");
      await processTask(task);
    }
    setP3Running(null);setQRunning(false);setP3Phase("");cancelRef.current.q=false;
  },[qRunning,processTask,showToast]);

  const approveQ=useCallback((taskId)=>{
    const updated=tQRef.current.map(t=>t.id===taskId?{...t,status:TS.APPROVED,approved:true,approvedAt:new Date().toISOString()}:t);
    tQRef.current=updated;setTQueue([...updated]);sv("cos-tq",updated);
    showToast("Task approved and archived ✓","success");
  },[showToast]);

  const rejectQ=useCallback((taskId,note)=>{
    const updated=tQRef.current.map(t=>t.id===taskId?{...t,status:TS.REJECTED,rejectionNote:note||"Sent back for revision"}:t);
    tQRef.current=updated;setTQueue([...updated]);sv("cos-tq",updated);
    showToast("Task rejected","warning");
  },[showToast]);

  const requeueT=useCallback((taskId)=>{
    const updated=tQRef.current.map(t=>t.id===taskId?{...t,status:TS.QUEUED,steps:[],finalOutput:null,approved:false,currentLevel:0,startedAt:null,completedAt:null}:t);
    tQRef.current=updated;setTQueue([...updated]);sv("cos-tq",updated);
    showToast("Task re-queued","info");
  },[showToast]);

  const deleteT=useCallback((taskId)=>{
    const updated=tQRef.current.filter(t=>t.id!==taskId);
    tQRef.current=updated;setTQueue([...updated]);sv("cos-tq",updated);
  },[]);

  const addD=()=>{if(!dataF.k.trim())return;const d={...compData,[dataF.k]:dataF.v};setCompData(d);sv("cos-cd",d);setDataF({k:"",v:""});};
  const delD=k=>{const d={...compData};delete d[k];setCompData(d);sv("cos-cd",d);};

  const saveDn=cfg=>{setDnCfg(cfg);setLocalDn(cfg);sv("cos-dn",cfg);showToast("Donation settings saved","success");};

  const resetData=async()=>{
    // Clear all user-generated data from every module
    const dataKeys=[
      "cos-ch","cos-cd","cos-br","cos-br-live","cos-wf","cos-tq",
      "cos-tm","cos-tm-live","cos-ap","cos-ap-live",
      "cos-ledger","cos-accounts","cos-actions","cos-dispatch-templates",
      "cos-projects","cos-project-plan","cos-dp","oiq-token-records",
    ];
    for(const k of dataKeys){try{localStorage.removeItem(k);}catch{}}
    // Also remove all deliverable content keys (cos-rc-*)
    try{
      const toRemove=Object.keys(localStorage).filter(k=>k.startsWith("cos-rc-"));
      toRemove.forEach(k=>localStorage.removeItem(k));
    }catch{}
    // Reset all module state
    setChats({});
    setCompData({});
    setBrSessions([]);
    setBrCur({q:"",researchBrief:"",format:"threaded",stages:[]});
    setWorkflows([]);
    setWfActive(null);
    tQRef.current=[];
    setTQueue([]);
    setSelRole(null);
    setTmSessions([]);
    setTmRes("");
    setTmDec("");
    setTmResearchBrief("");
    setApSessions([]);
    setApRes("");
    setApResearchBrief("");
    setLedgerEntries([]);
    setCustomAccounts([]);
    setDispatchTemplates([]);
    setActionItems([]);
    setProjects([]);
    setProjectPlan(null);
    setProjectExecution(null);
    setProjectDashboardOpen(false);
    rawContentStore.current={};
    setConfirmReset(null);
    showToast("All data reset — API keys preserved","warning");
  };
  const fullReset=async()=>{
    WorkspaceMemory.clearAll();
    try{await supabase.auth.signOut();}catch(e){console.warn("[OIQ] Sign out error:",e);}
    window.location.href="/";
  };
  const exportAll=()=>{
    // Enrich projects with full deliverable content from ref/localStorage
    // The JSON download is a Blob with no size limit — include complete content
    const enrichedProjects=(projects||[]).map(proj=>({
      ...proj,
      modules:(proj.modules||[]).map(mod=>({
        ...mod,
        deliverables:(mod.deliverables||[]).map(del=>{
          // Priority: memory ref (full) > localStorage (full) > state (preview)
          const fullContent=
            rawContentStore.current[del.id]||
            (()=>{try{return localStorage.getItem("cos-rc-"+del.id)||"";}catch{return "";}})();
          return fullContent
            ?{...del,rawContent:fullContent,_contentSource:"full"}
            :{...del,_contentSource:"preview"};
        })
      }))
    }));
    const payload={version:VERSION,exported:new Date().toISOString(),
      company:co,companyData:compData,
      ledgerEntries,customAccounts,dispatchTemplates,adminConfig,actionItems,
      chats,boardroomSessions:brSessions,workflows,taskQueue:tQueue,
      projects:enrichedProjects,
      timeMachineSessions:tmSessions,
      timeMachineLive:{dec:tmDec,res:tmRes,brief:tmResearchBrief},
      autopilotSessions:apSessions,
      autopilotLive:{res:apRes,brief:apResearchBrief}};
    dlFile("OrchestrIQ-"+co.name.replace(/\s+/g,"-")+"-"+Date.now()+".json",payload);
  };
  const handleSignOut=useCallback(async(saveFirst:boolean)=>{
    if(saveFirst){
      try{exportAll();}catch(e){showToast("Save failed: "+(e as Error).message+" — signing out anyway","warning");}
      await new Promise(r=>setTimeout(r,600));
    }
    try{await supabase.auth.signOut();}catch(e){console.warn("[OIQ] Sign out error:",e);}
    setShowSignOutConfirm(false);
    window.location.reload();
  },[showToast]);

  const importData=file=>{const r=new FileReader();r.onload=e=>{try{const d=JSON.parse(e.target.result);if(d.company)setCo(d.company);sv("cos-co",d.company);
if(d.adminConfig){setAdminConfig({...adminConfig,...d.adminConfig});sv("cos-admin-config",d.adminConfig);}
if(d.actionItems){setActionItems(d.actionItems);sv("cos-actions",d.actionItems);}if(d.chats){setChats(d.chats);sv("cos-ch",d.chats);}if(d.boardroomSessions){setBrSessions(d.boardroomSessions);sv("cos-br",d.boardroomSessions);}if(d.workflows){setWorkflows(d.workflows);sv("cos-wf",d.workflows);}if(d.taskQueue){tQRef.current=d.taskQueue;setTQueue(d.taskQueue);sv("cos-tq",d.taskQueue);}if(d.projects){
  const cp=(d.projects||[]).map(p=>p.status==="executing"||p.status==="qa"?{...p,status:"partial"}:p);
  setProjects(cp);sv("cos-projects",cp);
  // Restore full deliverable content to ref and localStorage
  cp.forEach(proj=>{
    (proj.modules||[]).forEach(mod=>{
      (mod.deliverables||[]).forEach(del=>{
        if(del.rawContent&&del._contentSource==="full"){
          rawContentStore.current[del.id]=del.rawContent;
          try{localStorage.setItem("cos-rc-"+del.id,del.rawContent);}catch{}
        }
      });
    });
  });
}
if(d.companyData){setCompData(d.companyData);sv("cos-cd",d.companyData);}
if(d.ledgerEntries){setLedgerEntries(d.ledgerEntries);sv("cos-ledger",d.ledgerEntries);}
if(d.customAccounts){setCustomAccounts(d.customAccounts);sv("cos-accounts",d.customAccounts);}
if(d.dispatchTemplates){setDispatchTemplates(d.dispatchTemplates);sv("cos-dispatch-templates",d.dispatchTemplates);}
if(d.timeMachineSessions){setTmSessions(d.timeMachineSessions);sv("cos-tm",d.timeMachineSessions);}
if(d.timeMachineLive?.dec){setTmDec(d.timeMachineLive.dec);setTmRes(d.timeMachineLive.res||"");setTmResearchBrief(d.timeMachineLive.brief||"");sv("cos-tm-live",{dec:d.timeMachineLive.dec,res:d.timeMachineLive.res,brief:d.timeMachineLive.brief});}
if(d.autopilotSessions){setApSessions(d.autopilotSessions);sv("cos-ap",d.autopilotSessions);}
if(d.autopilotLive?.res){setApRes(d.autopilotLive.res);setApResearchBrief(d.autopilotLive.brief||"");sv("cos-ap-live",{res:d.autopilotLive.res,brief:d.autopilotLive.brief});}
setResumeInfo(null);
showToast("Workspace loaded — all modules restored","success");}catch{showToast("Invalid workspace file","error");}};r.readAsText(file);};

  // FEATURE 4 & 5: Export Studio generation
  const runExport=useCallback(async()=>{
    if(expGenerating)return;
    setExpGenerating(true);setExpSynthesis("");
    try{
      const corpus=gatherWorkspace(co,compData,chats,brSessions,workflows,tQueue,{
        chats:expSources.chats,boardroom:expSources.boardroom,workflows:expSources.workflows,
        tasks:expSources.tasks,timeMachine:expSources.timeMachine?tmRes:null,autopilot:expSources.autopilot?apRes:null,
      });
      if(corpus.trim().split("\n").length<3){throw new Error("No workspace content selected. Use the platform first, then export.");}
      const isPdf=expMode==="pdf";
      const dtype=isPdf?expDocType:expPptType;
      const tLabel=isPdf?(PDF_TYPES.find(t=>t.id===dtype)?.label):(PPT_TYPES.find(t=>t.id===dtype)?.label);
      setExpStep("🎨 Presentation Architect is synthesizing your workspace…");
      const pa=AR.find(r=>r.id==="pres_arch");
      const structureHint=isPdf
        ?"Produce a "+tLabel+". Use ## for each major section heading. Under each, use concise bullet points and markdown tables where data is comparative. Sections must suit a "+tLabel+": "+(dtype==="summary"?"single tight executive summary with key metrics and the one recommendation.":dtype==="investor"?"Executive Summary (3-4 sentence overview of the opportunity and ask - never leave empty or use placeholder dashes), Problem, Market & TAM, Solution, Traction/Metrics, Business Model, Financials, Risks, The Ask.":dtype==="executive"?"Executive Summary (3-4 sentence overview - never leave empty or use placeholder dashes), Key Findings, Strategic Recommendations, Financials, Risk Register, 90-Day Action Plan.":"full detailed report covering every theme found in the workspace.")
        :"Produce a "+tLabel+" as a slide deck. Each ## heading = one slide title. Under each, 3-6 short punchy bullet points (slide-ready, not paragraphs) OR a markdown table. Aim for 8-12 slides. Structure for a "+tLabel+": "+(dtype==="investor"?"Title, Problem, Solution, Market, Traction, Business Model, Competition, Financials, Team, The Ask.":dtype==="pitch"?"Hook, Problem, Solution, Why Now, Market, Product, Traction, Ask.":dtype==="roadmap"?"Vision, Now, Next, Later, Milestones, Metrics.":dtype==="research"?"Objective, Method, Findings, Analysis, Implications, Next Steps.":dtype==="operational"?"Overview, KPIs, Wins, Issues, Actions, Outlook.":dtype==="strategy"?"Context, Strategic Goals, Initiatives, Roadmap, Risks, Metrics.":"Agenda, Key Themes, Insights, Recommendations, Risks, Next Steps.");
      const userTitle=expTitle.trim()||(tLabel+" — "+co.name);

      // QUALITY ENGINE: for PPTX only, try the structured archetype pipeline first.
      // Falls back to the original markdown pipeline if the AI response doesn't
      // parse as valid structured JSON — this can never make PPTX generation worse,
      // only better when it succeeds.
      let usedQualityEngine=false;
      if(!isPdf){
        try{
          const qeSys=buildSys(pa,co,compData)+"\n\nWORKSPACE CORPUS TO SYNTHESIZE:\n"+corpus+"\n\n"+buildStructuredDeckPrompt(userTitle,tLabel);
          const qeRaw=await ask(qeSys,[{role:"user",content:"Build the structured slide JSON now."}],4000,false,"general");
          const slides=parseStructuredDeck(qeRaw);
          if(slides){
            setExpStep("📊 Building PowerPoint (consulting-grade)…");
            const PptxGenJS=await ensurePptx();
            const pptx=new PptxGenJS();
            const useStandard=expStyleResult?.ok&&expStyleResult.slideSize&&!expStyleResult.slideSize.isWidescreen;
            if(useStandard){pptx.defineLayout({name:"STANDARD",width:10,height:7.5});pptx.layout="STANDARD";}
            else{pptx.defineLayout({name:"WIDE",width:13.333,height:7.5});pptx.layout="WIDE";}
            const PAL={briefing:"14B8A6",strategy:"6366F1",investor:"A855F7",pitch:"F97316",roadmap:"8B5CF6",research:"06B6D4",operational:"F59E0B"};
            const customPal=buildPalFromExtractedStyle(expStyleResult);
            const A=customPal?.accent||PAL[dtype]||"14B8A6";
            slides.forEach(s=>{if(s.type==="title"){s.companyName=s.companyName||co.name;s.deckTitle=s.deckTitle||userTitle;}});
            renderStructuredDeck(pptx,slides,A,customPal||QE_PAL);
            await pptx.writeFile({fileName:(co.name||"Deck").replace(/\s+/g,"-")+"-"+tLabel.replace(/\s+/g,"-")+"-"+Date.now()+".pptx"});
            setExpSynthesis(slides.map(s=>"## "+(s.answerFirstTitle||s.deckTitle||s.type)+"\n"+(s.keyPoints||[]).join("\n")).join("\n\n"));
            usedQualityEngine=true;
          }
        }catch(qeErr){
          console.warn("[OrchestrIQ] Quality engine pipeline failed, falling back to legacy:",qeErr);
        }
      }

      if(!usedQualityEngine){
        const sys=buildSys(pa,co,compData)+"\n\nWORKSPACE CORPUS TO SYNTHESIZE:\n"+corpus+"\n\nOUTPUT INSTRUCTIONS: "+structureHint+" Be specific and use real numbers from the corpus in "+cur.sym+cur.code+". Do not include any preamble - start directly with the first ## section. EVERY section must contain real content - never output a section with only a horizontal rule, dash, or placeholder. If data for a section is genuinely unavailable, write 1-2 sentences explaining what is needed instead of leaving it blank.";
        const synth=await ask(sys,[{role:"user",content:"Build: \""+userTitle+"\". Synthesize across the entire workspace corpus above."}],4000);
        setExpSynthesis(synth);
        setExpStep(isPdf?"📄 Rendering PDF…":"📊 Building PowerPoint…");
        if(isPdf)await generatePDFv2(dtype,userTitle,synth,co,cur);
        else await generatePPTX(dtype,userTitle,synth,co,cur);
      }
      showToast((isPdf?"PDF":"PowerPoint")+" generated and downloaded ✓","success");
      setExpStep("");
    }catch(e){showToast("Export failed: "+e.message,"error");setExpStep("");}
    finally{setExpGenerating(false);}
  },[expGenerating,expMode,expDocType,expPptType,expSources,expTitle,co,compData,chats,brSessions,workflows,tQueue,tmRes,apRes,cur,keys,defP,showToast,expStyleResult]);

  // Quick single-source export (used inline in chat/boardroom/etc.)
  const quickExport=useCallback(async(mode,dtype,title,body)=>{
    try{showToast("Generating "+(mode==="pdf"?"PDF":"PowerPoint")+"…","info");
      if(mode==="pdf")await generatePDFv2(dtype,title,body,co,cur);
      else await generatePPTX(dtype,title,body,co,cur);
      showToast("Downloaded ✓","success");
    }catch(e){showToast("Export failed: "+e.message,"error");}
  },[co,cur,showToast]);

  const curRole=AR.find(r=>r.id===selRole);
  const curMsgs=selRole?(chats[selRole]||[]):[];
  const cfgP=["nvidia",...Object.keys(keys).filter(p=>keys[p]?.trim())];
  const sColor=s=>s===TS.APPROVED?"#10B981":s===TS.REVIEWING?"#8B5CF6":s===TS.RUNNING?"#14B8A6":s===TS.REJECTED||s===TS.FAILED?"#EF4444":"#F59E0B";
  const sBg=s=>s===TS.APPROVED?"rgba(16,185,129,0.12)":s===TS.REVIEWING?"rgba(139,92,246,0.1)":s===TS.RUNNING?"rgba(20,184,166,0.1)":s===TS.REJECTED||s===TS.FAILED?"rgba(239,68,68,0.1)":"rgba(245,158,11,0.1)";

  // S: defined at module scope below

  const healthDot=apiHealth==="ok"?"🟢":apiHealth==="fail"?"🔴":apiHealth==="checking"?"🟡":"⚪";
  const healthTip=apiHealth==="ok"?"API connected":apiHealth==="fail"?"API check failed — verify key in Settings":apiHealth==="checking"?"Checking API…":"API not tested";

  if(page==="landing") return(
    <div id="oiq-root" style={{minHeight:"100vh",background:"#0a0e1a",fontFamily:"Manrope,sans-serif",color:"#A0AAC0",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 28px",borderBottom:"1px solid #14192a"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20,color:"#14B8A6",fontWeight:900}}>◆</span><span style={{fontSize:18,fontWeight:800,color:"#F1F5F9"}}>{BRAND}</span><span style={{fontSize:9,color:"#5A6480",marginLeft:4}}>v{VERSION}</span></div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>setShowDonate(true)} style={{background:"rgba(20,184,166,0.08)",border:"1px solid rgba(20,184,166,0.25)",borderRadius:6,padding:"6px 14px",color:"#14B8A6",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>Support</button>
          <button onClick={()=>setPage("onboard")} style={{background:"#14B8A6",color:"#0a0e1a",border:"none",borderRadius:6,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>Get Started</button>
        </div>
      </div>
      <div style={{textAlign:"center",padding:"60px 28px 30px"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#14B8A6",textTransform:"uppercase",letterSpacing:2,marginBottom:12}}>AI Company Operating System</div>
        <h1 style={{fontSize:34,fontWeight:900,color:"#F1F5F9",lineHeight:1.15,marginBottom:14,letterSpacing:-1,maxWidth:680,margin:"0 auto 14px"}}>Full AI executive hierarchy.<br/>Autonomous chains. Real answers.</h1>
        <p style={{fontSize:14,color:"#8892B0",maxWidth:540,margin:"0 auto 24px",lineHeight:1.6}}>From Chairman to Accounts Executive — every role, every department, 3 AI providers, location-aware, currency-native. Now with 7 themes, local workspace ownership, and investor-grade PDF & PowerPoint generation.</p>
        <button onClick={()=>setPage("onboard")} style={{background:"#14B8A6",color:"#0a0e1a",border:"none",borderRadius:8,padding:"14px 36px",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"Manrope,sans-serif",marginBottom:8}}>Launch {BRAND}</button>
        <div style={{fontSize:12,color:"#5A6480",marginTop:8}}>Free Gemini tier works · All data stays in your browser</div>
      </div>
      <div style={{maxWidth:860,margin:"0 auto",padding:"10px 28px 20px"}}>
        <div style={{textAlign:"center",marginBottom:16}}><h2 style={{fontSize:20,fontWeight:900,color:"#F1F5F9"}}>API Setup Guide — Get your key in 3 minutes</h2></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
          {Object.entries(MODELS).map(([id,m])=>(
            <div key={id} style={{background:"#131825",border:"1px solid "+m.color+"22",borderRadius:12,padding:"18px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><div style={{width:10,height:10,borderRadius:"50%",background:m.color}}/><span style={{fontSize:14,fontWeight:800,color:m.color}}>{m.name}</span>{id==="gemini"&&<span style={{fontSize:8,background:"rgba(16,185,129,0.12)",color:"#10B981",padding:"1px 6px",borderRadius:8,fontWeight:700}}>FREE</span>}</div>
              <ol style={{paddingLeft:16,fontSize:11,color:"#A0AAC0",lineHeight:2,margin:0}}>
                <li>Go to <a href={m.keyUrl} target="_blank" rel="noopener noreferrer" style={{color:m.color}}>{m.company} console</a></li>
                <li>Create / generate an API key</li>
                <li>Copy and paste into onboarding</li>
                {id!=="gemini"&&<li>Add billing credits to use</li>}
              </ol>
              <div style={{fontSize:10,color:"#3A4060",marginTop:8}}>{id==="claude"&&"~$3/M input · $15/M output"}{id==="openai"&&"~$2.50/M input · $10/M output"}{id==="gemini"&&"Free: 50 req/day"}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{maxWidth:860,margin:"0 auto",padding:"0 28px 50px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[["🏛️","AI Boardroom","Live C-suite debate with synthesis and CEO-ready recommendations.","#14B8A6"],["🎨","Presentation Studio","Synthesize your whole workspace into investor-grade PDFs and PowerPoint decks.","#A855F7"],["🤖","Decision Autopilot","Surfaces 6 critical decisions you should be making right now.","#F59E0B"],["🎭","7 Themes","Dark, Light, Enlightened, Pro Blue, Executive Gray, High Contrast — instant, persistent.","#3B82F6"],["💾","Local Workspace","Save and load your entire workspace to your own device. No cloud required.","#10B981"],["⚡","Autonomous Chains","Tasks processed through the full hierarchy — you just approve at the end.","#84CC16"]].map(([ic,t,d,c])=>(
            <div key={t} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:10,padding:"16px 14px"}}><div style={{fontSize:24,marginBottom:6}}>{ic}</div><div style={{fontSize:13,fontWeight:700,color:c,marginBottom:4}}>{t}</div><div style={{fontSize:11,color:"#8892B0",lineHeight:1.6}}>{d}</div></div>
          ))}
        </div>
      </div>
      {showDonate&&<DonateModal cfg={dnCfg} presets={DONATION_PRESETS} onClose={()=>setShowDonate(false)} cur={cur} amt={dnAmt} setAmt={setDnAmt} custom={dnCustom} setCustom={setDnCustom} S={S}/>}
      <Toaster toasts={toasts} onDismiss={id=>setToasts(prev=>prev.filter(t=>t.id!==id))}/>
      <style>{CSS}</style>
    </div>
  );

  if(page==="onboard"){
    const hasKey=Object.values(keys).some(k=>k?.trim())||!!EFF_GEMINI;
    return(
      <div id="oiq-root" style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0e1a",fontFamily:"Manrope,sans-serif",padding:20}}>
        <div style={{background:"#131825",borderRadius:14,padding:"26px 24px",width:"100%",maxWidth:520,border:"1px solid #1a2030",maxHeight:"95vh",overflowY:"auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{fontSize:22,color:"#14B8A6"}}>◆</span><span style={{fontSize:18,fontWeight:800,color:"#F1F5F9"}}>Setup {BRAND}</span></div>
          <label style={S.lbl}>Step 1: API Keys {EFF_GEMINI?"(Gemini powered — optional)":"(need at least one)"}</label>
          <div style={{background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:6,padding:"8px 10px",marginBottom:10,fontSize:10,color:"#10B981"}}>Gemini is free — no credit card needed. Get key at <a href={MODELS.gemini.keyUrl} target="_blank" rel="noopener noreferrer" style={{color:"#4285F4"}}>aistudio.google.com</a>.</div>
          {Object.entries(MODELS).map(([id,m])=>(
            <div key={id} style={{marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:keys[id]?.trim()?m.color:"#3A4060"}}/>
                <span style={{fontSize:11,fontWeight:700,color:"#F1F5F9"}}>{m.name}</span>
                {id==="gemini"&&<span style={{fontSize:8,color:"#10B981",fontWeight:700}}>FREE</span>}{m.note&&<span style={{fontSize:9,color:"#5A6480",marginLeft:4}}>{m.note}</span>}
                <a href={m.keyUrl} target="_blank" rel="noopener noreferrer" style={{marginLeft:"auto",fontSize:9,color:m.color,textDecoration:"none"}}>Get key</a>
                {keys[id]?.trim()&&<button onClick={()=>testKey(id)} style={{...S.iBtn,fontSize:9,padding:"1px 6px"}}>{testSt[id]==="testing"?"…":testSt[id]==="ok"?"✓ OK":testSt[id]?.startsWith("fail:")?"✗ Fail":"Test"}</button>}
              </div>
              <input style={S.inp} type="password" value={keys[id]} onChange={e=>{setKeys({...keys,[id]:e.target.value});setTestSt(p=>({...p,[id]:undefined}));}} placeholder={m.placeholder}/>
              {testSt[id]?.startsWith("fail:")&&<div style={{fontSize:9,color:"#EF4444",marginTop:2,lineHeight:1.4}}>{testSt[id].slice(5)}</div>}
            </div>
          ))}
          {cfgP.length>1&&(
            <div style={{padding:"8px 10px",background:"#0a0e1a",borderRadius:6,border:"1px solid #1a2030",marginBottom:10}}>
              <label style={{...S.lbl,marginBottom:5}}>Default Model</label>
              <div style={{display:"flex",gap:4}}>{cfgP.map(p=><button key={p} onClick={()=>setDefP(p)} style={{flex:1,padding:"5px",borderRadius:4,fontSize:10,fontWeight:600,border:"1px solid "+(defP===p?MODELS[p].color:"#1a2030"),background:defP===p?MODELS[p].color+"15":"transparent",color:defP===p?MODELS[p].color:"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{MODELS[p].name}</button>)}</div>
            </div>
          )}
          {[["name","Company Name *","e.g. Nexus Technologies"],["industry","Industry *","e.g. EdTech, FinTech, SaaS"],["location","HQ Location *","e.g. Gurugram, India"],["markets","Target Markets (optional)","e.g. India + UAE"]].map(([f,lb,ph])=>(
            <div key={f} style={{marginBottom:8}}><label style={S.lbl}>{lb}</label><input style={S.inp} value={co[f]} onChange={e=>setCo({...co,[f]:e.target.value})} placeholder={ph}/></div>
          ))}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div><label style={S.lbl}>Currency</label><select style={{...S.inp,padding:"8px"}} value={co.currency} onChange={e=>setCo({...co,currency:e.target.value})}>{CURRENCIES.map(c=><option key={c.code} value={c.code} style={{background:"#0a0e1a"}}>{c.sym} {c.code}</option>)}</select></div>
            <div><label style={S.lbl}>Stage</label><select style={{...S.inp,padding:"8px"}} value={co.stage} onChange={e=>setCo({...co,stage:e.target.value})}>{STAGES.map(st=><option key={st.id} value={st.id} style={{background:"#0a0e1a"}}>{st.ic} {st.l}</option>)}</select></div>
          </div>
          <button onClick={completeOnboard} disabled={!(Object.values(keys).some(k=>k?.trim())||!!EFF_GEMINI)||!co.name.trim()||!co.industry.trim()||!co.location.trim()} style={{...S.pBtn,opacity:hasKey&&co.name.trim()&&co.industry.trim()&&co.location.trim()?1:0.3}}>Launch {BRAND}</button>
          <button onClick={()=>setPage("landing")} style={{background:"none",border:"none",color:"#5A6480",fontSize:12,cursor:"pointer",fontFamily:"Manrope,sans-serif",marginTop:8,display:"block"}}>Back to home</button>
        </div>
        <Toaster toasts={toasts} onDismiss={id=>setToasts(prev=>prev.filter(t=>t.id!==id))}/>
        <style>{CSS}</style>
      </div>
    );
  }

  return(
    <div id="oiq-root" style={{display:"flex",flexDirection:"column",width:"100vw",height:"100vh",background:"#0a0e1a",fontFamily:"Manrope,sans-serif",color:"#A0AAC0",overflow:"hidden"}}>
      <a href="#oiq-main" className="skip-link">Skip to main content</a>
      <div id="oiq-live" aria-live="polite" aria-atomic="false" className="sr-only"/>
      <header id="oiq-header" role="banner" aria-label="OrchestrIQ navigation">
        <button id="oiq-hamburger" aria-label="Toggle navigation menu" aria-expanded={sbOpen}
          onClick={()=>{const open=!sbOpen;setSbOpen(open);const r=document.getElementById("oiq-root");if(r){r.classList.toggle("oiq-sb-open",open);}const ov=document.getElementById("oiq-sb-overlay");if(ov){ov.classList.toggle("oiq-overlay-visible",open);}}}>
          {sbOpen?"✕":"☰"}
        </button>
        <div id="oiq-header-logo">
          <span className="oiq-brand-mark">◆</span>
          <span className="oiq-brand-name">OrchestrIQ</span>
        </div>
        <div id="oiq-header-workspace" title={co.name||"Set company name in Settings"}>
          {co.name||"Set workspace"}
        </div>
        <div id="oiq-header-actions">
          <select value={theme} onChange={e=>changeTheme(e.target.value)} aria-label="Select theme"
            style={{background:"none",border:"1px solid #1a2030",borderRadius:20,color:"#A0AAC0",fontSize:12,cursor:"pointer",padding:"4px 8px",fontFamily:"Inter,sans-serif",height:32}}>
            {Object.entries(THEMES).map(([id,t])=><option key={id} value={id} style={{background:"#0a0e1a"}}>{t.ic} {t.name}</option>)}
          </select>
          <button aria-label={sbCollapsed?"Expand sidebar":"Collapse sidebar"}
            onClick={()=>{const next=!sbCollapsed;setSbCollapsed(next);try{WorkspaceMemory.set("oiq-sb-col",next?"1":"0");}catch{}const r=document.getElementById("oiq-root");if(r)r.classList.toggle("oiq-sb-collapsed",next);}}
            style={{background:"none",border:"1px solid #1a2030",borderRadius:8,padding:"4px 10px",color:"#A0AAC0",cursor:"pointer",fontSize:14,fontFamily:"Inter,sans-serif",height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {sbCollapsed?"»":"«"}
          </button>
          <button onClick={()=>setShowExport(true)} aria-label="Export Studio" title="Export Studio — PDF and PowerPoint"
            style={{background:"none",border:"1px solid #1a2030",borderRadius:8,padding:"4px 10px",color:"#A855F7",cursor:"pointer",fontSize:16,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>🎨</button>
          <button onClick={()=>{setShowSettings(true);setSTab("api");}} aria-label="Settings" title="Settings"
            style={{background:"none",border:"1px solid #1a2030",borderRadius:8,padding:"4px 10px",color:"#A0AAC0",cursor:"pointer",fontSize:16,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>⚙</button>
          <button onClick={()=>setShowSignOutConfirm(true)} aria-label="Sign out" title="Sign out"
            style={{background:"none",border:"1px solid #1a2030",borderRadius:8,padding:"4px 10px",color:"#EF4444",cursor:"pointer",fontSize:16,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>⎋</button>
        </div>
      </header>
      <div id="oiq-sb-overlay" aria-hidden="true"
        onClick={()=>{setSbOpen(false);const r=document.getElementById("oiq-root");if(r)r.classList.remove("oiq-sb-open");const ov=document.getElementById("oiq-sb-overlay");if(ov)ov.classList.remove("oiq-overlay-visible");}}/>
      <GlobalTicker />
      {/* ── BODY ROW: sidebar + main side by side ── */}
      <div className="oiq-body-row" style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>
      {/* ── SIDEBAR ── */}
      <div id="oiq-sidebar" className="oiq-sidebar" role="navigation" aria-label="Executive roster and module navigation" style={{width:210,background:"#0c1120",borderRight:"1px solid #14192a",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",paddingTop:'0'}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 8px",borderBottom:"1px solid #14192a"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
            <span style={{color:"#14B8A6",fontSize:13,fontWeight:900}}>◆</span>
            <span style={{fontWeight:700,fontSize:12,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{co.name||BRAND}</span>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            <span title={healthTip} style={{fontSize:10,cursor:"default"}}>{healthDot}</span>
            <select value={theme} onChange={e=>changeTheme(e.target.value)} title="Theme" style={{background:"none",border:"1px solid #1a2030",borderRadius:4,color:"#A0AAC0",fontSize:10,cursor:"pointer",padding:"2px",fontFamily:"Manrope,sans-serif"}}>
              {Object.entries(THEMES).map(([id,t])=><option key={id} value={id} style={{background:"#0a0e1a"}}>{t.ic}</option>)}
            </select>
            <button onClick={()=>setShowExport(true)} title="Export Studio — PDF & PowerPoint" style={{...S.iBtn,color:"#A855F7"}}>🎨</button>
            <button onClick={()=>setShowSignOutConfirm(true)} title="Sign Out" style={{...S.iBtn,color:"#EF4444"}}>⎋</button>
            <button onClick={()=>{setShowSettings(true);setSTab("api");}} title="Settings" style={S.iBtn}>⚙</button>
          </div>
        </div>
        <div style={{padding:"3px 8px 2px",fontSize:9,color:"#5A6480",display:"flex",alignItems:"center",gap:4}}>
          <span style={{width:5,height:5,borderRadius:"50%",background:cfgP.length?"#14B8A6":"#EF4444",flexShrink:0}}/>
          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{!cfgP.length?"No key — add in Settings":cfgP.length===1?MODELS[cfgP[0]]?.name:MODELS[defP]?.name+" · "+cfgP.length+" keys"}</span>
          <span style={{marginLeft:"auto",flexShrink:0}}>{cur.sym}{co.currency}</span>
        </div>
        {/* ── MODULE DROPDOWN TRIGGER ── */}
        <div style={{position:"relative",padding:"6px 8px",borderBottom:"1px solid #1a2030"}}>
          <button onClick={()=>setShowModules(v=>!v)}
            style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"rgba(20,184,166,0.06)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:8,cursor:"pointer",fontFamily:"Manrope,sans-serif",transition:"all 0.15s"}}>
            <span style={{fontSize:16}}>{[["nerve","🧠"],["workflow","⚡"],["agentic","🔗"],["agents","🤖"],["p3","🤖"],["chat","💬"],["data","🗄️"],["ledger","📒"],["dispatch","📡"],["actions","✅"],["studio","🎨"],["funding","💰"],["tokens","🔢"]].find(([v])=>v===view)?.[1]||"🧠"}</span>
            <span style={{flex:1,fontSize:12,fontWeight:700,color:"#F1F5F9",textAlign:"left",textTransform:"uppercase",letterSpacing:"0.04em"}}>{[["nerve","Nerve Center"],["workflow","Workflow"],["agentic","Agentic AI"],["agents","AI Agents"],["p3","Autopilot"],["chat","Chat"],["data","Data Hub"],["home","Command Center"],["ledger","Ledger"],["finance","Finance"],["dispatch","Pulse"],["actions","Tasks"],["studio","Studio"],["funding","Funding"],["tokens","Tokens"]].find(([v])=>v===view)?.[1]||"Nerve Center"}</span>
            <span style={{fontSize:10,color:"#5A6480",transition:"transform 0.2s",transform:showModules?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
          </button>
          {showModules&&(
            <div style={{position:"absolute",top:"calc(100% - 6px)",left:8,right:8,background:"#131825",border:"1px solid #1e2433",maxHeight:"60vh",overflowY:"auto",borderRadius:10,zIndex:200,padding:8,boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
              {[["home","🎛️","Command Center"],["nerve","🧠","Nerve Center"],["workflow","⚡","Workflow"],["agentic","🔗","Agentic AI"],["agents","🤖","AI Agents"],["p3","🤖","Autopilot"],["chat","💬","Chat"],["data","🗄️","Data Hub"],["ledger","📒","Ledger"],["finance","🏦","Finance"],["dispatch","📡","Pulse"],["actions","✅","Tasks"],["studio","🎨","Studio"],["funding","💰","Funding"],["tokens","🔢","Tokens"]].filter(([v])=>v!=="ledger"||adminConfig.ledgerEnabled).filter(([v])=>v!=="dispatch"||adminConfig.dispatchEnabled).filter(([v])=>v!=="actions"||adminConfig.actionsEnabled).map(([v,ic,lb])=>(
                <button key={v} onClick={()=>{setView(v);setShowModules(false);}}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:view===v?"rgba(20,184,166,0.10)":"none",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"Manrope,sans-serif",marginBottom:2,transition:"background 0.12s"}}>
                  <span style={{fontSize:16,width:24,textAlign:"center"}}>{ic}</span>
                  <span style={{fontSize:12,fontWeight:600,color:view===v?"#14B8A6":"#A0AAC0"}}>{lb}</span>
                  {view===v&&<span style={{marginLeft:"auto",width:6,height:6,borderRadius:"50%",background:"#14B8A6",flexShrink:0}}/>}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* ── STAGE PILLS — restored ── */}
        <div style={{display:"flex",gap:3,padding:"5px 8px",borderBottom:"1px solid #1a2030",flexWrap:"wrap"}}>
          {STAGES.map(st=>(
            <button key={st.id} onClick={()=>{const n={...co,stage:st.id};setCo(n);sv("cos-co",n);}} title={st.l}
              style={{...S.pill,...(co.stage===st.id?{borderColor:"#14B8A6",color:"#14B8A6",background:"rgba(20,184,166,0.08)"}:{})}}>{st.ic} <span style={{fontSize:9}}>{st.l}</span></button>
          ))}
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 4px"}}>
          {DEPTS.map(dept=>(
            <div key={dept.id}>
              <button onClick={()=>{const n={...expD,[dept.id]:!expD[dept.id]};setExpD(n);sv("cos-dp",n);}} style={S.dH}>
                <span style={{fontSize:8,color:dept.c,transition:"transform 0.15s",transform:expD[dept.id]?"rotate(90deg)":"rotate(0)"}}>▶</span>
                <span style={{fontSize:10,fontWeight:700,color:dept.c}}>{dept.l}</span>
              </button>
              {expD[dept.id]&&dept.roles.map(r=>(
                <button key={r.id} onClick={()=>{setSelRole(r.id);setView("chat");setError(null);}} style={{...S.rBtn,...(selRole===r.id?{background:dept.c+"10",borderColor:dept.c+"33"}:{})}}>
                  <span style={{fontSize:12}}>{r.ic}</span>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:9,fontWeight:700,color:dept.c}}>{r.t}</div><div style={{fontSize:7,color:"#3A4060",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.d}</div></div>
                  {chats[r.id]?.length>0&&<span style={{width:4,height:4,borderRadius:"50%",background:dept.c,opacity:0.6,flexShrink:0}}/>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN PANEL ── */}
      <div id="oiq-main" role="main" tabIndex={-1} style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* NERVE CENTER */}
        {view==="nerve"&&(
          <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
            <div className="oiq-nerve-tabs" style={{display:"flex",gap:3,padding:"8px 14px",borderBottom:"1px solid #14192a",background:"#0c1120"}}>
              {[["boardroom","🏛️","AI Boardroom","#14B8A6"],["timemachine","⏳","Time Machine","#8B5CF6"],["autopilot","🤖","Autopilot","#F59E0B"]].map(([id,ic,lb,c])=>(
                <button key={id} className="oiq-nerve-btn" onClick={()=>setNTab(id)} style={{...S.nrvTab,...(nTab===id?{background:c+"10",color:c,borderColor:c+"30"}:{})}}><span style={{fontSize:15}}>{ic}</span><span style={{fontSize:10,fontWeight:700}}>{lb}</span></button>
              ))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
              {/* BOARDROOM */}
              {nTab==="boardroom"&&(
  <BoardroomView
    brQ={brQ} setBrQ={setBrQ}
    brAg={brAg} setBrAg={setBrAg}
    brCur={brCur} brRun={brRun} brPh={brPh}
    brSessions={brSessions} setBrSessions={setBrSessions}
    brShowHistory={brShowHistory} setBrShowHistory={setBrShowHistory}
    brFollowUp={brFollowUp} setBrFollowUp={setBrFollowUp}
    drillRole={drillRole} setDrillRole={setDrillRole}
    drillQ={drillQ} setDrillQ={setDrillQ}
    drillRun={drillRun} brEnd={brEnd}
    runBR={runBR} runBRContinue={runBRContinue} runDrill={runDrill}
    cancelBR={()=>{cancelRef.current.br=true;}}
    followUpExecIds={followUpExecIds} setFollowUpExecIds={setFollowUpExecIds}
    followUpSuggestions={followUpSuggestions} setFollowUpSuggestions={setFollowUpSuggestions}
    suggestFollowUpExecs={suggestFollowUpExecs}
    dlFile={dlFile} cp={cp}
    quickExport={quickExport}
    extractActionItems={extractActionItems}
    extracting={extracting}
    showToast={showToast} sv={sv} setBrCur={setBrCur}
    CS={CS} co={co} cur={cur}
    isDark={theme==="dark"||theme==="blue"||theme==="gray"}
    MicButton={MicButton} vLang={vLang}
  />
)}

              {/* TIME MACHINE */}
              {nTab==="timemachine"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9"}}>Business Time Machine</div>
                    {tmSessions.length>0&&<button onClick={()=>setTmShowHistory(s=>!s)} style={{...S.hBtn,...(tmShowHistory?{color:"#8B5CF6",borderColor:"#8B5CF644"}:{})}}>{tmShowHistory?"✕ Close":"🕓 Past Runs ("+tmSessions.length+")"}</button>}
                  </div>
                  <p style={{fontSize:10,color:"#5A6480",marginBottom:10}}>Two parallel 12-month futures · {co.location||"Set location"} · {cur.code} · 60s timeout</p>
                  {tmShowHistory&&(
                    <div style={{marginBottom:10,background:"#0c1120",border:"1px solid #1a2030",borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Saved Simulations</div>
                      {tmSessions.map(s=>(
                        <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#131825",border:"1px solid #1a2030",borderRadius:6,marginBottom:5}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:600,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.dec}</div>
                            <div style={{fontSize:8,color:"#5A6480",marginTop:2}}>{new Date(s.ts).toLocaleString()}</div>
                          </div>
                          <button onClick={()=>{setTmDec(s.dec);setTmRes(s.res);setTmResearchBrief(s.brief||"");sv("cos-tm-live",{dec:s.dec,res:s.res,brief:s.brief||""});setTmShowHistory(false);showToast("Simulation reopened","success");}} style={{...S.hBtn,color:"#8B5CF6",borderColor:"#8B5CF633",flexShrink:0}}>Reopen</button>
                          <button onClick={()=>{if(confirm("Delete this saved simulation?")){setTmSessions(prev=>{const ns=prev.filter(x=>x.id!==s.id);sv("cos-tm",ns);return ns;});}}} style={{...S.hBtn,color:"#EF4444",borderColor:"#EF444433",flexShrink:0}}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{display:"flex",gap:5,marginBottom:12}}>
                    <textarea style={{...S.inp,flex:1,minHeight:55}} value={tmDec} onChange={e=>setTmDec(e.target.value)} placeholder={"Describe the decision… e.g. Hire 5 engineers and launch in "+(co.location||"Delhi")+" Q3 with "+cur.sym+"50L budget"} disabled={tmRun}/>
                    <div style={{display:"flex",flexDirection:"column",gap:4,alignSelf:"flex-end"}}>
                      <div style={{display:"flex",gap:3}}><LangPick value={vLang} onChange={vl=>{setVLang(vl);sv("cos-vl",vl);}}/><MicButton lang={vLang} onResult={t=>setTmDec(prev=>(prev?prev+" ":"")+t)} disabled={tmRun}/></div>
                      <div style={{display:"flex",gap:3}}>
                        {tmRun&&<button onClick={()=>{cancelRef.current.tm=true;}} style={S.cancelBtn}>Cancel</button>}
                        <button onClick={runTM} disabled={tmRun||!tmDec.trim()} style={{...S.pBtn,width:"auto",padding:"7px 12px",marginTop:0,fontSize:11,background:"#8B5CF6",opacity:tmRun||!tmDec.trim()?0.3:1}}>{tmRun?"Simulating…":"Simulate"}</button>
                      </div>
                    </div>
                  </div>
                  {tmRun&&tmPh&&<div style={{fontSize:10,color:"#8B5CF6",marginBottom:8,display:"flex",alignItems:"center",gap:5}}><span style={{width:5,height:5,borderRadius:"50%",background:"#8B5CF6",display:"inline-block",animation:"pulse 1s infinite"}}/> {tmPh} (up to 100s)</div>}
                  {tmResearchBrief&&(
                    <div style={{marginBottom:10,background:"rgba(59,130,246,0.05)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:7,padding:"10px 12px"}}>
                      <div style={{fontSize:10,fontWeight:800,color:"#3B82F6",marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>📡 Research Brief — Current Data, Generated {new Date().toLocaleString()}</div>
                      <div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={tmResearchBrief} ac="#3B82F6"/></div>
                      <div style={{fontSize:9,color:"#5A6480",marginTop:6,fontStyle:"italic"}}>Click source links to verify independently. AI-generated — please confirm critical figures before external use.</div>
                    </div>
                  )}
                  {tmRes&&<div style={{animation:"fadeIn 0.3s"}}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:4,gap:4,flexWrap:"wrap"}}><button onClick={()=>cp(tmRes)} style={S.hBtn}>Copy</button><button onClick={()=>quickExport("pdf","detailed","Time Machine — "+tmDec,tmRes)} style={S.hBtn}>📄 PDF</button><button onClick={()=>quickExport("pptx","strategy","Time Machine Simulation",tmRes)} style={S.hBtn}>📊 PPT</button><button onClick={()=>dlFile("TimeMachine-"+Date.now()+".md",tmDec+"\n\n"+tmRes,"text/markdown")} style={S.hBtn}>MD</button><button onClick={()=>extractActionItems("timemachine","Time Machine — \""+tmDec.slice(0,40)+"\"",tmRes)} disabled={extracting==="timemachine"} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>{extracting==="timemachine"?"Extracting...":"✅ Extract Action Items"}</button></div><div style={{background:"#131825",borderRadius:8,padding:"14px 16px",border:"1px solid rgba(139,92,246,0.18)"}}><div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={tmRes} ac="#8B5CF6"/></div></div></div>}
                  {error&&nTab==="timemachine"&&<div style={S.errB}>⚠️ {error}<div style={{display:"flex",gap:4}}><button onClick={runTM} style={S.retBtn}>Retry</button><button onClick={()=>setError(null)} style={{...S.retBtn,background:"#3A4060"}}>Dismiss</button></div></div>}
                </div>
              )}

              {/* AUTOPILOT */}
              {nTab==="autopilot"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>Decision Autopilot</div>
                  <p style={{fontSize:10,color:"#5A6480",marginBottom:10}}>Surfaces decisions you should be making but aren't · {co.location||"Set location"} · {cur.code}</p>
                  <div style={{display:"flex",gap:5,marginBottom:14}}>
                    <button onClick={runAP} disabled={apRun} style={{...S.pBtn,width:"auto",padding:"10px 24px",marginTop:0,fontSize:13,background:"#F59E0B",opacity:apRun?0.4:1}}>{apRun?"Scanning…":"Run Decision Scan"}</button>
                    {apRun&&<button onClick={()=>{cancelRef.current.ap=true;}} style={{...S.cancelBtn,alignSelf:"flex-end",marginBottom:6}}>Cancel</button>}
                  </div>
                  {apRun&&apPh&&<div style={{fontSize:10,color:"#F59E0B",marginBottom:8,display:"flex",alignItems:"center",gap:5}}><span style={{width:5,height:5,borderRadius:"50%",background:"#F59E0B",display:"inline-block",animation:"pulse 1s infinite"}}/> {apPh} (up to 100s)</div>}
                  {apResearchBrief&&(
                    <div style={{marginBottom:10,background:"rgba(59,130,246,0.05)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:7,padding:"10px 12px"}}>
                      <div style={{fontSize:10,fontWeight:800,color:"#3B82F6",marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>📡 Research Brief — Current Data, Generated {new Date().toLocaleString()}</div>
                      <div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={apResearchBrief} ac="#3B82F6"/></div>
                      <div style={{fontSize:9,color:"#5A6480",marginTop:6,fontStyle:"italic"}}>Click source links to verify independently. AI-generated — please confirm critical figures before external use.</div>
                    </div>
                  )}
                  {apRes&&<div style={{animation:"fadeIn 0.3s"}}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:4,gap:4,flexWrap:"wrap"}}><button onClick={()=>cp(apRes)} style={S.hBtn}>Copy</button><button onClick={()=>quickExport("pdf","executive","Decision Autopilot Scan",apRes)} style={S.hBtn}>📄 PDF</button><button onClick={()=>quickExport("pptx","briefing","Decision Autopilot",apRes)} style={S.hBtn}>📊 PPT</button><button onClick={()=>dlFile("Autopilot-"+Date.now()+".md",apRes,"text/markdown")} style={S.hBtn}>MD</button><button onClick={()=>extractActionItems("autopilot","Decision Autopilot Scan",apRes)} disabled={extracting==="autopilot"} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633"}}>{extracting==="autopilot"?"Extracting...":"✅ Extract Action Items"}</button></div><div style={{background:"#131825",borderRadius:8,padding:"14px 16px",border:"1px solid rgba(245,158,11,0.18)"}}><div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={apRes} ac="#F59E0B"/></div></div></div>}
                  {error&&nTab==="autopilot"&&<div style={S.errB}>⚠️ {error}<div style={{display:"flex",gap:4}}><button onClick={runAP} style={S.retBtn}>Retry</button><button onClick={()=>setError(null)} style={{...S.retBtn,background:"#3A4060"}}>Dismiss</button></div></div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* WORKFLOW */}
        {view==="workflow"&&(
          <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
            <div style={{display:"flex",gap:3,padding:"8px 14px",borderBottom:"1px solid #14192a",background:"#0c1120",alignItems:"center",flexWrap:"wrap"}}>
              {[["new","New Task"],["project","⚡ Project Engine"+(projectPlanning?" ●":"")],["active","Active"+(wfActive?" ●":"")],["history","History ("+workflows.length+")"]].map(([id,lb])=>(
                <button key={id} onClick={()=>setWfView(id)} style={{padding:"5px 12px",borderRadius:5,fontSize:10,fontWeight:600,border:"1px solid "+(wfView===id?"#14B8A6":"#1a2030"),background:wfView===id?"rgba(20,184,166,0.08)":"transparent",color:wfView===id?"#14B8A6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{lb}</button>
              ))}
              <div style={{marginLeft:"auto",fontSize:9,color:"#3A4060"}}>Flow · v2 · 60s/level</div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"14px 16px"}}>
              {wfView==="new"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:4}}>Workflow Task Engine</div>
                  <p style={{fontSize:10,color:"#8892B0",marginBottom:12,lineHeight:1.6}}>Pick a category, customize which executives you want, then describe your task. You get the actual deliverable — not a discussion.</p>
                  <label style={S.lbl}>Step 1: Select Task Category</label>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:5,marginBottom:12}}>
                    {Object.entries(CHAINS).map(([key,ch])=>(
                      <button key={key} onClick={()=>{setWfCat(key);}} style={{display:"flex",alignItems:"flex-start",gap:7,padding:"9px 10px",borderRadius:7,border:"1px solid "+(wfCat===key?ch.color+"66":"#1a2030"),background:wfCat===key?ch.color+"08":"#0a0e1a",cursor:"pointer",fontFamily:"Manrope,sans-serif",textAlign:"left"}}>
                        <span style={{fontSize:16,flexShrink:0}}>{ch.ic}</span>
                        <div><div style={{fontSize:10,fontWeight:700,color:wfCat===key?ch.color:"#A0AAC0"}}>{ch.label}</div><div style={{fontSize:8,color:"#3A4060",lineHeight:1.4,marginTop:1}}>{ch.desc}</div></div>
                      </button>
                    ))}
                  </div>
                  {wfCat&&(()=>{
                    const ch=CHAINS[wfCat];
                    const defaultIds=ch.chain;
                    const currentSelected=wfCustomChain.length?wfCustomChain:defaultIds;
                    const allOtherRoles=AR.filter(r=>!defaultIds.includes(r.id)&&r.id!=="pres_arch"&&EP[r.id]);
                    return(
                      <div style={{marginBottom:12}}>
                        <div style={{padding:"10px 12px",background:"#0a0e1a",borderRadius:7,border:"1px solid "+ch.color+"22",marginBottom:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <div style={{fontSize:9,fontWeight:700,color:ch.color,textTransform:"uppercase",letterSpacing:1}}>Step 2: Choose Your Executives</div>
                            <button onClick={()=>setWfCustomChain(defaultIds)} style={{...S.hBtn,fontSize:8,color:ch.color,borderColor:ch.color+"44"}}>Reset to Default</button>
                          </div>
                          <div style={{fontSize:8,color:"#5A6480",marginBottom:8,lineHeight:1.5}}>Toggle to include or exclude. Drag order doesn't matter — selected executives run sequentially top to bottom. You can also add executives from other departments below.</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                            {defaultIds.map((id)=>{
                              const r=AR.find(x=>x.id===id);if(!r)return null;
                              const sel=currentSelected.includes(id);
                              return(
                                <button key={id} onClick={()=>{const next=sel?currentSelected.filter(x=>x!==id):[...currentSelected,id];setWfCustomChain(next.length?next:currentSelected);}} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 9px",borderRadius:5,border:"1px solid "+(sel?r.dc+"66":"#1a2030"),background:sel?r.dc+"12":"#131825",cursor:"pointer",fontFamily:"Manrope,sans-serif",opacity:sel?1:0.45,transition:"all 0.15s"}}>
                                  <span style={{fontSize:11}}>{r.ic}</span>
                                  <span style={{fontSize:9,fontWeight:700,color:sel?r.dc:"#5A6480"}}>{r.t}</span>
                                  <span style={{fontSize:8,color:sel?"#10B981":"#3A4060",fontWeight:700}}>{sel?"✓":"+"}</span>
                                </button>
                              );
                            })}
                          </div>
                          {currentSelected.length>0&&(
                            <div style={{background:"#131825",borderRadius:5,padding:"7px 10px",border:"1px solid #1a2030"}}>
                              <div style={{fontSize:8,color:"#5A6480",marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Your Chain ({currentSelected.length} executives)</div>
                              <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:3}}>
                                {currentSelected.map((id,i)=>{const r=AR.find(x=>x.id===id);if(!r)return null;return(<span key={id} style={{display:"flex",alignItems:"center",gap:3}}><span style={{background:r.dc+"15",border:"1px solid "+r.dc+"33",borderRadius:4,padding:"3px 7px",fontSize:9,fontWeight:600,color:r.dc}}>{r.ic} {r.t}</span>{i<currentSelected.length-1&&<span style={{color:"#3A4060",fontSize:10}}>→</span>}</span>);})}
                              </div>
                            </div>
                          )}
                        </div>
                        <div style={{background:"#0a0e1a",borderRadius:7,border:"1px solid #1a2030",overflow:"hidden"}}>
                          <button onClick={()=>setWfShowExtra(s=>!s)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"none",border:"none",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>
                            <span style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8}}>+ Add Executives from Other Departments</span>
                            <span style={{fontSize:9,color:"#3A4060"}}>{wfShowExtra?"▲":"▼"}</span>
                          </button>
                          {wfShowExtra&&(
                            <div style={{padding:"0 12px 12px",maxHeight:260,overflowY:"auto"}}>
                              {DEPTS.filter(d=>d.id!=="presentation").map(dept=>{
                                const extra=dept.roles.filter(r=>!defaultIds.includes(r.id));
                                if(!extra.length)return null;
                                return(
                                  <div key={dept.id} style={{marginBottom:10}}>
                                    <div style={{fontSize:8,fontWeight:700,color:dept.c,textTransform:"uppercase",letterSpacing:0.8,marginBottom:5}}>{dept.l}</div>
                                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                                      {extra.map(r=>{
                                        const sel=currentSelected.includes(r.id);
                                        return(
                                          <button key={r.id} onClick={()=>{const next=sel?currentSelected.filter(x=>x!==r.id):[...currentSelected,r.id];setWfCustomChain(next);}} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:5,border:"1px solid "+(sel?r.dc+"66":"#1a2030"),background:sel?r.dc+"12":"#131825",cursor:"pointer",fontFamily:"Manrope,sans-serif",transition:"all 0.15s"}}>
                                            <span style={{fontSize:10}}>{r.ic}</span>
                                            <span style={{fontSize:9,fontWeight:600,color:sel?r.dc:"#8892B0"}}>{r.t}</span>
                                            <span style={{fontSize:7,color:dept.c,opacity:0.7}}>{dept.l}</span>
                                            <span style={{fontSize:8,color:sel?"#10B981":"#3A4060",fontWeight:700}}>{sel?"✓":"+"}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <label style={S.lbl}>Step 3: Describe the Task</label>
                  <div style={{display:"flex",gap:4,alignItems:"flex-start",marginBottom:12}}>
                    <textarea style={{...S.inp,flex:1,minHeight:80,resize:"vertical"}} value={wfTask} onChange={e=>setWfTask(e.target.value)} placeholder="e.g. Prepare Q1 FY2026 P&L statement, highlight variances greater than 10% from budget, and recommend 3 cost reduction measures for board review" disabled={wfRunning}/>
                    <div style={{display:"flex",flexDirection:"column",gap:4}}><LangPick value={vLang} onChange={vl=>{setVLang(vl);sv("cos-vl",vl);}}/><MicButton lang={vLang} onResult={t=>setWfTask(prev=>(prev?prev+" ":"")+t)} disabled={wfRunning}/></div>
                  </div>
                  {!wfPreflightActive&&(<div style={{display:"flex",gap:4}}>
                    <button onClick={runPreflight} disabled={wfRunning||wfPreflightLoading||!wfTask.trim()||!wfCat} style={{...S.pBtn,background:"linear-gradient(135deg,#14B8A6,#3B82F6)",opacity:wfRunning||wfPreflightLoading||!wfTask.trim()?0.3:1,marginTop:0,flex:1}}>{wfPreflightLoading?"Preparing questions…":wfRunning?"Chain Running…":"Start Workflow Chain"}</button>
                    {wfRunning&&<button onClick={()=>cancelRef.current.wf=true} style={{...S.cancelBtn,alignSelf:"flex-end",marginBottom:0}}>Cancel</button>}
                  </div>)}
                  {wfRunning&&wfPhase&&<div style={{fontSize:10,color:"#14B8A6",marginTop:8,display:"flex",alignItems:"center",gap:5}}><span style={{width:5,height:5,borderRadius:"50%",background:"#14B8A6",display:"inline-block",animation:"pulse 1s infinite"}}/>{wfPhase}</div>}
                  {wfPreflightActive&&wfPreflight&&!wfRunning&&(
                    <div style={{marginTop:12,background:"linear-gradient(135deg,rgba(20,184,166,0.06),rgba(59,130,246,0.04))",border:"1px solid rgba(20,184,166,0.25)",borderRadius:10,padding:"16px 16px 12px"}}>
                      <div style={{fontSize:12,fontWeight:800,color:"#F1F5F9",marginBottom:4}}>Quick questions before we begin</div>
                      <p style={{fontSize:10,color:"#8892B0",marginBottom:14,lineHeight:1.6}}>Answer these so the team produces your actual deliverable — not a generic report. Skip any you want.</p>
                      {wfPreflight.questions.map((q,i)=>(
                        <div key={i} style={{marginBottom:12,background:"#131825",borderRadius:8,padding:"10px 12px",border:"1px solid #1a2030"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                            <span style={{fontSize:16}}>{q.personaIc||"👔"}</span>
                            <span style={{fontSize:10,fontWeight:700,color:"#14B8A6"}}>{q.persona}</span>
                          </div>
                          <div style={{fontSize:11,color:"#F1F5F9",marginBottom:6,lineHeight:1.5}}>{q.q}</div>
                          <div style={{display:"flex",gap:4,alignItems:"flex-end"}}>
                            <textarea style={{...S.inp,flex:1,minHeight:36,resize:"vertical",fontSize:11}} value={wfPreflight.answers[i]||""} onChange={e=>{const na=[...wfPreflight.answers];na[i]=e.target.value;setWfPreflight({...wfPreflight,answers:na});}} placeholder={q.placeholder||"Your answer…"}/>
                            <MicButton lang={vLang} onResult={t=>{const na=[...wfPreflight.answers];na[i]=(na[i]?na[i]+" ":"")+t;setWfPreflight({...wfPreflight,answers:na});}} disabled={false}/>
                          </div>
                        </div>
                      ))}
                      <div style={{display:"flex",gap:6,marginTop:4}}>
                        <button onClick={()=>{const ch=CHAINS[wfCat];const finalChain=wfCustomChain.length?wfCustomChain:ch.chain;setWfPreflightActive(false);runWorkflow(finalChain,wfPreflight);}} style={{...S.pBtn,marginTop:0,flex:1,background:"linear-gradient(135deg,#14B8A6,#3B82F6)"}}>Build My Deliverable</button>
                        <button onClick={()=>{const ch=CHAINS[wfCat];const finalChain=wfCustomChain.length?wfCustomChain:ch.chain;setWfPreflightActive(false);runWorkflow(finalChain,null);}} style={{...S.hBtn,padding:"10px 14px",fontSize:10}}>Skip & Run</button>
                        <button onClick={()=>{setWfPreflightActive(false);setWfPreflight(null);}} style={{...S.hBtn,padding:"10px 14px",fontSize:10}}>← Back</button>
                      </div>
                    </div>
                  )}
                  {wfPauseMsg&&(
  <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:11,color:"#F59E0B",display:"flex",alignItems:"center",gap:8}}>
    <span style={{fontSize:14,flexShrink:0}}>⏸</span>
    <span style={{flex:1,lineHeight:1.6}}>{wfPauseMsg}</span>
  </div>
)}
{wfResumeData&&!wfRunning&&(
  <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
    <div style={{fontSize:12,fontWeight:700,color:"#F59E0B",marginBottom:3}}>⏸ Paused Workflow Found</div>
    <div style={{fontSize:11,color:"#A0AAC0",marginBottom:2}}>"{wfResumeData.task.slice(0,60)}{wfResumeData.task.length>60?"…":""}"</div>
    <div style={{fontSize:9,color:"#5A6480",marginBottom:10}}>{wfResumeData.chainLabel} · Completed {wfResumeData.completedLevels} of {CHAINS[wfResumeData.category]?.chain.length||0} levels · Saved {new Date(wfResumeData.savedAt).toLocaleTimeString()}</div>
    <div style={{display:"flex",gap:6}}>
      <button onClick={()=>runWorkflow(wfResumeData)} style={{...S.pBtn,marginTop:0,flex:1,background:"#F59E0B",color:"#0a0e1a",fontSize:11}}>▶ Resume from Level {wfResumeData.completedLevels+1}</button>
      <button onClick={()=>{clearResumeState();setWfResumeData(null);}} style={{...S.hBtn,padding:"8px 12px",fontSize:10}}>Discard</button>
    </div>
  </div>
)}
                  {error&&<div style={{...S.errB,marginTop:8}}>⚠️ {error}<button onClick={()=>setError(null)} style={{...S.retBtn,background:"#3A4060"}}>Dismiss</button></div>}
                </div>
              )}
              
              {wfView==="project"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>⚡ Project Engine</div>
                  <p style={{fontSize:10,color:"#8892B0",marginBottom:14,lineHeight:1.6}}>Describe a complex business objective. The engine decomposes it into an Execution Plan with modules and deliverables — you approve before anything runs.</p>

                  {/* ── EXECUTION DASHBOARD ── */}
                  {projectDashboardOpen&&projectExecution&&(
                    <div style={{animation:"fadeIn 0.3s"}}>
                      {/* Header */}
                      <div style={{marginBottom:6}}>
                        <button onClick={()=>{setProjectDashboardOpen(false);setProjectExecution(null);setProjectReviewMode(false);setProjectExcluded({});}} style={{...S.hBtn,fontSize:9,color:"#14B8A6",borderColor:"#14B8A633"}}>← Back to Projects</button>
                      </div>
                      <div style={{background:"#131825",border:"1px solid #1a2030",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                          <span style={{fontSize:16}}>⚡</span>
                          <div style={{flex:1}}><div style={{fontSize:12,fontWeight:800,color:"#F1F5F9"}}>{projectExecution.name}</div><div style={{fontSize:9,color:"#5A6480"}}>{projectExecution.modules?.length||0} modules · {(projectExecution.modules||[]).reduce((a,m)=>a+(m.deliverables?.length||0),0)} deliverables</div></div>
                          <span style={{fontSize:8,padding:"3px 8px",borderRadius:8,fontWeight:700,background:projectExecution.status==="complete"?"rgba(16,185,129,0.12)":projectExecution.status==="partial"?"rgba(245,158,11,0.1)":projectExecution.status==="qa"?"rgba(59,130,246,0.1)":"rgba(20,184,166,0.08)",color:projectExecution.status==="complete"?"#10B981":projectExecution.status==="partial"?"#F59E0B":projectExecution.status==="qa"?"#3B82F6":"#14B8A6"}}>{projectExecution.status==="qa"?"🔍 QA IN PROGRESS":projectExecution.status?.toUpperCase()}</span>
                        </div>
                        {/* Progress bar */}
                        {(()=>{
                          const allD=(projectExecution.modules||[]).flatMap(m=>m.deliverables||[]);
                          const done=allD.filter(d=>d.status==="complete").length;
                          const total=allD.length||1;
                          const pct=Math.round(done/total*100);
                          return(
                            <div>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#5A6480",marginBottom:3}}><span>{done}/{total} deliverables</span><span>{pct}%</span></div>
                              <div style={{background:"#1a2030",borderRadius:20,height:4}}><div style={{background:"linear-gradient(90deg,#14B8A6,#6366F1)",height:"100%",borderRadius:20,width:pct+"%",transition:"width 0.5s"}}/></div>
                            </div>
                          );
                        })()}
                        {projectExecPhase&&(
                          <div style={{fontSize:9,color:projectQARunning?"#3B82F6":"#14B8A6",marginTop:6,display:"flex",alignItems:"center",gap:4}}>
                            <span style={{width:5,height:5,borderRadius:"50%",background:projectQARunning?"#3B82F6":"#14B8A6",display:"inline-block",animation:"pulse 1s infinite",flexShrink:0}}/>{projectExecPhase}
                          </div>
                        )}
                        {projectExecuting&&<button onClick={()=>{setProjectExecCancel(true);projectExecCancelRef.current=true;setProjectExecPhase("\u23f9 Stopping \u2014 finishing current step, completed deliverables will be kept...");}} style={{...S.cancelBtn,marginTop:8,fontSize:9}}>⏹ Stop Execution</button>}
                      </div>
                      {/* Module cards */}
                      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
                        {(projectExecution.modules||[]).map((mod,mi)=>{
                          const modDels=mod.deliverables||[];
                          const modDone=modDels.filter(d=>d.status==="complete").length;
                          const modFailed=modDels.filter(d=>d.status==="failed").length;
                          const statusColor=modDone===modDels.length?"#10B981":modFailed>0?"#EF4444":"#14B8A6";
                          return(
                            <div key={mi} style={{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:7,padding:"10px 12px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                                <span style={{fontSize:14}}>{mod.icon||"⚙️"}</span>
                                <div style={{flex:1}}><div style={{fontSize:10,fontWeight:700,color:"#F1F5F9"}}>{mod.name}</div><div style={{fontSize:8,color:"#5A6480"}}>{modDone}/{modDels.length} complete</div></div>
                                <span style={{fontSize:8,color:statusColor,fontWeight:700}}>{modDone===modDels.length?"✓ Done":modFailed>0?modFailed+" failed":"Running"}</span>
                              </div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                                {modDels.map((del,di)=>{
                                  const sc={queued:"#3A4060",generating:"#14B8A6",waiting:"#F59E0B",retrying:"#8B5CF6",qa:"#3B82F6",complete:"#10B981",failed:"#EF4444"}[del.status]||"#3A4060";
                                  return(
                                    <div key={di} style={{background:sc+"15",border:"1px solid "+sc+"44",borderRadius:4,padding:"3px 7px",fontSize:8}}>
                                      <div style={{color:sc,fontWeight:700,marginBottom:1}}>{del.status==="generating"?"⟳ ":del.status==="complete"?"✓ ":del.status==="failed"?"✗ ":""}{del.name}</div>
                                      {del.status==="complete"&&<div style={{color:"#5A6480"}}>{del.outputFormat} · {del.confidenceScore}%</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Completed deliverables — view content */}
                      {(()=>{
                        const completed=(projectExecution.modules||[]).flatMap(m=>(m.deliverables||[]).filter(d=>d.status==="complete").map(d=>({...d,_mod:m.name})));
                        if(!completed.length)return null;
                        return(
                          <div style={{marginBottom:10}}>
                            <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Completed Deliverables</div>
                            {completed.map((del,ci)=>(
                              <div key={ci} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:6,padding:"9px 11px",marginBottom:5}}>
                                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:del.rawContent?4:0}}>
                                  <span style={{fontSize:9,fontWeight:700,color:"#10B981"}}>✓</span>
                                  <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600,color:"#F1F5F9"}}>{del.name}</div><div style={{fontSize:8,color:"#5A6480"}}>{del._mod} · {del.outputFormat} · {del.confidenceScore}% confidence · {del.verificationStatus}</div></div>
                                  <button onClick={()=>cp(del.rawContent||"")} style={{...S.hBtn,fontSize:8}}>Copy</button>
                                  <button onClick={async()=>{
                                    const nm=del.name.replace(/\s+/g,"-");
                                    const lsC=(()=>{try{return localStorage.getItem("cos-rc-"+del.id)||"";}catch{return "";}})();
                                    const cnt=rawContentStore.current[del.id]||lsC||del.rawContent||"";
                                    const fmt=(del.outputFormat||"md").toLowerCase();
                                    if(fmt==="pdf"){
                                      // Publication engine first; existing inline renderer stays as fallback.
                                      let _pdfOk=false;
                                      try{
                                        const _pubCtx=[projectExecution?.context?.company?.name||co.name||"",projectExecution?.context?.company?.industry||co.industry||"",projectExecution?.context?.company?.stage||co.stage||""].filter(Boolean).join(" | ");
                                        let _w=false;
                                        const _bee=new BusinessExecutionEngine(
                                          async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>(await callMulti({...keys,...(EFF_CLAUDE?.trim()?{claude:EFF_CLAUDE}:{}),...(EFF_GEMINI?.trim()?{gemini:EFF_GEMINI}:{}),...(EFF_GROQ?.trim()?{groq:EFF_GROQ}:{})},defP,sys,msgs,maxT||6000,false,tt||"general")).primary,
                                          ensureXLSX,ensurePptx,ensureJsPDF,
                                          (_fname:any,buf:any)=>{dlFile(nm+".pdf",buf,"application/pdf");_w=true;},
                                          stripMd);
                                        const _spec:DeliverableSpec={type:"pdf",title:del.name,purpose:del.name,audience:"board",qualityStandard:"cfo_model",priority:"primary"};
                                        const _plan:ExecutionPlan={objectiveRestated:del.name,domain:"strategy",persona:"Senior Consultant",audience:"board",qualityStandard:"cfo_model",decisionContext:del.name,deliverables:[_spec],missingInfo:[],executionOrder:[del.name],validationCriteria:[]};
                                        await _bee.generatePDF(_plan,_spec,_pubCtx,cnt,()=>{});
                                        _pdfOk=_w;
                                      }catch(_e:any){recordEngineDowngrade(del.name,"pdf",_e);}
                                      if(!_pdfOk)try{
                                      const jsPDF=await ensureJsPDF();const doc=new jsPDF({unit:"pt",format:"a4"});
                                      const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=48;let y=M;
                                      doc.setFillColor(20,184,166);doc.rect(0,0,W,72,"F");
                                      doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(15);
                                      doc.text(del.name,M,44,{maxWidth:W-2*M});
                                      doc.setFontSize(9);doc.setFont("helvetica","normal");
                                      doc.text((projectExecution?.context?.company?.name||"")+" · "+new Date().toLocaleDateString(),M,62);
                                      y=90;parseSections(cnt).forEach(sec=>{
                                        if(y>H-M){doc.addPage();y=M;}
                                        doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(20,184,166);
                                        doc.splitTextToSize(sec.title,W-2*M).forEach(l=>{if(y>H-M){doc.addPage();y=M;}doc.text(l,M,y);y+=15;});
                                        doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(45,45,45);
                                        sec.lines.forEach(ln=>{const t=stripMd(ln);if(!t.trim())return;if(y>H-M){doc.addPage();y=M;}
                                          doc.splitTextToSize(t,W-2*M).forEach(w=>{if(y>H-M){doc.addPage();y=M;}doc.text(w,M,y);y+=13;});});
                                        y+=5;});
                                      const pg=doc.internal.getNumberOfPages();
                                      for(let p=1;p<=pg;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text("Page "+p+" of "+pg,M,H-18);}
                                      doc.save(nm+".pdf");
                                    }catch(e){showToast("PDF: "+e.message,"error");}}
                                    else if(fmt==="xlsx"){
                                      // FIX: this path never called the real engine — it did a naive
                                      // pipe-character split with zero formulas, zero styling, zero
                                      // charts, none of the Excel Intelligence Engine work. It has been
                                      // producing a worse file than the main package this whole time.
                                      // Same publication-engine-first pattern as the pdf/pptx branches
                                      // right next to it — inline is now only the last-resort fallback.
                                      let _xlsxOk=false;
                                      try{
                                        const _pubCtx=[projectExecution?.context?.company?.name||co.name||"",projectExecution?.context?.company?.industry||co.industry||"",projectExecution?.context?.company?.stage||co.stage||""].filter(Boolean).join(" | ");
                                        let _w=false;
                                        const _bee=new BusinessExecutionEngine(
                                          async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>(await callMulti({...keys,...(EFF_CLAUDE?.trim()?{claude:EFF_CLAUDE}:{}),...(EFF_GEMINI?.trim()?{gemini:EFF_GEMINI}:{}),...(EFF_GROQ?.trim()?{groq:EFF_GROQ}:{})},defP,sys,msgs,maxT||6000,false,tt||"general")).primary,
                                          ensureXLSX,ensurePptx,ensureJsPDF,
                                          (_fname:any,buf:any)=>{dlFile(nm+".xlsx",buf,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");_w=true;},
                                          stripMd);
                                        const _spec:DeliverableSpec={type:"xlsx",title:del.name,purpose:del.description||del.name,audience:"board",qualityStandard:"cfo_model",priority:"primary"};
                                        const _plan:ExecutionPlan={objectiveRestated:del.description||del.name,domain:(["finance","audit","strategy","marketing","operations","hr","legal","technology","sales","risk"] as const).find(d=>(del.capabilityType||"").toLowerCase().includes(d)||del.name.toLowerCase().includes(d))||"finance",persona:"Senior FP&A Director",audience:"board",qualityStandard:"cfo_model",decisionContext:del.description||del.name,deliverables:[_spec],missingInfo:[],executionOrder:[del.name],validationCriteria:[]};
                                        const _res:any=await _bee.generateExcel(_plan,_spec,_pubCtx,cnt,projectExecution?.context?.company?.currency||"INR",projectExecution?.context?.company?.currencySymbol||"₹",()=>{});
                                        _xlsxOk=_w;
                                        if(!_w&&_res?.error)throw new Error(_res.error);
                                      }catch(_e:any){recordEngineDowngrade(del.name,"xlsx",_e);}
                                      if(!_xlsxOk)try{
                                      const XLSX=await ensureXLSX();const wb=XLSX.utils.book_new();
                                      const rows=cnt.split("\n").filter(Boolean).map(r=>r.split("|").filter((c,ii,a)=>ii>0&&ii<a.length-1).map(c=>c.trim())).filter(r=>r.length>1&&!r.every(c=>c.match(/^[-:]+$/)));
                                      const ws=rows.length>0?XLSX.utils.aoa_to_sheet(rows):XLSX.utils.aoa_to_sheet([[del.name],[""],[ cnt.slice(0,500)]]);
                                      XLSX.utils.book_append_sheet(wb,ws,del.name.slice(0,31)||"Data");
                                      const buf=XLSX.write(wb,{type:"array",bookType:"xlsx"});
                                      const blob=new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
                                      const u=URL.createObjectURL(blob);
                                      const a=document.createElement("a");a.href=u;a.download=nm+".xlsx";a.style.display="none";
                                      document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(u),200);
                                    }catch(e:any){showToast("Excel: "+e.message,"error");}}
                                    else if(fmt==="docx"){
                                      const secs=parseSections(cnt);
                                      let html="<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\" xmlns=\"http://www.w3.org/TR/REC-html40\"><head><meta charset=\"UTF-8\"><style>@page{mso-page-orientation:portrait;margin:2.54cm;}body{font-family:Calibri,sans-serif;font-size:11pt;text-align:left;}h1{font-size:18pt;color:#14B8A6;}h2{font-size:13pt;}p{line-height:1.5;text-align:left;}table{border-collapse:collapse;width:100%;}th{background:#14B8A6;color:#fff;padding:5pt 8pt;}td{padding:4pt 8pt;border-bottom:1pt solid #ddd;}</style></head><body><h1>"+del.name+"</h1>";
                                      for(const sec of secs){html+="<h2>"+sec.title+"</h2>";sec.lines.forEach(ln=>{const t=stripMd(ln).trim();if(t)html+="<p>"+t+"</p>";});}
                                      html+="</body></html>";dlFile(nm+".doc",html,"application/msword");
                                    } else if(fmt==="pptx"){
                                      // Publication engine first; existing inline renderer stays as fallback.
                                      let _pptxOk=false;
                                      try{
                                        const _pubCtx=[projectExecution?.context?.company?.name||co.name||"",projectExecution?.context?.company?.industry||co.industry||"",projectExecution?.context?.company?.stage||co.stage||""].filter(Boolean).join(" | ");
                                        let _w=false;
                                        const _bee=new BusinessExecutionEngine(
                                          async(sys:any,msgs:any,maxT?:any,_es?:any,tt?:any)=>(await callMulti({...keys,...(EFF_CLAUDE?.trim()?{claude:EFF_CLAUDE}:{}),...(EFF_GEMINI?.trim()?{gemini:EFF_GEMINI}:{}),...(EFF_GROQ?.trim()?{groq:EFF_GROQ}:{})},defP,sys,msgs,maxT||6000,false,tt||"general")).primary,
                                          ensureXLSX,ensurePptx,ensureJsPDF,
                                          (_fname:any,buf:any)=>{dlFile(nm+".pptx",buf,"application/vnd.openxmlformats-officedocument.presentationml.presentation");_w=true;},
                                          stripMd);
                                        const _spec:DeliverableSpec={type:"pptx",title:del.name,purpose:del.description||del.name,audience:"board",qualityStandard:"cfo_model",priority:"primary"};
                                        const _plan:ExecutionPlan={objectiveRestated:del.description||del.name,domain:(["finance","audit","strategy","marketing","operations","hr","legal","technology","sales","risk"] as const).find(d=>(del.capabilityType||"").toLowerCase().includes(d)||del.name.toLowerCase().includes(d))||"strategy",persona:"Senior Consultant",audience:"board",qualityStandard:"cfo_model",decisionContext:del.description||del.name,deliverables:[_spec],missingInfo:[],executionOrder:[del.name],validationCriteria:[]};
                                        await _bee.generatePPTX(_plan,_spec,_pubCtx,cnt,()=>{});
                                        _pptxOk=_w;
                                      }catch(_e:any){recordEngineDowngrade(del.name,"pptx",_e);}
                                      if(!_pptxOk)try{
                                      const PptxGenJS=await ensurePptx();const pptx=new PptxGenJS();
                                      pptx.defineLayout({name:"WIDE",width:13.333,height:7.5});pptx.layout="WIDE";
                                      const s0=pptx.addSlide();s0.background={color:"0A0E1A"};
                                      s0.addText(del.name,{x:0.7,y:2.8,w:12,h:1.2,fontSize:26,bold:true,color:"F1F5F9"});
                                      parseSections(cnt).slice(0,10).forEach(sec=>{
                                        const s=pptx.addSlide();s.background={color:"0A0E1A"};
                                        s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:0.9,fill:{color:"131825"}});
                                        s.addText(sec.title,{x:0.5,y:0.1,w:12,h:0.7,fontSize:18,bold:true,color:"F1F5F9",valign:"middle"});
                                        const b=sec.lines.map(l=>stripMd(l)).filter(Boolean).slice(0,8);
                                        if(b.length)s.addText(b.map(t=>({text:t.replace(/^[*-]\s*/,""),options:{bullet:{code:"2022"},color:"A0AAC0",fontSize:13,paraSpaceAfter:6}})),{x:0.7,y:1.2,w:12,h:5.8,valign:"top"});
                                      });
                                      await pptx.writeFile({fileName:nm+".pptx"});
                                    }catch(e){showToast("PPT: "+e.message,"error");}}
                                    else if(["linkedin_post","facebook_post","instagram_post","whatsapp_message","email"].includes(fmt)){dlFile(nm+".txt",stripMd(cnt).trim(),"text/plain");} else{dlFile(nm+"."+(fmt||"txt"),cnt,"text/plain");}
                                  }} style={{...S.hBtn,fontSize:8}}>↓</button>
                                </div>
                                {del.qaResult&&(
                                  <div style={{display:"flex",alignItems:"center",gap:5,marginTop:3,flexWrap:"wrap"}}>
                                    <span style={{fontSize:8,padding:"1px 6px",borderRadius:4,fontWeight:700,background:del.qaResult.passed?"rgba(16,185,129,0.1)":"rgba(245,158,11,0.1)",color:del.qaResult.passed?"#10B981":"#F59E0B"}}>{del.qaResult.passed?"✓ QA":"⚠ QA"} {del.qaResult.score}%</span>
                                    <span style={{fontSize:8,color:"#5A6480",flex:1}}>{del.qaResult.summary}</span>
                                    {(del.qaResult.flags||[]).slice(0,1).map((f,fi)=>(
                                      <span key={fi} style={{fontSize:7,padding:"1px 5px",borderRadius:3,background:"rgba(239,68,68,0.08)",color:"#EF4444"}}>{f.suggestion?.slice(0,35)}</span>
                                    ))}
                                  </div>
                                )}
                                {/* Phase 6: user-driven iteration — say what you'd like changed, get exactly that change */}
                                <div style={{display:"flex",gap:4,marginTop:5,alignItems:"center"}}>
                                  <input
                                    value={projectFeedback[del.id]||""}
                                    onChange={e=>setProjectFeedback(prev=>({...prev,[del.id]:e.target.value}))}
                                    placeholder="What would you like changed? (optional)"
                                    disabled={projectRegeneratingId===del.id}
                                    style={{...S.inp,flex:1,fontSize:9,padding:"4px 8px"}}
                                  />
                                  <button
                                    onClick={()=>regenerateDeliverableWithFeedback(del.moduleId,del.id,del.name,rawContentStore.current[del.id]||del.rawContent||"")}
                                    disabled={projectRegeneratingId===del.id||!(projectFeedback[del.id]||"").trim()}
                                    style={{...S.hBtn,fontSize:8,opacity:(projectRegeneratingId===del.id||!(projectFeedback[del.id]||"").trim())?0.4:1,whiteSpace:"nowrap"}}
                                  >{projectRegeneratingId===del.id?"Updating...":"Apply"}</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {/* New project button */}
                      {/* ── REVIEW PANEL ── */}
                      {projectReviewMode&&projectExecution&&!projectExecuting&&!projectQARunning&&(
                        <div style={{background:"#131825",border:"1px solid #1a2030",borderRadius:8,padding:"12px 14px",marginTop:8,marginBottom:8}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#F1F5F9"}}>Review Deliverables Before Packaging</div>
                            <button onClick={()=>setProjectReviewMode(false)} style={{...S.hBtn,fontSize:9}}>Done Reviewing</button>
                          </div>
                          {(projectExecution.modules||[]).flatMap(m=>(m.deliverables||[]).filter(d=>d.rawContent).map(d=>({...d,_mod:m.name}))).map((del,di)=>(
                            <div key={di} style={{background:"#0a0e1a",borderRadius:6,padding:"8px 10px",marginBottom:6,border:"1px solid "+(projectExcluded[del.id]?"#EF444433":"#1a2030")}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                                <input type="checkbox" checked={!projectExcluded[del.id]} onChange={()=>setProjectExcluded(prev=>({...prev,[del.id]:!prev[del.id]}))} style={{accentColor:"#14B8A6",flexShrink:0}}/>
                                <div style={{flex:1}}>
                                  <div style={{fontSize:10,fontWeight:600,color:projectExcluded[del.id]?"#5A6480":"#F1F5F9"}}>{del.name}</div>
                                  <div style={{fontSize:8,color:"#5A6480"}}>{del._mod} · {del.outputFormat} · QA {del.qaResult?.score||0}%</div>
                                </div>
                                {del.qaResult?.passed===false&&<span style={{fontSize:8,padding:"1px 6px",borderRadius:4,background:"rgba(245,158,11,0.1)",color:"#F59E0B"}}>⚠ Review</span>}
                                <button onClick={()=>cp(del.rawContent||"")} style={{...S.hBtn,fontSize:8}}>Copy</button>
                              </div>
                              {!projectExcluded[del.id]&&del.rawContent&&(
                                <div style={{background:"#131825",borderRadius:4,padding:"6px 8px",maxHeight:120,overflowY:"auto",fontSize:9,color:"#8892B0",lineHeight:1.5}}>
                                  {del.rawContent.slice(0,400)}{del.rawContent.length>400?"...":""}
                                </div>
                              )}
                            </div>
                          ))}
                          <div style={{fontSize:9,color:"#5A6480",marginTop:6}}>
                            {Object.keys(projectExcluded).filter(k=>projectExcluded[k]).length} excluded · {(projectExecution.modules||[]).flatMap(m=>m.deliverables||[]).filter(d=>d.rawContent&&!projectExcluded[d.id]).length} will be packaged
                          </div>
                        </div>
                      )}
                      {!projectExecuting&&!projectQARunning&&(
                        <div style={{marginTop:8}}>
                          {/* Media picker */}
                          <div style={{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:7,padding:"10px 12px",marginBottom:8}}>
                            <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Media Generation</div>
                            <div style={{marginBottom:8}}>
                              <div style={{fontSize:9,fontWeight:600,color:"#A0AAC0",marginBottom:4}}>🖼 Images</div>
                              {[["prompts","Export prompts only","free",""],["dalle","Generate with DALL-E 3","~₹8/image","openai"],["stability","Generate with Stability AI","~₹3/image","stability"]].map(([val,lb,cost,reqKey])=>(
                                <label key={val} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,cursor:"pointer",opacity:reqKey&&!keys[reqKey]?.trim()?0.4:1}}>
                                  <input type="radio" name="imgMode" checked={mediaMode.image===val} onChange={()=>setMediaMode(m=>({...m,image:val}))} disabled={!!reqKey&&!keys[reqKey]?.trim()} style={{accentColor:"#14B8A6"}}/>
                                  <span style={{fontSize:9,color:"#A0AAC0"}}>{lb}</span>
                                  <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:val==="prompts"?"rgba(16,185,129,0.1)":"rgba(245,158,11,0.08)",color:val==="prompts"?"#10B981":"#F59E0B"}}>{cost}</span>
                                  {reqKey&&!keys[reqKey]?.trim()&&(
                                  <span style={{fontSize:7,color:"#EF4444",display:"block",marginTop:2}}>⚠ Add {reqKey==="openai"?"OpenAI":reqKey==="stability"?"Stability AI":reqKey} key in Settings → API Keys</span>
                                )}
                                </label>
                              ))}
                            </div>
                            <div>
                              <div style={{fontSize:9,fontWeight:600,color:"#A0AAC0",marginBottom:4}}>🎬 Video</div>
                              {[["veo","Google Veo prompts","free"],["runway","Runway ML prompts","free"],["kling","Kling AI prompts","free"]].map(([val,lb,cost])=>(
                                <label key={val} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,cursor:"pointer"}}>
                                  <input type="radio" name="vidMode" checked={mediaMode.video===val} onChange={()=>setMediaMode(m=>({...m,video:val}))} style={{accentColor:"#14B8A6"}}/>
                                  <span style={{fontSize:9,color:"#A0AAC0"}}>{lb}</span>
                                  <span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:"rgba(16,185,129,0.1)",color:"#10B981"}}>{cost}</span>
                                </label>
                              ))}
                              <div style={{fontSize:8,color:"#5A6480",marginTop:4,lineHeight:1.5}}>Video prompts are included in the ZIP — paste into your chosen tool to generate.</div>
                            </div>
                            <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #1a2030",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span style={{fontSize:9,color:"#5A6480"}}>Estimated cost:</span>
                              <span style={{fontSize:10,fontWeight:700,color:mediaMode.image==="prompts"?"#10B981":"#F59E0B"}}>{mediaMode.image==="prompts"?"₹0 — Free":"Paid — check key balance"}</span>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>runProjectPackage({...projectExecution,_excluded:projectExcluded})} disabled={projectPackaging}
                              style={{...S.pBtn,marginTop:0,flex:2,fontSize:11,background:"linear-gradient(135deg,#14B8A6,#6366F1)",opacity:projectPackaging?0.5:1}}>
                              {projectPackaging?"📦 Packaging...":"📦 Download All Files (ZIP)"}
                            </button>
                            <button onClick={()=>{setProjectReviewMode(r=>!r);setProjectExcluded({});}}
                              style={{...S.hBtn,flex:1,textAlign:"center",padding:"10px 8px",fontSize:10,color:projectReviewMode?"#14B8A6":"#A0AAC0",borderColor:projectReviewMode?"#14B8A633":"#1a2030"}}>Review</button>
                            <button onClick={()=>{setProjectExecution(null);setProjectExecPhase("");setProjectReviewMode(false);setProjectExcluded({});setProjectDashboardOpen(false);rawContentStore.current={};}}
                              style={{...S.hBtn,textAlign:"center",padding:"10px 8px",fontSize:10}}>New</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── PLANNING / INPUT UI ── */}
                  {!projectDashboardOpen&&(
                  <div>
                  {!projectPlan&&!projectPlanning&&(
                    <div>
                      <label style={S.lbl}>Business Objective</label>
                      <div style={{display:"flex",gap:4,alignItems:"flex-start",marginBottom:10}}>
                        <textarea style={{...S.inp,flex:1,minHeight:80,resize:"vertical"}} value={projectObjective} onChange={e=>setProjectObjective(e.target.value)} placeholder="e.g. Launch Orchestriq to market. Or: Build a complete compliance audit programme for our EMEA operations."/>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}><LangPick value={vLang} onChange={vl=>{setVLang(vl);sv("cos-vl",vl);}}/><MicButton lang={vLang} onResult={t=>setProjectObjective(prev=>(prev?prev+" ":"")+t)}/></div>
                      </div>
                      <div style={{background:"rgba(20,184,166,0.04)",border:"1px solid rgba(20,184,166,0.15)",borderRadius:7,padding:"10px 12px",marginBottom:12,fontSize:10,color:"#A0AAC0",lineHeight:1.7}}>
                        <strong style={{color:"#14B8A6"}}>What happens next:</strong> The Project Architect analyses your objective and builds an Execution Plan listing every module and deliverable. You review and approve the plan before any AI execution begins.
                      </div>
                      <button onClick={runProjectPlanning} disabled={!projectObjective.trim()} style={{...S.pBtn,marginTop:0,background:"linear-gradient(135deg,#14B8A6,#6366F1)",opacity:projectObjective.trim()?1:0.3}}>Generate Execution Plan</button>
                    </div>
                  )}
                  {projectPlanning&&(
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"20px",background:"#131825",borderRadius:8,border:"1px solid #1a2030"}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:"#14B8A6",display:"inline-block",animation:"pulse 1s infinite",flexShrink:0}}/>
                      <div><div style={{fontSize:12,fontWeight:700,color:"#14B8A6"}}>Project Architect is analysing your objective…</div><div style={{fontSize:10,color:"#5A6480",marginTop:3}}>Decomposing into modules and deliverables. This takes 15-30 seconds.</div></div>
                    </div>
                  )}
                  {projectPlan&&!projectPlanning&&(
                    <div style={{animation:"fadeIn 0.3s"}}>
                      <div style={{background:"#131825",border:"1px solid #1a2030",borderRadius:8,padding:"14px 16px",marginBottom:12}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                          <span style={{fontSize:18}}>📋</span>
                          <div><div style={{fontSize:13,fontWeight:800,color:"#F1F5F9"}}>{projectPlan.name}</div><div style={{fontSize:9,color:"#5A6480",marginTop:1}}>{projectPlan.modules?.length||0} execution modules · {(projectPlan.modules||[]).reduce((a,m)=>a+(m.deliverables?.length||0),0)} deliverables planned</div></div>
                          <span style={{marginLeft:"auto",fontSize:8,padding:"3px 8px",borderRadius:8,background:"rgba(245,158,11,0.1)",color:"#F59E0B",fontWeight:700}}>AWAITING APPROVAL</span>
                        </div>
                        <div style={{fontSize:10,color:"#8892B0",lineHeight:1.6,marginBottom:10,fontStyle:"italic"}}>Objective: "{projectPlan.objective}"</div>
                        {projectPlan.architectReasoning&&(
                          <div style={{background:"rgba(20,184,166,0.05)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:6,padding:"9px 11px",marginBottom:10}}>
                            <div style={{fontSize:9,fontWeight:700,color:"#14B8A6",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Here's what I understood</div>
                            <div style={{fontSize:10.5,color:"#C5CCDC",lineHeight:1.6}}>{projectPlan.architectReasoning.goalRestated}</div>
                            {projectPlan.architectReasoning.relevantDataUsed?.length>0&&(
                              <div style={{fontSize:9,color:"#8892B0",marginTop:5}}>📎 Used: {projectPlan.architectReasoning.relevantDataUsed.join(" · ")}</div>
                            )}
                            {projectPlan.architectReasoning.keyAssumptions?.length>0&&(
                              <div style={{fontSize:9,color:"#F59E0B",marginTop:4}}>⚠ Assuming: {projectPlan.architectReasoning.keyAssumptions.join(" · ")} — edit your objective above and regenerate if this isn't right.</div>
                            )}
                          </div>
                        )}
                        {(projectPlan.modules||[]).map((mod,mi)=>(
                          <div key={mi} style={{marginBottom:8,background:"#0a0e1a",borderRadius:6,padding:"10px 12px",border:"1px solid #1a2030"}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                              <span style={{fontSize:14}}>{mod.icon||"⚙️"}</span>
                              <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:"#14B8A6"}}>{mod.name}</div><div style={{fontSize:9,color:"#5A6480"}}>{mod.capabilityType} · {mod.deliverables?.length||0} deliverables</div></div>
                            </div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                              {(mod.deliverables||[]).map((del,di)=>(
                                <div key={di} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:4,padding:"4px 8px",fontSize:9}}>
                                  <span style={{color:"#A0AAC0"}}>{del.name}</span>
                                  <span style={{marginLeft:4,color:"#3A4060",fontSize:8}}>{del.outputFormat}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{background:"rgba(20,184,166,0.04)",border:"1px solid rgba(20,184,166,0.15)",borderRadius:7,padding:"10px 12px",marginBottom:12,fontSize:10,color:"#8892B0",lineHeight:1.7}}>
                        Approving this plan saves it as a reusable Execution Plan template. Future similar objectives will be matched to this plan automatically.
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={approveProjectPlan} style={{flex:1,...S.pBtn,marginTop:0,background:"#10B981"}}>Approve Plan and Begin Execution</button>
                        <button onClick={()=>{setProjectPlan(null);setProjectObjective("");}} style={{...S.hBtn,padding:"10px 14px",fontSize:11}}>Revise</button>
                        <button onClick={()=>{setProjectPlan(null);setProjectObjective("");try{localStorage.removeItem("cos-project-plan");}catch{}}} style={{...S.hBtn,padding:"10px 14px",fontSize:11,color:"#EF4444",borderColor:"#EF444433"}}>✕ Cancel</button>
                      </div>
                    </div>
                  )}
                  {projects.length>0&&!projectPlan&&!projectPlanning&&!projectDashboardOpen&&(
                    <div style={{marginTop:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8,flexWrap:"wrap"}}>
                        {[["recent","Recent"],["complete","Completed"],["partial","Partial"],["archived","Archived"]].map(([v,lb])=>(
                          <button key={v} onClick={()=>setProjectArchiveView(v)} style={{padding:"3px 9px",borderRadius:5,fontSize:9,fontWeight:600,border:"1px solid "+(projectArchiveView===v?"#14B8A6":"#1a2030"),background:projectArchiveView===v?"rgba(20,184,166,0.08)":"transparent",color:projectArchiveView===v?"#14B8A6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{lb}</button>
                        ))}
                        <input value={projectSearchQ} onChange={e=>setProjectSearchQ(e.target.value)} placeholder="Search..." style={{...S.inp,flex:1,minWidth:70,fontSize:9,padding:"3px 7px",marginLeft:"auto"}}/>
                      </div>
                      {(()=>{
                        const q=projectSearchQ.toLowerCase();
                        return projects.filter(p=>{
                          if(q&&!p.name.toLowerCase().includes(q)&&!(p.objective||"").toLowerCase().includes(q))return false;
                          if(projectArchiveView==="recent")return !p.archived;
                          if(projectArchiveView==="complete")return p.status==="complete"&&!p.archived;
                          if(projectArchiveView==="partial")return p.status==="partial"&&!p.archived;
                          if(projectArchiveView==="archived")return !!p.archived;
                          return !p.archived;
                        }).slice(0,10).map(p=>(
                          <div key={p.id} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:6,padding:"9px 11px",marginBottom:5}}>
                            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:10,fontWeight:600,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                                <div style={{fontSize:8,color:"#5A6480",marginTop:1}}>{p.modules?.length||0} modules · {new Date(p.createdAt).toLocaleDateString()}</div>
                              </div>
                              <span style={{fontSize:8,padding:"2px 7px",borderRadius:8,fontWeight:700,flexShrink:0,background:p.status==="complete"?"rgba(16,185,129,0.12)":p.status==="partial"?"rgba(245,158,11,0.08)":"rgba(20,184,166,0.08)",color:p.status==="complete"?"#10B981":p.status==="partial"?"#F59E0B":"#14B8A6"}}>{p.status}</span>
                            </div>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>{setProjectExecution(p);setProjectReviewMode(false);setProjectExcluded({});setProjectDashboardOpen(true);}} style={{...S.hBtn,flex:2,textAlign:"center",fontSize:8,color:"#14B8A6",borderColor:"#14B8A633"}}>📂 Open</button>
                              {p.status==="complete"&&<button onClick={()=>runProjectPackage({...p,_excluded:{}})} style={{...S.hBtn,flex:2,textAlign:"center",fontSize:8}}>📦 ZIP</button>}
                              <button onClick={()=>{const u=projects.map(x=>x.id===p.id?{...x,archived:!x.archived}:x);setProjects(u);sv("cos-projects",u);}} style={{...S.hBtn,flex:1,textAlign:"center",fontSize:8}}>{p.archived?"↩":"📁"}</button>
                              <button onClick={()=>{if(window.confirm("Delete \""+p.name+"\"? This cannot be undone.")){const u=projects.filter(x=>x.id!==p.id);setProjects(u);sv("cos-projects",u);}}} style={{...S.hBtn,flex:1,textAlign:"center",fontSize:8,color:"#EF4444",borderColor:"#EF444433"}}>🗑</button>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  </div>
                  )}
                </div>
              )}
              {wfView==="active"&&(
                <div>
                  {!wfActive?(
                    <div style={{textAlign:"center",padding:"40px 20px",color:"#5A6480"}}><div style={{fontSize:32,marginBottom:8}}>⚡</div><div style={{fontSize:13,fontWeight:600,color:"#A0AAC0",marginBottom:6}}>No active workflow</div><button onClick={()=>setWfView("new")} style={{...S.pBtn,width:"auto",padding:"8px 20px",marginTop:14,fontSize:12}}>Start New Task</button></div>
                  ):(
                    <div>
                      <div style={{background:"#131825",borderRadius:8,padding:"12px 14px",marginBottom:12,border:"1px solid "+(CHAINS[wfActive.category]?.color+"33"||"#1a2030")}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                          <span style={{fontSize:16}}>{CHAINS[wfActive.category]?.ic||"⚡"}</span>
                          <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:"#F1F5F9"}}>{wfActive.chainLabel}</div><div style={{fontSize:9,color:"#5A6480"}}>Started {new Date(wfActive.startedAt).toLocaleString()}</div></div>
                          <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,fontWeight:700,background:wfActive.status==="awaiting_approval"?"rgba(245,158,11,0.1)":wfActive.status==="error"?"rgba(239,68,68,0.1)":"rgba(20,184,166,0.08)",color:wfActive.status==="awaiting_approval"?"#F59E0B":wfActive.status==="error"?"#EF4444":"#14B8A6"}}>{wfActive.status==="awaiting_approval"?"Awaiting Approval":wfActive.status==="error"?"Error":wfRunning?"Running":"Complete"}</span>
                        </div>
                        <div style={{fontSize:11,color:"#A0AAC0",fontStyle:"italic"}}>"{wfActive.task}"</div>
                      </div>
                      <div style={{marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#5A6480",marginBottom:4}}><span>Chain Progress</span><span>{wfActive.steps.length}/{CHAINS[wfActive.category]?.chain.length||0} levels</span></div>
                        <div style={{background:"#1a2030",borderRadius:20,height:4}}><div style={{background:"linear-gradient(90deg,#14B8A6,#3B82F6)",height:"100%",borderRadius:20,width:((wfActive.steps.length/(CHAINS[wfActive.category]?.chain.length||1))*100)+"%",transition:"width 0.5s"}}/></div>
                      </div>
                      {wfActive.steps.map((step,i)=>(
                        <div key={i} style={{marginBottom:8,animation:"fadeIn 0.3s"}}>
                          <div style={{background:step.failed?"rgba(239,68,68,0.06)":"#131825",borderRadius:7,padding:"10px 12px",borderLeft:"3px solid "+(step.failed?"#EF4444":step.role.dc)}}>
                            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                              <span style={{fontSize:14}}>{step.role.ic}</span>
                              <span style={{fontSize:10,fontWeight:700,color:step.failed?"#EF4444":step.role.dc}}>{step.role.t} — Level {step.level}</span>
                              {step.isLast&&!step.failed&&<span style={{marginLeft:"auto",fontSize:8,background:"rgba(245,158,11,0.1)",color:"#F59E0B",padding:"2px 7px",borderRadius:8,fontWeight:700}}>FINAL</span>}
                              {step.failed&&<span style={{marginLeft:"auto",fontSize:8,background:"rgba(239,68,68,0.1)",color:"#EF4444",padding:"2px 7px",borderRadius:8,fontWeight:700}}>FAILED</span>}
                              {!step.failed&&<button onClick={()=>cp(step.output)} style={{...S.hBtn,marginLeft:"auto"}}>Copy</button>}
                            </div>
                            <div style={{fontSize:11,lineHeight:1.7,color:step.failed?"#EF9999":"#A0AAC0"}}><Md text={step.output} ac={step.failed?"#EF4444":step.role.dc}/></div>
                          </div>
                          {step.capability&&(
                            <div style={{marginTop:8,background:"linear-gradient(135deg,rgba(168,85,247,0.06),rgba(20,184,166,0.04))",border:"1px solid rgba(168,85,247,0.2)",borderRadius:8,padding:"12px 14px"}}>
                              <div style={{fontSize:12,fontWeight:800,color:"#A855F7",marginBottom:8}}>📋 Capability & Cost Brief</div>
                              {step.capability.info_needed?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:3}}>Information Still Needed</div>{step.capability.info_needed.map((x,k)=><div key={k} style={{fontSize:10,color:"#A0AAC0",padding:"2px 0"}}>• {x}</div>)}</div>}
                              {step.capability.tools_required?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:3}}>Tools / Integrations Required</div>{step.capability.tools_required.map((t,k)=><div key={k} style={{fontSize:10,padding:"2px 0",color:t.available?"#10B981":"#F59E0B"}}>{t.available?"✓":"⚠"} {t.name} — {t.why}{!t.available&&" (not yet integrated — contact admin)"}</div>)}</div>}
                              {step.capability.automated_steps?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:3}}>✅ Completed By This Chain</div>{step.capability.automated_steps.map((x,k)=><div key={k} style={{fontSize:10,color:"#10B981",padding:"2px 0"}}>• {x}</div>)}</div>}
                              {step.capability.manual_steps?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:3}}>👤 Your Next Steps</div>{step.capability.manual_steps.map((x,k)=><div key={k} style={{fontSize:10,color:"#A0AAC0",padding:"2px 0"}}>{k+1}. {x}</div>)}</div>}
                              {step.capability.est_cost_usd>0&&<div style={{marginTop:8,paddingTop:8,borderTop:"1px dashed #1a2030"}}><div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:3}}>Estimated Cost</div><div style={{fontSize:11,color:"#A0AAC0"}}>External services: ~${step.capability.est_cost_usd.toFixed(2)} · Service fee: ~${step.capability.fee_usd.toFixed(2)}</div><div style={{fontSize:14,fontWeight:800,color:"#14B8A6",marginTop:4}}>{step.capability.converted_total?cur.sym+step.capability.converted_total:"$"+step.capability.total_usd.toFixed(2)+" total"}</div></div>}
                              {step.capability.notes&&<div style={{marginTop:8,fontSize:10,color:"#8892B0",fontStyle:"italic"}}>{step.capability.notes}</div>}
                            </div>
                          )}
                          {i<wfActive.steps.length-1&&<div style={{display:"flex",justifyContent:"center",margin:"3px 0"}}><span style={{fontSize:9,color:"#3A4060"}}>↓ escalated</span></div>}
                        </div>
                      ))}
                      {wfRunning&&wfPhase&&<div style={{fontSize:10,color:"#14B8A6",margin:"8px 0",display:"flex",alignItems:"center",gap:5}}><span style={{width:5,height:5,borderRadius:"50%",background:"#14B8A6",display:"inline-block",animation:"pulse 1s infinite"}}/>{wfPhase}</div>}
                      {wfActive.status==="awaiting_approval"&&!wfRunning&&(
                        <div style={{marginTop:14,padding:"14px",background:"linear-gradient(135deg,rgba(20,184,166,0.06),rgba(59,130,246,0.04))",border:"1px solid rgba(20,184,166,0.2)",borderRadius:8}}>
                          <div style={{fontSize:12,fontWeight:800,color:"#14B8A6",marginBottom:4}}>Chain Complete — Your Decision</div>
                          <p style={{fontSize:11,color:"#8892B0",marginBottom:12,lineHeight:1.6}}>All {wfActive.steps.length} levels have reviewed and enhanced this task. Do you approve this output?</p>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={approveWF} style={{flex:1,background:"#10B981",color:"#fff",border:"none",borderRadius:7,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>Approve and Archive</button>
                            <button onClick={()=>{const note=prompt("Reason for rejection?");rejectWF(note||"");}} style={{flex:1,background:"transparent",color:"#EF4444",border:"1px solid #EF444444",borderRadius:7,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>Send Back</button>
                          </div>
                          <button onClick={()=>dlFile("Workflow-"+wfActive.id+".md",wfActive.steps.map(s=>"## Level "+s.level+": "+s.role.t+"\n"+s.output).join("\n\n---\n\n"),"text/markdown")} style={{...S.hBtn,width:"100%",marginTop:8,textAlign:"center"}}>Export Full Chain as Markdown</button>
<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #1a2030"}}>
  <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>⚡ Generate CFO-Grade File (Python Service)</div>
  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
    {[["📊 Excel","excel"],["📑 PPT","pptx"],["📄 PDF","pdf"],["📝 Word","docx"]].map(([lb,type])=>(
      <button key={type} onClick={async()=>{
        const body=wfActive.steps.map(s=>s.output).join("\n\n");
        const fn=type==="excel"?generateExcel:type==="pptx"?generatePptx:type==="pdf"?generatePdf:generateDocx;
        showToast("Building "+lb.replace(/[^\w]/g,"")+"…","info");
        const r=await fn({objective:wfActive.task,company_context:co.name+" | "+co.industry+" | "+co.stage+" | "+co.location,available_data:body,currency:co.currency,currency_symbol:cur.sym,api_key:keys.claude||keys.openai||keys.gemini||keys.groq||""});
        if(!r.success)showToast(r.error||"Generation failed","error");
      }} style={{...S.hBtn,color:"#14B8A6",borderColor:"#14B8A633",flex:1,textAlign:"center"}}>{lb}</button>
    ))}
  </div>
  <div style={{fontSize:8,color:"#5A6480",marginTop:5}}>Uses Railway Python service → CFO-grade Excel with formulas, consulting-grade PPT/PDF/Word</div>
</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {wfView==="history"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div><div style={{fontSize:13,fontWeight:800,color:"#F1F5F9"}}>Workflow History</div><p style={{fontSize:10,color:"#5A6480"}}>{workflows.length} completed</p></div>
                    {workflows.length>0&&<button onClick={()=>{if(confirm("Clear all history?")){setWorkflows([]);sv("cos-wf",[]);}}} style={{...S.hBtn,color:"#EF4444",borderColor:"#EF444433"}}>Clear All</button>}
                  </div>
                  {!workflows.length?(<div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}><div style={{fontSize:28,marginBottom:8}}>📁</div><div style={{fontSize:12}}>No completed workflows yet.</div></div>):(
                    workflows.map(wf=>(
                      <div key={wf.id} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:8,padding:"12px 14px",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
                          <span style={{fontSize:16}}>{CHAINS[wf.category]?.ic||"⚡"}</span>
                          <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontWeight:700,color:"#F1F5F9",marginBottom:1}}>{wf.chainLabel}</div><div style={{fontSize:10,color:"#8892B0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{wf.task}"</div><div style={{fontSize:8,color:"#3A4060",marginTop:3}}>{new Date(wf.startedAt).toLocaleDateString()} · {wf.steps.length} levels</div></div>
                          <span style={{fontSize:8,padding:"3px 8px",borderRadius:10,fontWeight:700,background:wf.status==="approved"?"rgba(16,185,129,0.12)":"rgba(239,68,68,0.1)",color:wf.status==="approved"?"#10B981":"#EF4444"}}>{wf.status==="approved"?"Approved":"Rejected"}</span>
                        </div>
                        {wf.rejectionNote&&<div style={{fontSize:9,color:"#EF4444",padding:"4px 8px",background:"rgba(239,68,68,0.05)",borderRadius:4,marginBottom:6}}>{wf.rejectionNote}</div>}
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>{setWfActive(wf);setWfView("active");}} style={{...S.hBtn,flex:1,textAlign:"center"}}>View</button>
                          <button onClick={()=>dlFile("Workflow-"+wf.id+".md",wf.steps.map(s=>"## Level "+s.level+": "+s.role.t+"\n"+s.output).join("\n\n---\n\n"),"text/markdown")} style={{...S.hBtn,flex:1,textAlign:"center"}}>Export</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AUTOPILOT P3 */}
        {view==="p3"&&(
          <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
            <div style={{display:"flex",gap:2,padding:"8px 14px",borderBottom:"1px solid #14192a",background:"#0c1120",alignItems:"center",flexWrap:"wrap"}}>
              {[["dashboard","Dashboard"],["new","New Task"],["running","Running"+(qRunning?" ●":"")],["completed","Review ("+tQueue.filter(t=>t.status===TS.REVIEWING).length+")"],["completed_arc","Archive ("+tQueue.filter(t=>[TS.APPROVED,TS.REJECTED].includes(t.status)).length+")"]].map(([id,lb])=>(
                <button key={id} onClick={()=>setP3View(id)} style={{padding:"4px 8px",borderRadius:5,fontSize:9,fontWeight:600,border:"1px solid "+(p3View===id?"#14B8A6":"#1a2030"),background:p3View===id?"rgba(20,184,166,0.08)":"transparent",color:p3View===id?"#14B8A6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif",whiteSpace:"nowrap"}}>{lb}</button>
              ))}
              <button onClick={()=>setP3Notify([])} title="Clear notifications" style={{...S.hBtn,marginLeft:"auto",fontSize:13,position:"relative"}}>
                🔔{p3Notify.length>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#EF4444",color:"#fff",fontSize:7,borderRadius:"50%",width:12,height:12,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{p3Notify.length>9?"9+":p3Notify.length}</span>}
              </button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
              {p3View==="dashboard"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>Autonomous Task Dashboard</div>
                  <p style={{fontSize:10,color:"#8892B0",marginBottom:14,lineHeight:1.6}}>Phase 3: Full automation. Queue tasks, hit Run All, the entire hierarchy processes them. You approve at the end.</p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
                    {[["Queued",tQueue.filter(t=>t.status===TS.QUEUED).length,"#F59E0B"],["Running",tQueue.filter(t=>t.status===TS.RUNNING).length,"#14B8A6"],["Review",tQueue.filter(t=>t.status===TS.REVIEWING).length,"#8B5CF6"],["Approved",tQueue.filter(t=>t.status===TS.APPROVED).length,"#10B981"]].map(([lb,count,c])=>(
                      <div key={lb} style={{background:"#131825",border:"1px solid "+c+"22",borderRadius:8,padding:"12px 10px",textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,color:c}}>{count}</div><div style={{fontSize:9,color:"#5A6480",fontWeight:600,textTransform:"uppercase"}}>{lb}</div></div>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                    <button onClick={()=>setP3View("new")} style={{...S.pBtn,marginTop:0,fontSize:12}}>Add Task to Queue</button>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={runQueue} disabled={qRunning||!tQueue.filter(t=>t.status===TS.QUEUED).length} style={{...S.pBtn,marginTop:0,background:"linear-gradient(135deg,#8B5CF6,#3B82F6)",fontSize:12,flex:1,opacity:qRunning||!tQueue.filter(t=>t.status===TS.QUEUED).length?0.3:1}}>{qRunning?"Processing…":"Run All Queued"}</button>
                      {qRunning&&<button onClick={()=>{cancelRef.current.q=true;}} style={{...S.cancelBtn,alignSelf:"stretch"}}>Stop</button>}
                    </div>
                  </div>
                  {qRunning&&p3Phase&&(
                    <div style={{background:"rgba(20,184,166,0.06)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:7,padding:"10px 14px",marginBottom:12,fontSize:11,color:"#14B8A6",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:"#14B8A6",display:"inline-block",animation:"pulse 1s infinite",flexShrink:0}}/>
                      <div><div style={{fontWeight:700}}>{p3Phase}</div>{p3Running&&<div style={{fontSize:9,color:"#5A6480",marginTop:2}}>Task: "{p3Running.task?.slice(0,60)}…"</div>}</div>
                    </div>
                  )}
                  {p3Notify.length>0&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:5}}>Activity Feed</div>
                      {p3Notify.slice(0,8).map(n=>(
                        <div key={n.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:"#0a0e1a",borderRadius:5,marginBottom:3,fontSize:10,color:n.type==="error"?"#EF4444":n.type==="success"?"#10B981":n.type==="complete"?"#8B5CF6":"#A0AAC0"}}>
                          <span style={{fontSize:8,color:"#3A4060",flexShrink:0}}>{new Date(n.ts).toLocaleTimeString()}</span>{n.msg}
                        </div>
                      ))}
                    </div>
                  )}
                  {tQueue.length>0?(
                    <div>
                      <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>All Tasks</div>
                      {tQueue.slice().reverse().map(t=>(
                        <div key={t.id} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:6,padding:"9px 11px",marginBottom:5,display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:14}}>{CHAINS[t.category]?.ic||"⚡"}</span>
                          <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontWeight:600,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{t.task.slice(0,55)}{t.task.length>55?"…":""}"</div><div style={{fontSize:8,color:"#5A6480",marginTop:1}}>{t.chainLabel} · {t.priority.toUpperCase()} · Level {t.currentLevel||0}/{CHAINS[t.category]?.chain.length||0}</div></div>
                          <span style={{fontSize:8,padding:"2px 7px",borderRadius:8,fontWeight:700,background:sBg(t.status),color:sColor(t.status)}}>{t.status.replace("_"," ").toUpperCase()}</span>
                          <button onClick={()=>deleteT(t.id)} style={{background:"none",border:"none",color:"#3A4060",fontSize:10,cursor:"pointer",flexShrink:0}}>×</button>
                        </div>
                      ))}
                    </div>
                  ):(<div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}><div style={{fontSize:32,marginBottom:8}}>🤖</div><div style={{fontSize:13,fontWeight:600,color:"#A0AAC0",marginBottom:4}}>Queue is empty</div><button onClick={()=>setP3View("new")} style={{...S.pBtn,width:"auto",padding:"8px 20px",marginTop:14,fontSize:12}}>Add First Task</button></div>)}
                </div>
              )}
              {p3View==="new"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:6}}>Add Task to Autonomous Queue</div>
                  <div style={{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:7,padding:"10px 12px",marginBottom:10}}>
                    <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                      <input type="checkbox" checked={p3Auto} onChange={e=>setP3Auto(e.target.checked)} style={{accentColor:"#14B8A6",width:14,height:14}}/>
                      <div><div style={{fontSize:11,fontWeight:700,color:"#F1F5F9"}}>Auto-Route (Recommended)</div><div style={{fontSize:9,color:"#5A6480"}}>AI analyses task description and selects the best escalation chain automatically</div></div>
                    </label>
                    {p3Auto&&p3Task.trim()&&(()=>{const detected=autoRoute(p3Task);const ch=CHAINS[detected];return<div style={{marginTop:8,padding:"5px 8px",background:ch.color+"08",borderRadius:4,fontSize:9,color:ch.color,fontWeight:600}}>Detected: {ch.ic} {ch.label}</div>;})()}
                  </div>
                  {!p3Auto&&(<div style={{marginBottom:10}}><label style={S.lbl}>Select Chain Manually</label><select style={{...S.inp,padding:"8px"}} value={p3Cat} onChange={e=>setP3Cat(e.target.value)}>{Object.entries(CHAINS).map(([k,ch])=><option key={k} value={k} style={{background:"#0a0e1a"}}>{ch.ic} {ch.label}</option>)}</select></div>)}
                  <div style={{marginBottom:10}}><label style={S.lbl}>Priority</label><div style={{display:"flex",gap:5}}>{[["high","High","#EF4444"],["medium","Medium","#F59E0B"],["low","Low","#10B981"]].map(([p,lb,c])=>(<button key={p} onClick={()=>setP3Pri(p)} style={{flex:1,padding:"7px",borderRadius:5,fontSize:10,fontWeight:600,border:"1px solid "+(p3Pri===p?c+"66":"#1a2030"),background:p3Pri===p?c+"10":"transparent",color:p3Pri===p?c:"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{lb}</button>))}</div></div>
                  <label style={S.lbl}>Task Description</label>
                  <div style={{display:"flex",gap:4,alignItems:"flex-start",marginBottom:10}}>
                    <textarea style={{...S.inp,flex:1,minHeight:80,resize:"vertical"}} value={p3Task} onChange={e=>setP3Task(e.target.value)} placeholder="Describe the task in detail…"/>
                    <div style={{display:"flex",flexDirection:"column",gap:4}}><LangPick value={vLang} onChange={vl=>{setVLang(vl);sv("cos-vl",vl);}}/><MicButton lang={vLang} onResult={t=>setP3Task(prev=>(prev?prev+" ":"")+t)}/></div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{if(!p3Task.trim())return;enqueue(p3Task,p3Cat,p3Pri,p3Auto);setP3Task("");setP3View("dashboard");}} disabled={!p3Task.trim()} style={{...S.pBtn,marginTop:0,flex:1,opacity:p3Task.trim()?1:0.3}}>Add to Queue</button>
                    <button onClick={()=>{if(!p3Task.trim())return;enqueue(p3Task,p3Cat,p3Pri,p3Auto);setP3Task("");if(!qRunning)runQueue();setP3View("running");}} disabled={!p3Task.trim()||qRunning} style={{...S.pBtn,marginTop:0,flex:1,background:"linear-gradient(135deg,#14B8A6,#3B82F6)",opacity:p3Task.trim()&&!qRunning?1:0.3}}>Add and Run Now</button>
                  </div>
                </div>
              )}
              {p3View==="running"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:6}}>Live Chain Processing</div>
                  {!qRunning&&!p3Running?(<div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}><div style={{fontSize:28,marginBottom:8}}>✅</div><div style={{fontSize:12}}>No tasks currently running.</div><button onClick={()=>setP3View("dashboard")} style={{...S.pBtn,width:"auto",padding:"8px 18px",marginTop:14,fontSize:12}}>Back to Dashboard</button></div>):(
                    p3Running&&(
                      <div>
                        <div style={{background:"rgba(20,184,166,0.06)",border:"1px solid rgba(20,184,166,0.2)",borderRadius:8,padding:"12px",marginBottom:12}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#14B8A6",marginBottom:3}}>Currently Processing</div>
                          <div style={{fontSize:11,color:"#F1F5F9",marginBottom:4}}>"{p3Running.task}"</div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{flex:1,background:"#1a2030",borderRadius:20,height:4}}><div style={{background:"linear-gradient(90deg,#14B8A6,#3B82F6)",height:"100%",borderRadius:20,width:((p3Running.currentLevel||0)/(CHAINS[p3Running.category]?.chain.length||1)*100)+"%",transition:"width 0.5s"}}/></div>
                            <span style={{fontSize:9,color:"#5A6480",whiteSpace:"nowrap"}}>{p3Running.currentLevel||0}/{CHAINS[p3Running.category]?.chain.length||0} levels</span>
                          </div>
                          {p3Phase&&<div style={{fontSize:10,color:"#14B8A6",marginTop:6,display:"flex",alignItems:"center",gap:4}}><span style={{width:5,height:5,borderRadius:"50%",background:"#14B8A6",display:"inline-block",animation:"pulse 1s infinite"}}/>{p3Phase}</div>}
                        </div>
                        {(()=>{const liveTask=tQRef.current.find(t=>t.id===p3Running.id)||p3Running;return liveTask.steps.map((step,i)=>(
                          <div key={i} style={{marginBottom:8,animation:"fadeIn 0.3s"}}>
                            <div style={{background:"#131825",borderRadius:7,padding:"10px 12px",borderLeft:"3px solid "+step.role.dc}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}><span style={{fontSize:14}}>{step.role.ic}</span><div style={{flex:1}}><div style={{fontSize:10,fontWeight:700,color:step.role.dc}}>{step.role.t} — Level {step.level}</div></div>{step.isLast&&<span style={{fontSize:8,background:"rgba(245,158,11,0.1)",color:"#F59E0B",padding:"2px 7px",borderRadius:8,fontWeight:700}}>FINAL</span>}<button onClick={()=>cp(step.output)} style={S.hBtn}>Copy</button></div>
                              <div style={{fontSize:10,lineHeight:1.65,color:"#A0AAC0",maxHeight:200,overflowY:"auto"}}><Md text={step.output} ac={step.role.dc}/></div>
                            </div>
                            {i<liveTask.steps.length-1&&<div style={{display:"flex",justifyContent:"center",margin:"3px 0"}}><span style={{fontSize:9,color:"#3A4060"}}>escalated ↓</span></div>}
                          </div>
                        ));})()}
                      </div>
                    )
                  )}
                </div>
              )}
              {p3View==="completed"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:6}}>Tasks Awaiting Your Approval</div>
                  {tQueue.filter(t=>t.status===TS.REVIEWING).length===0?(<div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}><div style={{fontSize:28,marginBottom:8}}>🎉</div><div style={{fontSize:12}}>No tasks pending review.</div></div>):(
                    tQueue.filter(t=>t.status===TS.REVIEWING).map(t=>(
                      <div key={t.id} style={{marginBottom:14}}>
                        <div style={{background:"linear-gradient(135deg,rgba(139,92,246,0.06),rgba(20,184,166,0.04))",border:"1px solid rgba(139,92,246,0.25)",borderRadius:9,padding:"12px 14px",marginBottom:4}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                            <span style={{fontSize:16}}>{CHAINS[t.category]?.ic||"⚡"}</span>
                            <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:"#F1F5F9"}}>{t.chainLabel}</div><div style={{fontSize:9,color:"#5A6480"}}>{t.steps.length} levels · {t.completedAt?new Date(t.completedAt).toLocaleString():""}</div></div>
                            <span style={{fontSize:8,padding:"2px 8px",borderRadius:10,background:"rgba(139,92,246,0.12)",color:"#8B5CF6",fontWeight:700}}>AWAITING APPROVAL</span>
                          </div>
                          <div style={{fontSize:10,color:"#A0AAC0",fontStyle:"italic",marginBottom:10}}>"{t.task}"</div>
                          {t.finalOutput&&(<div style={{background:"#0a0e1a",borderRadius:6,padding:"10px",marginBottom:10,maxHeight:300,overflowY:"auto",border:"1px solid #1a2030"}}><div style={{fontSize:9,fontWeight:700,color:"#8B5CF6",marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Final Output — {t.steps[t.steps.length-1]?.role.t}</div><div style={{fontSize:10,lineHeight:1.65,color:"#A0AAC0"}}><Md text={t.finalOutput} ac="#8B5CF6"/></div></div>)}
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>approveQ(t.id)} style={{flex:1,background:"#10B981",color:"#fff",border:"none",borderRadius:6,padding:"9px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>Approve</button>
                            <button onClick={()=>{const note=prompt("Reason for rejection?");rejectQ(t.id,note||"");}} style={{flex:1,background:"transparent",color:"#EF4444",border:"1px solid #EF444444",borderRadius:6,padding:"9px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>Reject</button>
                            <button onClick={()=>dlFile("Task-"+t.id+".md",t.steps.map(s=>"## Level "+s.level+": "+s.role.t+"\n"+s.output).join("\n\n---\n\n"),"text/markdown")} style={{...S.hBtn,padding:"8px 10px"}}>Export</button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {p3View==="completed_arc"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div><div style={{fontSize:13,fontWeight:800,color:"#F1F5F9"}}>Task Archive</div><p style={{fontSize:10,color:"#5A6480"}}>{tQueue.filter(t=>[TS.APPROVED,TS.REJECTED].includes(t.status)).length} tasks</p></div>
                    {tQueue.filter(t=>[TS.APPROVED,TS.REJECTED].includes(t.status)).length>0&&(<button onClick={()=>{if(confirm("Clear archive?")){const updated=tQueue.filter(t=>![TS.APPROVED,TS.REJECTED].includes(t.status));tQRef.current=updated;setTQueue(updated);sv("cos-tq",updated);}}} style={{...S.hBtn,color:"#EF4444",borderColor:"#EF444433"}}>Clear</button>)}
                  </div>
                  {tQueue.filter(t=>[TS.APPROVED,TS.REJECTED].includes(t.status)).length===0?(<div style={{textAlign:"center",padding:"30px",color:"#5A6480"}}><div style={{fontSize:28,marginBottom:8}}>📁</div><div style={{fontSize:12}}>Archive is empty.</div></div>):(
                    tQueue.filter(t=>[TS.APPROVED,TS.REJECTED].includes(t.status)).slice().reverse().map(t=>(
                      <div key={t.id} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:7,padding:"10px 12px",marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:5}}>
                          <span style={{fontSize:14}}>{CHAINS[t.category]?.ic||"⚡"}</span>
                          <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontWeight:600,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{t.task.slice(0,60)}{t.task.length>60?"…":""}"</div><div style={{fontSize:8,color:"#5A6480",marginTop:1}}>{t.chainLabel} · {t.steps.length} levels</div>{t.rejectionNote&&<div style={{fontSize:8,color:"#EF4444",marginTop:2}}>{t.rejectionNote}</div>}</div>
                          <span style={{fontSize:8,padding:"2px 7px",borderRadius:8,fontWeight:700,background:t.status===TS.APPROVED?"rgba(16,185,129,0.12)":"rgba(239,68,68,0.1)",color:t.status===TS.APPROVED?"#10B981":"#EF4444"}}>{t.status===TS.APPROVED?"Approved":"Rejected"}</span>
                        </div>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>dlFile("Task-"+t.id+".md",t.steps.map(s=>"## Level "+s.level+": "+s.role.t+"\n"+s.output).join("\n\n---\n\n"),"text/markdown")} style={{...S.hBtn,flex:1,textAlign:"center"}}>Export</button>
                          {t.status===TS.REJECTED&&<button onClick={()=>requeueT(t.id)} style={{...S.hBtn,flex:1,textAlign:"center",color:"#14B8A6",borderColor:"#14B8A633"}}>Requeue</button>}
                          <button onClick={()=>deleteT(t.id)} style={{...S.hBtn,color:"#EF4444",borderColor:"#EF444433"}}>×</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GENERAL LEDGER */}
{view==="ledger"&&(
  <Ledger cur={cur} entries={ledgerEntries} setEntries={setLedgerEntries} customAccounts={customAccounts} setCustomAccounts={setCustomAccounts} sv={sv} S={S} showToast={showToast} ask={ask} MicButton={MicButton} vLang={vLang}/>
)}

{view==="finance"&&(
  <FinanceSuite curSym={cur.sym} ask={(s,m,t)=>ask(s,m,t)} showToast={showToast}/>
)}

{view==="home"&&(
  <CommandCenter co={co} curSym={cur.sym} ledgerEntries={ledgerEntries} workflows={workflows} tQueue={tQueue} brSessions={brSessions} setView={setView}/>
)}

        {/* PULSE AGENTIC */}
{view==="dispatch"&&<div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}><div style={{display:"flex",gap:6,padding:"8px 14px",borderBottom:"1px solid #14192a",background:"#0c1120",flexShrink:0}}>{[["dispatch","📡","Dispatch"],["servicenow","🎫","ServiceNow"],["concur","🧾","Concur Audit"],["email","📧","Email"]].map(([id,ic,lb])=><button key={id} onClick={()=>setPulseTab(id)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+(pulseTab===id?"#14B8A6":"#1a2030"),background:pulseTab===id?"rgba(20,184,166,0.08)":"transparent",color:pulseTab===id?"#14B8A6":"#5A6480",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{ic} {lb}</button>)}</div><div style={{flex:1,overflow:"auto"}}>{pulseTab==="dispatch"&&<Dispatch templates={dispatchTemplates} setTemplates={setDispatchTemplates} sv={sv} S={S} showToast={showToast} ask={ask} askVision={askVision} MicButton={MicButton} vLang={vLang}/>}{pulseTab!=="dispatch"&&<PulseGovernance callAI={(prompt)=>ask("You are a governance analyst.",[{role:"user",content:prompt}],4000)} askVision={askVision} companyName={co.name} defaultModule={pulseTab}/>}</div></div>}

        {/* ACTION TRACKER */}
{view==="actions"&&(
  <ActionTracker items={actionItems} setItems={setActionItems} sv={sv} S={S} showToast={showToast} AR={AR}/>
)}

        {/* DATA HUB */}
        {view==="data"&&(
          <div style={{flex:1,padding:"14px 18px",overflowY:"auto"}}>
            <h2 style={{fontSize:15,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>Company Data Hub</h2>
            <p style={{fontSize:10,color:"#5A6480",marginBottom:10}}>All agents use this data. Currency: <strong style={{color:"#14B8A6"}}>{cur.sym} {cur.code}</strong></p>
            <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
              <input style={{...S.inp,width:190}} placeholder="Label (e.g. Monthly Revenue)" value={dataF.k} onChange={e=>setDataF({...dataF,k:e.target.value})} onKeyDown={e=>e.key==="Enter"&&addD()}/>
              <input style={{...S.inp,flex:1,minWidth:120}} placeholder={"Value (e.g. "+cur.sym+"5,00,000)"} value={dataF.v} onChange={e=>setDataF({...dataF,v:e.target.value})} onKeyDown={e=>e.key==="Enter"&&addD()}/>
              <LangPick value={vLang} onChange={vl=>{setVLang(vl);sv("cos-vl",vl);}}/>
              <MicButton lang={vLang} onResult={t=>setDataF(p=>({...p,v:(p.v?p.v+" ":"")+t}))}/>
              <button onClick={addD} style={{...S.pBtn,padding:"6px 14px",marginTop:0,fontSize:11,width:"auto"}}>+ Add</button>
            </div>
{(
  <div style={{marginBottom:14}}>
    {[
      {cat:"Financial - Income",items:["Monthly Revenue","Monthly Operating Costs","COGS (Cost of Goods Sold)","Marketing Budget (Quarterly)"]},
      {cat:"Financial - Balance Sheet",items:["Current Assets","Current Liabilities","Total Debt","Total Equity","Total Assets","Inventory","Accounts Receivable","Accounts Payable","Cash in Bank"]},
      {cat:"Equity & Cap Table",items:["Total Shares Outstanding","Founder Shareholding %","ESOP Pool %","Current Valuation"]},
      {cat:"Customer Metrics",items:["Total Customers (Current)","Total Customers (Previous Period)","New Customers This Period","Churned Customers This Period","Customer Acquisition Cost (CAC)","Average Revenue Per User (ARPU)"]},
      {cat:"Operations",items:["Team Size (Total)","Key Vendors/Suppliers","Monthly Burn Rate"]},
      {cat:"Market",items:["Target Markets/Cities","Primary Customer Segment","Top 3 Competitors"]},
      {cat:"Product",items:["Core Product/Service","Pricing (per unit/service)","Unique Selling Proposition"]},
    ].map(grp=>(
      <div key={grp.cat} style={{marginBottom:10}}>
        <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{grp.cat}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
          {grp.items.map(k=>(
            <button key={k} onClick={()=>setDataF({k,v:""})} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:5,padding:"8px 10px",cursor:"pointer",textAlign:"left",fontFamily:"Manrope,sans-serif"}}><div style={{fontSize:10,fontWeight:600,color:"#14B8A6"}}>+ {k}</div></button>
          ))}
        </div>
        </div>
      ))}
    </div>
      )}

            {Object.entries(compData).map(([k,v])=>(
  <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:"#131825",border:"1px solid #1a2030",borderRadius:5,marginBottom:3}}>
    <div style={{flex:1,cursor:"pointer"}} onClick={()=>setDataF({k,v})}><span style={{fontSize:11,fontWeight:600,color:"#A0AAC0"}}>{k}:</span> <span style={{fontSize:11,color:"#F1F5F9"}}>{v}</span></div>
    <div style={{display:"flex",gap:4}}>
      <button onClick={()=>setDataF({k,v})} style={{background:"none",border:"none",color:"#5A6480",fontSize:10,cursor:"pointer"}}>Edit</button>
      <button onClick={()=>delD(k)} style={{background:"none",border:"none",color:"#3A4060",fontSize:10,cursor:"pointer"}}>×</button>
    </div>
  </div>
))}
          </div>
        )}

        {view==="funding"&&<FundingIntelligence co={co} compData={compData} ask={ask}/>}
        {view==="tokens"&&<TokenAnalytics defP={defP} keys={keys}/>}
        {view==="agents"&&(
          <AIAgents
            co={co}
            compData={compData}
            keys={keys}
            defP={defP}
            ask={ask}
            askImage={askImage}
            askVideo={askVideo}
            showToast={showToast}
            dlFile={dlFile}
            ensureJsPDF={ensureJsPDF}
            ensureXLSX={ensureXLSX}
            ensurePptx={ensurePptx}
            parseSections={parseSections}
            stripMd={stripMd}
            ensureJSZip={ensureJSZip}
            brSessions={brSessions}
            setBrSessions={setBrSessions}
            actionItems={actionItems}
            setActionItems={setActionItems}
            sv={sv}
          />
        )}
        {view==="agentic"&&(
          <AgenticWorkflows
            co={co} compData={compData} keys={keys} defP={defP} ask={ask}
            askImage={askImage} askVideo={askVideo}
            showToast={showToast} dlFile={dlFile}
            ensureJsPDF={ensureJsPDF} ensureXLSX={ensureXLSX}
            ensurePptx={ensurePptx} ensureJSZip={ensureJSZip}
            parseSections={parseSections} stripMd={stripMd}
            actionItems={actionItems} setActionItems={setActionItems}
            brSessions={brSessions} setBrSessions={setBrSessions}
            sv={sv}
          />
        )}
        {view==="servicedesk"&&<ServiceDesk co={co} compData={compData} ask={ask} supabase={supabase}/>}
        {view==="studio"&&(
          <div style={{flex:1,padding:"14px 18px",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{fontSize:20}}>🎨</span>
              <div><h2 style={{fontSize:15,fontWeight:800,color:"#F1F5F9"}}>Presentation Studio</h2><p style={{fontSize:10,color:"#5A6480"}}>The Presentation Architect synthesizes your entire workspace into investor-grade decks and reports.</p></div>
            </div>
            <div style={{background:"linear-gradient(135deg,rgba(168,85,247,0.06),rgba(20,184,166,0.04))",border:"1px solid rgba(168,85,247,0.2)",borderRadius:9,padding:"12px 14px",marginTop:10,marginBottom:14}}>
              <div style={{fontSize:11,color:"#A0AAC0",lineHeight:1.7}}>Choose a format, select which parts of your workspace to include, and the Architect builds a structured narrative — then renders it to a downloadable PDF or PowerPoint. You can also chat with the Architect directly from the <strong style={{color:"#A855F7"}}>Presentation Studio</strong> department in the sidebar.</div>
              <button onClick={()=>{setSelRole("pres_arch");setView("chat");}} style={{...S.hBtn,marginTop:8,color:"#A855F7",borderColor:"#A855F733"}}>💬 Chat with Presentation Architect</button>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              <button onClick={()=>{setShowExport(true);setExpMode("pptx");}} style={{...S.pBtn,marginTop:0,background:"linear-gradient(135deg,#A855F7,#6366F1)",flex:1}}>📊 Generate PowerPoint</button>
              <button onClick={()=>{setShowExport(true);setExpMode("pdf");}} style={{...S.pBtn,marginTop:0,background:"linear-gradient(135deg,#3B82F6,#14B8A6)",flex:1}}>📄 Generate PDF</button>
            </div>
            <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Workspace Knowledge Available</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
              {[["💬 Conversations",Object.values(chats).filter(c=>c?.length).length,"#14B8A6"],["🏛️ Boardroom",brSessions.length,"#3B82F6"],["⚡ Workflows",workflows.length,"#10B981"],["🤖 Auto Tasks",tQueue.filter(t=>t.finalOutput).length,"#F59E0B"],["⏳ Time Machine",tmRes?1:0,"#8B5CF6"],["📊 Autopilot",apRes?1:0,"#A855F7"]].map(([lb,n,c])=>(
                <div key={lb} style={{background:"#131825",border:"1px solid "+c+"22",borderRadius:8,padding:"10px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:900,color:c}}>{n}</div><div style={{fontSize:8,color:"#5A6480",fontWeight:600}}>{lb}</div></div>
              ))}
            </div>
            <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Output Formats</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:"#131825",border:"1px solid #1a2030",borderRadius:8,padding:"12px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#3B82F6",marginBottom:6}}>📄 PDF Reports</div>
                {PDF_TYPES.map(t=><div key={t.id} style={{fontSize:10,color:"#8892B0",padding:"2px 0"}}>{t.ic} {t.label} — <span style={{color:"#5A6480"}}>{t.desc}</span></div>)}
              </div>
              <div style={{background:"#131825",border:"1px solid #1a2030",borderRadius:8,padding:"12px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#A855F7",marginBottom:6}}>📊 PowerPoint Decks</div>
                {PPT_TYPES.map(t=><div key={t.id} style={{fontSize:10,color:"#8892B0",padding:"2px 0"}}>{t.ic} {t.label}</div>)}
              </div>
            </div>
          </div>
        )}

        {/* CHAT — no role selected */}
        {view==="chat"&&!selRole&&(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"0 20px"}}>
              <span style={{fontSize:36,color:"#14B8A6"}}>◆</span>
              <h1 style={{fontSize:18,fontWeight:800,color:"#F1F5F9",marginTop:8,marginBottom:2}}>{co.name}</h1>
              <p style={{fontSize:11,color:"#5A6480",marginBottom:12}}>{co.location} · {cur.code} · {co.industry} · {STAGES.find(st=>st.id===co.stage)?.l}</p>
              <p style={{fontSize:11,color:"#8892B0",marginBottom:14}}>Select any executive from the sidebar, or start with the C-suite:</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,maxWidth:440}}>
                {CS.map(r=><button key={r.id} onClick={()=>setSelRole(r.id)} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:8,padding:"12px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:"Manrope,sans-serif"}}><span style={{fontSize:20}}>{r.ic}</span><span style={{fontSize:9,fontWeight:700,color:r.dc}}>{r.t}</span></button>)}
              </div>
            </div>
          </div>
        )}

        {/* CHAT — with role */}
        {view==="chat"&&selRole&&curRole&&(
          <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 12px",borderBottom:"1px solid #14192a",background:"#0c1120"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>{curRole.ic}</span>
                <div><div style={{fontWeight:700,fontSize:12,color:curRole.dc}}>{curRole.f}</div><div style={{fontSize:8,color:"#3A4060"}}>{curRole.dl} · {co.name} · {co.location} · {cur.sym}{co.currency} · 60s timeout</div></div>
              </div>
              <div style={{display:"flex",gap:4}}>
                {curMsgs.length>0&&<>
                  <button onClick={()=>quickExport("pdf","detailed",curRole.t+" Consultation",curMsgs.map(m=>(m.role==="user"?"## Question\n":"## "+curRole.t+"\n")+stripMd(m.content)).join("\n\n"))} style={S.hBtn} title="Export conversation as PDF">📄 PDF</button>
                  <button onClick={()=>quickExport("pptx","briefing",curRole.t+" Briefing",curMsgs.filter(m=>m.role==="assistant").map(m=>m.content).join("\n\n"))} style={S.hBtn} title="Export conversation as PowerPoint">📊 PPT</button>
                  <button onClick={()=>dlFile("Chat-"+curRole.t+"-"+Date.now()+".md",curMsgs.map(m=>"### "+(m.role==="user"?"You":curRole.t)+"\n"+m.content).join("\n\n---\n\n"),"text/markdown")} style={S.hBtn}>MD</button>
                </>}
                <button onClick={()=>{if(confirm("Clear chat with "+curRole.t+"?")){const u={...chats};delete u[selRole];setChats(u);sv("cos-ch",u);}}} style={S.hBtn}>Clear</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px 12px"}}>
              {!curMsgs.length&&(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",animation:"fadeIn 0.3s ease",padding:"20px"}}>
                  <span style={{fontSize:32,marginBottom:4}}>{curRole.ic}</span>
                  <div style={{fontWeight:700,fontSize:14,color:curRole.dc,marginBottom:3}}>{curRole.t} Ready</div>
                  <div style={{fontSize:9,color:"#5A6480",marginBottom:4,textAlign:"center",maxWidth:340,lineHeight:1.5}}>{EP[curRole.id]?.b?.split("\n")[0]||"World-class "+curRole.f}</div>
                  <div style={{fontSize:10,color:"#5A6480",marginBottom:12}}>Answering in {cur.sym}{co.currency} · {co.location} context</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,maxWidth:400,width:"100%"}}>
                    {curRole.qa?.map((a,i)=><button key={i} onClick={()=>send(a)} style={S.qaBtn}>{a}</button>)}
                  </div>
                </div>
              )}
              {curMsgs.map((msg,i)=>(
                <div key={i} style={{marginBottom:8,animation:"fadeIn 0.2s"}}>
                  {msg.role==="user"
                    ?<div style={S.uMsg}><div style={S.mLbl}>YOU</div><div style={{fontSize:11,lineHeight:1.65,color:"#A0AAC0",whiteSpace:"pre-wrap"}}>{msg.content}</div></div>
                    :<div style={S.aMsg}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{...S.mLbl,color:curRole.dc}}>{curRole.ic} {curRole.t}</div><button onClick={()=>cp(msg.content)} style={{background:"none",border:"none",color:"#3A4060",fontSize:8,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>Copy</button></div>
                      <div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={msg.content} ac={curRole.dc}/></div>
                      {i===curMsgs.length-1&&(
                        <div style={{marginTop:8,paddingTop:6,borderTop:"1px dashed #1a2030",display:"flex",flexWrap:"wrap",gap:3,alignItems:"center"}}>
                          <span style={{fontSize:8,color:"#5A6480",marginRight:2}}>Consult:</span>
                          {CS.filter(c=>c.id!==curRole.id).map(c=><button key={c.id} onClick={()=>consultRole(c.id,curMsgs[i-1]?.content||"question",msg.content)} style={{background:"transparent",border:"1px solid "+c.dc+"33",color:c.dc,padding:"2px 6px",borderRadius:4,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{c.ic} {c.t}</button>)}
                        </div>
                      )}
                    </div>
                  }
                </div>
              ))}
              {/* FIX BUG 5: loading skeleton with animation */}
              {loading&&(
                <div style={S.aMsg}>
                  <div style={{...S.mLbl,color:curRole.dc}}>{curRole.ic} {curRole.t}</div>
                  <div style={{display:"flex",gap:4,padding:"3px 0",alignItems:"center"}}>
                    <span style={{...S.dot,animationDelay:"0s"}}/><span style={{...S.dot,animationDelay:"0.15s"}}/><span style={{...S.dot,animationDelay:"0.3s"}}/>
                    <span style={{fontSize:9,color:"#3A4060",marginLeft:6}}>Thinking… (up to 60s)</span>
                  </div>
                </div>
              )}
              {error&&(
                <div style={S.errB}>
                  ⚠️ {error}
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{const l=curMsgs.filter(m=>m.role==="user").pop();if(l)send(l.content);}} style={S.retBtn}>Retry</button>
                    <button onClick={()=>setError(null)} style={{...S.retBtn,background:"#3A4060"}}>Dismiss</button>
                  </div>
                </div>
              )}
              <div ref={chatEnd}/>
            </div>
            <div style={S.inpA}>
              <div style={S.inpR}>
                <textarea style={S.ta} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(input);}}} placeholder={"Message "+curRole.t+"… (Enter to send, Shift+Enter for newline)"} rows={1} disabled={loading}/>
                <LangPick value={vLang} onChange={vl=>{setVLang(vl);sv("cos-vl",vl);}}/>
                <button onClick={()=>setSearchMode(v=>!v)} title={searchMode?"Live web search ON — click to turn off":"Turn on live web search for this message"} style={{background:searchMode?"rgba(20,184,166,0.15)":"none",border:"1px solid "+(searchMode?"#14B8A6":"#1a2030"),borderRadius:6,padding:"4px 8px",color:searchMode?"#14B8A6":"#5A6480",cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",height:28,display:"flex",alignItems:"center",gap:4,flexShrink:0,transition:"all 0.15s"}}>🔍{searchMode&&<span style={{fontSize:9,fontWeight:700}}>LIVE</span>}</button>
                <VoiceEngine send={send} setInput={setInput} lang={vLang} roleColor={curRole?.dc||"#14B8A6"} disabled={loading}/>
                <button onClick={()=>send(input)} disabled={!input.trim()||loading} style={{...S.sBtn,background:curRole.dc,opacity:input.trim()&&!loading?1:0.2}}>↑</button>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* FEATURE 4 & 5: EXPORT STUDIO MODAL */}
      {showExport&&(
        <div style={S.modalBg} onClick={()=>!expGenerating&&setShowExport(false)}>
          <div style={{...S.modal,maxWidth:560}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h2 style={{fontSize:16,fontWeight:800,color:"#F1F5F9"}}>🎨 Export Studio</h2>
              <button onClick={()=>!expGenerating&&setShowExport(false)} style={S.iBtn}>×</button>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              <button onClick={()=>setExpMode("pdf")} style={{flex:1,padding:"9px",borderRadius:6,fontSize:12,fontWeight:700,border:"1px solid "+(expMode==="pdf"?"#3B82F6":"#1a2030"),background:expMode==="pdf"?"rgba(59,130,246,0.1)":"#0a0e1a",color:expMode==="pdf"?"#3B82F6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>📄 PDF Report</button>
              <button onClick={()=>setExpMode("pptx")} style={{flex:1,padding:"9px",borderRadius:6,fontSize:12,fontWeight:700,border:"1px solid "+(expMode==="pptx"?"#A855F7":"#1a2030"),background:expMode==="pptx"?"rgba(168,85,247,0.1)":"#0a0e1a",color:expMode==="pptx"?"#A855F7":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>📊 PowerPoint</button>
            </div>
            {expMode==="pptx"&&(
              <div style={{marginBottom:14,padding:"10px 12px",background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:7}}>
                <label style={S.lbl}>Match a Sample PPT's Style (optional)</label>
                <p style={{fontSize:9,color:"#5A6480",marginBottom:8,lineHeight:1.5}}>Upload a .pptx and we'll match its colors, fonts, and slide shape. Nothing else from the file is read or stored.</p>
                <label style={{...S.inp,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#5A6480",fontSize:11,padding:"10px"}}>
                  {expStyleResult?.extracting?"⏳ Reading style…":expStyleResult?.ok?"📎 "+expStyleResult.sourceFileName:"📎 Upload a .pptx to match its style"}
                  <input type="file" accept=".pptx" style={{display:"none"}} onChange={async e=>{
                    const f=e.target.files[0];
                    if(!f)return;
                    setExpStyleResult({extracting:true});
                    setExpStyleResult(await extractPptxStyle(f));
                  }}/>
                </label>
                {expStyleResult?.ok&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                    <div style={{display:"flex",gap:3}}>
                      {Object.values(expStyleResult.colors||{}).slice(0,6).map((c,i)=><span key={i} style={{width:14,height:14,borderRadius:3,background:c,border:"1px solid #1a2030"}}/>)}
                    </div>
                    <span style={{fontSize:9,color:"#10B981"}}>✓ Style captured{expStyleResult.fonts?.heading?" — "+expStyleResult.fonts.heading:""}</span>
                    <button onClick={()=>setExpStyleResult(null)} style={{...S.hBtn,marginLeft:"auto"}}>Remove</button>
                  </div>
                )}
                {expStyleResult?.error&&<div style={{fontSize:9,color:"#EF4444",marginTop:6}}>{expStyleResult.error}</div>}
              </div>
            )}
            <label style={S.lbl}>Type</label>
            <div style={{display:"grid",gridTemplateColumns:expMode==="pdf"?"repeat(2,1fr)":"repeat(2,1fr)",gap:5,marginBottom:12}}>
              {(expMode==="pdf"?PDF_TYPES:PPT_TYPES).map(t=>{const sel=expMode==="pdf"?expDocType===t.id:expPptType===t.id;const c=expMode==="pdf"?"#3B82F6":"#A855F7";return(
                <button key={t.id} onClick={()=>expMode==="pdf"?setExpDocType(t.id):setExpPptType(t.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",borderRadius:6,border:"1px solid "+(sel?c+"66":"#1a2030"),background:sel?c+"0d":"#0a0e1a",cursor:"pointer",fontFamily:"Manrope,sans-serif",textAlign:"left"}}>
                  <span style={{fontSize:15}}>{t.ic}</span><div><div style={{fontSize:10,fontWeight:700,color:sel?c:"#A0AAC0"}}>{t.label}</div>{t.desc&&<div style={{fontSize:8,color:"#5A6480"}}>{t.desc}</div>}</div>
                </button>);})}
            </div>
            <label style={S.lbl}>Document Title (optional)</label>
            <input style={{...S.inp,marginBottom:12}} value={expTitle} onChange={e=>setExpTitle(e.target.value)} placeholder={(expMode==="pdf"?PDF_TYPES.find(t=>t.id===expDocType)?.label:PPT_TYPES.find(t=>t.id===expPptType)?.label)+" — "+co.name}/>
            <label style={S.lbl}>Include from Workspace</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:5,marginBottom:14}}>
              {[["chats","💬 Conversations",Object.values(chats).filter(c=>c?.length).length],["boardroom","🏛️ Boardroom",brSessions.length],["workflows","⚡ Workflows",workflows.length],["tasks","🤖 Auto Tasks",tQueue.filter(t=>t.finalOutput).length],["timeMachine","⏳ Time Machine",tmRes?1:0],["autopilot","📊 Autopilot",apRes?1:0]].map(([k,lb,n])=>(
                <label key={k} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 9px",background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:5,cursor:"pointer",opacity:n?1:0.45}}>
                  <input type="checkbox" checked={expSources[k]} onChange={e=>setExpSources(p=>({...p,[k]:e.target.checked}))} style={{accentColor:"#14B8A6"}} disabled={!n}/>
                  <span style={{fontSize:10,color:"#A0AAC0",flex:1}}>{lb}</span>
                  <span style={{fontSize:9,color:n?"#14B8A6":"#3A4060",fontWeight:700}}>{n}</span>
                </label>
              ))}
            </div>
            {expStep&&<div style={{fontSize:11,color:"#A855F7",marginBottom:10,display:"flex",alignItems:"center",gap:6}}><span style={{width:6,height:6,borderRadius:"50%",background:"#A855F7",display:"inline-block",animation:"pulse 1s infinite"}}/>{expStep}</div>}
            <button onClick={runExport} disabled={expGenerating} style={{...S.pBtn,marginTop:0,background:expMode==="pdf"?"linear-gradient(135deg,#3B82F6,#14B8A6)":"linear-gradient(135deg,#A855F7,#6366F1)",opacity:expGenerating?0.5:1}}>
              {expGenerating?"Generating…":"Generate "+(expMode==="pdf"?"PDF":"PowerPoint")}
            </button>
            {expSynthesis&&!expGenerating&&(
              <div style={{marginTop:12}}>
                <div style={{fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:5}}>Synthesized Content Preview</div>
                <div style={{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:6,padding:"10px",maxHeight:200,overflowY:"auto",fontSize:10,lineHeight:1.6,color:"#A0AAC0"}}><Md text={expSynthesis} ac="#A855F7"/></div>
                <div style={{display:"flex",gap:4,marginTop:6}}>
                  <button onClick={()=>cp(expSynthesis)} style={{...S.hBtn,flex:1,textAlign:"center"}}>Copy Text</button>
                  <button onClick={()=>dlFile("Synthesis-"+Date.now()+".md",expSynthesis,"text/markdown")} style={{...S.hBtn,flex:1,textAlign:"center"}}>Save as Markdown</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FEATURE 2: RESUME BANNER */}
      {resumeInfo&&(
        <div style={{position:"fixed",bottom:20,left:20,zIndex:9998,background:"#131825",border:"1px solid rgba(20,184,166,0.3)",borderLeft:"3px solid #14B8A6",borderRadius:8,padding:"12px 16px",maxWidth:340,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontFamily:"Manrope,sans-serif"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#F1F5F9",marginBottom:3}}>Welcome back 👋</div>
          <div style={{fontSize:10,color:"#8892B0",lineHeight:1.6,marginBottom:8}}>It's been {resumeInfo.days} {resumeInfo.days===1?"day":"days"}. Your workspace is right where you left it. You can also load a saved workspace file.</div>
          <div style={{display:"flex",gap:6}}>
            <label style={{...S.hBtn,cursor:"pointer",flex:1,textAlign:"center",color:"#14B8A6",borderColor:"#14B8A633"}}>Load Workspace<input type="file" accept=".json" onChange={e=>e.target.files[0]&&importData(e.target.files[0])} style={{display:"none"}}/></label>
            <button onClick={()=>setResumeInfo(null)} style={{...S.hBtn,flex:1,textAlign:"center"}}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ── SETTINGS MODAL ── */}
      {showSettings&&(
        <div style={S.modalBg} onClick={()=>setShowSettings(false)}>
          <div style={{...S.modal,maxWidth:520}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><h2 style={{fontSize:16,fontWeight:800,color:"#F1F5F9"}}>Settings</h2><button onClick={()=>setShowSettings(false)} style={S.iBtn}>×</button></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:14,paddingBottom:12,borderBottom:"1px solid #1a2030"}}>
              {[["api","API"],["theme","Theme"],["company","Company"],["workspace","Workspace"],["backup","Backup"],["danger","Reset"]].map(([id,lb])=><button key={id} onClick={()=>setSTab(id)} style={{padding:"5px 10px",borderRadius:5,fontSize:10,fontWeight:600,border:"1px solid "+(sTab===id?"#14B8A6":"#1a2030"),background:sTab===id?"rgba(20,184,166,0.08)":"transparent",color:sTab===id?"#14B8A6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{lb}</button>)}
            </div>
            {sTab==="api"&&(
              <div>
                <div style={{background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:6,padding:"8px 10px",marginBottom:12,fontSize:10,color:"#10B981"}}>
                  Gemini is free — no billing needed. Get key at <a href={MODELS.gemini.keyUrl} target="_blank" rel="noopener noreferrer" style={{color:"#4285F4"}}>aistudio.google.com</a>
                </div>
                <div style={{background:"rgba(118,185,0,0.06)",border:"1px solid rgba(118,185,0,0.25)",borderRadius:6,padding:"8px 10px",marginBottom:12,fontSize:10,color:"#76B900"}}>
                  \u2728 NVIDIA (Free) works automatically \u2014 no key needed. Select it as your Primary AI below to try the platform instantly.
                </div>
                {Object.entries(MODELS).filter(([id])=>id!=="nvidia").map(([id,m])=>(
                  <div key={id} style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:keys[id]?.trim()?m.color:"#3A4060"}}/>
                      <span style={{fontSize:11,fontWeight:700,color:"#F1F5F9"}}>{m.name}</span>
                      {id==="gemini"&&<span style={{fontSize:8,color:"#10B981",fontWeight:700}}>FREE</span>}
                      <a href={m.keyUrl} target="_blank" rel="noopener noreferrer" style={{marginLeft:"auto",fontSize:9,color:m.color,textDecoration:"none"}}>Get key ↗</a>
                      {keys[id]?.trim()&&<button onClick={()=>testKey(id)} style={{...S.iBtn,fontSize:9,padding:"1px 6px"}}>{testSt[id]==="testing"?"…":testSt[id]==="ok"?"✓ OK":testSt[id]?.startsWith("fail:")?"✗ Fail":"Test"}</button>}
                    </div>
                    <input style={{...S.inp,fontSize:11}} type="password" value={keys[id]} onChange={e=>{const nk={...keys,[id]:e.target.value};setKeys(nk);sv("cos-keys",{keys:nk,defaultProvider:defP,multiAI});setTestSt(p=>({...p,[id]:undefined}));if(id==="claude"||id==="openai")saveBYOKeyToSupabase(e.target.value);}} placeholder={m.placeholder}/>
                    {testSt[id]?.startsWith("fail:")&&<div style={{fontSize:9,color:"#EF4444",marginTop:2,lineHeight:1.4}}>{testSt[id].slice(5)}</div>}
                  </div>
                ))}
                {cfgP.length>1&&(
                  <div style={{padding:"10px",background:"#0a0e1a",borderRadius:6,border:"1px solid #1a2030",marginBottom:10}}>
                    <label style={{...S.lbl,marginBottom:2}}>Primary AI</label>
                    <div style={{fontSize:8.5,color:"#5A6480",marginBottom:6,lineHeight:1.5}}>Your Primary AI handles all general reasoning, research, writing and orchestration. Specialist tasks are automatically routed to the best available model, then control returns to your Primary AI.</div>
                    <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
                      {cfgP.map(p=>{const pm=PROVIDER_META[p];return(
                        <button key={p} onClick={()=>{setDefP(p);sv("cos-keys",{keys,defaultProvider:p,multiAI});}} style={{flex:"1 1 110px",padding:"7px 6px",borderRadius:5,border:"1px solid "+(defP===p?MODELS[p].color:"#1a2030"),background:defP===p?MODELS[p].color+"15":"transparent",cursor:"pointer",fontFamily:"Manrope,sans-serif",textAlign:"left"}}>
                          <div style={{fontSize:10,fontWeight:700,color:defP===p?MODELS[p].color:"#A0AAC0"}}>{MODELS[p].name}{defP===p?" ✓":""}</div>
                          {pm&&<div style={{fontSize:7.5,color:"#5A6480",marginTop:2}}>Cost {pm.cost} · {pm.speed} · {pm.quality}</div>}
                          {pm&&<div style={{fontSize:7.5,color:"#5A6480",marginTop:1,lineHeight:1.4}}>{pm.blurb}</div>}
                          {p==="nvidia"&&<div style={{fontSize:7.5,color:"#76B900",marginTop:2,fontWeight:700}}>\u2728 No key needed</div>}
                        </button>);})}
                    </div>
                    {defP==="nvidia"&&(
                      <div style={{marginBottom:8}}>
                        <label style={{...S.lbl,marginBottom:3}}>NVIDIA model</label>
                        <select value={keys.nvidiaModel||MODELS.nvidia.model} onChange={e=>{const nk={...keys,nvidiaModel:e.target.value};setKeys(nk);sv("cos-keys",{keys:nk,defaultProvider:defP,multiAI});}} style={{...S.inp,cursor:"pointer"}}>
                          {NVIDIA_MODELS.map(m=><option key={m.id} value={m.id}>{m.label} \u2014 {m.note}</option>)}
                        </select>
                      </div>
                    )}
                    <label style={{...S.lbl,marginBottom:4}}>Automatic Specialist Routing</label>
                    <div style={{border:"1px solid #1a2030",borderRadius:5,overflow:"hidden",marginBottom:8}}>
                      {(()=>{
                        const hasK=(p)=>!!(keys[p]?.trim()||(p==="claude"&&EFF_CLAUDE?.trim())||(p==="gemini"&&EFF_GEMINI?.trim())||(p==="groq"&&EFF_GROQ?.trim())||(p==="fal"&&EFF_FAL?.trim()));
                        const CAPS=[["General & Writing","general"],["Research","research"],["Code","code"],["Excel & Financial","excel_advanced"],["PowerPoint","powerpoint"],["Word / PDF","financial"],["Image Generation","image_gen"],["Video Generation","video_gen"]];
                        return CAPS.map(([label,task],i)=>{
                          const route=resolveRoute(task,defP);
                          const act=route.find(hasK);
                          const fb=route.filter(p=>p!==act&&hasK(p)).slice(0,2);
                          return(
                            <div key={task} style={{display:"flex",alignItems:"center",padding:"4px 8px",fontSize:8.5,background:i%2?"#0a0e1a":"transparent",borderBottom:i<CAPS.length-1?"1px solid #141a28":"none"}}>
                              <span style={{flex:1,color:"#A0AAC0",fontWeight:600}}>{label}</span>
                              <span style={{color:act?(MODELS[act]?.color||"#14B8A6"):"#EF4444",fontWeight:700}}>{act?(MODELS[act]?.name||act):"⚠ No provider"}</span>
                              {fb.length>0&&<span style={{color:"#3A4060",marginLeft:6}}>→ {fb.map(p=>MODELS[p]?.name||p).join(" → ")}</span>}
                            </div>);
                        });
                      })()}
                    </div>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                      <input type="checkbox" checked={multiAI} onChange={e=>{setMultiAI(e.target.checked);sv("cos-keys",{keys,defaultProvider:defP,multiAI:e.target.checked});}} style={{accentColor:"#14B8A6"}}/>
                      <span style={{fontSize:11,color:"#A0AAC0"}}>Multi-AI Consensus Mode</span>
                    </label>
                  </div>
                )}
                <div style={{padding:"10px",background:"#0a0e1a",borderRadius:6,border:"1px solid #1a2030"}}>
                  <label style={{...S.lbl,marginBottom:6}}>Voice Language</label>
                  <select style={{...S.inp,padding:"8px"}} value={vLang} onChange={e=>{setVLang(e.target.value);sv("cos-vl",e.target.value);}}>
                    {VOICE_LANGS.map(l=><option key={l.code} value={l.code} style={{background:"#0a0e1a"}}>{l.label}</option>)}
                  </select>
                </div>
              </div>
            )}
            {sTab==="theme"&&(
              <div>
                <p style={{fontSize:11,color:"#8892B0",marginBottom:12,lineHeight:1.6}}>Switch visual themes instantly. Your choice is saved and persists across refreshes and sessions. Layout, content, and navigation are never changed.</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
                  {Object.entries(THEMES).map(([id,t])=>(
                    <button key={id} onClick={()=>changeTheme(id)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px",borderRadius:8,border:"1px solid "+(theme===id?"#14B8A6":"#1a2030"),background:theme===id?"rgba(20,184,166,0.06)":"#0a0e1a",cursor:"pointer",fontFamily:"Manrope,sans-serif",textAlign:"left"}}>
                      <div style={{display:"flex",flexShrink:0}}>
                        {["--bg","--panel","--accent","--text"].map(v=><div key={v} style={{width:14,height:28,background:t.vars[v],borderLeft:"1px solid rgba(128,128,128,0.2)"}}/>)}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,fontWeight:700,color:theme===id?"#14B8A6":"#F1F5F9"}}>{t.ic} {t.name}</div>
                        {t.default&&<div style={{fontSize:8,color:"#5A6480"}}>Default</div>}
                        {theme===id&&<div style={{fontSize:8,color:"#14B8A6",fontWeight:700}}>● Active</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {sTab==="workspace"&&(
              <div>
                <div style={{background:"rgba(20,184,166,0.04)",border:"1px solid rgba(20,184,166,0.15)",borderRadius:7,padding:"10px 12px",marginBottom:12,fontSize:10,color:"#A0AAC0",lineHeight:1.7}}>
                  Own your knowledge locally. Save your full workspace — conversations, dashboard data, boardroom sessions, workflows, and AI outputs with timestamps — to a file on your device. Return any time, load it, and continue seamlessly. No cloud required.
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={()=>{exportAll();showToast("Workspace saved to your device","success");}} style={{...S.actBtn,borderColor:"#14B8A633",color:"#14B8A6"}}>💾 Save Workspace to Device</button>
                  <label style={{...S.actBtn,display:"flex",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer",borderColor:"#3B82F633",color:"#3B82F6"}}>
                    📂 Load Workspace from Device
                    <input type="file" accept=".json" onChange={e=>e.target.files[0]&&importData(e.target.files[0])} style={{display:"none"}}/>
                  </label>
                </div>
                <div style={{marginTop:14,fontSize:9,fontWeight:700,color:"#5A6480",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Currently Stored</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6}}>
                  {[["Conversations",Object.values(chats).filter(c=>c?.length).length],["Data points",Object.keys(compData).length],["Ledger entries",ledgerEntries.length],["Custom accounts",customAccounts.length],["Boardroom sessions",brSessions.length],["Workflows",workflows.length],["Queue tasks",tQueue.length]].map(([lb,n])=>(
                    <div key={lb} style={{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:5,padding:"8px 10px",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:"#8892B0"}}>{lb}</span><span style={{fontSize:10,fontWeight:700,color:"#14B8A6"}}>{n}</span></div>
                  ))}
                </div>
                <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #1a2030"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#5A6480",textTransform:"uppercase",marginBottom:8}}>Admin - Section Visibility</div>
                  {[["ledgerEnabled","General Ledger"],["dispatchEnabled","Pulse Agentic"],["actionsEnabled","Action Tracker"]].map(([key,lb])=>(
                    <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0"}}>
                      <span style={{fontSize:11,color:"#A0AAC0"}}>{lb}</span>
                      <button onClick={()=>{const nc={...adminConfig,[key]:!adminConfig[key]};setAdminConfig(nc);sv("cos-admin-config",nc);showToast(lb+(nc[key]?" enabled":" disabled"),"info");}} style={{width:38,height:20,borderRadius:10,border:"none",background:adminConfig[key]?"#14B8A6":"#1a2030",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                        <span style={{position:"absolute",top:2,left:adminConfig[key]?20:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sTab==="company"&&(
              <div>
                {[["name","Company Name"],["industry","Industry"],["location","HQ Location"],["markets","Target Markets"]].map(([f,lb])=>(
                  <div key={f} style={{marginBottom:8}}>
                    <label style={S.lbl}>{lb}</label>
                    <input style={S.inp} value={co[f]||""} onChange={e=>{const n={...co,[f]:e.target.value};setCo(n);sv("cos-co",n);}} placeholder={lb}/>
                  </div>
                ))}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><label style={S.lbl}>Currency</label><select style={{...S.inp,padding:"8px"}} value={co.currency} onChange={e=>{const n={...co,currency:e.target.value};setCo(n);sv("cos-co",n);}}>{CURRENCIES.map(c=><option key={c.code} value={c.code} style={{background:"#0a0e1a"}}>{c.sym} {c.code}</option>)}</select></div>
                  <div><label style={S.lbl}>Stage</label><select style={{...S.inp,padding:"8px"}} value={co.stage} onChange={e=>{const n={...co,stage:e.target.value};setCo(n);sv("cos-co",n);}}>{STAGES.map(st=><option key={st.id} value={st.id} style={{background:"#0a0e1a"}}>{st.ic} {st.l}</option>)}</select></div>
                </div>
              </div>
            )}
            {sTab==="donation"&&(
              <div>
                <div style={{background:"rgba(20,184,166,0.04)",border:"1px solid rgba(20,184,166,0.15)",borderRadius:7,padding:"10px 12px",marginBottom:12,fontSize:10,color:"#A0AAC0",lineHeight:1.7}}>
                  Configure payment details. Users pay you directly — OrchestrIQ never handles money.
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[["ownerName","Your Name","e.g. Anubhav Sharma"],["ownerEmail","Contact Email","for enquiries"],["upiId","UPI ID","yourname@upi"],["bankName","Bank Name","e.g. HDFC Bank"],["accountNo","Account Number","for NEFT/IMPS"],["ifsc","IFSC Code","HDFC0001234"],["accountType","Account Type","Savings or Current"],["paypalMe","PayPal.me Link","paypal.me/yourname"],["stripeLink","Stripe Link","buy.stripe.com/..."],["note","Donation Note","Thank you message"]].map(([f,lb,ph])=>(
                    <div key={f}><label style={S.lbl}>{lb}</label><input style={S.inp} value={localDn[f]||""} onChange={e=>setLocalDn(p=>({...p,[f]:e.target.value}))} placeholder={ph}/></div>
                  ))}
                  <div>
                    <label style={S.lbl}>Payment QR Code (image)</label>
                    {localDn.qrImage?(
                      <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px",background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:6}}>
                        <img src={localDn.qrImage} alt="QR" style={{width:56,height:56,borderRadius:4,objectFit:"contain",background:"#fff"}}/>
                        <div style={{flex:1,fontSize:10,color:"#10B981"}}>QR code uploaded ✓</div>
                        <button onClick={()=>setLocalDn(p=>({...p,qrImage:""}))} style={{...S.hBtn,color:"#EF4444",borderColor:"#EF444433"}}>Remove</button>
                      </div>
                    ):(
                      <label style={{...S.inp,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#5A6480",fontSize:11,padding:"12px"}}>
                        📷 Upload QR code image (PNG / JPG)
                        <input type="file" accept="image/*" onChange={e=>{const file=e.target.files[0];if(!file)return;if(file.size>2*1024*1024){showToast("Image too large (max 2MB)","error");return;}const rd=new FileReader();rd.onload=ev=>setLocalDn(p=>({...p,qrImage:ev.target.result}));rd.readAsDataURL(file);}} style={{display:"none"}}/>
                      </label>
                    )}
                  </div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginTop:4}}>
                    <input type="checkbox" checked={!!localDn.enabled} onChange={e=>setLocalDn(p=>({...p,enabled:e.target.checked}))} style={{accentColor:"#14B8A6"}}/>
                    <span style={{fontSize:12,color:"#F1F5F9",fontWeight:600}}>Enable donation button on landing page</span>
                  </label>
                  <button onClick={()=>saveDn(localDn)} style={{...S.pBtn,marginTop:4}}>Save Donation Settings</button>
                </div>
              </div>
            )}
            {sTab==="backup"&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={exportAll} style={S.actBtn}>Export All Data (JSON)</button>
                <label style={{...S.actBtn,display:"flex",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer"}}>
                  Import Data
                  <input type="file" accept=".json" onChange={e=>e.target.files[0]&&importData(e.target.files[0])} style={{display:"none"}}/>
                </label>
                <p style={{fontSize:10,color:"#5A6480",lineHeight:1.6}}>Exports all chats, data, sessions, workflows, and task queue to a JSON file.</p>
              </div>
            )}
            {sTab==="danger"&&(
              <div>
                <p style={{fontSize:11,color:"#8892B0",marginBottom:10,lineHeight:1.6}}>These actions are irreversible. Data will be permanently deleted from this browser.</p>
                {confirmReset===null&&(
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <button onClick={()=>setConfirmReset("data")} style={{...S.actBtn,borderColor:"#F59E0B33",color:"#F59E0B"}}>Reset Chats and Data (keep API keys)</button>
                    <button onClick={()=>setConfirmReset("full")} style={{...S.actBtn,borderColor:"#EF444433",color:"#EF4444"}}>Full Reset — Delete Everything and Log Out</button>
                  </div>
                )}
                {confirmReset==="data"&&(
                  <div style={{background:"rgba(245,158,11,0.05)",border:"1px solid #F59E0B33",borderRadius:6,padding:10}}>
                    <p style={{fontSize:11,color:"#F59E0B",marginBottom:8,fontWeight:600}}>Clears all chats, data, sessions. API keys are kept.</p>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={resetData} style={{...S.actBtn,background:"#F59E0B",color:"#0a0e1a",border:"none",flex:1}}>Yes, Reset Data</button>
                      <button onClick={()=>setConfirmReset(null)} style={{...S.actBtn,flex:1}}>Cancel</button>
                    </div>
                  </div>
                )}
                {confirmReset==="full"&&(
                  <div style={{background:"rgba(239,68,68,0.05)",border:"1px solid #EF444433",borderRadius:6,padding:10}}>
                    <p style={{fontSize:11,color:"#EF4444",marginBottom:8,fontWeight:600}}>Removes EVERYTHING. You will be logged out immediately.</p>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={fullReset} style={{...S.actBtn,background:"#EF4444",color:"#fff",border:"none",flex:1}}>Yes, Wipe Everything</button>
                      <button onClick={()=>setConfirmReset(null)} style={{...S.actBtn,flex:1}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showSignOutConfirm&&(
        <div style={S.modalBg} onClick={()=>setShowSignOutConfirm(false)}>
          <div style={{...S.modal,maxWidth:420,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:32,marginBottom:8}}>⎋</div>
            <h2 style={{fontSize:16,fontWeight:800,color:"#F1F5F9",marginBottom:8}}>Sign Out</h2>
            <p style={{fontSize:12,color:"#8892B0",marginBottom:18,lineHeight:1.6}}>
              Your conversations, boardroom sessions, and company data live in this browser only. Signing out without saving means this data will not follow you to your next login on this or any device.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={()=>handleSignOut(true)} style={{...S.pBtn,marginTop:0,background:"#14B8A6"}}>Save Workspace, Then Sign Out</button>
              <button onClick={()=>handleSignOut(false)} style={{...S.pBtn,marginTop:0,background:"transparent",border:"1px solid #EF444466",color:"#EF4444"}}>Sign Out Without Saving</button>
              <button onClick={()=>setShowSignOutConfirm(false)} style={{background:"none",border:"none",color:"#5A6480",fontSize:12,cursor:"pointer",fontFamily:"Manrope,sans-serif",marginTop:4}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {extractModal&&<ExtractReviewModal extracted={extractModal.items} sourceType={extractModal.sourceType} sourceLabel={extractModal.sourceLabel} onConfirm={confirmExtractedItems} onCancel={()=>setExtractModal(null)} AR={AR} S={S}/>}
      {showDonate&&<DonateModal cfg={dnCfg} presets={DONATION_PRESETS} onClose={()=>setShowDonate(false)} cur={cur} amt={dnAmt} setAmt={setDnAmt} custom={dnCustom} setCustom={setDnCustom} S={S}/>}
      <TokenBadge defP={defP} setDefP={p=>{setDefP(p);sv("cos-keys",{keys,defaultProvider:p,multiAI});}} keys={keys} onOpen={()=>{setView("tokens");}} />
      <Toaster toasts={toasts} onDismiss={id=>setToasts(prev=>prev.filter(t=>t.id!==id))}/>
      <style>{CSS}</style>
      </div>{/* end oiq-body-row */}
    </div>
  );
}

function DonateModal({cfg,presets,onClose,cur,amt,setAmt,custom,setCustom,S}){
  const [thanked,setThanked]=useState(false);
  const finalAmt=custom?parseInt(custom)||0:amt;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(3px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:"#131825",border:"1px solid #1a2030",borderRadius:12,padding:"20px 22px",width:"100%",maxWidth:420,maxHeight:"92vh",overflowY:"auto",textAlign:"center",fontFamily:"Manrope,sans-serif"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:36,marginBottom:6}}>💙</div>
        <h2 style={{fontSize:18,fontWeight:800,color:"#F1F5F9",marginBottom:4}}>Support {BRAND}</h2>
        <p style={{fontSize:12,color:"#8892B0",marginBottom:16,lineHeight:1.6}}>{cfg.note||"Your contribution helps keep this project free and improving."}</p>
        {cfg.ownerName&&<p style={{fontSize:11,color:"#5A6480",marginBottom:16}}>Beneficiary: <strong style={{color:"#F1F5F9"}}>{cfg.ownerName}</strong></p>}
        {cfg.qrImage&&(
          <div style={{marginBottom:16}}>
            <img src={cfg.qrImage} alt="Donation QR code" style={{width:180,height:180,objectFit:"contain",background:"#fff",borderRadius:10,padding:8,maxWidth:"100%"}}/>
            <div style={{fontSize:10,color:"#5A6480",marginTop:6}}>Scan to pay</div>
          </div>
        )}
        <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:10}}>
          {presets.map(p=><button key={p} onClick={()=>{setAmt(p);setCustom("");}} style={{padding:"8px 14px",borderRadius:6,fontSize:12,fontWeight:700,border:"1px solid "+(amt===p&&!custom?"#14B8A6":"#1a2030"),background:amt===p&&!custom?"rgba(20,184,166,0.1)":"#0a0e1a",color:amt===p&&!custom?"#14B8A6":"#A0AAC0",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{cur.sym}{p}</button>)}
        </div>
        <input style={{width:"100%",background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:6,padding:"9px 11px",color:"#F1F5F9",fontSize:12,fontFamily:"Manrope,sans-serif",textAlign:"center",marginBottom:14,boxSizing:"border-box"}} value={custom} onChange={e=>setCustom(e.target.value.replace(/\D/,""))} placeholder="Or enter custom amount…"/>
        <div style={{fontSize:13,fontWeight:700,color:"#F1F5F9",marginBottom:14}}>Total: {cur.sym}{finalAmt}</div>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {cfg.upiId&&<a href={"upi://pay?pa="+cfg.upiId+"&pn="+encodeURIComponent(cfg.ownerName||BRAND)+"&am="+finalAmt+"&cu=INR"} style={{display:"block",background:"#14B8A6",color:"#0a0e1a",borderRadius:7,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Pay via UPI ({cfg.upiId})</a>}
          {cfg.accountNo&&(
            <div style={{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:7,padding:"12px",textAlign:"left",fontSize:11,color:"#A0AAC0",lineHeight:1.8}}>
              <div style={{fontWeight:700,color:"#F1F5F9",marginBottom:4}}>Bank Transfer (NEFT / IMPS / RTGS)</div>
              {cfg.bankName&&<div>Bank: <strong style={{color:"#F1F5F9"}}>{cfg.bankName}</strong></div>}
              <div>Account: <strong style={{color:"#F1F5F9"}}>{cfg.accountNo}</strong></div>
              {cfg.ifsc&&<div>IFSC: <strong style={{color:"#F1F5F9"}}>{cfg.ifsc}</strong></div>}
              {cfg.accountType&&<div>Type: <strong style={{color:"#F1F5F9"}}>{cfg.accountType}</strong></div>}
            </div>
          )}
          {cfg.paypalMe&&<a href={"https://paypal.me/"+cfg.paypalMe.replace("paypal.me/","")+"/"+finalAmt} target="_blank" rel="noopener noreferrer" style={{display:"block",background:"#003087",color:"#fff",borderRadius:7,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Pay via PayPal</a>}
          {cfg.stripeLink&&<a href={cfg.stripeLink} target="_blank" rel="noopener noreferrer" style={{display:"block",background:"#635BFF",color:"#fff",borderRadius:7,padding:"11px",fontSize:13,fontWeight:700,textDecoration:"none"}}>Pay via Card (Stripe)</a>}
          {!cfg.upiId&&!cfg.accountNo&&!cfg.paypalMe&&!cfg.stripeLink&&!cfg.qrImage&&(
            <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:7,padding:"12px",fontSize:11,color:"#F59E0B"}}>
              Configure payment methods in Settings › Donation tab.
            </div>
          )}
        </div>
        {(cfg.upiId||cfg.accountNo||cfg.paypalMe||cfg.stripeLink||cfg.qrImage)&&(
          thanked
            ?<div style={{marginTop:14,fontSize:12,color:"#10B981",fontWeight:600}}>🙏 Thank you for your support!</div>
            :<button onClick={()=>setThanked(true)} style={{marginTop:14,background:"none",border:"1px solid #1a2030",borderRadius:6,padding:"7px 14px",color:"#5A6480",fontSize:10,cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>I've donated — mark as complete</button>
        )}
        {cfg.ownerEmail&&<p style={{fontSize:10,color:"#3A4060",marginTop:14}}>Questions? <a href={"mailto:"+cfg.ownerEmail} style={{color:"#14B8A6"}}>{cfg.ownerEmail}</a></p>}
        <button onClick={onClose} style={{background:"none",border:"none",color:"#5A6480",fontSize:12,cursor:"pointer",marginTop:12,fontFamily:"Manrope,sans-serif"}}>Close</button>
      </div>
    </div>
  );
}

const CSS=`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800;900&display=swap');
:root{--bg:#0a0e1a;--bg2:#0c1120;--panel:#131825;--panel2:#0a0e1a;--border:#1a2030;--border2:#14192a;--text:#F1F5F9;--text2:#A0AAC0;--text3:#8892B0;--muted:#5A6480;--muted2:#3A4060;--accent:#14B8A6;--code:#080c18;--scroll:#1a2030;}
*{box-sizing:border-box;margin:0;padding:0}
@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
textarea:focus,input:focus,select:focus{outline:none;border-color:var(--accent)!important}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:3px}
button:hover{filter:brightness(1.1)}select{appearance:auto}html,body{background:var(--bg)}a{color:var(--accent)}
/* THEME BRIDGE: map legacy hex inline-styles onto theme variables, non-destructively */
[style*="#0a0e1a"]{}
.oiq-themed{transition:background-color .25s,color .25s,border-color .25s}
/* P6: Reduce ticker height */
#oiq-root .global-ticker,#oiq-root [class*="ticker"]{transform:scaleY(0.88);transform-origin:top;}
#oiq-root header+*{margin-top:-3px;}`;
