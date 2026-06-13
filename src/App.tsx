import { getExecutivesCached } from "./lib/executives";
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

import { useState, useEffect, useRef, useCallback } from "react";
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
const USE_SYS_KEY = import.meta.env.VITE_USE_SYSTEM_KEY === "true";
const EFF_GEMINI = USE_SYS_KEY && SYS_GEMINI ? SYS_GEMINI : "";
const EFF_GROQ = USE_SYS_KEY && SYS_GROQ ? SYS_GROQ : "";
console.log("[OIQ-DIAG] USE_SYS_KEY:",USE_SYS_KEY,"| SYS_GEMINI present:",!!SYS_GEMINI,"| SYS_GROQ present:",!!SYS_GROQ,"| EFF_GEMINI:",!!EFF_GEMINI,"| EFF_GROQ:",!!EFF_GROQ);
const BRAND = "OrchestrIQ";
const TAGLINE = "The orchestration layer of intelligent business.";

const STAGES = [{id:"idea",l:"Idea",ic:"💡"},{id:"formation",l:"Formation",ic:"📋"},{id:"mvp",l:"MVP",ic:"🚀"},{id:"funding",l:"Funding",ic:"💰"},{id:"growth",l:"Growth",ic:"📈"},{id:"mature",l:"Mature",ic:"🏛️"}];
const CURRENCIES = [{code:"INR",sym:"₹",name:"Indian Rupee"},{code:"USD",sym:"$",name:"US Dollar"},{code:"EUR",sym:"€",name:"Euro"},{code:"GBP",sym:"£",name:"British Pound"},{code:"AUD",sym:"A$",name:"Australian Dollar"},{code:"CAD",sym:"C$",name:"Canadian Dollar"},{code:"SGD",sym:"S$",name:"Singapore Dollar"},{code:"AED",sym:"AED",name:"UAE Dirham"},{code:"CHF",sym:"Fr",name:"Swiss Franc"}];
const MODELS = {
  claude:{name:"Claude",company:"Anthropic",model:"claude-sonnet-4-5",placeholder:"sk-ant-...",color:"#D97757",keyUrl:"https://console.anthropic.com/settings/keys"},
  openai:{name:"ChatGPT",company:"OpenAI",model:"gpt-4o",placeholder:"sk-...",color:"#10A37F",keyUrl:"https://platform.openai.com/api-keys"},
  gemini:{name:"Gemini",company:"Google",model:"gemini-1.5-flash",placeholder:"AIza...",color:"#4285F4",keyUrl:"https://aistudio.google.com/app/apikey"},
  groq:{name:"Groq",company:"Groq",model:"llama-3.3-70b-versatile",placeholder:"gsk_...",color:"#F97316",keyUrl:"https://console.groq.com/keys"},
};
// ─── DONATION QR ────────────────────────────────────────────────────────────
// Paste your QR code as a base64 data URI between the quotes below to hard-code it,
// e.g. "data:image/png;base64,iVBORw0KGgo...". Until then, upload it once via
// Settings › Donation (it saves to your device and persists across sessions).
const DEFAULT_QR = "";

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
  "CLO_001": "clo",
  "CPOO_001": "coo2",
  "CRDO_001": "strat_mgr",
  "CSO_001": "cso",
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

async function callGroq(key,sys,msgs,maxT){
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key.trim()},body:JSON.stringify({model:MODELS.groq.model,max_tokens:maxT,messages:[{role:"system",content:sys},...msgs]})});
  if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}if(r.status===401)throw new Error("Groq: Invalid API key.");if(r.status===429)throw new Error("Groq: Rate limit hit. Wait a moment.");throw new Error("Groq "+r.status+": "+(m||r.statusText));}
  const d=await r.json();return d.choices?.[0]?.message?.content||"";
}
  async function callClaude(key,sys,msgs,maxT){   const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:MODELS.claude.model,max_tokens:maxT,system:sys,messages:msgs})});
  if(!r.ok){const t=await r.text().catch(()=>"");let m="";try{m=JSON.parse(t).error?.message;}catch{m=t.slice(0,200);}throw new Error("Claude "+r.status+": "+(m||r.statusText));}
  const d=await r.json();return d.content?.map(b=>b.text||"").join("\n")||"";
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
async function callAI(provider,key,sys,rawMsgs,maxT=3500){
  if(!key?.trim())throw new Error("No API key for "+(MODELS[provider]?.name||provider)+". Add it in Settings.");
  const msgs=rawMsgs.map(m=>({role:m.role==="user"?"user":"assistant",content:m.content}));
  let timerId;
  const timeout=new Promise((_,rej)=>{
    timerId=setTimeout(()=>rej(new Error("Request timed out after 60s. The AI provider may be busy — try switching to Gemini (free tier).")),60000);
  });
  const callP=provider==="claude"?callClaude(key,sys,msgs,maxT):provider==="openai"?callOpenAI(key,sys,msgs,maxT):provider==="gemini"?callGemini(key,sys,msgs,maxT):provider==="groq"?callGroq(key,sys,msgs,maxT):Promise.reject(new Error("Unknown provider: "+provider));
  try{return await Promise.race([callP,timeout]);}
  finally{clearTimeout(timerId);}
}

