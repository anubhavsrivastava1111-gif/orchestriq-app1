// COMPLIANCE FRAMEWORK & LAW REGISTER - deterministic applicability tests.
// Indicative, as understood in 2026; thresholds and scope change. Every result tells the
// user why it applies and to confirm with legal counsel / statutory auditor. Never "complete".

export interface Entity {
  id: string; name: string; country: string; type: "Private" | "Public unlisted" | "Listed";
  listedIn: string[];            // exchanges' countries, e.g. ["India","US"]
  turnoverCr: number; borrowingsCr: number; paidUpCr: number; netWorthCr: number; employees: number;
  personalData: boolean; euData: boolean; ukBusiness: boolean; usNexus: boolean; govtDealings: boolean;
  accelerated?: boolean;         // US accelerated / large accelerated filer
  operatesSites?: boolean;       // factory, plant, warehouse, construction site or commercial kitchen
  subsidiaryOfUSListed?: boolean;
}
export type Applies = "REQUIRED" | "LIKELY" | "GOOD PRACTICE" | "NOT REQUIRED";
export interface Framework { id: string; name: string; region: string; what: string; obligations: string[]; ref: string }
export interface Applicability { fw: Framework; status: Applies; why: string }

export const COSO_COMPONENTS = ["Control Environment", "Risk Assessment", "Control Activities", "Information & Communication", "Monitoring Activities"] as const;
export const COSO_PRINCIPLES: { n: number; component: (typeof COSO_COMPONENTS)[number]; text: string }[] = [
  [1, 0, "Demonstrates commitment to integrity and ethical values"], [2, 0, "Board exercises oversight responsibility"], [3, 0, "Establishes structure, authority and responsibility"],
  [4, 0, "Demonstrates commitment to competence"], [5, 0, "Enforces accountability"], [6, 1, "Specifies suitable objectives"], [7, 1, "Identifies and analyses risk"],
  [8, 1, "Assesses fraud risk"], [9, 1, "Identifies and analyses significant change"], [10, 2, "Selects and develops control activities"], [11, 2, "Selects and develops general controls over technology"],
  [12, 2, "Deploys through policies and procedures"], [13, 3, "Uses relevant, quality information"], [14, 3, "Communicates internally"], [15, 3, "Communicates externally"],
  [16, 4, "Conducts ongoing and/or separate evaluations"], [17, 4, "Evaluates and communicates deficiencies"],
].map(([n, c, text]) => ({ n: n as number, component: COSO_COMPONENTS[c as number], text: text as string }));

