import { RoofType } from '../types/gis';
import {
  classifyPixelWithProfile,
  computeAdaptiveStats,
  computeTextureAndEdgeMaps,
  ImageAdaptiveStats,
} from './droneSegmentationEngine';
import { classifyRoofsWithCnn, RoofBboxPatchInput } from './roofCnnClassifier';
import {
  DEFAULT_CALIBRATION_PROFILE,
  getActiveCalibrationProfile,
  saveCalibrationProfile,
  SegmentationCalibrationProfile,
} from './segmentationCalibration';

export interface KaggleImageMaskPair {
  id: string;
  imageName: string;
  maskName: string;
  imageUrl: string;
  maskUrl: string;
}

export interface ClassIoUBreakdown {
  meanIoU: number;
  meanDice: number;
  pixelAccuracy: number;
  perClassIoU: {
    buildings: number | null;
    roads: number | null;
    water: number | null;
    vegetation: number | null;
  };
}

export interface CalibrationTrainingResult {
  baseline: ClassIoUBreakdown;
  calibrated: ClassIoUBreakdown;
  optimizedProfile: SegmentationCalibrationProfile;
  extractedRoofPatches: ExtractedRoofPatchCandidate[];
}

export interface ExtractedRoofPatchCandidate {
  id: string;
  sourceName: string;
  patchDataUrl: string;
  suggestedLabel: RoofType;
  confidence: number;
}

const EVAL_MAX_DIM = 360;
const ENABLED_ALL = new Set(['Buildings', 'Roads', 'Water', 'Vegetation']);

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
 * Normalizes binary (0/255), grayscale class IDs (0..4), or RGB color semantic masks
 * into SVAMITVA class IDs: 0=BG, 1=Building, 2=Vegetation, 3=Water, 4=Road.
 */
function decodeMaskToClassIds(maskData: Uint8ClampedArray, totalPx: number): Uint8Array {
  const out = new Uint8Array(totalPx);
  let isGrayscale = true;
  let maxGray = 0;

  for (let i = 0; i < totalPx; i++) {
    const p = i * 4;
    const r = maskData[p];
    const g = maskData[p + 1];
    const b = maskData[p + 2];
    if (Math.abs(r - g) > 4 || Math.abs(g - b) > 4) {
      isGrayscale = false;
      break;
    }
    if (r > maxGray) maxGray = r;
  }

  if (isGrayscale) {
    if (maxGray <= 4) {
      for (let i = 0; i < totalPx; i++) out[i] = Math.min(4, maskData[i * 4]);
      return out;
    }
    // Check if binary mask (mostly 0 or >200)
    let intermediateCount = 0;
    for (let i = 0; i < totalPx; i += 4) {
      const v = maskData[i * 4];
      if (v > 12 && v < 215) intermediateCount++;
    }
    const isBinary = intermediateCount < totalPx * 0.02;
    if (isBinary) {
      for (let i = 0; i < totalPx; i++) {
        out[i] = maskData[i * 4] >= 128 ? 1 : 0;
      }
      return out;
    }
    for (let i = 0; i < totalPx; i++) {
      const v = maskData[i * 4];
      if (v >= 215) out[i] = 1;
      else if (v >= 160) out[i] = 4;
      else if (v >= 100) out[i] = 3;
      else if (v >= 40) out[i] = 2;
      else out[i] = 0;
    }
    return out;
  }

  // RGB palette decoding (buildings red/white, veg green, water blue, road amber/magenta)
  for (let i = 0; i < totalPx; i++) {
    const p = i * 4;
    const r = maskData[p];
    const g = maskData[p + 1];
    const b = maskData[p + 2];
    if (((r > 150 && g < 120 && b < 120) || (r > 210 && g > 210 && b > 210))) {
      out[i] = 1;
    } else if (g > 110 && g > r + 25 && g > b + 25) {
      out[i] = 2;
    } else if (b > 120 && b > r + 25) {
      out[i] = 3;
    } else if ((r > 160 && g > 140 && b < 110) || (r > 130 && b > 130 && g < 100)) {
      out[i] = 4;
    } else {
      out[i] = 0;
    }
  }
  return out;
}

