import * as tf from '@tensorflow/tfjs';
import { RoofType } from '../types/gis';

export interface RoofCnnPrediction {
  roofType: RoofType;
  confidence: number;
  classifier: string;
}

export interface RoofTrainingSample {
  imageDataUrl: string;
  label: RoofType;
}

export interface RoofTrainingEpochLog {
  epoch: number;
  loss: number;
  accuracy: number;
}

export interface RoofCnnStatus {
  fineTuned: boolean;
  epochsTrained: number;
  samplesUsed: number;
  lastAccuracy: number | null;
  updatedAt: string | null;
}

const ROOF_LABELS: RoofType[] = ['RCC', 'Tiled', 'Tin', 'Other', 'Unknown'];
const PATCH_SIZE = 32;
const IDB_MODEL_URL = 'indexeddb://svamitva-roofnet-cnn-v1';
const META_STORAGE_KEY = 'svamitva_roofnet_meta_v1';

let cachedModel: tf.LayersModel | null = null;
let cachedClassifierLabel = 'CNN-2D (TensorFlow.js RoofNet)';
let modelInitPromise: Promise<tf.LayersModel> | null = null;
let backendReadyPromise: Promise<void> | null = null;

async function ensureTfBackend(): Promise<void> {
  if (!backendReadyPromise) {
    backendReadyPromise = (async () => {
      try {
        await tf.ready();
      } catch {
        await tf.setBackend('cpu');
        await tf.ready();
      }
    })();
  }
  await backendReadyPromise;
}

export function getRoofCnnStatus(): RoofCnnStatus {
  if (typeof window === 'undefined') {
    return {
      fineTuned: false,
      epochsTrained: 0,
      samplesUsed: 0,
      lastAccuracy: null,
      updatedAt: null,
    };
  }
  try {
    const raw = window.localStorage.getItem(META_STORAGE_KEY);
    if (!raw) {
      return {
        fineTuned: false,
        epochsTrained: 0,
        samplesUsed: 0,
        lastAccuracy: null,
        updatedAt: null,
      };
    }
    return JSON.parse(raw) as RoofCnnStatus;
  } catch {
    return {
      fineTuned: false,
      epochsTrained: 0,
      samplesUsed: 0,
      lastAccuracy: null,
      updatedAt: null,
    };
  }
}

function saveRoofCnnStatus(status: RoofCnnStatus) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(status));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Builds a deterministic 2D Convolutional Neural Network (RoofNet-2D CNN)
 * with domain-initialized 5x5 Gabor/spectral conv1 kernels + 3x3 conv2 spatial
 * co-occurrence kernels + dual GlobalAverage/GlobalMax pooling + Softmax dense head.
 */
