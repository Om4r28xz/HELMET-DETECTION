import assert from 'node:assert/strict';
import test from 'node:test';
import { persistTerminalDecision, TerminalLogInput } from './access-session-finalization';
import { evaluatePpeFrame, PpePolicyConfig, PpePolicyState } from './ppe-policy';

const config: PpePolicyConfig = { allowConsecutiveFrames: 5, denialGraceMs: 10_000 };
const initialState: PpePolicyState = { stableFrames: 0, missingEquipment: [], missingEquipmentSince: null };

test('grants only after five consecutive valid single-person frames', () => {
  let state = initialState;
  for (let frame = 1; frame <= 4; frame += 1) {
    const result = evaluatePpeFrame(state, { personCount: 1, helmet: true, vest: true }, frame * 100, config);
    assert.equal(result.decision, null);
    assert.equal(result.stableFrames, frame);
    state = result;
  }

  const result = evaluatePpeFrame(state, { personCount: 1, helmet: true, vest: true }, 500, config);
  assert.equal(result.decision, 'granted');
  assert.equal(result.stableFrames, 5);
});

test('denies sustained missing equipment after the configured grace period', () => {
  const first = evaluatePpeFrame(initialState, { personCount: 1, helmet: false, vest: true }, 1_000, config);
  assert.equal(first.decision, null);
  const last = evaluatePpeFrame(first, { personCount: 1, helmet: false, vest: true }, 11_000, config);
  assert.equal(last.decision, 'denied');
  assert.equal(last.denialReason, 'missing_helmet');
  assert.deepEqual(last.missingEquipment, ['helmet']);
});

test('resets valid frames and missing-equipment time when nobody or multiple people are present', () => {
  const partlyValid = evaluatePpeFrame(
    { stableFrames: 3, missingEquipment: [], missingEquipmentSince: null },
    { personCount: 1, helmet: false, vest: true },
    2_000,
    config
  );
  const noPerson = evaluatePpeFrame(partlyValid, { personCount: 0, helmet: false, vest: false }, 11_000, config);
  assert.equal(noPerson.decision, null);
  assert.equal(noPerson.stableFrames, 0);
  assert.equal(noPerson.missingEquipmentSince, null);
  assert.deepEqual(noPerson.missingEquipment, []);

  const multiplePeople = evaluatePpeFrame(
    { stableFrames: 4, missingEquipment: [], missingEquipmentSince: null },
    { personCount: 2, helmet: true, vest: true },
    12_000,
    config
  );
  assert.equal(multiplePeople.decision, null);
  assert.equal(multiplePeople.stableFrames, 0);
});

test('persists one terminal log and one denial incident when finalization is retried', async () => {
  const logs: Array<TerminalLogInput & { id: string }> = [];
  const incidents: string[] = [];
  let completionCount = 0;
  const store = {
    async findAccessLog(sessionId: string) {
      return logs.find((log) => log.sessionId === sessionId) ?? null;
    },
    async createAccessLog(input: TerminalLogInput) {
      const log = { ...input, id: `log-${logs.length + 1}` };
      logs.push(log);
      return log;
    },
    async createIncident(input: { sessionId: string }) {
      incidents.push(input.sessionId);
    },
    async completeSession() {
      completionCount += 1;
    }
  };
  const input = {
    sessionId: 'session-1',
    workerId: 'worker-1',
    result: 'denied' as const,
    helmet: false,
    vest: true,
    helmetConfidence: 0.42,
    vestConfidence: 0.91,
    denialReason: 'missing_helmet',
    missingEquipment: ['helmet' as const]
  };

  const first = await persistTerminalDecision(input, store);
  const repeated = await persistTerminalDecision(input, store);
  assert.equal(first.id, repeated.id);
  assert.equal(logs.length, 1);
  assert.deepEqual(incidents, ['session-1']);
  assert.equal(completionCount, 1);
});