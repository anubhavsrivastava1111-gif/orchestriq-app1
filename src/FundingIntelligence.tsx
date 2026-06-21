import { useState, useCallback } from "react";

const STAGES = ["Idea","Formation","MVP","Funding","Growth","Mature"];
const SECTORS = [
  "Manufacturing","Textiles & Apparel","Food Processing","Agriculture & Agritech",
  "Technology & SaaS","Healthcare & Pharma","Education & EdTech","Renewable Energy",
  "Construction & Real Estate","Retail & E-commerce","Logistics & Supply Chain",
  "Financial Services & Fintech","Tourism & Hospitality","Media & Entertainment",
  "Defence & Aerospace","Chemical & Petrochemical","Automotive & EV","Other"
];
const STATES = [
  "All India (Central Schemes)","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar",
  "Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
  "Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
  "Uttar Pradesh","Uttarakhand","West Bengal","Delhi","International/Global"
];
const FUNDING_TYPES = [
  "All Types","Government Grant","Subsidized Loan","Equity/VC","Bank Loan (MUDRA/CGTMSE)",
  "International Grant (World Bank/ADB/IFC)","Tax Incentive","Export Incentive"
];

interface SchemeResult {
  name: string;
  authority: string;
  type: string;
  funding: string;
  eligibility: string[];
  howToApply: string;
  officialLink: string;
  deadline: string;
  matchScore: number;
  matchReason: string;
}

interface SearchState {
  status: "idle"|"searching"|"done"|"error";
  results: SchemeResult[];
  summary: string;
  error: string;
  rawText: string;
}

const S = {
  page: { flex:1 as const, overflowY:"auto" as const, background:"#070C18", fontFamily:"'Inter',-apple-system,sans-serif", color:"#F0F4FF" },
  header: { padding:"24px 28px 0", borderBottom:"1px solid #1C2A40", paddingBottom:"20px" },
  title: { fontSize:20, fontWeight:800, color:"#F0F4FF", marginBottom:4 },
  subtitle: { fontSize:12, color:"#4D6A8A" },
  body: { padding:"24px 28px" },
  card: { background:"#0F1829", border:"1px solid #1C2A40", borderRadius:8, padding:20, marginBottom:16 },
  label: { fontSize:10, fontWeight:700, color:"#4D6A8A", letterSpacing:"0.1em", textTransform:"uppercase" as const, display:"block" as const, marginBottom:6 },
  input: { width:"100%", background:"#070C18", border:"1px solid #1C2A40", borderRadius:6, padding:"9px 12px", color:"#F0F4FF", fontSize:12, fontFamily:"'Inter',-apple-system,sans-serif", boxSizing:"border-box" as const },
  select: { width:"100%", background:"#070C18", border:"1px solid #1C2A40", borderRadius:6, padding:"9px 12px", color:"#F0F4FF", fontSize:12, fontFamily:"'Inter',-apple-system,sans-serif", boxSizing:"border-box" as const },
  btn: { background:"#3B82F6", color:"#fff", border:"none", borderRadius:6, padding:"11px 24px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Inter',-apple-system,sans-serif" },
  schemeCard: { background:"#0F1829", border:"1px solid #1C2A40", borderRadius:8, padding:20, marginBottom:12 },
  tag: { display:"inline-flex" as const, alignItems:"center" as const, padding:"2px 8px", borderRadius:9999, fontSize:10, fontWeight:600, marginRight:6, marginBottom:4 },
  sectionLabel: { fontSize:10, fontWeight:700, color:"#4D6A8A", letterSpacing:"0.1em", textTransform:"uppercase" as const, marginBottom:6, display:"block" as const },
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#EAB308" : "#F97316";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, background:"#1C2A40", borderRadius:9999, height:4 }}>
        <div style={{ width:`${score}%`, background:color, height:"100%", borderRadius:9999, transition:"width 0.5s" }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, minWidth:32 }}>{score}%</span>
    </div>
  );
}