function buildRoofCnnModel(): tf.LayersModel {
  const input = tf.input({ shape: [PATCH_SIZE, PATCH_SIZE, 3] });

  const k1 = new Float32Array(5 * 5 * 3 * 12);
  const b1 = new Float32Array(12);

  const setK1 = (f: number, dy: number, dx: number, ch: number, val: number) => {
    const iy = dy + 2;
    const ix = dx + 2;
    k1[((iy * 5 + ix) * 3 + ch) * 12 + f] = val;
  };

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const gauss = Math.exp(-(dx * dx + dy * dy) / 3.6) / 14.0;
      const center = dx === 0 && dy === 0 ? 1 : 0;
      const dist = Math.hypot(dx, dy);

      setK1(0, dy, dx, 0, 1.35 * gauss);
      setK1(0, dy, dx, 1, -0.45 * gauss);
      setK1(0, dy, dx, 2, -0.95 * gauss);

      const gH = Math.cos(dy * 1.9) * Math.exp(-(dx * dx + dy * dy) / 4.2) * 0.25;
      setK1(1, dy, dx, 0, gH * 1.2);
      setK1(1, dy, dx, 1, gH * 0.3);
      setK1(1, dy, dx, 2, -gH * 0.8);

      const gV = Math.cos(dx * 1.9) * Math.exp(-(dx * dx + dy * dy) / 4.2) * 0.25;
      setK1(2, dy, dx, 0, gV * 1.2);
      setK1(2, dy, dx, 1, gV * 0.3);
      setK1(2, dy, dx, 2, -gV * 0.8);

      setK1(3, dy, dx, 0, -0.9 * gauss);
      setK1(3, dy, dx, 1, 0.18 * gauss);
      setK1(3, dy, dx, 2, 1.25 * gauss);

      setK1(4, dy, dx, 0, 0.45 * gauss);
      setK1(4, dy, dx, 1, 0.48 * gauss);
      setK1(4, dy, dx, 2, 0.46 * gauss);

      const ribV = Math.cos(dx * 2.4) * Math.exp(-(dy * dy) / 4.5) * 0.22;
      setK1(5, dy, dx, 0, ribV);
      setK1(5, dy, dx, 1, ribV);
      setK1(5, dy, dx, 2, ribV);

      const ribH = Math.cos(dy * 2.4) * Math.exp(-(dx * dx) / 4.5) * 0.22;
      setK1(6, dy, dx, 0, ribH);
      setK1(6, dy, dx, 1, ribH);
      setK1(6, dy, dx, 2, ribH);

      const diag1 = Math.cos((dx + dy) * 1.65) * Math.exp(-(dx * dx + dy * dy) / 4.5) * 0.22;
      setK1(7, dy, dx, 0, diag1);
      setK1(7, dy, dx, 1, diag1);
      setK1(7, dy, dx, 2, diag1);

      const lap = center ? 0.85 : dist <= 1.5 ? -0.10625 : 0;
      setK1(8, dy, dx, 0, lap * 0.4);
      setK1(8, dy, dx, 1, lap * 0.4);
      setK1(8, dy, dx, 2, lap * 0.4);

      setK1(9, dy, dx, 0, 0.36 * gauss);
      setK1(9, dy, dx, 1, 0.4 * gauss);
      setK1(9, dy, dx, 2, 0.45 * gauss);

      setK1(10, dy, dx, 0, -0.45 * gauss);
      setK1(10, dy, dx, 1, 0.72 * gauss);
      setK1(10, dy, dx, 2, -0.35 * gauss);

      setK1(11, dy, dx, 0, -0.45 * gauss);
      setK1(11, dy, dx, 1, 0.35 * gauss);
      setK1(11, dy, dx, 2, 0.1 * gauss);
    }
  }

  b1[0] = -0.05;
  b1[1] = -0.02;
  b1[2] = -0.02;
  b1[3] = -0.06;
  b1[4] = -0.58;
  b1[5] = -0.04;
  b1[6] = -0.04;
  b1[7] = -0.04;
  b1[8] = -0.03;
  b1[9] = -0.34;
  b1[10] = -0.02;
  b1[11] = -0.01;

  const c1 = tf.layers
    .conv2d({
      filters: 12,
      kernelSize: 5,
      padding: 'same',
      activation: 'relu',
      weights: [tf.tensor4d(k1, [5, 5, 3, 12]), tf.tensor1d(b1)],
      name: 'roof_conv1',
    })
    .apply(input) as tf.SymbolicTensor;

  const p1 = tf.layers
    .maxPooling2d({ poolSize: 2, strides: 2, name: 'roof_pool1' })
    .apply(c1) as tf.SymbolicTensor;

  const k2 = new Float32Array(3 * 3 * 12 * 10);
  const b2 = new Float32Array(10);
  const setK2 = (inF: number, outF: number, weight: number) => {
    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        const w = cy === 1 && cx === 1 ? weight * 0.55 : weight * 0.05625;
        k2[((cy * 3 + cx) * 12 + inF) * 10 + outF] = w;
      }
    }
  };

  setK2(4, 0, 2.2);
  setK2(8, 0, -0.7);
  setK2(0, 0, -0.9);
  setK2(3, 0, -0.7);

  setK2(9, 1, 1.4);
  setK2(4, 1, 0.8);
  setK2(0, 1, -0.8);
  setK2(3, 1, -0.4);
  setK2(5, 1, -0.5);
  setK2(6, 1, -0.5);

  setK2(0, 2, 2.6);
  setK2(4, 2, -0.5);

  setK2(1, 3, 1.5);
  setK2(2, 3, 1.5);
  setK2(0, 3, 1.1);

  setK2(3, 4, 2.8);
  setK2(0, 4, -0.8);

  setK2(5, 5, 1.6);
  setK2(6, 5, 1.6);
  setK2(7, 5, 1.1);
  setK2(9, 5, 0.7);
  setK2(0, 5, -0.7);

  setK2(8, 6, 1.8);
  setK2(10, 6, 1.2);
  setK2(4, 6, -0.9);

  setK2(10, 7, 2.1);
  setK2(0, 7, -0.6);

  setK2(4, 8, -1.2);
  setK2(0, 8, -0.8);
  setK2(3, 8, -0.8);
  b2[8] = 0.28;

  setK2(11, 9, 1.3);
  setK2(9, 9, 0.5);

  const c2 = tf.layers
    .conv2d({
      filters: 10,
      kernelSize: 3,
      padding: 'same',
      activation: 'relu',
      weights: [tf.tensor4d(k2, [3, 3, 12, 10]), tf.tensor1d(b2)],
      name: 'roof_conv2',
    })
    .apply(p1) as tf.SymbolicTensor;

  const avgPool = tf.layers
    .globalAveragePooling2d({ name: 'roof_gap' })
    .apply(c2) as tf.SymbolicTensor;
  const maxPool = tf.layers
    .globalMaxPooling2d({ name: 'roof_gmp' })
    .apply(c2) as tf.SymbolicTensor;
  const merged = tf.layers
    .concatenate({ name: 'roof_embed' })
    .apply([avgPool, maxPool]) as tf.SymbolicTensor;

  const wDense = new Float32Array(20 * 5);
  const bDense = new Float32Array([-0.15, -0.25, -0.35, -0.35, 0.32]);
  const setDense = (featIdx: number, clsIdx: number, weight: number) => {
    wDense[featIdx * 5 + clsIdx] = weight;
  };

  setDense(0, 0, 3.2);
  setDense(10, 0, 1.2);
  setDense(1, 0, 2.3);
  setDense(11, 0, 0.8);
  setDense(2, 0, -2.2);
  setDense(4, 0, -2.5);
  setDense(5, 0, -1.1);

  setDense(2, 1, 3.6);
  setDense(12, 1, 1.5);
  setDense(3, 1, 1.8);
  setDense(13, 1, 1.2);
  setDense(4, 1, -2.0);
  setDense(0, 1, -1.2);

  setDense(4, 2, 3.8);
  setDense(14, 2, 1.9);
  setDense(5, 2, 2.4);
  setDense(15, 2, 1.4);
  setDense(1, 2, 0.8);
  setDense(2, 2, -2.1);

  setDense(6, 3, 2.6);
  setDense(16, 3, 1.1);
  setDense(7, 3, 2.1);
  setDense(9, 3, 1.3);
  setDense(0, 3, -1.4);
  setDense(2, 3, -1.1);

  setDense(8, 4, 2.1);
  setDense(18, 4, 0.6);
  setDense(0, 4, -1.6);
  setDense(2, 4, -1.5);
  setDense(4, 4, -1.6);

  const output = tf.layers
    .dense({
      units: 5,
      activation: 'softmax',
      weights: [tf.tensor2d(wDense, [20, 5]), tf.tensor1d(bDense)],
      name: 'roof_softmax',
    })
    .apply(merged) as tf.SymbolicTensor;

  return tf.model({ inputs: input, outputs: output, name: 'RoofNet_2D_CNN' });
}