interface PreparedPair {
  name: string;
  w: number;
  h: number;
  pixels: Uint8ClampedArray;
  lum: Float32Array;
  localStd: Float32Array;
  edgeDensity: Float32Array;
  stats: ImageAdaptiveStats;
  gt: Uint8Array;
  srcCanvas: HTMLCanvasElement;
}

async function preparePair(pair: KaggleImageMaskPair): Promise<PreparedPair> {
  const [img, msk] = await Promise.all([loadImg(pair.imageUrl), loadImg(pair.maskUrl)]);
  const scale = Math.min(1, EVAL_MAX_DIM / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(64, Math.round((img.naturalWidth || 256) * scale));
  const h = Math.max(64, Math.round((img.naturalHeight || 256) * scale));

  const imgCanvas = document.createElement('canvas');
  imgCanvas.width = w;
  imgCanvas.height = h;
  const imgCtx = imgCanvas.getContext('2d')!;
  imgCtx.drawImage(img, 0, 0, w, h);
  const pixels = imgCtx.getImageData(0, 0, w, h).data;

  const mskCanvas = document.createElement('canvas');
  mskCanvas.width = w;
  mskCanvas.height = h;
  const mskCtx = mskCanvas.getContext('2d')!;
  mskCtx.imageSmoothingEnabled = false;
  mskCtx.drawImage(msk, 0, 0, w, h);
  const gt = decodeMaskToClassIds(mskCtx.getImageData(0, 0, w, h).data, w * h);

  const { lum, localStd, edgeDensity } = computeTextureAndEdgeMaps(pixels, w, h);
  const stats = computeAdaptiveStats(pixels, lum, localStd, w * h);

  return {
    name: pair.imageName,
    w,
    h,
    pixels,
    lum,
    localStd,
    edgeDensity,
    stats,
    gt,
    srcCanvas: imgCanvas,
  };
}

function evaluateParamsOnPrepared(
  prepared: PreparedPair[],
  params: SegmentationCalibrationProfile['params']
): ClassIoUBreakdown {
  const inter = new Float64Array(5);
  const union = new Float64Array(5);
  const predTot = new Float64Array(5);
  const gtTot = new Float64Array(5);
  let correctPx = 0;
  let totalPx = 0;

  for (const item of prepared) {
    const n = item.w * item.h;
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const pred = classifyPixelWithProfile(
        item.pixels[p],
        item.pixels[p + 1],
        item.pixels[p + 2],
        item.lum[i],
        item.localStd[i],
        item.edgeDensity[i],
        item.stats,
        ENABLED_ALL,
        params
      );
      const gtCls = item.gt[i];
      totalPx++;
      if (pred === gtCls) {
        correctPx++;
        inter[pred]++;
      }
      predTot[pred]++;
      gtTot[gtCls]++;
      if (pred === gtCls) {
        union[pred]++;
      } else {
        union[pred]++;
        union[gtCls]++;
      }
    }
  }

  const classIoU = (clsId: number): number | null => {
    if (gtTot[clsId] === 0 && predTot[clsId] === 0) return null;
    if (gtTot[clsId] === 0) return null;
    return Number((inter[clsId] / Math.max(1, union[clsId])).toFixed(4));
  };

  const bIoU = classIoU(1);
  const vIoU = classIoU(2);
  const wIoU = classIoU(3);
  const rIoU = classIoU(4);

  const activeIoUs: number[] = [];
  const activeDices: number[] = [];
  for (const cid of [1, 2, 3, 4]) {
    if (gtTot[cid] > 0) {
      const iou = inter[clsIdIndex(cid)] / Math.max(1, union[cid]);
      const dice = (2 * inter[cid]) / Math.max(1, predTot[cid] + gtTot[cid]);
      activeIoUs.push(iou);
      activeDices.push(dice);
    }
  }

  return {
    meanIoU: Number(
      (activeIoUs.length ? activeIoUs.reduce((a, b) => a + b, 0) / activeIoUs.length : 0).toFixed(4)
    ),
    meanDice: Number(
      (activeDices.length ? activeDices.reduce((a, b) => a + b, 0) / activeDices.length : 0).toFixed(4)
    ),
    pixelAccuracy: Number((correctPx / Math.max(1, totalPx)).toFixed(4)),
    perClassIoU: {
      buildings: bIoU,
      roads: rIoU,
      water: wIoU,
      vegetation: vIoU,
    },
  };
}