function SchemeCard({ scheme }: { scheme: SchemeResult }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = scheme.type.includes("Grant") ? "#10B981" :
    scheme.type.includes("Loan") || scheme.type.includes("Bank") ? "#3B82F6" :
    scheme.type.includes("International") ? "#A855F7" : "#F97316";

  return (
    <div style={S.schemeCard}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", flexWrap:"wrap" as const, gap:4, marginBottom:6 }}>
            <span style={{ ...S.tag, background:`${typeColor}15`, color:typeColor, border:`1px solid ${typeColor}30` }}>{scheme.type}</span>
            <span style={{ ...S.tag, background:"rgba(59,130,246,0.1)", color:"#8FA8CC", border:"1px solid #1C2A40" }}>{scheme.authority}</span>
            {scheme.deadline && scheme.deadline !== "Ongoing" && (
              <span style={{ ...S.tag, background:"rgba(239,68,68,0.1)", color:"#EF4444", border:"1px solid rgba(239,68,68,0.2)" }}>⏰ {scheme.deadline}</span>
            )}
          </div>
          <div style={{ fontSize:14, fontWeight:700, color:"#F0F4FF", marginBottom:4, lineHeight:1.4 }}>{scheme.name}</div>
          <div style={{ fontSize:12, color:"#10B981", fontWeight:600 }}>{scheme.funding}</div>
        </div>
        <div style={{ textAlign:"right" as const, flexShrink:0 }}>
          <div style={{ fontSize:10, color:"#4D6A8A", marginBottom:4 }}>Match</div>
          <ScoreBar score={scheme.matchScore} />
        </div>
      </div>

      <div style={{ fontSize:11, color:"#8FA8CC", lineHeight:1.6, marginBottom:10, padding:"8px 12px", background:"rgba(59,130,246,0.05)", borderRadius:6, borderLeft:"2px solid #3B82F6" }}>
        {scheme.matchReason}
      </div>

      {expanded && (
        <div style={{ borderTop:"1px solid #1C2A40", paddingTop:12, marginTop:4 }}>
          {scheme.eligibility && scheme.eligibility.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <span style={S.sectionLabel}>Eligibility</span>
              {scheme.eligibility.map((e, i) => (
                <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", fontSize:12, color:"#8FA8CC", lineHeight:1.6, marginBottom:3 }}>
                  <span style={{ color:"#3B82F6", flexShrink:0 }}>→</span>{e}
                </div>
              ))}
            </div>
          )}
          {scheme.howToApply && (
            <div style={{ marginBottom:12 }}>
              <span style={S.sectionLabel}>How to Apply</span>
              <div style={{ fontSize:12, color:"#8FA8CC", lineHeight:1.6 }}>{scheme.howToApply}</div>
            </div>
          )}
          {scheme.officialLink && scheme.officialLink !== "N/A" && (
            <a href={scheme.officialLink} target="_blank" rel="noopener noreferrer"
              style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color:"#3B82F6", textDecoration:"none", padding:"6px 12px", border:"1px solid rgba(59,130,246,0.3)", borderRadius:6, background:"rgba(59,130,246,0.05)" }}>
              🔗 Official Website ↗
            </a>
          )}
        </div>
      )}

      <button onClick={() => setExpanded(!expanded)}
        style={{ background:"none", border:"none", color:"#4D6A8A", fontSize:11, cursor:"pointer", marginTop:8, fontFamily:"'Inter',-apple-system,sans-serif", padding:0 }}>
        {expanded ? "▴ Show less" : "▾ Show eligibility & how to apply"}
      </button>
    </div>
  );
}

