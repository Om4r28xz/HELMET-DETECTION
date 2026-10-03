import { AccessDecision, MissingEquipment } from '../models/access-session';

export interface TerminalLogInput {
  sessionId: string;
  workerId: string;
  result: AccessDecision;
  helmet: boolean;
  vest: boolean;
  helmetConfidence: number | null;
  vestConfidence: number | null;
  denialReason: string | null;
}

export interface TerminalIncidentInput {
  sessionId: string;
  workerId: string;
  missingEquipment: MissingEquipment[];
  denialReason: string;
}

export interface TerminalRecord {
  id: string;
}

export interface FinalizationStore {
  findAccessLog(sessionId: string): Promise<TerminalRecord | null>;
  createAccessLog(input: TerminalLogInput): Promise<TerminalRecord>;
  createIncident(input: TerminalIncidentInput): Promise<void>;
  completeSession(input: { decision: AccessDecision; denialReason: string | null; endedAt: Date }): Promise<void>;
}

export async function persistTerminalDecision(
  input: TerminalLogInput & { missingEquipment: MissingEquipment[] },
  store: FinalizationStore,
  endedAt = new Date()
): Promise<TerminalRecord> {
  const existing = await store.findAccessLog(input.sessionId);
  if (existing) return existing;

  const { missingEquipment, ...logInput } = input;
  const accessLog = await store.createAccessLog(logInput);
  if (input.result === 'denied') {
    await store.createIncident({
      sessionId: input.sessionId,
      workerId: input.workerId,
      missingEquipment,
      denialReason: input.denialReason ?? ''
    });
  }
  await store.completeSession({ decision: input.result, denialReason: input.denialReason, endedAt });
  return accessLog;
}