export const FRAMEWORKS: Framework[] = [
  { id: "coso", name: "COSO Internal Control \u2014 Integrated Framework (2013)", region: "Global", what: "The reference framework for designing and assessing internal control: 5 components, 17 principles.", obligations: ["All 17 principles present and functioning", "Components operating together"], ref: "COSO 2013" },
  { id: "sox302", name: "SOX s.302 \u2014 CEO/CFO certification", region: "United States", what: "CEO and CFO certify each periodic report and their responsibility for disclosure controls and internal control.", obligations: ["Quarterly/annual sub-certifications cascade", "Disclosure committee", "Evaluate disclosure controls each period"], ref: "Sarbanes-Oxley Act 2002, s.302" },
  { id: "sox404", name: "SOX s.404 \u2014 ICFR assessment (404a) and auditor attestation (404b)", region: "United States", what: "Management assesses internal control over financial reporting annually; accelerated filers also need the auditor's attestation.", obligations: ["Scoping of significant accounts and locations", "Documented RCM, test of design and operating effectiveness", "Deficiency evaluation; material weaknesses disclosed"], ref: "SOX s.404; PCAOB AS 2201; SEC interpretive guidance 2007" },
  { id: "fcpa", name: "US FCPA \u2014 anti-bribery, books & records, internal accounting controls", region: "United States", what: "Prohibits bribing foreign officials; issuers must keep accurate books and reasonable internal accounting controls.", obligations: ["Anti-bribery policy and third-party due diligence", "Gifts/entertainment controls", "Accurate books and records"], ref: "15 U.S.C. 78dd-1, 78m(b)" },
  { id: "in-ifc-board", name: "Companies Act 2013 \u2014 IFC in the Board's report (s.134(5)(e); Rule 8(5)(viii))", region: "India", what: "Directors state that internal financial controls were laid down and are adequate and operating effectively (listed); every Board report comments on IFC adequacy.", obligations: ["Documented IFC framework (often COSO-based)", "Evidence of testing to support the directors' statement"], ref: "Companies Act 2013 s.134(5)(e); Companies (Accounts) Rules 2014, Rule 8(5)(viii)" },
  { id: "in-ifc-audit", name: "Companies Act 2013 \u2014 auditor's report on IFC over financial reporting (s.143(3)(i))", region: "India", what: "The statutory auditor reports on adequacy and operating effectiveness of internal financial controls with reference to financial statements.", obligations: ["RCM and test evidence the auditor can rely on", "Remediation of deficiencies before year end"], ref: "s.143(3)(i); ICAI Guidance Note on Audit of IFC over Financial Reporting; MCA notification 13 June 2017 (exemption)" },
  { id: "in-ia", name: "Companies Act 2013 \u2014 internal audit (s.138)", region: "India", what: "Prescribed companies must appoint an internal auditor; the Board/Audit Committee sets scope.", obligations: ["Risk-based internal audit plan", "Reporting to the Audit Committee"], ref: "s.138; Companies (Accounts) Rules 2014, Rule 13" },
  { id: "in-ac", name: "Companies Act 2013 \u2014 Audit Committee and vigil mechanism (s.177)", region: "India", what: "Audit Committee evaluates internal financial controls and risk management; vigil (whistle-blower) mechanism.", obligations: ["Audit Committee charter and meetings", "Vigil mechanism with direct access to the Committee chair"], ref: "s.177(4)(vii), s.177(9)-(10); Companies (Meetings of Board) Rules 2014, Rules 6-7" },
  { id: "in-caro", name: "CARO 2020 \u2014 auditor's report on specified matters", region: "India", what: "Auditor reports on fixed-asset records and physical verification, inventory, loans, statutory dues, fraud, whistle-blower complaints and more.", obligations: ["Fixed-asset register and physical verification", "Inventory verification", "Statutory dues paid on time", "Fraud and whistle-blower reporting"], ref: "Companies (Auditor's Report) Order, 2020" },
  { id: "in-audittrail", name: "Audit trail (edit log) in accounting software", region: "India", what: "Accounting software must record an audit trail of every change that cannot be disabled; auditor reports on it.", obligations: ["Edit log enabled for all books, cannot be switched off", "Retention for the statutory period"], ref: "Companies (Accounts) Rules 2014, Rule 3(1) proviso (from 1 April 2023); Companies (Audit and Auditors) Rules, Rule 11(g)" },
  { id: "in-lodr", name: "SEBI LODR \u2014 listed-entity governance", region: "India", what: "CEO/CFO certification on financial statements and internal controls; audit committee; risk management committee; vigil mechanism.", obligations: ["Reg 17(8) CEO/CFO certificate", "Reg 18 Audit Committee", "Reg 21 Risk Management Committee (top 1000)", "Reg 22 vigil mechanism"], ref: "SEBI (LODR) Regulations 2015" },
  { id: "in-dpdp", name: "Digital Personal Data Protection Act 2023 and Rules", region: "India", what: "Lawful processing, notice and consent, security safeguards, breach reporting and data-principal rights.", obligations: ["Privacy notice and consent records", "Security safeguards and breach response", "Erasure and grievance process"], ref: "DPDP Act 2023; DPDP Rules 2025 (phased commencement)" },
  { id: "in-posh", name: "POSH Act 2013 \u2014 Internal Committee", region: "India", what: "Prevention of sexual harassment: Internal Committee and annual reporting.", obligations: ["Internal Committee constituted", "Policy, training and annual report"], ref: "Sexual Harassment of Women at Workplace Act 2013" },
  { id: "in-tax", name: "Indian tax compliance \u2014 GST and TDS", region: "India", what: "Registration, returns, input-tax-credit reconciliation, tax deducted at source and its deposit.", obligations: ["GST return filing and ITC reconciliation", "TDS deduction, deposit and returns"], ref: "CGST Act 2017; Income-tax law (TDS provisions)" },
  { id: "in-labour", name: "Indian labour and social security", region: "India", what: "Wages, PF, ESI, gratuity, bonus and working conditions under the Labour Codes and state rules.", obligations: ["PF/ESI registration and monthly remittance", "Statutory registers and returns"], ref: "Labour Codes and state rules; EPF and ESI schemes" },
  { id: "in-rpt", name: "Related-party transactions (Companies Act s.188; SEBI LODR Reg 23)", region: "India", what: "Transactions with directors, promoters, their relatives and group entities need approval (Audit Committee / Board / shareholders as applicable) and disclosure.", obligations: ["Related-party register", "Approval before the transaction; arm's-length evidence", "Disclosure in financial statements (Ind AS 24 / AS 18)"], ref: "Companies Act 2013 s.177, s.188; SEBI LODR Reg 23" },
  { id: "cert-in", name: "CERT-In cyber-security directions", region: "India", what: "Report specified cyber incidents to CERT-In within 6 hours of noticing them, keep ICT logs for 180 days in India, and synchronise clocks.", obligations: ["Incident reporting within 6 hours", "Log retention for 180 days", "Point of contact registered with CERT-In"], ref: "CERT-In Directions under s.70B(6) of the IT Act, 28 April 2022" },
  { id: "in-ehs", name: "Health, safety & environment laws", region: "India", what: "Factory licence and safety duties, pollution-control consents for air, water and hazardous waste, fire safety and accident reporting.", obligations: ["Factory licence and statutory inspections", "Consent to Establish / Operate and monitoring returns", "Hazardous-waste authorisation", "Accident reporting and safety committee"], ref: "Factories Act 1948 / OSH Code 2020 and state rules; Water Act 1974; Air Act 1981; Environment (Protection) Act 1986; Hazardous Waste Rules 2016" },
  { id: "uk-bribery", name: "UK Bribery Act 2010 \u2014 failure to prevent bribery (s.7)", region: "United Kingdom", what: "A company carrying on business in the UK is liable if an associated person bribes, unless it had adequate procedures.", obligations: ["Proportionate anti-bribery procedures", "Top-level commitment, risk assessment, due diligence"], ref: "Bribery Act 2010, s.7; MoJ guidance" },
  { id: "uk-fraud", name: "UK ECCTA 2023 \u2014 failure to prevent fraud", region: "United Kingdom", what: "Large organisations are liable for fraud by associated persons for their benefit unless reasonable prevention procedures exist.", obligations: ["Fraud risk assessment", "Reasonable prevention procedures and monitoring"], ref: "Economic Crime and Corporate Transparency Act 2023 (offence in force 1 September 2025)" },
  { id: "uk-cgc", name: "UK Corporate Governance Code 2024 \u2014 Provision 29", region: "United Kingdom", what: "The board declares the effectiveness of material internal controls in the annual report.", obligations: ["Identify material controls", "Board declaration and description of ineffective controls"], ref: "FRC UK Corporate Governance Code 2024 (Provision 29 for periods from 1 January 2026)" },
  { id: "eu-gdpr", name: "EU / UK GDPR", region: "European Union / UK", what: "Data-protection obligations when processing personal data of people in the EU or UK.", obligations: ["Lawful basis and records of processing", "DPIAs, breach notification within 72 hours", "Cross-border transfer safeguards"], ref: "Regulation (EU) 2016/679; UK GDPR" },
  { id: "jsox", name: "Japan J-SOX", region: "Japan", what: "Management assessment and auditor audit of ICFR for companies listed in Japan.", obligations: ["Management ICFR assessment", "Auditor's internal control audit"], ref: "Financial Instruments and Exchange Act (revised standards 2024)" },
  { id: "csox", name: "China C-SOX", region: "China", what: "Basic Standard for Enterprise Internal Control and guidelines for listed companies.", obligations: ["Internal control self-assessment report", "Auditor internal control audit"], ref: "Basic Standard for Enterprise Internal Control (2008) and guidelines" },
  { id: "au-295a", name: "Australia Corporations Act s.295A declarations", region: "Australia", what: "CEO/CFO declare financial records are properly maintained and statements give a true and fair view (listed entities).", obligations: ["CEO/CFO declaration supported by sub-certification"], ref: "Corporations Act 2001 s.295A; ASX Corporate Governance Principles" },
  { id: "sg-1207", name: "Singapore SGX Rule 1207(10)", region: "Singapore", what: "Board comments on the adequacy and effectiveness of internal controls and risk management.", obligations: ["Board/AC opinion on internal controls", "Risk management framework"], ref: "SGX Mainboard Rule 1207(10); Code of Corporate Governance 2018" },
  { id: "iso37301", name: "ISO 37301 / ISO 37001 \u2014 compliance & anti-bribery management systems", region: "Global", what: "Certifiable management systems for compliance and anti-bribery; useful evidence of adequate procedures.", obligations: ["Compliance obligations register", "Policy, roles, monitoring and continual improvement"], ref: "ISO 37301:2021; ISO 37001:2016" },
];
const F = (id: string) => FRAMEWORKS.find((f) => f.id === id)!;

