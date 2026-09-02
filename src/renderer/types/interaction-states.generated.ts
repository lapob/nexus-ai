/**
 * @module renderer/types/interaction-states.generated
 * @description Generated from config/nexus-interaction-states.json · 2bd84253e710af79. Do not edit.
 */
// #region 01 — Identità e stati
export const NEXUS_INTERACTION_CONTRACT_ID = "nexusnxs-interaction-state" as const;
export const NEXUS_COSMIC_CONTINUUM_ID = "nexus-cosmic-continuum-v1" as const;
export const NEXUS_INTERACTION_STATES = {
  "booting": {
    "color": "#527B80",
    "rgb": [
      82,
      123,
      128
    ],
    "energy": 0.08,
    "motion": "materialize"
  },
  "idle": {
    "color": "#3A9CA1",
    "rgb": [
      58,
      156,
      161
    ],
    "energy": 0.17,
    "motion": "breathe"
  },
  "listening": {
    "color": "#45C89D",
    "rgb": [
      69,
      200,
      157
    ],
    "energy": 0.42,
    "motion": "listen-wave"
  },
  "speaking": {
    "color": "#55DBE1",
    "rgb": [
      85,
      219,
      225
    ],
    "energy": 0.76,
    "motion": "voice-pulse"
  },
  "thinking": {
    "color": "#668FBD",
    "rgb": [
      102,
      143,
      189
    ],
    "energy": 0.58,
    "motion": "reason-orbit"
  },
  "responding": {
    "color": "#8FD6E5",
    "rgb": [
      143,
      214,
      229
    ],
    "energy": 0.68,
    "motion": "stream"
  },
  "executing": {
    "color": "#BD9F4F",
    "rgb": [
      189,
      159,
      79
    ],
    "energy": 0.76,
    "motion": "execute-scan"
  },
  "permission": {
    "color": "#C59458",
    "rgb": [
      197,
      148,
      88
    ],
    "energy": 0.46,
    "motion": "consent-hold"
  },
  "offline": {
    "color": "#53686A",
    "rgb": [
      83,
      104,
      106
    ],
    "energy": 0.04,
    "motion": "quiet",
    "inputPolicy": "blocked-until-online",
    "allowedActions": [
      "retry-connection",
      "read-status"
    ]
  },
  "error": {
    "color": "#D69A58",
    "rgb": [
      214,
      154,
      88
    ],
    "energy": 0.42,
    "motion": "amber-contract"
  }
} as const;
// #endregion

// #region 02 — Alias e risoluzione
export const NEXUS_INTERACTION_ALIASES = {
  "connecting": "booting",
  "understanding": "thinking",
  "planning": "thinking",
  "research": "thinking",
  "researching": "thinking",
  "searching": "thinking",
  "reasoning": "thinking",
  "verifying": "thinking",
  "validating": "thinking",
  "ready": "listening",
  "consent": "permission",
  "failed": "error"
} as const;
export type NexusInteractionState = keyof typeof NEXUS_INTERACTION_STATES;
export function resolveNexusInteractionState(value: string): NexusInteractionState {
  const key = String(value || '').trim().toLowerCase();
  if (key in NEXUS_INTERACTION_STATES) return key as NexusInteractionState;
  return (NEXUS_INTERACTION_ALIASES as Record<string, NexusInteractionState>)[key] || 'idle';
}
// #endregion
