// Lifeline — curated ways to earn extra, ranked against the user's skills, time and urgency.
// Earnings are broad, indicative ranges for India (late 2026) — always verify on the platform.
import type { EarnProfile } from "./types";

export type Speed = "days" | "weeks" | "months" | "6+ months";
export type Category = "quick-cash" | "teach" | "freelance" | "gig" | "ai-work" | "sell" | "content" | "local" | "skill-up" | "jobs";

export interface Opportunity {
  id: string;
  title: string;
  category: Category;
  what: string;
  speed: Speed;               // realistic time to first rupee
  earning: string;            // indicative range
  investment: "none" | "low" | "medium";
  minHours: number;           // per week to make it worthwhile
  skills: string[];           // matches SKILL_TAGS ids; [] = anyone
  needs?: string;             // hard requirements (vehicle, licence, laptop…)
  links: { label: string; url: string }[];
  reality: string;            // honest reality check
  region: "IN" | "GLOBAL";
}

export const SKILL_TAGS: { id: string; label: string }[] = [
  { id: "teaching", label: "Teaching / explaining" },
  { id: "maths-science", label: "Maths / science" },
  { id: "english", label: "Good English" },
  { id: "regional-language", label: "Regional language" },
  { id: "excel", label: "Excel / data entry" },
  { id: "accounting", label: "Accounting / GST / tax" },
  { id: "coding", label: "Coding / IT" },
  { id: "design", label: "Design / Canva" },
  { id: "writing", label: "Writing / translation" },
  { id: "video", label: "Video / photo editing" },
  { id: "speaking", label: "Speaking on camera" },
  { id: "marketing", label: "Social media / marketing" },
  { id: "cooking", label: "Cooking" },
  { id: "driving", label: "Have a 2-wheeler / car" },
  { id: "repair", label: "Repairs / electrician / beauty" },
  { id: "sales", label: "Sales / talking to people" },
  { id: "domain-expert", label: "Professional expertise (law, medicine, finance, engg.)" },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  "quick-cash": "Quick cash (this week)", teach: "Teach & tutor", freelance: "Freelance online", gig: "Gig & delivery",
  "ai-work": "AI training & remote tasks", sell: "Sell products", content: "Content & influence", local: "Local services",
  "skill-up": "Free skilling", jobs: "Better job / govt schemes",
};

const SPEED_SCORE: Record<Speed, number> = { days: 3, weeks: 2, months: 1, "6+ months": 0 };