export default function FundingIntelligence({ co, compData, ask }: {
  co: any;
  compData: any;
  ask: (sys: string, msgs: any[], maxT: number, search?: boolean) => Promise<string>;
}) {
  const [businessDesc, setBusinessDesc] = useState("");
  const [sector, setSector]             = useState(co?.industry || "");
  const [state, setState]               = useState("All India (Central Schemes)");
  const [stage, setStage]               = useState(co?.stage || "idea");
  const [fundingType, setFundingType]   = useState("All Types");
  const [employeeCount, setEmployeeCount] = useState("");
  const [annualRevenue, setAnnualRevenue] = useState("");
  const [search, setSearch]             = useState<SearchState>({ status:"idle", results:[], summary:"", error:"", rawText:"" });

  const runSearch = useCallback(async () => {
    if (!businessDesc.trim()) return;
    setSearch({ status:"searching", results:[], summary:"", error:"", rawText:"" });

    const sys = `You are a Government Funding and Schemes Intelligence Expert for Indian and international businesses.
Your job is to find the most relevant government schemes, grants, subsidies, bank loans, and international funding programs for a business.

BUSINESS PROFILE:
- Description: ${businessDesc}
- Sector: ${sector}
- Stage: ${stage}
- Location/State: ${state}
- Employees: ${employeeCount || "Not specified"}
- Annual Revenue: ${annualRevenue || "Not specified"}
- Funding Type Preference: ${fundingType}
- Company Name: ${co?.name || "Not specified"}

Search for and return REAL, CURRENT government schemes. Include:
1. Central Government Schemes (Ministry of MSME, Commerce, Agriculture, Textiles, etc.)
2. State Government Schemes for ${state}
3. Bank Schemes (MUDRA, CGTMSE, SIDBI, NABARD, SBI, etc.)
4. International Funding (World Bank, ADB, IFC, UNDP, bilateral grants)
5. Export incentives if applicable (DGFT, RoDTEP, PLI schemes)

For EACH scheme found, return a JSON array with this exact structure:
{
  "schemes": [
    {
      "name": "Full official scheme name",
      "authority": "Ministry/Bank/Organization name",
      "type": "Government Grant|Subsidized Loan|Bank Loan|International Grant|Tax Incentive|Export Incentive",
      "funding": "Exact amount or range e.g. Up to ₹10 Lakh or ₹50,000 - ₹10 Crore",
      "eligibility": ["criterion 1", "criterion 2", "criterion 3"],
      "howToApply": "Step by step application process",
      "officialLink": "https://official-website.gov.in",
      "deadline": "Ongoing or specific date",
      "matchScore": 85,
      "matchReason": "Why this scheme matches this specific business in 1-2 sentences"
    }
  ],
  "summary": "2-3 sentence executive summary of top funding opportunities for this business"
}

Return ONLY valid JSON. No preamble. No markdown. Find at least 8-12 schemes.`;

    try {
      const raw = await ask(sys, [{ role:"user", content:"Find all relevant funding schemes now." }], 4000, true);

      // Parse JSON from response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse response");

      const parsed = JSON.parse(jsonMatch[0]);
      const schemes: SchemeResult[] = (parsed.schemes || [])
        .sort((a: SchemeResult, b: SchemeResult) => b.matchScore - a.matchScore);

      setSearch({ status:"done", results:schemes, summary:parsed.summary || "", error:"", rawText:raw });
    } catch (err: any) {
      setSearch({ status:"error", results:[], summary:"", error:err.message, rawText:"" });
    }
  }, [businessDesc, sector, state, stage, fundingType, employeeCount, annualRevenue, co, ask]);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
          <span style={{ fontSize:20 }}>💰</span>
          <div style={S.title}>Funding Intelligence</div>
        </div>
        <div style={S.subtitle}>
          Central + State schemes · Bank loans · International grants · Export incentives · Real-time search
        </div>
      </div>

      <div style={S.body}>
        {/* Search Form */}
        <div style={S.card}>
          <div style={{ fontSize:12, fontWeight:700, color:"#F0F4FF", marginBottom:16 }}>
            Describe your business to find matching schemes
          </div>
          <div style={{ marginBottom:12 }}>
            <span style={S.label}>Business Description *</span>
            <textarea
              style={{ ...S.input, minHeight:80, resize:"vertical" as const }}
              value={businessDesc}
              onChange={e => setBusinessDesc(e.target.value)}
              placeholder="e.g. I want to start a garment manufacturing unit in Lucknow, UP producing ethnic wear for export. Looking for land, machinery, and working capital support."
            />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <span style={S.label}>Sector</span>
              <select style={S.select} value={sector} onChange={e => setSector(e.target.value)}>
                <option value="">Select sector</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <span style={S.label}>State / Region</span>
              <select style={S.select} value={state} onChange={e => setState(e.target.value)}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <span style={S.label}>Business Stage</span>
              <select style={S.select} value={stage} onChange={e => setStage(e.target.value)}>
                {STAGES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
              </select>
            </div>
            <div>
              <span style={S.label}>Funding Type</span>
              <select style={S.select} value={fundingType} onChange={e => setFundingType(e.target.value)}>
                {FUNDING_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <span style={S.label}>Employee Count (optional)</span>
              <input style={S.input} value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} placeholder="e.g. 10" />
            </div>
            <div>
              <span style={S.label}>Annual Revenue (optional)</span>
              <input style={S.input} value={annualRevenue} onChange={e => setAnnualRevenue(e.target.value)} placeholder="e.g. ₹50 Lakh" />
            </div>
          </div>
          <button
            onClick={runSearch}
            disabled={search.status === "searching" || !businessDesc.trim()}
            style={{ ...S.btn, opacity: search.status === "searching" || !businessDesc.trim() ? 0.4 : 1 }}
          >
            {search.status === "searching" ? "🔍 Searching all schemes..." : "💰 Find Matching Schemes"}
          </button>
        </div>

        {/* Loading */}
        {search.status === "searching" && (
          <div style={{ ...S.card, textAlign:"center" as const, padding:40 }}>
            <div style={{ fontSize:28, marginBottom:12 }}>🔍</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#F0F4FF", marginBottom:6 }}>Searching across all schemes...</div>
            <div style={{ fontSize:11, color:"#4D6A8A", lineHeight:1.7 }}>
              Central Government · State Schemes · MUDRA · CGTMSE · SIDBI · NABARD<br/>
              World Bank · ADB · IFC · Export Incentives · PLI Schemes
            </div>
          </div>
        )}

        {/* Error */}
        {search.status === "error" && (
          <div style={{ ...S.card, borderColor:"rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.05)" }}>
            <div style={{ fontSize:12, color:"#EF4444" }}>⚠ {search.error}</div>
            <div style={{ fontSize:11, color:"#4D6A8A", marginTop:4 }}>Add a Gemini API key in Settings for web search capability.</div>
          </div>
        )}

        {/* Results */}
        {search.status === "done" && (
          <div>
            {search.summary && (
              <div style={{ ...S.card, background:"rgba(59,130,246,0.06)", borderColor:"rgba(59,130,246,0.25)", borderLeft:"3px solid #3B82F6", marginBottom:20 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#3B82F6", letterSpacing:"0.1em", textTransform:"uppercase" as const, marginBottom:6 }}>Intelligence Summary</div>
                <div style={{ fontSize:13, lineHeight:1.7, color:"#8FA8CC" }}>{search.summary}</div>
              </div>
            )}
            <div style={{ fontSize:12, color:"#4D6A8A", marginBottom:16 }}>
              Found <strong style={{ color:"#F0F4FF" }}>{search.results.length}</strong> matching schemes — sorted by relevance
            </div>
            {search.results.map((scheme, i) => (
              <SchemeCard key={i} scheme={scheme} />
            ))}
            <div style={{ fontSize:11, color:"#2D4460", marginTop:16, lineHeight:1.6, padding:"12px 16px", background:"#0B1120", borderRadius:6 }}>
              ⚠ Always verify scheme details on official government websites before applying. Scheme terms, eligibility and deadlines change frequently. This is AI-generated guidance, not legal or financial advice.
            </div>
          </div>
        )}

        {/* Empty state */}
        {search.status === "idle" && (
          <div style={{ ...S.card, textAlign:"center" as const, padding:40 }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🏛️</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#F0F4FF", marginBottom:8 }}>Find your funding match</div>
            <div style={{ fontSize:12, color:"#4D6A8A", lineHeight:1.7, maxWidth:400, margin:"0 auto" }}>
              Describe your business above and we'll search across 1000+ central, state, bank and international funding schemes to find the best matches for you.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
