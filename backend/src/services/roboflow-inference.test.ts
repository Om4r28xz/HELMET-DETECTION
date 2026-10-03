import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePredictions } from './roboflow-inference';

test('converts Roboflow center coordinates to top-left coordinates', () => {
  const [prediction] = normalizePredictions([
    { class: 'helmet', confidence: 0.94, x: 50, y: 40, width: 20, height: 10 }
  ], 100, 80);

  assert.deepEqual(prediction, {
    class: 'helmet', confidence: 0.94, x: 40, y: 35, width: 20, height: 10
  });
});

test('clips partially out-of-frame boxes and ignores boxes outside the image', () => {
  const predictions = normalizePredictions([
    { class: 'person', confidence: 0.9, x: 2, y: 2, width: 10, height: 8 },
    { class: 'vest', confidence: 0.8, x: 120, y: 20, width: 10, height: 10 }
  ], 100, 80);

  assert.deepEqual(predictions, [
    { class: 'person', confidence: 0.9, x: 0, y: 0, width: 7, height: 6 }
  ]);
});