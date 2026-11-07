// A realistic credit-card picture: bank colours, chip, network, last 4 digits.
import type { ReactNode } from "react";
import type { CardNetwork, CreditCard } from "./types";

const BANK_THEME: Record<string, string> = {
  HDFC: "t-navy", SBI: "t-sky", ICICI: "t-rust", Axis: "t-wine", Kotak: "t-red", "IDFC FIRST": "t-maroon",
  "Yes Bank": "t-blue", PNB: "t-gold", "Bank of Baroda": "t-orange", Canara: "t-teal", "Union Bank": "t-indigo",
  AU: "t-plum", RBL: "t-steel", OneCard: "t-black", Amex: "t-steel", Standard: "t-green",
};
const THEMES = ["t-navy", "t-plum", "t-teal", "t-black", "t-wine", "t-steel"];

function cardTheme(card: Pick<CreditCard, "bank" | "id">): string {
  const key = Object.keys(BANK_THEME).find(k => card.bank.toLowerCase().startsWith(k.toLowerCase()));
  if (key) return BANK_THEME[key];
  let h = 0; for (const ch of card.id || card.bank) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return THEMES[h % THEMES.length];
}


function NetworkMark({ network }: { network?: CardNetwork }) {
  if (network === "mastercard") return <span className="cf-net mc" aria-label="Mastercard"><i /><i /></span>;
  if (!network) return null;
  return <span className={"cf-net txt " + network}>{network === "visa" ? "VISA" : network === "rupay" ? "RuPay" : network === "amex" ? "AMEX" : "Diners"}</span>;
}

export function CardFace({ card, badge, small }: { card: Pick<CreditCard, "bank" | "name" | "id" | "last4" | "network">; badge?: ReactNode; small?: boolean }) {
  return (
    <div className={"cf " + cardTheme(card) + (small ? " small" : "")}>
      <div className="cf-top"><span className="cf-bank">{card.bank || "Credit card"}</span>{badge}</div>
      <span className="cf-chip" aria-hidden />
      <div className="cf-num" aria-label={card.last4 ? `Card ending ${card.last4}` : undefined}>•••• •••• •••• {card.last4 || "····"}</div>
      <div className="cf-bottom"><span className="cf-name">{card.name || "Your card"}</span><NetworkMark network={card.network} /></div>
    </div>
  );
}