async function callMulti(keys,defP,sys,msgs,maxT=3500){
  const effectiveKeys={...keys};
  if(EFF_GEMINI?.trim())effectiveKeys.gemini=EFF_GEMINI;
  if(EFF_GROQ?.trim())effectiveKeys.groq=EFF_GROQ;

  const active=getActiveProvider(defP,effectiveKeys,EFF_GROQ,EFF_GEMINI);
  const key=effectiveKeys[active]?.trim();

  if(!key){
    const fallback=active==="groq"?"gemini":"groq";
    const fallbackKey=effectiveKeys[fallback]?.trim();
    if(!fallbackKey)throw new Error("No API keys available. Check Cloudflare environment variables.");
    const text=await callAI(fallback,fallbackKey,sys,msgs,maxT);
    return{primary:text};
  }

  try{
    const text=await callAI(active,key,sys,msgs,maxT);
    return{primary:text};
  }catch(err:any){
    if(isRateLimit(err.message)){
      markProviderExhausted(active);
      const fallback=active==="groq"?"gemini":"groq";
      const fallbackKey=effectiveKeys[fallback]?.trim();
      if(fallbackKey){
        try{
          const text=await callAI(fallback,fallbackKey,sys,msgs,maxT);
          return{primary:text};
        }catch(err2:any){
          if(isRateLimit(err2.message))markProviderExhausted(fallback);
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
function buildSys(role,co,compData){
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
    "Format: 1. Quick Read 2. Analysis with " + co.location + " context in " + cur.sym +
    " 3. 0-90 Day Actions 4. 3-12 Month Strategy 5. 1-3 Year Vision 6. Top 3 Risks 7. Single Most Important Next Step."
  );
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
async function ensurePptx(){
  if(window.PptxGenJS)return window.PptxGenJS;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js");
  if(!window.PptxGenJS)throw new Error("PptxGenJS unavailable");
  return window.PptxGenJS;
}

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

// Gather all workspace knowledge into a single corpus
// ─── PHASE 2: CAPABILITY & COST BRIEF ───────────────────────────────────────
async function fetchExchangeRate(toCode){
  if(toCode==="USD")return 1;
  try{
    const r=await fetch("https://api.frankfurter.app/latest?from=USD&to="+toCode);
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
  doc.text("Generated "+new Date().toLocaleString()+"  ·  Currency: "+cur.code,M,y);y+=20;
  doc.setDrawColor(...A);doc.setLineWidth(1.5);doc.line(M,y,W-M,y);y+=20;
  // Body
  const secs=parseSections(bodyText);
  secs.forEach(sec=>{
    addPageIfNeeded(40);
    doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(...A);
    const st=doc.splitTextToSize(sec.title,W-2*M);
    st.forEach(line=>{addPageIfNeeded(18);doc.text(line,M,y);y+=18;});
    y+=2;
    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(45,45,45);
    sec.lines.forEach(raw=>{
      const isBullet=/^[-*]\s/.test(raw)||/^•/.test(raw);
      const isTable=raw.includes("|")&&raw.trim().startsWith("|");
      let text=stripMd(raw);
      if(isTable){text=raw.split("|").filter(c=>c.trim()&&!c.trim().match(/^[-:]+$/)).map(c=>c.trim()).join("   |   ");if(!text)return;}
      const indent=isBullet?M+14:M;
      const lines=doc.splitTextToSize(text,W-indent-M);
      lines.forEach(line=>{addPageIfNeeded(14);doc.text(line,indent,y);y+=13;});
      y+=2;
    });
    y+=8;
  });
  // Footer page numbers
  const pages=doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text((co.name||"")+"  ·  Confidential  ·  Page "+i+" of "+pages,M,H-20);}
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
    if(tableRows.length>=2){
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

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function App(){
  const [page,setPage]=useState("landing");
  const [keys,setKeys]=useState({claude:"",openai:"",gemini:"",groq:""});
  const [defP,setDefP]=useState("groq");
  const [multiAI,setMultiAI]=useState(false);
  const [co,setCo]=useState({name:"",industry:"",stage:"idea",location:"",markets:"",currency:"INR"});
  const [selRole,setSelRole]=useState(null);
  const [chats,setChats]=useState({});
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [expD,setExpD]=useState({});
  const [compData,setCompData]=useState({});
  const [dataF,setDataF]=useState({k:"",v:""});
  const [view,setView]=useState("nerve");
  const [nTab,setNTab]=useState("boardroom");
  const [brQ,setBrQ]=useState("");
  const [brAg,setBrAg]=useState(["ceo","cfo","cto","cmo"]);
  const [brSessions,setBrSessions]=useState([]);
  const [brCur,setBrCur]=useState({q:"",debate:[],synthesis:"",drilldown:{}});
  const [brRun,setBrRun]=useState(false);
  const [brPh,setBrPh]=useState("");
  const [drillRole,setDrillRole]=useState(null);
  const [drillQ,setDrillQ]=useState("");
  const [drillRun,setDrillRun]=useState(false);
  const [tmDec,setTmDec]=useState("");
  const [tmRes,setTmRes]=useState("");
  const [tmRun,setTmRun]=useState(false);
  const [apRes,setApRes]=useState("");
  const [apRun,setApRun]=useState(false);
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
  const [wfView,setWfView]=useState("new");
  const [wfTask,setWfTask]=useState("");
  const [wfCat,setWfCat]=useState("finance");
  const [wfActive,setWfActive]=useState(null);
  const [wfRunning,setWfRunning]=useState(false);
  const [wfPhase,setWfPhase]=useState("");
  const [workflows,setWorkflows]=useState([]);
  const [tQueue,setTQueue]=useState([]);
  const [qRunning,setQRunning]=useState(false);
  const [p3View,setP3View]=useState("dashboard");
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
  const cur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
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
    try{const th=localStorage.getItem("cos-theme");const tid=th&&THEMES[th]?th:"dark";setTheme(tid);applyTheme(tid);}catch{applyTheme("dark");}
    try{const c=localStorage.getItem("cos-co");if(c)setCo(p=>({...p,...JSON.parse(c)}));}catch{}
    try{const k=localStorage.getItem("cos-keys");if(k){
      const p=JSON.parse(k);
      const loadedKeys=p.keys||{claude:"",openai:"",gemini:"",groq:""};
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
    try{const vl=localStorage.getItem("cos-vl");if(vl)setVLang(vl);}catch{}
    try{const h=localStorage.getItem("cos-ch");if(h)setChats(JSON.parse(h));}catch{}
    try{const d=localStorage.getItem("cos-dp");if(d)setExpD(JSON.parse(d));}catch{}
    try{const cd=localStorage.getItem("cos-cd");if(cd)setCompData(JSON.parse(cd));}catch{}
    try{const br=localStorage.getItem("cos-br");if(br)setBrSessions(JSON.parse(br));}catch{}
    try{const dn=localStorage.getItem("cos-dn");if(dn){const parsed=JSON.parse(dn);setDnCfg(parsed);setLocalDn(parsed);}}catch{}
    try{const wf=localStorage.getItem("cos-wf");if(wf)setWorkflows(JSON.parse(wf));}catch{}
    try{const tq=localStorage.getItem("cos-tq");if(tq){const p=JSON.parse(tq);setTQueue(p);tQRef.current=p;}}catch{}
    try{const last=localStorage.getItem("cos-lastvisit");if(last){const days=Math.floor((Date.now()-parseInt(last))/86400000);if(days>=1)setResumeInfo({days});}localStorage.setItem("cos-lastvisit",String(Date.now()));}catch{}
    const saved=loadResumeState();
    if(saved)setWfResumeData(saved);
    enrichEPFromSupabase();
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

  const changeTheme=useCallback((id)=>{
    setTheme(id);applyTheme(id);sv("cos-theme",id);
  },[]);

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:"smooth"});},[chats,selRole,loading]);
  useEffect(()=>{brEnd.current?.scrollIntoView({behavior:"smooth"});},[brCur,brPh]);

  const sv=async(k,v)=>{try{localStorage.setItem(k,typeof v==="string"?v:JSON.stringify(v));}catch{}};
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

  const ask=async(sys,msgs,maxT)=>(await callMulti(keys,defP,sys,msgs,maxT)).primary;

  const send=useCallback(async(text)=>{
    if(!text.trim()||loading||!selRole)return;
    setError(null);
    const role=AR.find(r=>r.id===selRole);if(!role)return;
    const msgs=chats[selRole]||[];
    const nm={role:"user",content:text};
    const upd={...chats,[selRole]:[...msgs,nm]};
    setChats(upd);setInput("");setLoading(true);
    try{
      const sys=buildSys(role,co,compData);
      const apiM=[...msgs,nm].map(m=>({role:m.role==="user"?"user":"assistant",content:m.content})).slice(-16);
      const reply=await ask(sys,apiM);
      const fin={...upd,[selRole]:[...upd[selRole],{role:"assistant",content:reply}]};
      setChats(fin);sv("cos-ch",fin);
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
    setTmRun(true);setTmRes("");setError(null);
    const tmCur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
    try{
      if(cancelRef.current.tm)return;
      const sys="You are a Business Simulation Engine for \""+co.name+"\". "+buildCtx(co,compData)+"\nSimulate TWO parallel 12-month timelines. ALL figures in "+tmCur.sym+tmCur.code+".\nSections: Decision, Baseline Assumptions, TIMELINE A PROCEED (table: Month/Revenue/OpEx/Cash/Key Event), TIMELINE B DO NOT PROCEED (same table), Divergence Summary, Best/Worst/Black Swan scenarios, Verdict table (Expected Value A&B, Cost of Waiting per week, Reversibility, Recommendation with confidence %), First 30 Days Action Plan.";
      const res=await ask(sys,[{role:"user",content:"Simulate: \""+tmDec+"\""}],4000);
      if(!cancelRef.current.tm)setTmRes(res);
    }catch(err){
      if(!cancelRef.current.tm){setError(err.message);showToast("Time Machine: "+err.message,"error");}
    }finally{
      setTmRun(false);cancelRef.current.tm=false;
    }
  },[tmDec,tmRun,co,compData,keys,defP,showToast]);

  // FIX BUG 3: Autopilot — cancel support + robust error handling
  const runAP=useCallback(async()=>{
    if(apRun)return;
    cancelRef.current.ap=false;
    setApRun(true);setApRes("");setError(null);
    const apCur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
    try{
      if(cancelRef.current.ap)return;
      const sys="You are the Decision Intelligence Engine for \""+co.name+"\". "+buildCtx(co,compData)+"\nIdentify 6 CRITICAL decisions the founder should make RIGHT NOW. ALL figures in "+apCur.sym+apCur.code+".\nFor each: Title, Urgency, Owner, Decide By, Cost of delay/week (with calculation), Options 1/2/3 with outcomes, Recommendation, "+co.location+" Context, Data Needed. End with: THE ONE DECISION THAT MATTERS MOST THIS WEEK.";
      const res=await ask(sys,[{role:"user",content:"Run complete decision scan."}],4000);
      if(!cancelRef.current.ap)setApRes(res);
    }catch(err){
      if(!cancelRef.current.ap){setError(err.message);showToast("Autopilot: "+err.message,"error");}
    }finally{
      setApRun(false);cancelRef.current.ap=false;
    }
  },[apRun,co,compData,keys,defP,showToast]);

  // Boardroom with cancel support
  const runBR=useCallback(async()=>{
    if(!brQ.trim()||brRun)return;
    cancelRef.current.br=false;
    setBrRun(true);setError(null);
    setBrCur({q:brQ,debate:[],synthesis:"",drilldown:{}});
    const agents=brAg.map(id=>AR.find(r=>r.id===id)).filter(Boolean);
    const res=[];
    const synCur=CURRENCIES.find(c=>c.code===co.currency)||CURRENCIES[0];
    try{
      for(let i=0;i<agents.length;i++){
        if(cancelRef.current.br){showToast("Boardroom cancelled","warning");break;}
        const ag=agents[i];const p=EP[ag.id]||{};
        const prev=res.map(r=>"\n--- "+r.ag.t+" ---\n"+r.text).join("\n");
        setBrPh(ag.ic+" "+ag.t+" is analyzing…");
        const sys="You are "+ag.f+" at \""+co.name+"\".\nPROFILE: "+(p.b?.split("\n")[0]||"")+"\n"+buildCtx(co,compData)+"\nLIVE BOARDROOM DEBATE. "+(i===0?"Speak first. State position with calculations in "+synCur.sym+".":"Previous:\n"+prev+"\n\nChallenge one point, build on one, add unique "+ag.dl+" insight in "+synCur.sym+".")+"\n250-400 words.";
        const reply=await ask(sys,[{role:"user",content:brQ}]);
        if(cancelRef.current.br)break;
        res.push({ag,text:reply});
        setBrCur(prev=>({...prev,debate:[...res]}));
      }
      if(!cancelRef.current.br&&res.length>0){
        setBrPh("Synthesizing consensus…");
        const allPos=res.map(r=>r.ag.t+":\n"+r.text).join("\n\n---\n\n");
        const synSys="You are Chief of Staff at \""+co.name+"\". "+buildCtx(co,compData)+"\nSynthesize boardroom debate into CEO-ready briefing. Sections: Consensus Points, Points of Conflict, Quantified Recommendation in "+synCur.sym+", 30-60-90 Day Plan (table), 12-Month Strategic Bets, Risk Register (table), This Week's Decision with cost of delay/week. Be specific and numeric.";
        const syn=await ask(synSys,[{role:"user",content:"Question: \""+brQ+"\"\nDebate:\n"+allPos}],3500);
        const finalSession={id:Date.now(),q:brQ,agents:brAg,debate:res,synthesis:syn,ts:new Date().toISOString()};
        setBrCur({q:brQ,debate:res,synthesis:syn,drilldown:{}});
        const ns=[finalSession,...brSessions].slice(0,20);setBrSessions(ns);sv("cos-br",ns);
      }
    }catch(err){
      if(!cancelRef.current.br){setError(err.message);showToast("Boardroom error: "+err.message,"error");}
    }finally{setBrRun(false);setBrPh("");cancelRef.current.br=false;}
  },[brQ,brAg,brRun,co,compData,brSessions,keys,defP,showToast]);

  const runDrill=useCallback(async()=>{
    if(!drillRole||!drillQ.trim()||drillRun)return;
    setDrillRun(true);setError(null);
    const ag=AR.find(r=>r.id===drillRole);
    const prevTake=brCur.debate.find(d=>d.ag.id===drillRole)?.text||"";
    try{
      const sys=buildSys(ag,co,compData)+"\n\nYour boardroom take:\n"+prevTake+"\n\nCEO is drilling deeper.";
      const reply=await ask(sys,[{role:"user",content:drillQ}]);
      setBrCur(prev=>({...prev,drilldown:{...prev.drilldown,[drillRole]:[...(prev.drilldown[drillRole]||[]),{q:drillQ,a:reply}]}}));
      setDrillQ("");
    }catch(err){setError(err.message);showToast(err.message,"error");}finally{setDrillRun(false);}
  },[drillRole,drillQ,drillRun,brCur,co,compData,keys,defP,showToast]);

  // FIX BUG 4: Workflow — per-level error handling + cancel + progress
const runWorkflow=useCallback(async()=>{
  const taskText=wfTask.trim();
  const taskCat=wfCat;
  if(!taskText||wfRunning)return;
  const ch=CHAINS[taskCat];if(!ch)return;
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

  for(let i=0;i<ch.chain.length;i++){
    if(cancelRef.current.wf){
      showToast("Workflow cancelled at Level "+(i+1),"warning");
      setWfActive(prev=>prev?{...prev,status:"cancelled"}:null);
      setWfRunning(false);setWfPhase("");
      return;
    }

    const roleId=ch.chain[i];
    const role=AR.find(r=>r.id===roleId);
    if(!role)continue;
    const p=EP[roleId]||{};
    const isFirst=i===0;
    const isLast=i===ch.chain.length-1;
    setWfPhase(role.ic+" "+role.t+" — Level "+(i+1)+"/"+ch.chain.length);

    const prevWork=steps.length>0
      ?steps.map((s,si)=>"Level "+(si+1)+": "+s.role.t+"\n"+s.output).join("\n\n")
      :"";

    const sys=
      "You are "+role.f+" at \""+co.name+"\".\n"+
      "PROFILE: "+(p.b?.split("\n")[0]||"")+"\n"+
      "OPERATING STYLE: Think critically, not agreeably — challenge weak assumptions including your own from prior drafts. When current real-world data would strengthen your answer (rates, regulations, market data, competitor moves, benchmarks), search for it and use it — don't rely on memory for anything time-sensitive. Be decisive and specific; avoid generic frameworks restated without numbers.\n"+
      buildCtx(co,compData)+"\n"+
      "WORKFLOW CHAIN: \""+ch.label+"\" Level "+(i+1)+"/"+ch.chain.length+"\n"+
      "TASK: \""+taskText+"\"\n"+
      (steps.length>0?prevWork+"\n\n":"")+
      (isFirst
        ?"INITIATING: Acknowledge task. State clearly: (1) What specific information is missing — list it once, briefly. (2) State your KEY ASSUMPTIONS explicitly as a numbered list (budget, timeline, audience, product type) — these become FIXED CONSTRAINTS that all subsequent levels must honor and build upon, not re-invent. (3) Produce a structured FIRST DRAFT. Label your assumptions section clearly as 'FIXED ASSUMPTIONS FOR THIS CHAIN' so downstream levels treat them as given."
        :isLast
        :"FINAL APPROVAL: Review all previous levels. Produce DEFINITIVE FINAL OUTPUT. Sections: Chain Review, Corrections, FINAL APPROVED OUTPUT, Strategic Commentary, Cross-functional Actions.\n\nDELIVERABLE PACK (produce these — not descriptions of them, the actual items):\n1. 30-DAY CONTENT CALENDAR as a markdown table: Date | Platform | Content Type | Caption (ready to post) | Hashtags | CTA — minimum 12 rows, real captions written in full.\n2. THREE READY-TO-POST CAPTIONS written in full — one for Instagram, one for LinkedIn, one for Twitter/X — publication-ready, not templates.\n3. CREATIVE BRIEF — one paragraph for the visual designer describing the visual direction, colors, mood, and style for this campaign.\n\nAFTER finishing the above, on its own new line write exactly: ===CAPABILITY_BRIEF===\nThen, with NOTHING else (no markdown, no commentary), output ONLY a single valid JSON object with this exact shape:\n{\"info_needed\":[\"...\"],\"tools_required\":[{\"name\":\"...\",\"available\":true,\"why\":\"...\"}],\"manual_steps\":[\"...\"],\"automated_steps\":[\"...\"],\"est_cost_usd\":0,\"notes\":\"...\"}\nRules: info_needed = any data still missing from the user. tools_required = external tools/APIs/subscriptions needed, with 'available' set to false if it requires an integration we don't have yet. manual_steps = numbered actions the USER must do themselves. automated_steps = what this chain already completed. est_cost_usd = your best-effort estimate in US dollars of any external API/subscription/service cost to fully execute this (0 if none). If genuinely nothing is needed, return empty arrays and est_cost_usd:0."
        :"MID-LEVEL: You are reviewing the previous level's output as a critical, senior "+role.dl+" expert. DO NOT restate or repeat what was already said. Instead: (1) Identify 2-3 specific gaps, errors, or unrealistic assumptions in the previous output — be direct and critical. (2) If current real-world data (rates, regulations, benchmarks, competitor info, market figures) would materially improve this, search for it and cite what you found. (3) Add ONE substantive new dimension that only someone at your level would contribute — do not just add more of the same. (4) Output ONLY: a short 'Critical Review' section (your gaps/corrections), then 'New Contribution' (your unique addition), then an updated consolidated summary/table. Be concise — quality over length."
      )+"\nAll figures in "+wfCurr.sym+wfCurr.code+".";

    let reply="";
    let stepFailed=false;
    let failMsg="";

    try{
      reply=await ask(sys,[{role:"user",content:"Process: \""+taskText+"\""}],2800);
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
      const parsed=parseCapabilityBrief(reply);
      stepOutput=parsed.output;
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
},[wfTask,wfCat,wfRunning,co,compData,keys,defP,showToast]);

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
        ?"INITIATING: Acknowledge task, produce FIRST DRAFT. Use "+p3Curr.sym+p3Curr.code+"."
        :isLast
        ?"FINAL APPROVAL: Review all levels. Produce DEFINITIVE FINAL OUTPUT."
        :"MID-LEVEL: Review previous level, add "+role.dl+" expertise. Enhanced output in "+p3Curr.sym+p3Curr.code+"."
      );

    // Execute level call
    const levelStartTime=Date.now();
    let providerFailures=0;

    try{
      const reply=await ask(sys,[{role:"user",content:"Process: \""+task.task+"\""}],2800);
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

},[co,compData,keys,defP,showToast]);

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
    for(const k of["cos-ch","cos-cd","cos-br","cos-wf","cos-tq"]){try{localStorage.removeItem(k);}catch{}}
    setChats({});setCompData({});setBrSessions([]);setBrCur({q:"",debate:[],synthesis:"",drilldown:{}});
    setWorkflows([]);setWfActive(null);tQRef.current=[];setTQueue([]);setSelRole(null);setConfirmReset(null);
    showToast("All data reset","warning");
  };
  const fullReset=async()=>{
    for(const k of["cos-keys","cos-co","cos-ch","cos-dp","cos-cd","cos-br","cos-dn","cos-wf","cos-tq"]){try{localStorage.removeItem(k);}catch{}}
    setPage("landing");setKeys({claude:"",openai:"",gemini:""});setCo({name:"",industry:"",stage:"idea",location:"",markets:"",currency:"INR"});
    setSelRole(null);setChats({});setCompData({});setBrSessions([]);setShowSettings(false);
    setWorkflows([]);tQRef.current=[];setTQueue([]);setConfirmReset(null);
  };
  const exportAll=()=>dlFile("OrchestrIQ-"+co.name.replace(/\s+/g,"-")+"-"+Date.now()+".json",{version:VERSION,exported:new Date().toISOString(),company:co,companyData:compData,chats,boardroomSessions:brSessions,workflows,taskQueue:tQueue});
  const importData=file=>{const r=new FileReader();r.onload=e=>{try{const d=JSON.parse(e.target.result);if(d.company){setCo(d.company);sv("cos-co",d.company);}if(d.companyData){setCompData(d.companyData);sv("cos-cd",d.companyData);}if(d.chats){setChats(d.chats);sv("cos-ch",d.chats);}if(d.boardroomSessions){setBrSessions(d.boardroomSessions);sv("cos-br",d.boardroomSessions);}if(d.workflows){setWorkflows(d.workflows);sv("cos-wf",d.workflows);}if(d.taskQueue){tQRef.current=d.taskQueue;setTQueue(d.taskQueue);sv("cos-tq",d.taskQueue);}setResumeInfo(null);showToast("Workspace loaded — continue where you left off","success");}catch{showToast("Invalid workspace file","error");}};r.readAsText(file);};

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
        ?"Produce a "+tLabel+". Use ## for each major section heading. Under each, use concise bullet points and markdown tables where data is comparative. Sections must suit a "+tLabel+": "+(dtype==="summary"?"single tight executive summary with key metrics and the one recommendation.":dtype==="investor"?"Problem, Market & TAM, Solution, Traction/Metrics, Business Model, Financials, Risks, The Ask.":dtype==="executive"?"Executive Summary, Key Findings, Strategic Recommendations, Financials, Risk Register, 90-Day Action Plan.":"full detailed report covering every theme found in the workspace.")
        :"Produce a "+tLabel+" as a slide deck. Each ## heading = one slide title. Under each, 3-6 short punchy bullet points (slide-ready, not paragraphs) OR a markdown table. Aim for 8-12 slides. Structure for a "+tLabel+": "+(dtype==="investor"?"Title, Problem, Solution, Market, Traction, Business Model, Competition, Financials, Team, The Ask.":dtype==="pitch"?"Hook, Problem, Solution, Why Now, Market, Product, Traction, Ask.":dtype==="roadmap"?"Vision, Now, Next, Later, Milestones, Metrics.":dtype==="research"?"Objective, Method, Findings, Analysis, Implications, Next Steps.":dtype==="operational"?"Overview, KPIs, Wins, Issues, Actions, Outlook.":dtype==="strategy"?"Context, Strategic Goals, Initiatives, Roadmap, Risks, Metrics.":"Agenda, Key Themes, Insights, Recommendations, Risks, Next Steps.");
      const sys=buildSys(pa,co,compData)+"\n\nWORKSPACE CORPUS TO SYNTHESIZE:\n"+corpus+"\n\nOUTPUT INSTRUCTIONS: "+structureHint+" Be specific and use real numbers from the corpus in "+cur.sym+cur.code+". Do not include any preamble — start directly with the first ## section.";
      const userTitle=expTitle.trim()||(tLabel+" — "+co.name);
      const synth=await ask(sys,[{role:"user",content:"Build: \""+userTitle+"\". Synthesize across the entire workspace corpus above."}],4000);
      setExpSynthesis(synth);
      setExpStep(isPdf?"📄 Rendering PDF…":"📊 Building PowerPoint…");
      if(isPdf)await generatePDF(dtype,userTitle,synth,co,cur);
      else await generatePPTX(dtype,userTitle,synth,co,cur);
      showToast((isPdf?"PDF":"PowerPoint")+" generated and downloaded ✓","success");
      setExpStep("");
    }catch(e){showToast("Export failed: "+e.message,"error");setExpStep("");}
    finally{setExpGenerating(false);}
  },[expGenerating,expMode,expDocType,expPptType,expSources,expTitle,co,compData,chats,brSessions,workflows,tQueue,tmRes,apRes,cur,keys,defP,showToast]);

  // Quick single-source export (used inline in chat/boardroom/etc.)
  const quickExport=useCallback(async(mode,dtype,title,body)=>{
    try{showToast("Generating "+(mode==="pdf"?"PDF":"PowerPoint")+"…","info");
      if(mode==="pdf")await generatePDF(dtype,title,body,co,cur);
      else await generatePPTX(dtype,title,body,co,cur);
      showToast("Downloaded ✓","success");
    }catch(e){showToast("Export failed: "+e.message,"error");}
  },[co,cur,showToast]);

  const curRole=AR.find(r=>r.id===selRole);
  const curMsgs=selRole?(chats[selRole]||[]):[];
  const cfgP=Object.keys(keys).filter(p=>keys[p]?.trim());
  const sColor=s=>s===TS.APPROVED?"#10B981":s===TS.REVIEWING?"#8B5CF6":s===TS.RUNNING?"#14B8A6":s===TS.REJECTED||s===TS.FAILED?"#EF4444":"#F59E0B";
  const sBg=s=>s===TS.APPROVED?"rgba(16,185,129,0.12)":s===TS.REVIEWING?"rgba(139,92,246,0.1)":s===TS.RUNNING?"rgba(20,184,166,0.1)":s===TS.REJECTED||s===TS.FAILED?"rgba(239,68,68,0.1)":"rgba(245,158,11,0.1)";

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
                {id==="gemini"&&<span style={{fontSize:8,color:"#10B981",fontWeight:700}}>FREE</span>}
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
    <div id="oiq-root" style={{display:"flex",height:"100vh",background:"#0a0e1a",fontFamily:"Manrope,sans-serif",color:"#A0AAC0"}}>
      {/* ── SIDEBAR ── */}
      <div style={{width:210,background:"#0c1120",borderRight:"1px solid #14192a",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
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
            
            <button onClick={()=>{setShowSettings(true);setSTab("api");}} title="Settings" style={S.iBtn}>⚙</button>
          </div>
        </div>
        <div style={{padding:"3px 8px 2px",fontSize:9,color:"#5A6480",display:"flex",alignItems:"center",gap:4}}>
          <span style={{width:5,height:5,borderRadius:"50%",background:cfgP.length?"#14B8A6":"#EF4444",flexShrink:0}}/>
          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{!cfgP.length?"No key — add in Settings":cfgP.length===1?MODELS[cfgP[0]]?.name:MODELS[defP]?.name+" · "+cfgP.length+" keys"}</span>
          <span style={{marginLeft:"auto",flexShrink:0}}>{cur.sym}{co.currency}</span>
        </div>
        <div style={{display:"flex",gap:1,padding:"3px 6px"}}>
          {STAGES.map(st=>(
            <button key={st.id} onClick={()=>{const n={...co,stage:st.id};setCo(n);sv("cos-co",n);}} title={st.l}
              style={{...S.pill,...(co.stage===st.id?{borderColor:"#14B8A6",color:"#14B8A6",background:"rgba(20,184,166,0.08)"}:{})}}>{st.ic}</button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:1,padding:"2px 6px 4px"}}>
          {[["nerve","🧠","Nerve"],["workflow","⚡","Flow"],["p3","🤖","Auto"],["chat","💬","Chat"],["data","🗄️","Data"],["studio","🎨","Studio"]].map(([v,ic,lb])=>(
            <button key={v} onClick={()=>setView(v)} style={{...S.nTab,...(view===v?{background:"rgba(20,184,166,0.08)",color:"#14B8A6",borderColor:"rgba(20,184,166,0.18)"}:{})}}>
              <span style={{fontSize:10}}>{ic}</span><span style={{fontSize:6,fontWeight:600}}>{lb}</span>
            </button>
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
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

        {/* NERVE CENTER */}
        {view==="nerve"&&(
          <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
            <div style={{display:"flex",gap:3,padding:"8px 14px",borderBottom:"1px solid #14192a",background:"#0c1120"}}>
              {[["boardroom","🏛️","AI Boardroom","#14B8A6"],["timemachine","⏳","Time Machine","#8B5CF6"],["autopilot","🤖","Autopilot","#F59E0B"]].map(([id,ic,lb,c])=>(
                <button key={id} onClick={()=>setNTab(id)} style={{...S.nrvTab,...(nTab===id?{background:c+"10",color:c,borderColor:c+"30"}:{})}}><span style={{fontSize:15}}>{ic}</span><span style={{fontSize:10,fontWeight:700}}>{lb}</span></button>
              ))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
              {/* BOARDROOM */}
              {nTab==="boardroom"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div><div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:1}}>AI Boardroom</div><p style={{fontSize:10,color:"#5A6480"}}>Live debate · {co.location||"Set location"} · {cur.code}</p></div>
                    {brSessions.length>0&&<button onClick={()=>dlFile("Boardroom-"+Date.now()+".json",brSessions)} style={S.hBtn}>Export ({brSessions.length})</button>}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:8}}>
                    {CS.map(a=>{const sel=brAg.includes(a.id);return(<button key={a.id} onClick={()=>!brRun&&setBrAg(sel?brAg.filter(x=>x!==a.id):[...brAg,a.id])} style={{padding:"4px 8px",borderRadius:5,fontSize:10,fontWeight:600,border:"1px solid "+(sel?a.dc+"44":"#1a2030"),background:sel?a.dc+"10":"#0c1120",color:sel?a.dc:"#5A6480",cursor:brRun?"not-allowed":"pointer",fontFamily:"Manrope,sans-serif",opacity:brRun&&!sel?0.5:1}}>{a.ic} {a.t}</button>);})}
                  </div>
                  <div style={{display:"flex",gap:5,marginBottom:10}}>
                    <textarea style={{...S.inp,flex:1,minHeight:50,resize:"vertical"}} value={brQ} onChange={e=>setBrQ(e.target.value)} placeholder="e.g. Should we expand to UAE next quarter?" disabled={brRun}/>
                    <div style={{display:"flex",flexDirection:"column",gap:4,alignSelf:"flex-end"}}>
                      <div style={{display:"flex",gap:3}}><LangPick value={vLang} onChange={vl=>{setVLang(vl);sv("cos-vl",vl);}}/><MicButton lang={vLang} onResult={t=>setBrQ(prev=>(prev?prev+" ":"")+t)} disabled={brRun}/></div>
                      <div style={{display:"flex",gap:3}}>
                        {brRun&&<button onClick={()=>{cancelRef.current.br=true;}} style={S.cancelBtn}>Cancel</button>}
                        <button onClick={runBR} disabled={brRun||!brQ.trim()||brAg.length<2} style={{...S.pBtn,width:"auto",padding:"7px 14px",marginTop:0,fontSize:11,opacity:brRun||!brQ.trim()||brAg.length<2?0.3:1}}>{brRun?"Live…":"Start"}</button>
                      </div>
                    </div>
                  </div>
                  {brPh&&<div style={{fontSize:10,color:"#14B8A6",marginBottom:8}}><span style={{width:5,height:5,borderRadius:"50%",background:"#EF4444",display:"inline-block",marginRight:5,animation:"pulse 1s infinite"}}/>{brPh}</div>}
                  {brCur.debate.map((e,i)=>(
                    <div key={i} style={{marginBottom:8,animation:"fadeIn 0.3s ease"}}>
                      <div style={{background:"#131825",borderRadius:7,padding:"10px 12px",borderLeft:"3px solid "+e.ag.dc}}>
                        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                          <span style={{fontSize:14}}>{e.ag.ic}</span><span style={{fontSize:11,fontWeight:700,color:e.ag.dc}}>{e.ag.t}</span>
                          <span style={{fontSize:8,color:"#3A4060",marginLeft:"auto"}}>Round {i+1}</span>
                          <button onClick={()=>setDrillRole(drillRole===e.ag.id?null:e.ag.id)} style={{...S.hBtn,fontSize:8,padding:"2px 6px"}}>Drill</button>
                          <button onClick={()=>cp(e.text)} style={S.hBtn}>Copy</button>
                        </div>
                        <div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={e.text} ac={e.ag.dc}/></div>
                        {brCur.drilldown[e.ag.id]?.map((d,di)=>(
                          <div key={di} style={{marginTop:8,paddingTop:8,borderTop:"1px dashed #1a2030"}}>
                            <div style={{fontSize:10,color:e.ag.dc,fontWeight:600,marginBottom:3}}>Q: {d.q}</div>
                            <div style={{fontSize:11,lineHeight:1.65,color:"#8892B0"}}><Md text={d.a} ac={e.ag.dc}/></div>
                          </div>
                        ))}
                        {drillRole===e.ag.id&&(
                          <div style={{marginTop:8,paddingTop:8,borderTop:"1px dashed #1a2030"}}>
                            <div style={{display:"flex",gap:4}}>
                              <input style={{...S.inp,flex:1,padding:"6px 9px",fontSize:11}} value={drillQ} onChange={ev=>setDrillQ(ev.target.value)} placeholder={"Ask "+e.ag.t+" a follow-up…"} onKeyDown={ev=>ev.key==="Enter"&&runDrill()} disabled={drillRun}/>
                              <button onClick={runDrill} disabled={drillRun||!drillQ.trim()} style={{...S.pBtn,padding:"5px 12px",fontSize:10,marginTop:0,width:"auto",background:e.ag.dc,color:"#0a0e1a"}}>{drillRun?"…":"Ask"}</button>
                              <button onClick={()=>{setDrillRole(null);setDrillQ("");}} style={S.hBtn}>×</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {brCur.synthesis&&(
                    <div style={{marginTop:10,animation:"fadeIn 0.4s"}}>
                      <div style={{background:"linear-gradient(135deg,rgba(20,184,166,0.06),rgba(59,130,246,0.04))",borderRadius:8,padding:"14px 16px",border:"1px solid rgba(20,184,166,0.18)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <div style={{fontSize:12,fontWeight:800,color:"#14B8A6"}}>BOARDROOM SYNTHESIS</div>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>cp(brCur.synthesis)} style={S.hBtn}>Copy</button>
                            <button onClick={()=>quickExport("pdf","executive","Boardroom — "+brCur.q,brCur.synthesis)} style={S.hBtn}>📄 PDF</button>
                            <button onClick={()=>quickExport("pptx","strategy","Boardroom — "+brCur.q,brCur.synthesis)} style={S.hBtn}>📊 PPT</button>
                            <button onClick={()=>dlFile("Synthesis-"+Date.now()+".md","# "+brCur.q+"\n\n"+brCur.synthesis,"text/markdown")} style={S.hBtn}>MD</button>
                          </div>
                        </div>
                        <div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={brCur.synthesis}/></div>
                      </div>
                    </div>
                  )}
                  <div ref={brEnd}/>
                </div>
              )}

              {/* TIME MACHINE */}
              {nTab==="timemachine"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:2}}>Business Time Machine</div>
                  <p style={{fontSize:10,color:"#5A6480",marginBottom:10}}>Two parallel 12-month futures · {co.location||"Set location"} · {cur.code} · 60s timeout</p>
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
                  {tmRun&&<div style={{fontSize:10,color:"#8B5CF6",marginBottom:8,display:"flex",alignItems:"center",gap:5}}><span style={{width:5,height:5,borderRadius:"50%",background:"#8B5CF6",display:"inline-block",animation:"pulse 1s infinite"}}/> Running simulation… (up to 60s)</div>}
                  {tmRes&&<div style={{animation:"fadeIn 0.3s"}}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:4,gap:4}}><button onClick={()=>cp(tmRes)} style={S.hBtn}>Copy</button><button onClick={()=>quickExport("pdf","detailed","Time Machine — "+tmDec.slice(0,40),tmRes)} style={S.hBtn}>📄 PDF</button><button onClick={()=>quickExport("pptx","strategy","Time Machine Simulation",tmRes)} style={S.hBtn}>📊 PPT</button><button onClick={()=>dlFile("TimeMachine-"+Date.now()+".md",tmDec+"\n\n"+tmRes,"text/markdown")} style={S.hBtn}>MD</button></div><div style={{background:"#131825",borderRadius:8,padding:"14px 16px",border:"1px solid rgba(139,92,246,0.18)"}}><div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={tmRes} ac="#8B5CF6"/></div></div></div>}
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
                  {apRun&&<div style={{fontSize:10,color:"#F59E0B",marginBottom:8,display:"flex",alignItems:"center",gap:5}}><span style={{width:5,height:5,borderRadius:"50%",background:"#F59E0B",display:"inline-block",animation:"pulse 1s infinite"}}/> Scanning all decision vectors… (up to 60s)</div>}
                  {apRes&&<div style={{animation:"fadeIn 0.3s"}}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:4,gap:4}}><button onClick={()=>cp(apRes)} style={S.hBtn}>Copy</button><button onClick={()=>quickExport("pdf","executive","Decision Autopilot Scan",apRes)} style={S.hBtn}>📄 PDF</button><button onClick={()=>quickExport("pptx","briefing","Decision Autopilot",apRes)} style={S.hBtn}>📊 PPT</button><button onClick={()=>dlFile("Autopilot-"+Date.now()+".md",apRes,"text/markdown")} style={S.hBtn}>MD</button></div><div style={{background:"#131825",borderRadius:8,padding:"14px 16px",border:"1px solid rgba(245,158,11,0.18)"}}><div style={{fontSize:11,lineHeight:1.7,color:"#A0AAC0"}}><Md text={apRes} ac="#F59E0B"/></div></div></div>}
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
              {[["new","New Task"],["active","Active"+(wfActive?" ●":"")],["history","History ("+workflows.length+")"]].map(([id,lb])=>(
                <button key={id} onClick={()=>setWfView(id)} style={{padding:"5px 12px",borderRadius:5,fontSize:10,fontWeight:600,border:"1px solid "+(wfView===id?"#14B8A6":"#1a2030"),background:wfView===id?"rgba(20,184,166,0.08)":"transparent",color:wfView===id?"#14B8A6":"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{lb}</button>
              ))}
              <div style={{marginLeft:"auto",fontSize:9,color:"#3A4060"}}>Phase 2 · 60s/level timeout</div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"14px 16px"}}>
              {wfView==="new"&&(
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#F1F5F9",marginBottom:6}}>Workflow Task Engine</div>
                  <p style={{fontSize:11,color:"#8892B0",marginBottom:12,lineHeight:1.6}}>Select a chain, describe your task, and watch the hierarchy process it level by level. Each level builds on the last. You approve at the end.</p>
                  <label style={S.lbl}>Step 1: Select Task Category</label>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:5,marginBottom:12}}>
                    {Object.entries(CHAINS).map(([key,ch])=>(
                      <button key={key} onClick={()=>setWfCat(key)} style={{display:"flex",alignItems:"flex-start",gap:7,padding:"9px 10px",borderRadius:7,border:"1px solid "+(wfCat===key?ch.color+"66":"#1a2030"),background:wfCat===key?ch.color+"08":"#0a0e1a",cursor:"pointer",fontFamily:"Manrope,sans-serif",textAlign:"left"}}>
                        <span style={{fontSize:16,flexShrink:0}}>{ch.ic}</span>
                        <div><div style={{fontSize:10,fontWeight:700,color:wfCat===key?ch.color:"#A0AAC0"}}>{ch.label}</div><div style={{fontSize:8,color:"#3A4060",lineHeight:1.4,marginTop:1}}>{ch.desc}</div></div>
                      </button>
                    ))}
                  </div>
                  {wfCat&&(()=>{const ch=CHAINS[wfCat];return(<div style={{marginBottom:8,padding:"10px 12px",background:"#0a0e1a",borderRadius:7,border:"1px solid "+ch.color+"22"}}>
                    <div style={{fontSize:9,fontWeight:700,color:ch.color,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Chain — {ch.chain.length} levels</div>
                    <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:3}}>{ch.chain.map((id,i)=>{const r=AR.find(x=>x.id===id);if(!r)return null;return(<span key={id} style={{display:"flex",alignItems:"center",gap:3}}><span style={{background:r.dc+"15",border:"1px solid "+r.dc+"33",borderRadius:4,padding:"3px 7px",fontSize:9,fontWeight:600,color:r.dc}}>{r.ic} {r.t}</span>{i<ch.chain.length-1&&<span style={{color:"#3A4060",fontSize:10}}>→</span>}</span>);})}</div>
                  </div>);})()}
                  <label style={S.lbl}>Step 2: Describe the Task</label>
                  <div style={{display:"flex",gap:4,alignItems:"flex-start",marginBottom:12}}>
                    <textarea style={{...S.inp,flex:1,minHeight:80,resize:"vertical"}} value={wfTask} onChange={e=>setWfTask(e.target.value)} placeholder="e.g. Prepare Q1 FY2026 P&L statement, highlight variances greater than 10% from budget, and recommend 3 cost reduction measures for board review" disabled={wfRunning}/>
                    <div style={{display:"flex",flexDirection:"column",gap:4}}><LangPick value={vLang} onChange={vl=>{setVLang(vl);sv("cos-vl",vl);}}/><MicButton lang={vLang} onResult={t=>setWfTask(prev=>(prev?prev+" ":"")+t)} disabled={wfRunning}/></div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={runWorkflow} disabled={wfRunning||!wfTask.trim()} style={{...S.pBtn,background:"linear-gradient(135deg,#14B8A6,#3B82F6)",opacity:wfRunning||!wfTask.trim()?0.3:1,marginTop:0,flex:1}}>{wfRunning?"Chain Running…":"Start Workflow Chain"}</button>
                    {wfRunning&&<button onClick={()=>cancelRef.current.wf=true} style={{...S.cancelBtn,alignSelf:"flex-end",marginBottom:0}}>Cancel</button>}
                  </div>
                  {wfRunning&&wfPhase&&<div style={{fontSize:10,color:"#14B8A6",marginTop:8,display:"flex",alignItems:"center",gap:5}}><span style={{width:5,height:5,borderRadius:"50%",background:"#14B8A6",display:"inline-block",animation:"pulse 1s infinite"}}/>{wfPhase}</div>}
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
            {!Object.keys(compData).length&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:12}}>
                {[["Monthly Revenue"],["Monthly Expenses"],["Cash in Bank"],["Team Size"],["Total Customers"],["MoM Growth Rate"],["Product Price"],["TAM"],["Funding Raised"],["CAC"],["LTV"],["Burn Rate"]].map(([k])=>(
                  <button key={k} onClick={()=>setDataF({k,v:""})} style={{background:"#131825",border:"1px solid #1a2030",borderRadius:5,padding:"8px 10px",cursor:"pointer",textAlign:"left",fontFamily:"Manrope,sans-serif"}}><div style={{fontSize:10,fontWeight:600,color:"#14B8A6"}}>+ {k}</div></button>
                ))}
              </div>
            )}
            {Object.entries(compData).map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:"#131825",border:"1px solid #1a2030",borderRadius:5,marginBottom:3}}>
                <div><span style={{fontSize:11,fontWeight:600,color:"#A0AAC0"}}>{k}:</span> <span style={{fontSize:11,color:"#F1F5F9"}}>{v}</span></div>
                <button onClick={()=>delD(k)} style={{background:"none",border:"none",color:"#3A4060",fontSize:10,cursor:"pointer"}}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* PRESENTATION STUDIO — FEATURE 4/5/6 */}
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
                <MicButton lang={vLang} onResult={t=>setInput(prev=>(prev?prev+" ":"")+t)} disabled={loading}/>
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
                {Object.entries(MODELS).map(([id,m])=>(
                  <div key={id} style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:keys[id]?.trim()?m.color:"#3A4060"}}/>
                      <span style={{fontSize:11,fontWeight:700,color:"#F1F5F9"}}>{m.name}</span>
                      {id==="gemini"&&<span style={{fontSize:8,color:"#10B981",fontWeight:700}}>FREE</span>}
                      <a href={m.keyUrl} target="_blank" rel="noopener noreferrer" style={{marginLeft:"auto",fontSize:9,color:m.color,textDecoration:"none"}}>Get key ↗</a>
                      {keys[id]?.trim()&&<button onClick={()=>testKey(id)} style={{...S.iBtn,fontSize:9,padding:"1px 6px"}}>{testSt[id]==="testing"?"…":testSt[id]==="ok"?"✓ OK":testSt[id]?.startsWith("fail:")?"✗ Fail":"Test"}</button>}
                    </div>
                    <input style={{...S.inp,fontSize:11}} type="password" value={keys[id]} onChange={e=>{const nk={...keys,[id]:e.target.value};setKeys(nk);sv("cos-keys",{keys:nk,defaultProvider:defP,multiAI});setTestSt(p=>({...p,[id]:undefined}));}} placeholder={m.placeholder}/>
                    {testSt[id]?.startsWith("fail:")&&<div style={{fontSize:9,color:"#EF4444",marginTop:2,lineHeight:1.4}}>{testSt[id].slice(5)}</div>}
                  </div>
                ))}
                {cfgP.length>1&&(
                  <div style={{padding:"10px",background:"#0a0e1a",borderRadius:6,border:"1px solid #1a2030",marginBottom:10}}>
                    <label style={{...S.lbl,marginBottom:5}}>Default Model</label>
                    <div style={{display:"flex",gap:4,marginBottom:8}}>
                      {cfgP.map(p=><button key={p} onClick={()=>{setDefP(p);sv("cos-keys",{keys,defaultProvider:p,multiAI});}} style={{flex:1,padding:"5px",borderRadius:4,fontSize:10,fontWeight:600,border:"1px solid "+(defP===p?MODELS[p].color:"#1a2030"),background:defP===p?MODELS[p].color+"15":"transparent",color:defP===p?MODELS[p].color:"#5A6480",cursor:"pointer",fontFamily:"Manrope,sans-serif"}}>{MODELS[p].name}</button>)}
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
                  {[["Conversations",Object.values(chats).filter(c=>c?.length).length],["Data points",Object.keys(compData).length],["Boardroom sessions",brSessions.length],["Workflows",workflows.length],["Queue tasks",tQueue.length]].map(([lb,n])=>(
                    <div key={lb} style={{background:"#0a0e1a",border:"1px solid #1a2030",borderRadius:5,padding:"8px 10px",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:"#8892B0"}}>{lb}</span><span style={{fontSize:10,fontWeight:700,color:"#14B8A6"}}>{n}</span></div>
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

      {showDonate&&<DonateModal cfg={dnCfg} presets={DONATION_PRESETS} onClose={()=>setShowDonate(false)} cur={cur} amt={dnAmt} setAmt={setDnAmt} custom={dnCustom} setCustom={setDnCustom} S={S}/>}
      <Toaster toasts={toasts} onDismiss={id=>setToasts(prev=>prev.filter(t=>t.id!==id))}/>
      <style>{CSS}</style>
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
.oiq-themed{transition:background-color .25s,color .25s,border-color .25s}`;
