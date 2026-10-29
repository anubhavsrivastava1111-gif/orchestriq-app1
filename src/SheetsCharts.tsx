import React, { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { chartOption, type ChartData, type ChartType } from "./lib/SheetsSmart";

// Professional charts (Apache ECharts, Apache-2.0), only the pieces we use, loaded with Sheets.
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

function themeColors() { const cs = getComputedStyle(document.documentElement); const g = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return { text: g("--oiq-ink", "#1f2937"), muted: g("--oiq-muted", "#64748b"), grid: "rgba(100,116,139,0.20)" }; }

export function EChart({ data, type, height = 280, onPick, testid }: { data: ChartData; type: ChartType; height?: number; onPick?: (key: string) => void; testid?: string }) {
  const ref = useRef<HTMLDivElement>(null); const inst = useRef<any>(null);
  useEffect(() => { if (!ref.current) return; const c = echarts.init(ref.current, undefined, { renderer: "canvas" }); inst.current = c;
    const ro = new ResizeObserver(() => { try { c.resize(); } catch {} }); ro.observe(ref.current);
    return () => { ro.disconnect(); try { c.dispose(); } catch {} inst.current = null; }; }, []);
  useEffect(() => { const c = inst.current; if (!c) return; c.setOption(chartOption(data, type, themeColors()), true); c.off("click"); if (onPick) c.on("click", (p: any) => { if (p?.name && p.name !== "Others" && !String(p.name).startsWith("Others (")) onPick(String(p.name)); }); }, [data, type, onPick]);
  return <div ref={ref} data-testid={testid || "echart"} data-chart-type={type} style={{ width: "100%", height }} />;
}

// Render a chart off-screen to a PNG (used for PDF reports). White background, no animation.
export async function chartPng(data: ChartData, type: ChartType, w = 900, h = 380): Promise<string> {
  const div = document.createElement("div"); div.style.cssText = "position:fixed;left:-10000px;top:0;width:" + w + "px;height:" + h + "px;"; document.body.appendChild(div);
  try { const c = echarts.init(div, undefined, { renderer: "canvas", width: w, height: h });
    c.setOption(chartOption(data, type, { text: "#1f2937", muted: "#475569", grid: "rgba(100,116,139,0.25)", animate: false, forExport: true }), true);
    const url = c.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" }); c.dispose(); return url; }
  finally { div.remove(); }
}
