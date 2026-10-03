import { HttpError } from '../errors/http-error';

const DEFAULT_MODEL_ID = 'hard-hat-universe-0dy7t/26';
const MAX_IMAGE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

type Prediction = {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type InferenceResult = {
  predictions: Prediction[];
  image: { width: number; height: number };
  personCount: number;
  equipment: { person: boolean; helmet: boolean; vest: boolean };
  equipmentConfidences: { helmet: number | null; vest: number | null };
  confidenceThreshold: number;
};

function readImageDataUri(image: string): string {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[2].length % 4 !== 0) {
    throw new HttpError(400, 'INVALID_IMAGE', 'Image must be a valid base64 JPEG, PNG, or WebP data URI');
  }

  const decoded = Buffer.from(match[2], 'base64');
  const validSignature = match[1] === 'image/jpeg'
    ? decoded.length >= 3 && decoded[0] === 0xff && decoded[1] === 0xd8 && decoded[2] === 0xff
    : match[1] === 'image/png'
      ? decoded.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : decoded.length >= 12 && decoded.toString('ascii', 0, 4) === 'RIFF' && decoded.toString('ascii', 8, 12) === 'WEBP';

  if (!validSignature || decoded.length > MAX_IMAGE_BYTES || decoded.toString('base64') !== match[2]) {
    throw new HttpError(400, 'INVALID_IMAGE', 'Image must not exceed 1 MB and must contain valid base64 data');
  }

  return match[2];
}

function getConfiguration(): { apiKey: string; modelId: string; threshold: number } {
  const apiKey = process.env.ROBOFLOW_API_KEY?.trim();
  const modelId = process.env.ROBOFLOW_MODEL_ID?.trim() || DEFAULT_MODEL_ID;
  const thresholdValue = process.env.ROBOFLOW_CONFIDENCE_THRESHOLD;
  const threshold = thresholdValue === undefined ? 0.7 : Number(thresholdValue);

  if (!apiKey || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new HttpError(503, 'INFERENCE_UNAVAILABLE', 'Inference is not configured');
  }

  const modelParts = modelId.split('/');
  if (modelParts.length !== 2 || modelParts.some((part) => part.length === 0)) {
    throw new HttpError(503, 'INFERENCE_UNAVAILABLE', 'Inference is not configured');
  }

  return { apiKey, modelId, threshold };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizePredictions(value: unknown, imageWidth: number, imageHeight: number): Prediction[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): Prediction[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const className = typeof candidate.class === 'string' ? candidate.class.trim() : '';
    const confidence = finiteNumber(candidate.confidence);
    const x = finiteNumber(candidate.x);
    const y = finiteNumber(candidate.y);
    const width = finiteNumber(candidate.width);
    const height = finiteNumber(candidate.height);

    if (!className || confidence === undefined || confidence < 0 || confidence > 1
      || x === undefined || y === undefined || width === undefined || height === undefined || width <= 0 || height <= 0) {
      return [];
    }

    const left = Math.max(0, x - width / 2);
    const top = Math.max(0, y - height / 2);
    const right = Math.min(imageWidth, x + width / 2);
    const bottom = Math.min(imageHeight, y + height / 2);
    if (right <= left || bottom <= top) return [];

    return [{ class: className, confidence, x: left, y: top, width: right - left, height: bottom - top }];
  });
}

function normalizeClass(className: string): string {
  return className.toLowerCase().replace(/[\s_-]+/g, '');
}

export async function inferImage(image: string): Promise<InferenceResult> {
  const base64Image = readImageDataUri(image);
  const { apiKey, modelId, threshold } = getConfiguration();
  const [project, version] = modelId.split('/');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`https://serverless.roboflow.com/${encodeURIComponent(project)}/${encodeURIComponent(version)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: base64Image,
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new HttpError(502, 'ROBOFLOW_AUTH_ERROR', 'Roboflow rechazó la clave. Verifica ROBOFLOW_API_KEY en backend/.env.');
      }
      if (response.status === 404) {
        throw new HttpError(502, 'ROBOFLOW_MODEL_NOT_FOUND', 'Roboflow no encontró el modelo. Verifica ROBOFLOW_MODEL_ID.');
      }
      if (response.status === 429) {
        throw new HttpError(502, 'ROBOFLOW_RATE_LIMIT', 'Roboflow alcanzó el límite de solicitudes. Espera un momento e inténtalo de nuevo.');
      }
      throw new HttpError(502, 'INFERENCE_PROVIDER_ERROR', `Roboflow respondió con HTTP ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HttpError(502, 'INVALID_INFERENCE_RESPONSE', 'Image inference provider returned an invalid response');
    }

    if (!payload || typeof payload !== 'object') {
      throw new HttpError(502, 'INVALID_INFERENCE_RESPONSE', 'Image inference provider returned an invalid response');
    }

    const result = payload as Record<string, unknown>;
    const imageInfo = result.image && typeof result.image === 'object'
      ? result.image as Record<string, unknown>
      : {};
    const imageWidth = finiteNumber(imageInfo.width);
    const imageHeight = finiteNumber(imageInfo.height);
    if (imageWidth === undefined || imageHeight === undefined || imageWidth <= 0 || imageHeight <= 0) {
      throw new HttpError(502, 'INVALID_INFERENCE_RESPONSE', 'Image inference provider returned an invalid response');
    }
    const predictions = normalizePredictions(result.predictions, imageWidth, imageHeight);
    const qualifyingPredictions = predictions.filter((prediction) => prediction.confidence >= threshold);
    const classes = qualifyingPredictions.map((prediction) => normalizeClass(prediction.class));
    const confidenceFor = (classes: string[]): number | null => {
      const matching = predictions
        .filter((prediction) => classes.includes(normalizeClass(prediction.class)))
        .map((prediction) => prediction.confidence);
      return matching.length > 0 ? Math.max(...matching) : null;
    };

    return {
      predictions,
      image: { width: imageWidth, height: imageHeight },
      personCount: classes.filter((className) => className === 'person').length,
      equipment: {
        person: classes.includes('person'),
        helmet: classes.some((className) => ['helmet', 'hardhat'].includes(className)),
        vest: classes.some((className) => ['vest', 'safetyvest'].includes(className))
      },
      equipmentConfidences: {
        helmet: confidenceFor(['helmet', 'hardhat']),
        vest: confidenceFor(['vest', 'safetyvest'])
      },
      confidenceThreshold: threshold
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (controller.signal.aborted) {
      throw new HttpError(504, 'INFERENCE_TIMEOUT', 'Image inference timed out');
    }
    throw new HttpError(502, 'INFERENCE_PROVIDER_ERROR', 'Image inference provider is unavailable');
  } finally {
    clearTimeout(timeout);
  }
}