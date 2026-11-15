import {
  AppNotification,
  GisFeature,
  ModelBenchmark,
  ProcessingStage,
  SystemSettings,
  VillageProject,
} from '../types/gis';
import analystAvatarImg from '../assets/images/analyst_avatar_1794728866493.jpg';
import roofRccSampleImg from '../assets/images/roof_sample_rcc_1794728865787.jpg';
import roofTiledSampleImg from '../assets/images/roof_sample_tiled_1794728865694.jpg';
import villageOrthoAltImg from '../assets/images/village_orthophoto_alt_1794728865779.jpg';
import villageOrthoMainImg from '../assets/images/village_orthophoto_main_1794728864971.jpg';

export const ANALYST_AVATAR = analystAvatarImg;
export const DRONE_IMG_1 = '/assets/aistudio/img1_ec33c0f1.jpeg';
export const DRONE_IMG_2 = '/assets/aistudio/img2_be6ffe69.jpeg';
export const ORTHO_MAIN = DRONE_IMG_2;
export const ORTHO_ALT = DRONE_IMG_1;
export const ROOF_RCC_IMG = roofRccSampleImg;
export const ROOF_TILED_IMG = roofTiledSampleImg;

export const PIPELINE_STEP_NAMES = [
  'Upload Validation',
  'Metadata Extraction',
  'Image Tiling',
  'Preprocessing',
  'AI Inference',
  'GIS Vectorization',
  'Roof Classification',
  'Database Storage',
  'Completed',
] as const;

export function buildStages(completedCount: number, failedAt?: number): ProcessingStage[] {
  return PIPELINE_STEP_NAMES.map((name, idx) => {
    const step = idx + 1;
    if (failedAt && step === failedAt) {
      return {
        step,
        name,
        status: 'failed',
        detail: 'Tile batch CRC mismatch at sub-grid (x:14, y:09)',
      };
    }
    if (failedAt && step > failedAt) {
      return { step, name, status: 'pending' };
    }
    if (step <= completedCount) {
      return {
        step,
        name,
        status: 'completed',
        durationSec: [1.4, 2.1, 6.8, 4.2, 28.5, 9.3, 11.4, 2.6, 0.4][idx],
      };
    }
    if (step === completedCount + 1 && !failedAt && completedCount > 0 && completedCount < 9) {
      return { step, name, status: 'active' };
    }
    return { step, name, status: 'pending' };
  });
}

