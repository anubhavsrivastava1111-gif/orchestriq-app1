import { supabase } from './supabase';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface Executive {
  executive_id: string;
  name: string;
  role: string;
  tier: string;
  department: string;
  mission: string;
  education: string;
  certifications: string;
  years_experience: string;
  regions: string;
  industries: string;
  leadership_style: string;
  communication_style: string;
  decision_framework: string;
  economic_philosophy: string;
  core_traits: string;
  primary_responsibilities: string;
  strategic_skills: string;
  technical_skills: string;
  risk_expertise: string;
  cost_optimization_focus: string;
  response_framework: string;
  known_for: string;
  success_metrics: string;
  mentorship_level: string;
  ai_reasoning_model: string;
  superpower: string;
  location: string;
  performance_standard: string;
  internet_access: boolean;
  is_active: boolean;
  bio: string;
}

// ─── FETCH ALL ACTIVE EXECUTIVES ─────────────────────────────────────────────

export async function fetchExecutives(): Promise<Executive[]> {
  const { data, error } = await supabase
    .from('executives')
    .select('*')
    .eq('is_active', true)
    .order('tier', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('fetchExecutives error:', error.message);
    throw new Error('Failed to load executives: ' + error.message);
  }

  return data || [];
}

// ─── FETCH SINGLE EXECUTIVE BY ID ────────────────────────────────────────────

export async function fetchExecutiveById(
  executive_id: string
): Promise<Executive | null> {
  const { data, error } = await supabase
    .from('executives')
    .select('*')
    .eq('executive_id', executive_id)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('fetchExecutiveById error:', error.message);
    return null;
  }

  return data;
}

// ─── FETCH EXECUTIVES BY DEPARTMENT ──────────────────────────────────────────

export async function fetchExecutivesByDepartment(
  department: string
): Promise<Executive[]> {
  const { data, error } = await supabase
    .from('executives')
    .select('*')
    .eq('department', department)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('fetchExecutivesByDepartment error:', error.message);
    throw new Error('Failed to load executives: ' + error.message);
  }

  return data || [];
}

// ─── FETCH BOARD TIER ONLY (for Boardroom feature) ───────────────────────────

export async function fetchBoardExecutives(): Promise<Executive[]> {
  const { data, error } = await supabase
    .from('executives')
    .select('*')
    .eq('tier', 'Board')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('fetchBoardExecutives error:', error.message);
    throw new Error('Failed to load board executives: ' + error.message);
  }

  return data || [];
}

// ─── BUILD AI SYSTEM PROMPT FROM EXECUTIVE DATA ──────────────────────────────
// This replaces the hardcoded EP object in App.tsx with live Supabase data

export function buildExecutiveSystemPrompt(
  exec: Executive,
  companyName: string,
  companyContext: string
): string {
  return `You are ${exec.name}, ${exec.role} at "${companyName}".

PROFILE:
${exec.bio}

EDUCATION: ${exec.education}
CERTIFICATIONS: ${exec.certifications}
EXPERIENCE: ${exec.years_experience} years across ${exec.regions}
INDUSTRIES: ${exec.industries}

YOUR MISSION: ${exec.mission}

LEADERSHIP STYLE: ${exec.leadership_style}
COMMUNICATION STYLE: ${exec.communication_style}
DECISION FRAMEWORK: ${exec.decision_framework}
ECONOMIC PHILOSOPHY: ${exec.economic_philosophy}

CORE TRAITS: ${exec.core_traits}
SUPERPOWER: ${exec.superpower}
KNOWN FOR: ${exec.known_for}

PRIMARY RESPONSIBILITIES: ${exec.primary_responsibilities}
STRATEGIC SKILLS: ${exec.strategic_skills}
TECHNICAL SKILLS: ${exec.technical_skills}
RISK EXPERTISE: ${exec.risk_expertise}

RESPONSE FRAMEWORK: ${exec.response_framework}
SUCCESS METRICS: ${exec.success_metrics}
PERFORMANCE STANDARD: ${exec.performance_standard}

COMPANY CONTEXT:
${companyContext}

MANDATE: Respond as ${exec.name} with the full depth of your ${exec.years_experience} years of experience. Be specific, quantified, and actionable. Use your response framework for every answer.`;
}

// ─── CACHE LAYER (prevents repeated Supabase calls) ──────────────────────────

let executivesCache: Executive[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getExecutivesCached(): Promise<Executive[]> {
  const now = Date.now();
  if (executivesCache && now - cacheTimestamp < CACHE_TTL) {
    return executivesCache;
  }
  executivesCache = await fetchExecutives();
  cacheTimestamp = now;
  return executivesCache;
}

export function clearExecutivesCache(): void {
  executivesCache = null;
  cacheTimestamp = 0;
}
