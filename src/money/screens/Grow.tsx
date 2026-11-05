// Grow — goals, investments, research and extra income in one place.
import { useApp } from "../context";
import { Screen, Segmented } from "../components";
import Goals from "./Goals";
import Invest from "./Invest";
import Research from "./Research";
import { EarnContent } from "./Earn";

type Sub = "goals" | "invest" | "research" | "earn";
const SUBS: Sub[] = ["goals", "invest", "research", "earn"];

export default function Grow() {
  const { sub, go } = useApp();
  const view: Sub = SUBS.includes(sub as Sub) ? (sub as Sub) : "goals";
  return (
    <Screen title="Grow" subtitle="Reach goals, grow savings and earn more">
      <Segmented label="Grow view" value={view} onChange={v => go("earn", v)} options={[
        { value: "goals", label: "Goals" }, { value: "invest", label: "Invest" }, { value: "research", label: "Research" }, { value: "earn", label: "Earn" },
      ]} />
      {view === "goals" && <Goals />}
      {view === "invest" && <Invest />}
      {view === "research" && <Research />}
      {view === "earn" && <EarnContent />}
    </Screen>
  );
}