export function applicability(e: Entity): Applicability[] {
  const out: Applicability[] = []; const A = (id: string, status: Applies, why: string) => out.push({ fw: F(id), status, why });
  const india = /^india$/i.test(e.country), listedIndia = e.type === "Listed" && (e.listedIn.includes("India") || india && !e.listedIn.length);
  const usListed = e.listedIn.includes("US") || e.listedIn.includes("United States");
  A("coso", "GOOD PRACTICE", "Recommended basis for any control programme; also the framework most auditors expect for SOX and Indian IFC.");
  if (usListed) { A("sox302", "REQUIRED", "Securities registered with the US SEC."); A("sox404", "REQUIRED", e.accelerated ? "US issuer and an accelerated filer: management assessment (404a) and auditor attestation (404b)." : "US issuer: management assessment (404a). Auditor attestation (404b) applies only to accelerated / large accelerated filers."); }
  else if (e.subsidiaryOfUSListed) { A("sox404", "REQUIRED", "Part of a US-listed group: in-scope controls are tested for the parent's SOX assessment."); A("sox302", "LIKELY", "Sub-certifications to the parent's CEO/CFO are normally required."); }
  if (usListed || e.subsidiaryOfUSListed || e.usNexus) A("fcpa", e.govtDealings ? "REQUIRED" : "LIKELY", (usListed ? "US issuer" : e.subsidiaryOfUSListed ? "subsidiary of a US issuer" : "US nexus") + (e.govtDealings ? " and dealings with government officials." : "."));
  if (india) {
    A("in-ifc-board", "REQUIRED", e.type === "Listed" ? "Listed company: directors' responsibility statement on IFC (s.134(5)(e)) and Board report comment (Rule 8(5)(viii))." : "Every company's Board report comments on the adequacy of IFC with reference to financial statements (Rule 8(5)(viii)).");
    const ifcExempt = e.type === "Private" && e.turnoverCr < 50 && e.borrowingsCr < 25;
    A("in-ifc-audit", ifcExempt ? "NOT REQUIRED" : "REQUIRED", ifcExempt ? "Private company with turnover below \u20b950 crore and borrowings below \u20b925 crore is exempt (MCA notification, 13 June 2017). Small companies and OPCs are also exempt." : "Statutory auditor must report on IFC over financial reporting.");
    const ia = e.type === "Listed" || (e.type === "Public unlisted" && (e.paidUpCr >= 50 || e.turnoverCr >= 200 || e.borrowingsCr >= 100)) || (e.type === "Private" && (e.turnoverCr >= 200 || e.borrowingsCr >= 100));
    A("in-ia", ia ? "REQUIRED" : "GOOD PRACTICE", ia ? "Meets the s.138 / Rule 13 thresholds for internal audit." : "Below the Rule 13 thresholds; internal audit is still good practice.");
    const ac = e.type === "Listed" || (e.type === "Public unlisted" && (e.paidUpCr >= 10 || e.turnoverCr >= 100 || e.borrowingsCr > 50));
    A("in-ac", ac ? "REQUIRED" : e.borrowingsCr > 50 ? "LIKELY" : "GOOD PRACTICE", ac ? "Listed or prescribed public company: Audit Committee and vigil mechanism." : e.borrowingsCr > 50 ? "Borrowings above \u20b950 crore from banks/FIs trigger a vigil mechanism (Rule 7)." : "Not prescribed at this size; a whistle-blower channel is still good practice.");
    const caroExempt = e.type === "Private" && e.paidUpCr + Math.max(0, e.netWorthCr - e.paidUpCr) <= 1 && e.borrowingsCr <= 1 && e.turnoverCr <= 10;
    A("in-caro", caroExempt ? "NOT REQUIRED" : "REQUIRED", caroExempt ? "Small private company within the CARO 2020 exemption limits (verify holding/subsidiary status)." : "Auditor reports under CARO 2020 (banking, insurance, s.8 companies, OPCs and small companies excepted).");
    A("in-audittrail", "REQUIRED", "Applies to every company keeping books in accounting software, from 1 April 2023.");
    A("in-rpt", "REQUIRED", "Every company must get related-party transactions approved and disclose them" + (e.type === "Listed" ? "; listed entities also follow LODR Reg 23." : "."));
    A("cert-in", "REQUIRED", "Applies to every body corporate in India that uses computer systems: incidents reported within 6 hours, logs kept 180 days.");
    if (e.operatesSites) A("in-ehs", "REQUIRED", "Operates a factory, plant, warehouse or site: licences, consents and safety duties apply.");
    if (listedIndia) A("in-lodr", "REQUIRED", "Listed on an Indian exchange.");
    A("in-dpdp", e.personalData ? "REQUIRED" : "LIKELY", e.personalData ? "Processes digital personal data in India." : "Almost every business processes employee or customer data.");
    if (e.employees >= 10) A("in-posh", "REQUIRED", "10 or more employees: Internal Committee required.");
    A("in-tax", "REQUIRED", "GST and TDS obligations apply above their thresholds.");
    A("in-labour", "REQUIRED", e.employees >= 20 ? "20+ employees: PF applies; ESI applies in notified areas within the wage ceiling." : "Wage, gratuity and state labour rules apply; PF from 20 employees.");
  }
  if (e.ukBusiness || /united kingdom|^uk$/i.test(e.country)) {
    A("uk-bribery", "REQUIRED", "Carries on business in the UK.");
    const large = [e.employees > 250, e.turnoverCr > 380, e.netWorthCr > 190].filter(Boolean).length >= 2;   // approx. £36m / £18m at ~₹105/£ (indicative)
    A("uk-fraud", large ? "REQUIRED" : "LIKELY", large ? "Appears to meet the 'large organisation' test (2 of: >250 staff, >£36m turnover, >£18m assets) \u2014 verify on group figures." : "Applies to large organisations; check the group's figures.");
    if (e.type === "Listed" && e.listedIn.some((x) => /uk|united kingdom|london/i.test(x))) A("uk-cgc", "REQUIRED", "UK-listed company subject to the Code (comply or explain).");
  }
  if (e.euData || /germany|france|netherlands|ireland|spain|italy|belgium|sweden|poland|eu/i.test(e.country)) A("eu-gdpr", "REQUIRED", "Processes personal data of people in the EU/UK.");
  if (e.listedIn.includes("Japan")) A("jsox", "REQUIRED", "Listed in Japan.");
  if (e.listedIn.includes("China")) A("csox", "REQUIRED", "Listed in China.");
  if (e.type === "Listed" && (e.listedIn.includes("Australia") || /australia/i.test(e.country))) A("au-295a", "REQUIRED", "Listed in Australia.");
  if (e.listedIn.includes("Singapore")) A("sg-1207", "REQUIRED", "Listed on SGX.");
  A("iso37301", "GOOD PRACTICE", e.govtDealings ? "Government dealings: a certified anti-bribery system is strong evidence of adequate procedures." : "Optional certification that demonstrates a mature compliance system.");
  const order: Record<Applies, number> = { REQUIRED: 0, LIKELY: 1, "GOOD PRACTICE": 2, "NOT REQUIRED": 3 };
  return out.sort((a, b) => order[a.status] - order[b.status]);
}
// Which framework tag on a control is binding for this entity
export function bindingRegimes(e: Entity): string[] { return applicability(e).filter((a) => a.status === "REQUIRED" || a.status === "LIKELY").map((a) => a.fw.id); }
