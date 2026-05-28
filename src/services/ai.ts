/**
 * Ask-AI client. Calls /api/ai/chat on the Express server, which proxies to
 * Claude. Returns 503 if the server doesn't have ANTHROPIC_API_KEY configured.
 */

import { API_BASE_URL } from '../config';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiResponse {
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read?: number;
    cache_write?: number;
  };
}

const aiFetch = async <T,>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) msg = parsed.error;
    } catch {
      /* keep status */
    }
    const err = new Error(msg) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text) as T;
};

export const askAi = (messages: AiMessage[]) =>
  aiFetch<AiResponse>('/api/ai/chat', { messages });

/* ── Bank reconciliation tiers ────────────────────────────────────────── */

export interface ReconMatch {
  bankId: number;
  glIds: number[];
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ReconException {
  bankId?: number;
  glId?: number;
  kind: 'no_gl_match' | 'no_bank_match' | 'duplicate' | 'timing' | 'other';
  message: string;
}

export interface ReconResponse {
  matches: ReconMatch[];           // deterministic pre-pass (Tier 1 + 2)
  suggestions: ReconMatch[];       // AI-proposed
  exceptions: ReconException[];
  stats: {
    bankRows: number;
    glRows: number;
    matchedRows: number;
    suggestedRows: number;
    unmatchedBank: number;
    unmatchedGl: number;
  };
  iterations?: number;             // tier 2/3 only
}

export type ReconTier = 'tier1' | 'tier2' | 'tier3';

export const runRecon = (tier: ReconTier, monthEnd: string) =>
  aiFetch<ReconResponse>(`/api/ai/recon/${tier}`, { monthEnd });