function clsIdIndex(c: number): number {
  return c;
}

async function extractBuildingPatchesFromGroundTruth(
  prepared: PreparedPair[]
): Promise<ExtractedRoofPatchCandidate[]> {
  const candidates: ExtractedRoofPatchCandidate[] = [];

  for (const item of prepared) {
    const { w, h, gt, srcCanvas, name } = item;
    const visited = new Uint8Array(w * h);
    const boxes: RoofBboxPatchInput[] = [];
    const patchUrls: string[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const startIdx = y * w + x;
        if (gt[startIdx] !== 1 || visited[startIdx]) continue;

        const queue = [startIdx];
        visited[startIdx] = 1;
        let head = 0;
        let count = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        while (head < queue.length) {
          const cur = queue[head++];
          count++;
          const cx = cur % w;
          const cy = (cur / w) | 0;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [
            cx > 0 ? cur - 1 : -1,
            cx + 1 < w ? cur + 1 : -1,
            cy > 0 ? cur - w : -1,
            cy + 1 < h ? cur + w : -1,
          ];
          for (const nIdx of neighbors) {
            if (nIdx >= 0 && !visited[nIdx] && gt[nIdx] === 1) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
        }

        if (count < 40) continue;
        const sw = maxX - minX + 1;
        const sh = maxY - minY + 1;
        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = 64;
        patchCanvas.height = 64;
        const pCtx = patchCanvas.getContext('2d');
        if (!pCtx) continue;
        pCtx.drawImage(srcCanvas, minX, minY, sw, sh, 0, 0, 64, 64);

        boxes.push({ minX, minY, maxX, maxY, gw: w, gh: h });
        patchUrls.push(patchCanvas.toDataURL('image/png'));
        if (boxes.length >= 6) break;
      }
      if (boxes.length >= 6) break;
    }

    if (boxes.length > 0) {
      const preds = await classifyRoofsWithCnn(srcCanvas, boxes);
      preds.forEach((pr, idx) => {
        candidates.push({
          id: `GT-PATCH-${candidates.length + 1}`,
          sourceName: name,
          patchDataUrl: patchUrls[idx],
          suggestedLabel: pr.roofType,
          confidence: pr.confidence,
        });
      });
    }

    if (candidates.length >= 18) break;
  }

  return candidates;
}

/**
 * Matches dropped Kaggle image/mask files automatically by normalized stem.
 */
export function pairUploadedDatasetFiles(files: File[]): {
  pairs: KaggleImageMaskPair[];
  unpairedCount: number;
} {
  const imageMap = new Map<string, File>();
  const maskMap = new Map<string, File>();

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['jpg', 'jpeg', 'png', 'bmp', 'webp'].includes(ext)) continue;

    const pathLower = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).toLowerCase();
    const baseName = file.name.replace(/\.[^.]+$/, '').toLowerCase();
    const cleanStem = baseName.replace(/(_mask|-mask|_label|-label|_gt|-gt)$/i, '');

    if (
      pathLower.includes('mask') ||
      pathLower.includes('label') ||
      pathLower.includes('ground') ||
      /_mask|-mask|_label|-label|_gt|-gt/i.test(baseName)
    ) {
      maskMap.set(cleanStem, file);
    } else {
      imageMap.set(cleanStem, file);
    }
  }

  const pairs: KaggleImageMaskPair[] = [];
  for (const [stem, imgFile] of imageMap.entries()) {
    const mskFile = maskMap.get(stem);
    if (mskFile) {
      pairs.push({
        id: `${stem}-${pairs.length}`,
        imageName: imgFile.name,
        maskName: mskFile.name,
        imageUrl: URL.createObjectURL(imgFile),
        maskUrl: URL.createObjectURL(mskFile),
      });
    }
  }

  const unpairedCount = Math.max(0, imageMap.size - pairs.length);
  return { pairs, unpairedCount };
}

