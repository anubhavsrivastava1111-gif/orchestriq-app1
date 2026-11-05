// Earn — realistic ways to close the gap, ranked for this person.
import { useMemo, useState } from "react";
import { useApp } from "../context";
import { cashFlow, inr } from "../engine";
import { CATEGORY_LABEL, rankOpportunities, SKILL_TAGS, type Category, type Match } from "../opportunities";
import { Button, Card, Disclosure, LinkButton, Pill, Screen, Section } from "../components";
import { Icon } from "../icons";

const CAT_ICON: Record<Category, string> = {
  "quick-cash": "wallet", teach: "user", freelance: "doc", gig: "arrowRight", "ai-work": "sparkle",
  sell: "card", content: "star", local: "home", "skill-up": "grow", jobs: "bank",
};
const SPEED_TONE = { days: "good", weeks: "good", months: "warn", "6+ months": "danger" } as const;

export default function Earn() {
  const { state, open, update } = useApp();
  const cf = cashFlow(state);
  const gap = Math.max(0, -cf.surplus);
  const p = state.profile;
  const [cat, setCat] = useState<Category | "best">("best");
  const ranked = useMemo(() => rankOpportunities(p, gap), [p, gap]);
  const list = cat === "best" ? ranked.slice(0, 8) : ranked.filter(m => m.opp.category === cat);
  const shortlisted = ranked.filter(m => p.shortlist.includes(m.opp.id));
  const toggleStar = (id: string) => update(s => ({ ...s, profile: { ...s.profile, shortlist: s.profile.shortlist.includes(id) ? s.profile.shortlist.filter(x => x !== id) : [...s.profile.shortlist, id] } }));
  const skillNames = p.skills.map(id => SKILL_TAGS.find(s => s.id === id)?.label).filter(Boolean);

  return (
    <Screen title="Earn more" subtitle="Matched to your skills, time and urgency">
      <div className="hero hero-calm">
        <div className="hero-top"><span>{gap > 0 ? "Monthly gap to close" : "No monthly gap"}</span><Pill tone={gap > 0 ? "danger" : "good"}>{gap > 0 ? "Earn or cut" : "Extra goes to debt"}</Pill></div>
        <div className="hero-amount">{inr(gap)}</div>
        <p className="hero-sub">{gap > 0 ? `≈ ${inr(gap / (p.hoursPerWeek * 4.3))}/hour at ${p.hoursPerWeek} hrs/week. Use this to judge each option.` : "Any extra income can shorten your debt-free date."}</p>
      </div>

      <Card onClick={() => open({ kind: "earn-profile" })}>
        <div className="profile-sum">
          <span className="action-icon brand"><Icon name="user" /></span>
          <div>
            <b>Your profile</b>
            <p>{skillNames.length ? skillNames.slice(0, 3).join(", ") + (skillNames.length > 3 ? ` +${skillNames.length - 3}` : "") : "Add your skills for better matches"} · {p.hoursPerWeek} hrs/week · {p.urgency === "this-month" ? "need money this month" : p.urgency === "3-months" ? "within 3 months" : "long term"}</p>
          </div>
          <Icon name="edit" size={18} />
        </div>
      </Card>

      {shortlisted.length > 0 && (
        <Section title="My plan" hint="Options you've saved. Start with one and give it 2 weeks.">
          {shortlisted.map(m => <OppCard key={m.opp.id} m={m} starred onStar={() => toggleStar(m.opp.id)} />)}
        </Section>
      )}

      <div className="filter-scroll" role="tablist" aria-label="Categories">
        <button type="button" className={"chip" + (cat === "best" ? " on" : "")} onClick={() => setCat("best")}><Icon name="star" size={16} />Best for you</button>
        {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => (
          <button key={c} type="button" className={"chip" + (cat === c ? " on" : "")} onClick={() => setCat(c)}><Icon name={CAT_ICON[c]} size={16} />{CATEGORY_LABEL[c]}</button>
        ))}
      </div>

      {list.map((m, i) => <OppCard key={m.opp.id} m={m} rank={cat === "best" ? i + 1 : undefined} starred={p.shortlist.includes(m.opp.id)} onStar={() => toggleStar(m.opp.id)} />)}
      <p className="note center">Lifeline earns nothing from these links. Earnings are indicative ranges, so check each platform's current terms. Never pay to get work.</p>
    </Screen>
  );
}

function OppCard({ m, rank, starred, onStar }: { m: Match; rank?: number; starred: boolean; onStar: () => void }) {
  const o = m.opp;
  return (
    <Card className="opp">
      <div className="opp-head">
        <span className="action-icon brand"><Icon name={CAT_ICON[o.category]} /></span>
        <div className="opp-title">
          {rank && rank <= 3 && <span className="rank">Top {rank}</span>}
          <h3>{o.title}</h3>
          <small>{CATEGORY_LABEL[o.category]} · {o.region === "IN" ? "India" : "Worldwide"}</small>
        </div>
        <button type="button" className={"icon-btn star" + (starred ? " on" : "")} aria-pressed={starred} aria-label={starred ? "Remove from my plan" : "Save to my plan"} onClick={onStar}><Icon name="star" /></button>
      </div>
      <p>{o.what}</p>
      <div className="opp-facts">
        <div><small>First income</small><Pill tone={SPEED_TONE[o.speed]}>{o.speed}</Pill></div>
        <div><small>Typical earning</small><b>{o.earning}</b></div>
        <div><small>Upfront cost</small><b>{o.investment === "none" ? "None" : o.investment === "low" ? "Low" : "Medium"}</b></div>
      </div>
      <p className="why"><Icon name="check" size={14} /> {m.why.join(" · ")}</p>
      <Disclosure summary={<span>Reality check and how to start</span>}>
        {o.needs && <p><b>You'll need:</b> {o.needs}</p>}
        <p className="reality">{o.reality}</p>
        <div className="btn-row wrap">{o.links.map(l => <LinkButton key={l.url} href={l.url}>{l.label}</LinkButton>)}</div>
      </Disclosure>
      {!starred && rank && rank <= 3 && <Button size="sm" icon="star" onClick={onStar}>Add to my plan</Button>}
    </Card>
  );
}