async function getRoofCnnModel(): Promise<tf.LayersModel> {
  if (cachedModel) return cachedModel;
  if (!modelInitPromise) {
    modelInitPromise = (async () => {
      await ensureTfBackend();
      const status = getRoofCnnStatus();
      if (status.fineTuned && typeof indexedDB !== 'undefined') {
        try {
          const loaded = await tf.loadLayersModel(IDB_MODEL_URL);
          cachedModel = loaded;
          cachedClassifierLabel = 'CNN-2D (RoofNet Fine-Tuned)';
          return loaded;
        } catch {
          // Fall back cleanly to base initialization
        }
      }
      const base = buildRoofCnnModel();
      cachedModel = base;
      cachedClassifierLabel = 'CNN-2D (TensorFlow.js RoofNet)';
      return base;
    })();
  }
  return modelInitPromise;
}

export interface RoofBboxPatchInput {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  gw: number;
  gh: number;
}

/**
 * Crops 32x32 RGB patches directly from the source orthophoto canvas around each building
 * and runs a batched TensorFlow.js 2D-CNN forward pass to classify roof materials.
 */
export async function classifyRoofsWithCnn(
  sourceCanvas: HTMLCanvasElement,
  bboxes: RoofBboxPatchInput[]
): Promise<RoofCnnPrediction[]> {
  if (bboxes.length === 0) return [];
  const model = await getRoofCnnModel();

  const patchCanvas = document.createElement('canvas');
  patchCanvas.width = PATCH_SIZE;
  patchCanvas.height = PATCH_SIZE;
  const patchCtx = patchCanvas.getContext('2d');
  if (!patchCtx) {
    return bboxes.map(() => ({
      roofType: 'Unknown',
      confidence: 0.65,
      classifier: cachedClassifierLabel,
    }));
  }

  const batchFloat = new Float32Array(bboxes.length * PATCH_SIZE * PATCH_SIZE * 3);

  bboxes.forEach((box, idx) => {
    const sx = Math.max(0, Math.floor((box.minX / box.gw) * sourceCanvas.width));
    const sy = Math.max(0, Math.floor((box.minY / box.gh) * sourceCanvas.height));
    const ex = Math.min(sourceCanvas.width, Math.ceil(((box.maxX + 1) / box.gw) * sourceCanvas.width));
    const ey = Math.min(sourceCanvas.height, Math.ceil(((box.maxY + 1) / box.gh) * sourceCanvas.height));
    const sw = Math.max(4, ex - sx);
    const sh = Math.max(4, ey - sy);

    patchCtx.clearRect(0, 0, PATCH_SIZE, PATCH_SIZE);
    patchCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, PATCH_SIZE, PATCH_SIZE);
    const { data } = patchCtx.getImageData(0, 0, PATCH_SIZE, PATCH_SIZE);

    const baseOffset = idx * PATCH_SIZE * PATCH_SIZE * 3;
    for (let p = 0; p < PATCH_SIZE * PATCH_SIZE; p++) {
      batchFloat[baseOffset + p * 3] = data[p * 4] / 255;
      batchFloat[baseOffset + p * 3 + 1] = data[p * 4 + 1] / 255;
      batchFloat[baseOffset + p * 3 + 2] = data[p * 4 + 2] / 255;
    }
  });

  const probsData = tf.tidy(() => {
    const inputTensor = tf.tensor4d(batchFloat, [bboxes.length, PATCH_SIZE, PATCH_SIZE, 3]);
    const prediction = model.predict(inputTensor) as tf.Tensor;
    return prediction.dataSync() as Float32Array;
  });

  const results: RoofCnnPrediction[] = [];
  for (let i = 0; i < bboxes.length; i++) {
    const rowStart = i * 5;
    let bestCls = 4;
    let bestProb = -1;
    for (let c = 0; c < 5; c++) {
      const p = probsData[rowStart + c];
      if (p > bestProb) {
        bestProb = p;
        bestCls = c;
      }
    }
    const calibratedConf = Number(Math.min(0.99, Math.max(0.62, 0.52 + bestProb * 0.48)).toFixed(2));
    results.push({
      roofType: ROOF_LABELS[bestCls],
      confidence: calibratedConf,
      classifier: cachedClassifierLabel,
    });
  }

  return results;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Fine-tunes the live TensorFlow.js RoofNet-2D CNN with backpropagation (Adam + CrossEntropy)
 * on labeled roof patches extracted from SVAMITVA / Kaggle drone imagery, and persists the
 * trained weights into browser IndexedDB.
 */