/**
 * Runs real ground-truth IoU evaluation + multi-round coordinate-descent calibration
 * over SVAMITVA spectral/texture parameters on Kaggle image/mask pairs, persists the
 * winning parameters, and extracts building roof crops for CNN fine-tuning.
 */
export async function trainCalibrationFromPairs(
  pairs: KaggleImageMaskPair[],
  datasetLabel = 'utkarshsaxenadn/svamitva-drone-aerial-images',
  onProgress?: (pct: number, stage: string) => void
): Promise<CalibrationTrainingResult> {
  if (pairs.length === 0) {
    throw new Error('Add at least one paired (image, mask) from the dataset first.');
  }

  onProgress?.(10, 'Decoding ground-truth masks and computing Sobel texture maps...');
  const prepared: PreparedPair[] = [];
  for (let i = 0; i < Math.min(pairs.length, 16); i++) {
    prepared.push(await preparePair(pairs[i]));
    onProgress?.(10 + Math.round(((i + 1) / Math.min(pairs.length, 16)) * 25), `Prepared ${pairs[i].imageName}`);
  }

  const baselineParams = { ...getActiveCalibrationProfile().params };
  const baseline = evaluateParamsOnPrepared(prepared, baselineParams);

  let bestParams = { ...baselineParams };
  let bestEval = baseline;

  const searchGrid: {
    key: keyof SegmentationCalibrationProfile['params'];
    candidates: number[];
  }[] = [
    { key: 'rccBrightDelta', candidates: [18, 24, 30, 36, 42] },
    { key: 'rccMidDelta', candidates: [-2, 4, 8, 14] },
    { key: 'rccMaxSat', candidates: [0.16, 0.2, 0.24, 0.28] },
    { key: 'terracottaRbDiff', candidates: [16, 22, 26, 32] },
    { key: 'terracottaRgDiff', candidates: [6, 10, 14, 18] },
    { key: 'vegExgThresh', candidates: [8, 12, 16, 22] },
    { key: 'waterMaxStd', candidates: [8.0, 10.5, 13.0, 16.0] },
    { key: 'roadMaxStd', candidates: [9.0, 11.5, 14.5, 17.5] },
    { key: 'roadMaxEdge', candidates: [11.0, 14.2, 17.5] },
    { key: 'shadowLumRatio', candidates: [0.7, 0.85, 1.0] },
  ];

  // 2 passes of coordinate descent optimizing multi-class Mean IoU
  const totalSteps = searchGrid.length * 2;
  let stepDone = 0;
  for (let round = 0; round < 2; round++) {
    for (const dim of searchGrid) {
      stepDone++;
      for (const val of dim.candidates) {
        const trial = { ...bestParams, [dim.key]: val };
        const score = evaluateParamsOnPrepared(prepared, trial);
        if (score.meanIoU > bestEval.meanIoU) {
          bestParams = trial;
          bestEval = score;
        }
      }
      onProgress?.(
        35 + Math.round((stepDone / totalSteps) * 50),
        `Optimizing ${String(dim.key)} (best mIoU: ${bestEval.meanIoU.toFixed(3)})`
      );
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(90, 'Extracting verified building roof crops for RoofNet-2D CNN...');
  const extractedRoofPatches = await extractBuildingPatchesFromGroundTruth(prepared);

  const optimizedProfile: SegmentationCalibrationProfile = {
    profileName: `Kaggle Calibrated (${prepared.length} samples)`,
    datasetSource: datasetLabel,
    updatedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
    samplesTrained: prepared.length,
    baselineMeanIoU: baseline.meanIoU,
    calibratedMeanIoU: bestEval.meanIoU,
    perClassIoU: bestEval.perClassIoU,
    params: bestParams,
  };

  saveCalibrationProfile(optimizedProfile);
  onProgress?.(100, 'Calibration saved cleanly.');

  return {
    baseline,
    calibrated: bestEval,
    optimizedProfile,
    extractedRoofPatches,
  };
}

export function resetTrainingDefaults() {
  saveCalibrationProfile(DEFAULT_CALIBRATION_PROFILE);
}