export const INITIAL_PROJECTS: VillageProject[] = [
  {
    id: 'PRJ-HR-2026-014',
    village: 'Kheri Sadh',
    district: 'Rohtak',
    state: 'Haryana',
    latitude: 28.8954,
    longitude: 76.6428,
    surveyDate: '2026-10-18',
    description:
      'Abadi Deh high-resolution UAV survey processed with U-Net (ResNet-18, 256×256 tiled inference) over img2_be6ffe69.jpeg.',
    status: 'Completed',
    progress: 100,
    modelUsed: 'U-Net',
    modelVersion: 'U-Net ResNet-18 (final_drone_model)',
    tileSize: 256,
    enabledClasses: ['Buildings', 'Roads', 'Water', 'Vegetation'],
    lastProcessedAt: '2026-11-14 23:40 IST',
    wards: ['Ward 01 - North', 'Ward 02 - Central Lane', 'Ward 03 - East Fields'],
    orthophoto: {
      fileName: 'img2_be6ffe69.jpeg',
      fileSizeMb: 4.8,
      format: 'JPG',
      widthPx: 896,
      heightPx: 448,
      crs: 'EPSG:32643 (WGS 84 / UTM zone 43N)',
      bounds: {
        minLat: 28.8929,
        maxLat: 28.8979,
        minLng: 76.6382,
        maxLng: 76.6474,
      },
      resolutionCm: 5.0,
      bands: 3,
      imageUrl: DRONE_IMG_2,
    },
    stages: buildStages(9),
  },
  {
    id: 'PRJ-UP-2026-021',
    village: 'Rampur Khurd',
    district: 'Barabanki',
    state: 'Uttar Pradesh',
    latitude: 26.9261,
    longitude: 81.1945,
    surveyDate: '2026-10-29',
    description:
      'Mixed RCC & corrugated tin settlement survey processed with U-Net (ResNet-18, 256×256 tiled inference) over img1_ec33c0f1.jpeg.',
    status: 'Completed',
    progress: 100,
    modelUsed: 'U-Net',
    modelVersion: 'U-Net ResNet-18 (final_drone_model)',
    tileSize: 256,
    enabledClasses: ['Buildings', 'Roads', 'Water', 'Vegetation'],
    lastProcessedAt: '2026-11-14 23:35 IST',
    wards: ['Ward 01 - West Abadi', 'Ward 02 - Pond Sector', 'Ward 03 - South'],
    orthophoto: {
      fileName: 'img1_ec33c0f1.jpeg',
      fileSizeMb: 5.4,
      format: 'JPG',
      widthPx: 1408,
      heightPx: 1296,
      crs: 'EPSG:32644 (WGS 84 / UTM zone 44N)',
      bounds: {
        minLat: 26.9234,
        maxLat: 26.9288,
        minLng: 81.1897,
        maxLng: 81.1993,
      },
      resolutionCm: 4.6,
      bands: 3,
      imageUrl: DRONE_IMG_1,
    },
    stages: buildStages(9),
  },
  {
    id: 'PRJ-MH-2026-033',
    village: 'Devipur',
    district: 'Nagpur',
    state: 'Maharashtra',
    latitude: 21.1458,
    longitude: 79.0882,
    surveyDate: '2026-11-04',
    description:
      'Dense mixed-roof settlement extraction with tiled vs tin sheet disambiguation across 4 revenue wards.',
    status: 'Processing',
    progress: 62,
    modelUsed: 'SegFormer',
    modelVersion: 'SegFormer-B4 v2.3',
    tileSize: 512,
    enabledClasses: ['Buildings', 'Roads', 'Water', 'Vegetation'],
    lastProcessedAt: '2026-11-14 23:18 IST',
    wards: ['Ward 01 - Bazaar', 'Ward 02 - Temple Lane'],
    orthophoto: {
      fileName: 'devipur_block3_ortho.jpg',
      fileSizeMb: 12.4,
      format: 'JPG',
      widthPx: 1600,
      heightPx: 900,
      crs: 'EPSG:32644 (WGS 84 / UTM zone 44N)',
      bounds: {
        minLat: 21.1422,
        maxLat: 21.1494,
        minLng: 79.0825,
        maxLng: 79.0939,
      },
      resolutionCm: 4.5,
      bands: 3,
      imageUrl: villageOrthoMainImg,
    },
    stages: buildStages(5),
  },
  {
    id: 'PRJ-MP-2026-009',
    village: 'Bhojpur Kalan',
    district: 'Sehore',
    state: 'Madhya Pradesh',
    latitude: 23.1994,
    longitude: 77.0844,
    surveyDate: '2026-10-11',
    description:
      'Baseline U-Net extraction run for rural watershed boundary and courtyard perimeter verification.',
    status: 'Failed',
    progress: 44,
    modelUsed: 'U-Net',
    modelVersion: 'U-Net ResNet-18 (final_drone_model)',
    tileSize: 256,
    enabledClasses: ['Buildings', 'Roads', 'Water'],
    lastProcessedAt: '2026-11-08 17:12 IST',
    wards: ['Ward 01 - Core'],
    errorMessage: 'AI Inference interrupted: GPU tile batch checksum failure at sub-tile (14, 09). Retry with 256px tile size.',
    orthophoto: {
      fileName: 'bhojpur_kalan_raw_mosaic.jpg',
      fileSizeMb: 9.2,
      format: 'JPG',
      widthPx: 1408,
      heightPx: 792,
      crs: 'EPSG:32643 (WGS 84 / UTM zone 43N)',
      bounds: {
        minLat: 23.1968,
        maxLat: 23.202,
        minLng: 77.0801,
        maxLng: 77.0887,
      },
      resolutionCm: 5.5,
      bands: 3,
      imageUrl: villageOrthoAltImg,
    },
    stages: buildStages(4, 5),
  },
  {
    id: 'PRJ-RJ-2026-042',
    village: 'Nandgaon',
    district: 'Alwar',
    state: 'Rajasthan',
    latitude: 27.553,
    longitude: 76.6346,
    surveyDate: '2026-11-11',
    description:
      'Newly registered village survey awaiting drone orthophoto upload and coordinate verification.',
    status: 'Pending',
    progress: 0,
    modelUsed: 'U-Net',
    modelVersion: 'U-Net ResNet-18 (final_drone_model)',
    tileSize: 256,
    enabledClasses: ['Buildings', 'Roads', 'Water', 'Vegetation'],
    lastProcessedAt: 'Not processed',
    wards: ['Ward 01 - West', 'Ward 02 - East'],
    orthophoto: null,
    stages: buildStages(0),
  },
];

