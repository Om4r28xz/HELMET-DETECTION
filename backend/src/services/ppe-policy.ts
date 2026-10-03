import { HttpError } from '../errors/http-error';
import { MissingEquipment } from '../models/access-session';

export type PpeDecision = 'granted' | 'denied';

export interface PpePolicyConfig {
  allowConsecutiveFrames: number;
  denialGraceMs: number;
}

export interface PpePolicyState {
  stableFrames: number;
  missingEquipment: MissingEquipment[];
  missingEquipmentSince: number | null;
}

export interface PpeFrame {
  personCount: number;
  helmet: boolean;
  vest: boolean;
}

export interface PpePolicyResult extends PpePolicyState {
  decision: PpeDecision | null;
  denialReason: string | null;
}

function readInteger(value: string | undefined, fallback: number, minimum: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new HttpError(500, 'INVALID_PPE_POLICY_CONFIG', `${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}

export function getPpePolicyConfig(env: NodeJS.ProcessEnv = process.env): PpePolicyConfig {
  return {
    allowConsecutiveFrames: readInteger(env.PPE_ALLOW_CONSECUTIVE_FRAMES, 5, 1, 'PPE_ALLOW_CONSECUTIVE_FRAMES'),
    denialGraceMs: readInteger(env.PPE_DENIAL_GRACE_MS, 10_000, 0, 'PPE_DENIAL_GRACE_MS')
  };
}

export function evaluatePpeFrame(
  state: PpePolicyState,
  frame: PpeFrame,
  now: number,
  config: PpePolicyConfig
): PpePolicyResult {
  if (frame.personCount !== 1) {
    return { stableFrames: 0, missingEquipment: [], missingEquipmentSince: null, decision: null, denialReason: null };
  }

  const missingEquipment: MissingEquipment[] = [];
  if (!frame.helmet) missingEquipment.push('helmet');
  if (!frame.vest) missingEquipment.push('vest');

  if (missingEquipment.length === 0) {
    const stableFrames = state.stableFrames + 1;
    return {
      stableFrames,
      missingEquipment: [],
      missingEquipmentSince: null,
      decision: stableFrames >= config.allowConsecutiveFrames ? 'granted' : null,
      denialReason: null
    };
  }

  const sameMissingEquipment = state.missingEquipment.length === missingEquipment.length
    && state.missingEquipment.every((item) => missingEquipment.includes(item));
  const missingEquipmentSince = sameMissingEquipment ? state.missingEquipmentSince ?? now : now;
  const denied = now - missingEquipmentSince >= config.denialGraceMs;
  return {
    stableFrames: 0,
    missingEquipment,
    missingEquipmentSince,
    decision: denied ? 'denied' : null,
    denialReason: denied ? missingEquipment.map((item) => `missing_${item}`).join(',') : null
  };
}