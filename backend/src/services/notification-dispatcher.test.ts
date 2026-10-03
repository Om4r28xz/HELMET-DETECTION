import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDenialMessage } from './notification-dispatcher';

test('WhatsApp denial text clearly says the worker has no helmet', () => {
  const message = buildDenialMessage({
    workerId: 'worker-1',
    workerName: 'Demo Worker',
    workerIdentifier: 'DEMO-WORKER-001',
    missingEquipment: ['helmet'],
    sessionId: '12345678-1234-1234-1234-123456789012'
  });

  assert.match(message.body, /El trabajador no trae casco/);
  assert.match(message.body, /DEMO-WORKER-001/);
  assert.match(message.body, /casco/);
});