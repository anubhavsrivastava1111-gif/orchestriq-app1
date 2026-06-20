import React from 'react';
import type { ImpactLevel } from '../../types/news';

const CONFIG: Record<ImpactLevel, { label: string; cls: string; dot: string }> = {
  critical: { label: 'CRITICAL', cls: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-400' },
  high:     { label: 'HIGH',     cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30', dot: 'bg-orange-400' },
  medium:   { label: 'MEDIUM',   cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
  low:      { label: 'LOW',      cls: 'bg-green-500/20 text-green-400 border-green-500/30', dot: 'bg-green-400' },
};

interface Props {
  impact: ImpactLevel;
  size?: 'sm' | 'md';
}

export function ImpactBadge({ impact, size = 'sm' }: Props) {
  const c = CONFIG[impact];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wider ${c.cls} ${size === 'md' ? 'px-2 py-1 text-xs' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${impact === 'critical' ? 'animate-pulse' : ''}`} />
      {c.label}
    </span>
  );
}