// Features are generated directly in native orthophoto pixel coordinates via runTiledDroneSegmentation on mount/reset
export const INITIAL_FEATURES: GisFeature[] = [];

export const MODEL_BENCHMARKS: ModelBenchmark[] = [
  {
    id: 'U-Net',
    fullName: 'U-Net (ResNet-18 · final_drone_model.pth)',
    version: 'v1.0-resnet18',
    backbone: 'ResNet-18 Encoder (smp.Unet)',
    evaluated: false,
    meanIoU: null,
    diceScore: null,
    precision: null,
    recall: null,
    f1Score: null,
    inferenceTimeSec: null,
    paramsMillions: 14.3,
    inputTilePx: 256,
    perClassIoU: {
      buildings: null,
      roads: null,
      water: null,
      vegetation: null,
    },
    notes: 'Checkpoint is deployed, but no verifiable ground-truth evaluation report is available. Metrics are withheld until validation.',
  },
  {
    id: 'SegFormer',
    fullName: 'SegFormer-B4 (Aerial-SVAMITVA)',
    version: 'v2.3',
    backbone: 'Mix Transformer (MiT-B4)',
    evaluated: false,
    meanIoU: null,
    diceScore: null,
    precision: null,
    recall: null,
    f1Score: null,
    inferenceTimeSec: null,
    paramsMillions: 64.1,
    inputTilePx: 512,
    perClassIoU: {
      buildings: null,
      roads: null,
      water: null,
      vegetation: null,
    },
    notes: 'Reference model only. This model is not connected to the deployed inference API and has no verified evaluation metrics.',
  },
  {
    id: 'DeepLabV3+',
    fullName: 'DeepLabV3+ (ResNet-101 ASPP)',
    version: 'v1.8',
    backbone: 'ResNet-101 + Atrous SPP',
    evaluated: false,
    meanIoU: null,
    diceScore: null,
    precision: null,
    recall: null,
    f1Score: null,
    inferenceTimeSec: null,
    paramsMillions: 59.3,
    inputTilePx: 512,
    perClassIoU: {
      buildings: null,
      roads: null,
      water: null,
      vegetation: null,
    },
    notes: 'Not connected to the deployed inference API. Evaluation has not been completed.',
  },
];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'NTF-01',
    title: 'Kheri Sadh (img2_be6ffe69.jpeg) analyzed',
    detail: '256×256 tiled U-Net (ResNet-18) segmentation and vectorization completed.',
    timestamp: '14 Nov 2026 · 23:40',
    read: false,
    type: 'success',
  },
  {
    id: 'NTF-02',
    title: 'Rampur Khurd (img1_ec33c0f1.jpeg) analyzed',
    detail: 'Buildings, roads, pond, and vegetation layers extracted from uploaded drone photo.',
    timestamp: '14 Nov 2026 · 23:35',
    read: false,
    type: 'info',
  },
  {
    id: 'NTF-03',
    title: 'Bhojpur Kalan batch alert',
    detail: 'Tile checksum error at sub-grid (14, 09) during U-Net inference.',
    timestamp: '08 Nov 2026 · 17:12',
    read: true,
    type: 'warning',
  },
];

export const INITIAL_SETTINGS: SystemSettings = {
  defaultCrs: 'EPSG:32643',
  defaultTileSize: 512,
  defaultConfidenceThreshold: 0.75,
  autoVectorizePostInference: true,
  snapParcelToleranceM: 0.45,
  exportIncludeMetadata: true,
};