export const OPPORTUNITIES: Opportunity[] = [
  // ── Quick cash ──
  {
    id: "sell-unused", title: "Sell things you no longer use", category: "quick-cash", region: "IN",
    what: "Old phone, laptop, bike, furniture, books, appliances. Usually the fastest legitimate money you can raise.",
    speed: "days", earning: "₹2,000–50,000 one-time", investment: "none", minHours: 2, skills: [],
    links: [{ label: "OLX", url: "https://www.olx.in" }, { label: "Cashify (phones/laptops)", url: "https://www.cashify.in" }, { label: "Facebook Marketplace", url: "https://www.facebook.com/marketplace" }],
    reality: "One-time, not recurring. Meet buyers in public places; never accept 'QR code to receive money' — receiving money never needs a PIN.",
  },
  {
    id: "rent-out", title: "Rent out space or equipment", category: "quick-cash", region: "IN",
    what: "Spare room, parking spot, camera, tools — to known people or through local groups.",
    speed: "weeks", earning: "₹1,000–10,000/month", investment: "none", minHours: 1, skills: [],
    links: [{ label: "NoBroker (rooms)", url: "https://www.nobroker.in" }],
    reality: "Check your rental agreement/society rules first. Use a written agreement and ID verification.",
  },
  // ── Teaching ──
  {
    id: "home-tuition", title: "Home / online tuition for school students", category: "teach", region: "IN",
    what: "Teach Classes 1–12 subjects in your area or online. Parents search on these marketplaces.",
    speed: "weeks", earning: "₹300–1,500/hour", investment: "none", minHours: 4, skills: ["teaching", "maths-science", "english"],
    links: [{ label: "UrbanPro", url: "https://www.urbanpro.com" }, { label: "Superprof", url: "https://www.superprof.co.in" }],
    reality: "Word-of-mouth in your society/WhatsApp groups often beats platforms for the first students. Fees are lower for online.",
  },
  {
    id: "own-classes", title: "Run your own small batch classes", category: "teach", region: "IN",
    what: "Teach a batch of 5–20 students online with free class-management apps (attendance, fees, tests).",
    speed: "weeks", earning: "₹10,000–60,000/month", investment: "low", minHours: 8, skills: ["teaching"],
    links: [{ label: "Teachmint", url: "https://www.teachmint.com" }, { label: "Classplus", url: "https://classplusapp.com" }],
    reality: "Batches scale better than 1-to-1. First batch takes 3–6 weeks to fill.",
  },
  {
    id: "lang-tutor", title: "Teach English or Indian languages to foreigners", category: "teach", region: "GLOBAL",
    what: "Conversation practice or structured lessons over video, paid in dollars.",
    speed: "weeks", earning: "$5–25/hour", investment: "none", minHours: 5, skills: ["english", "regional-language", "teaching"],
    links: [{ label: "Preply", url: "https://preply.com/en/teach" }, { label: "italki", url: "https://teach.italki.com" }, { label: "Cambly", url: "https://www.cambly.com/en/tutors" }],
    reality: "Approval can take weeks and early rates are low until you have reviews. Needs a laptop, headset and stable internet.",
  },
  {
    id: "doubt-solving", title: "Subject expert / doubt solving", category: "teach", region: "GLOBAL",
    what: "Answer student questions in maths, science, engineering, accounts. Paid per answer.",
    speed: "weeks", earning: "₹15,000–40,000/month part-time", investment: "none", minHours: 6, skills: ["maths-science", "accounting", "coding", "domain-expert"],
    links: [{ label: "Chegg Expert", url: "https://expert.chegg.com" }],
    reality: "Entrance test required; volume of questions varies month to month.",
  },
  {
    id: "course", title: "Record a course", category: "teach", region: "GLOBAL",
    what: "Package what you know (Excel, Tally, spoken English, coding) into a video course.",
    speed: "6+ months", earning: "Highly variable; most courses earn little", investment: "low", minHours: 6, skills: ["teaching", "speaking", "video"],
    links: [{ label: "Udemy instructor", url: "https://www.udemy.com/teaching/" }],
    reality: "Long-term asset, not a fix for this month's EMI. Only start once your live teaching proves demand.",
  },
  // ── Freelance ──
  {
    id: "freelance-market", title: "Freelance on global marketplaces", category: "freelance", region: "GLOBAL",
    what: "Data entry, Excel, bookkeeping, design, writing, translation, development, video editing.",
    speed: "weeks", earning: "₹5,000–1,00,000+/month", investment: "none", minHours: 8, skills: ["excel", "accounting", "coding", "design", "writing", "video", "marketing"],
    links: [{ label: "Upwork", url: "https://www.upwork.com" }, { label: "Fiverr", url: "https://www.fiverr.com" }, { label: "Freelancer", url: "https://www.freelancer.com" }, { label: "Truelancer (India)", url: "https://www.truelancer.com" }],
    reality: "First 2–3 projects are the hardest; bid small and over-deliver for reviews. Never pay a 'registration fee' to get work.",
  },
  {
    id: "local-business-help", title: "Help local shops go digital", category: "freelance", region: "IN",
    what: "Set up Google Business Profile, WhatsApp catalogue, Instagram page, GST billing for nearby shops.",
    speed: "weeks", earning: "₹2,000–10,000 per shop + monthly upkeep", investment: "none", minHours: 5, skills: ["marketing", "design", "accounting", "sales"],
    links: [{ label: "Google Business Profile", url: "https://www.google.com/business/" }],
    reality: "In-person selling works better than online ads. Start with shops you already buy from.",
  },
  // ── AI work ──
  {
    id: "ai-training", title: "Train AI models (rate and write answers)", category: "ai-work", region: "GLOBAL",
    what: "AI companies pay graduates and professionals to write, check and rate AI answers, from home.",
    speed: "weeks", earning: "$10–40/hour (higher for experts)", investment: "none", minHours: 5, skills: ["english", "writing", "coding", "maths-science", "domain-expert"],
    links: [{ label: "Outlier", url: "https://outlier.ai" }, { label: "DataAnnotation", url: "https://www.dataannotation.tech" }],
    reality: "Work availability goes up and down without notice — treat it as a bonus, not a salary. Assessments are strict.",
  },
  {
    id: "research-studies", title: "Paid research studies & app testing", category: "ai-work", region: "GLOBAL",
    what: "Take academic surveys, test websites and apps and speak your thoughts aloud.",
    speed: "weeks", earning: "₹2,000–10,000/month", investment: "none", minHours: 2, skills: ["english"],
    links: [{ label: "Prolific", url: "https://www.prolific.com" }, { label: "UserTesting", url: "https://www.usertesting.com/get-paid-to-test" }],
    reality: "Small, irregular amounts. Avoid any 'task' app that asks you to deposit money first — that is a scam pattern.",
  },
  // ── Gig ──
  {
    id: "delivery", title: "Food & grocery delivery partner", category: "gig", region: "IN",
    what: "Flexible shifts delivering for food and quick-commerce apps.",
    speed: "days", earning: "₹15,000–30,000/month part-time", investment: "low", minHours: 15, skills: ["driving"],
    needs: "Two-wheeler or e-bike, driving licence, Android phone",
    links: [{ label: "Swiggy", url: "https://www.swiggy.com" }, { label: "Zomato", url: "https://www.zomato.com" }, { label: "Amazon Flex", url: "https://flex.amazon.in" }],
    reality: "Fuel and bike maintenance eat 20–30% of earnings. Peak hours (lunch, dinner, weekends) pay best.",
  },
  {
    id: "ride", title: "Bike taxi / cab driving", category: "gig", region: "IN",
    what: "Drive on weekends or evenings.",
    speed: "days", earning: "₹10,000–40,000/month part-time", investment: "low", minHours: 12, skills: ["driving"],
    needs: "Vehicle with commercial permit where required, licence",
    links: [{ label: "Rapido Captain", url: "https://www.rapido.bike" }, { label: "Uber", url: "https://www.uber.com/in/en/drive/" }],
    reality: "Check your vehicle insurance covers commercial use.",
  },
  {
    id: "home-services", title: "Home services professional", category: "local", region: "IN",
    what: "Beauty, cleaning, AC/appliance repair, electrician, plumber, carpentry jobs through an app.",
    speed: "weeks", earning: "₹20,000–60,000/month", investment: "medium", minHours: 20, skills: ["repair"],
    links: [{ label: "Urban Company (partner)", url: "https://www.urbancompany.com" }],
    reality: "Platform training and a starter kit may be required. Good ratings drive job volume.",
  },
  // ── Local ──
  {
    id: "home-food", title: "Home tiffin / snacks / baking", category: "local", region: "IN",
    what: "Cook for office-goers, students and PGs nearby; take orders on WhatsApp.",
    speed: "weeks", earning: "₹5,000–40,000/month", investment: "low", minHours: 10, skills: ["cooking"],
    links: [{ label: "FSSAI basic registration", url: "https://foscos.fssai.gov.in" }],
    reality: "Start with 5–10 regular customers before investing. Basic FSSAI registration is cheap and builds trust.",
  },
  // ── Sell ──
  {
    id: "reselling", title: "Reselling on social commerce", category: "sell", region: "IN",
    what: "Share products from supplier catalogues on WhatsApp/Instagram and earn a margin, or list as a seller.",
    speed: "weeks", earning: "₹2,000–20,000/month", investment: "low", minHours: 6, skills: ["sales", "marketing"],
    links: [{ label: "Meesho", url: "https://www.meesho.com" }, { label: "Amazon seller", url: "https://sell.amazon.in" }, { label: "Flipkart seller", url: "https://seller.flipkart.com" }],
    reality: "Returns and unpaid inventory are the main risks — do not buy stock on credit.",
  },
  // ── Content ──
  {
    id: "youtube", title: "YouTube channel", category: "content", region: "GLOBAL",
    what: "Teach, review, cook, explain — in your own language. Regional-language channels are growing fastest in India.",
    speed: "6+ months", earning: "₹0 for most for many months; strong channels earn well", investment: "low", minHours: 10, skills: ["speaking", "video", "teaching"],
    links: [{ label: "YouTube Partner Program rules", url: "https://support.google.com/youtube/answer/72851" }],
    reality: "You need 1,000 subscribers plus 4,000 watch hours (or 10M Shorts views) before YouTube pays you. Do NOT count on this to pay EMIs in the next 6 months — build it alongside a faster income.",
  },
  {
    id: "influencer", title: "Instagram creator / influencer", category: "content", region: "GLOBAL",
    what: "Build a niche audience and earn through brand collaborations and affiliate links.",
    speed: "6+ months", earning: "Brand deals typically start after ~10k engaged followers", investment: "low", minHours: 10, skills: ["speaking", "video", "marketing", "design"],
    links: [{ label: "Instagram for Creators", url: "https://creators.instagram.com" }],
    reality: "Same as YouTube: slow and uncertain. Brands pay for engagement in a niche, not raw follower count.",
  },
  {
    id: "writing", title: "Write stories / newsletters", category: "content", region: "IN",
    what: "Serialised stories in Indian languages, or a paid newsletter on a topic you know.",
    speed: "months", earning: "Small at first; grows with readers", investment: "none", minHours: 5, skills: ["writing", "regional-language"],
    links: [{ label: "Pratilipi", url: "https://www.pratilipi.com" }, { label: "Substack", url: "https://substack.com" }],
    reality: "A long game. Good for building a portfolio that later wins freelance writing work.",
  },
  // ── Skill up ──
  {
    id: "free-skills", title: "Free government & industry courses", category: "skill-up", region: "IN",
    what: "Certified courses that lead to better-paid jobs or freelance skills (Excel, Tally, digital marketing, coding, AI).",
    speed: "months", earning: "Raises your earning rate", investment: "none", minHours: 4, skills: [],
    links: [{ label: "Skill India Digital Hub", url: "https://www.skillindiadigital.gov.in" }, { label: "SWAYAM / NPTEL", url: "https://swayam.gov.in" }, { label: "Google Career Certificates", url: "https://grow.google/certificates/" }],
    reality: "Pick one skill that directly maps to a freelance or job listing you have already seen. Certificates alone don't earn — portfolios do.",
  },
  {
    id: "job-portals", title: "Switch to a better-paying job", category: "jobs", region: "IN",
    what: "Often the single biggest lever: a 20–30% raise can outweigh every side hustle combined.",
    speed: "months", earning: "+20–40% on current salary", investment: "none", minHours: 3, skills: [],
    links: [{ label: "National Career Service (govt.)", url: "https://www.ncs.gov.in" }, { label: "Naukri", url: "https://www.naukri.com" }, { label: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs/" }],
    reality: "Never pay a recruiter or 'agency' for a job offer — that is a common fraud.",
  },
  {
    id: "micro-enterprise", title: "Government-backed micro-enterprise support", category: "jobs", region: "IN",
    what: "Collateral-free loans for small businesses and street vendors under government schemes.",
    speed: "months", earning: "Enables a business; it is still a loan", investment: "medium", minHours: 20, skills: ["sales", "cooking", "repair"],
    links: [{ label: "PM Mudra Yojana", url: "https://www.mudra.org.in" }, { label: "PM SVANidhi (street vendors)", url: "https://pmsvanidhi.mohua.gov.in" }],
    reality: "This is new debt. Only consider it with a tested business that already has paying customers — never to repay existing EMIs.",
  },
];

export interface Match { opp: Opportunity; score: number; why: string[] }

/** Rank opportunities: urgency matters most when under financial stress. */
export function rankOpportunities(p: EarnProfile, monthlyGap: number): Match[] {
  return OPPORTUNITIES.map(opp => {
    const why: string[] = [];
    let score = 0;
    const skillHits = opp.skills.filter(s => p.skills.includes(s));
    if (opp.skills.length === 0) { score += 1; }
    else if (skillHits.length) { score += 2 + skillHits.length; why.push("matches your skills"); }
    else score -= 3;

    const speed = SPEED_SCORE[opp.speed];
    const urgencyWeight = p.urgency === "this-month" ? 3 : p.urgency === "3-months" ? 1.5 : 0.3;
    score += speed * urgencyWeight;
    if (p.urgency === "this-month" && speed >= 2) why.push("can pay within weeks");
    if (p.urgency === "this-month" && speed === 0) why.push("too slow for an urgent gap — build alongside");

    if (opp.minHours > p.hoursPerWeek) { score -= 2; why.push(`needs ~${opp.minHours} hrs/week`); }
    else why.push("fits your available time");
    if (opp.investment === "medium") score -= 1;
    if (monthlyGap > 15000 && ["freelance", "teach", "gig", "local"].includes(opp.category)) score += 1;
    return { opp, score, why };
  }).sort((a, b) => b.score - a.score);
}