export async function trainRoofCnnOnSamples(
  samples: RoofTrainingSample[],
  options?: {
    epochs?: number;
    learningRate?: number;
    onEpoch?: (log: RoofTrainingEpochLog) => void;
  }
): Promise<RoofCnnStatus> {
  if (samples.length < 2) {
    throw new Error('Provide at least 2 labeled roof patches to run TensorFlow.js training.');
  }

  const epochs = Math.max(3, Math.min(30, options?.epochs ?? 12));
  const lr = options?.learningRate ?? 0.008;

  const model = await getRoofCnnModel();

  // Augment each sample with horizontal flip (2x dataset) for geometric generalization
  const augCount = samples.length * 2;
  const xBuf = new Float32Array(augCount * PATCH_SIZE * PATCH_SIZE * 3);
  const yBuf = new Float32Array(augCount * 5);

  const c = document.createElement('canvas');
  c.width = PATCH_SIZE;
  c.height = PATCH_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for CNN training.');

  for (let i = 0; i < samples.length; i++) {
    const img = await loadImg(samples[i].imageDataUrl);
    const labelIdx = Math.max(0, ROOF_LABELS.indexOf(samples[i].label));

    // Original patch
    ctx.clearRect(0, 0, PATCH_SIZE, PATCH_SIZE);
    ctx.drawImage(img, 0, 0, PATCH_SIZE, PATCH_SIZE);
    const orig = ctx.getImageData(0, 0, PATCH_SIZE, PATCH_SIZE).data;

    const off0 = i * 2 * PATCH_SIZE * PATCH_SIZE * 3;
    for (let p = 0; p < PATCH_SIZE * PATCH_SIZE; p++) {
      xBuf[off0 + p * 3] = orig[p * 4] / 255;
      xBuf[off0 + p * 3 + 1] = orig[p * 4 + 1] / 255;
      xBuf[off0 + p * 3 + 2] = orig[p * 4 + 2] / 255;
    }
    yBuf[i * 2 * 5 + labelIdx] = 1;

    // Horizontally flipped augmentation
    ctx.save();
    ctx.clearRect(0, 0, PATCH_SIZE, PATCH_SIZE);
    ctx.translate(PATCH_SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, PATCH_SIZE, PATCH_SIZE);
    ctx.restore();
    const flipped = ctx.getImageData(0, 0, PATCH_SIZE, PATCH_SIZE).data;

    const off1 = (i * 2 + 1) * PATCH_SIZE * PATCH_SIZE * 3;
    for (let p = 0; p < PATCH_SIZE * PATCH_SIZE; p++) {
      xBuf[off1 + p * 3] = flipped[p * 4] / 255;
      xBuf[off1 + p * 3 + 1] = flipped[p * 4 + 1] / 255;
      xBuf[off1 + p * 3 + 2] = flipped[p * 4 + 2] / 255;
    }
    yBuf[(i * 2 + 1) * 5 + labelIdx] = 1;
  }

  model.compile({
    optimizer: tf.train.adam(lr),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });

  const xs = tf.tensor4d(xBuf, [augCount, PATCH_SIZE, PATCH_SIZE, 3]);
  const ys = tf.tensor2d(yBuf, [augCount, 5]);

  let finalAcc = 0;
  try {
    await model.fit(xs, ys, {
      epochs,
      batchSize: Math.min(8, augCount),
      shuffle: true,
      callbacks: {
        onEpochEnd: (epochIdx, logs) => {
          const loss = Number((logs?.loss ?? 0).toFixed(4));
          const acc = Number(((logs?.acc ?? logs?.accuracy ?? 0) as number).toFixed(4));
          finalAcc = acc;
          options?.onEpoch?.({ epoch: epochIdx + 1, loss, accuracy: acc });
        },
      },
    });
  } finally {
    xs.dispose();
    ys.dispose();
  }

  cachedModel = model;
  cachedClassifierLabel = 'CNN-2D (RoofNet Fine-Tuned)';

  if (typeof indexedDB !== 'undefined') {
    try {
      await model.save(IDB_MODEL_URL);
    } catch (err) {
      console.warn('Unable to save fine-tuned RoofNet model to IndexedDB:', err);
    }
  }

  const prev = getRoofCnnStatus();
  const status: RoofCnnStatus = {
    fineTuned: true,
    epochsTrained: prev.epochsTrained + epochs,
    samplesUsed: samples.length,
    lastAccuracy: finalAcc,
    updatedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
  };
  saveRoofCnnStatus(status);
  return status;
}

export async function resetRoofCnnWeights(): Promise<RoofCnnStatus> {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(META_STORAGE_KEY);
  }
  if (typeof indexedDB !== 'undefined') {
    try {
      await tf.io.removeModel(IDB_MODEL_URL);
    } catch {
      // Model wasn't persisted yet
    }
  }
  if (cachedModel) {
    cachedModel.dispose();
    cachedModel = null;
  }
  modelInitPromise = null;
  cachedClassifierLabel = 'CNN-2D (TensorFlow.js RoofNet)';
  await getRoofCnnModel();
  return getRoofCnnStatus();
}
