export interface SegmentationCalibrationProfile {
  profileName: string;
  datasetSource: string;
  updatedAt: string;
  samplesTrained: number;
  baselineMeanIoU: number | null;
  calibratedMeanIoU: number | null;
  perClassIoU: {
    buildings: number | null;
    roads: number | null;
    water: number | null;
    vegetation: number | null;
  };
  params: {
    rccBrightDelta: number;      // offset added to medianLum for bright RCC roofs
    rccMidDelta: number;         // offset added to medianLum for weathered RCC roofs
    rccMaxSat: number;           // max HSV saturation for neutral concrete slabs
    terracottaRbDiff: number;    // min R-B threshold for clay/terracotta roofs
    terracottaRgDiff: number;    // min R-G threshold for clay/terracotta roofs
    vegExgThresh: number;        // Excess Green (2G-R-B) threshold for canopy/crops
    waterMaxStd: number;         // max local std for smooth water surface
    waterMaxEdge: number;        // max Sobel edge density for water bodies
    algaeExgThresh: number;      // ExG threshold for duckweed/algae-covered village ponds
    roadMaxStd: number;          // max local std for paved/kacha road corridors
    roadMaxEdge: number;         // max edge density for road surfaces
    shadowLumRatio: number;      // multiplier on p15Lum for building shadow separation
  };
}

export const DEFAULT_CALIBRATION_PROFILE: SegmentationCalibrationProfile = {
  profileName: 'SVAMITVA Rural UAV Baseline',
  datasetSource: 'Default Adaptive Calibration',
  updatedAt: 'Default',
  samplesTrained: 0,
  baselineMeanIoU: null,
  calibratedMeanIoU: null,
  perClassIoU: {
    buildings: null,
    roads: null,
    water: null,
    vegetation: null,
  },
  params: {
    rccBrightDelta: 30,
    rccMidDelta: 6,
    rccMaxSat: 0.22,
    terracottaRbDiff: 25,
    terracottaRgDiff: 10,
    vegExgThresh: 13,
    waterMaxStd: 10.5,
    waterMaxEdge: 11.5,
    algaeExgThresh: 20,
    roadMaxStd: 11.5,
    roadMaxEdge: 14.2,
    shadowLumRatio: 0.85,
  },
};

const STORAGE_KEY = 'svamitva_seg_calibration_v1';

export function getActiveCalibrationProfile(): SegmentationCalibrationProfile {
  if (typeof window === 'undefined') return DEFAULT_CALIBRATION_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CALIBRATION_PROFILE;
    const parsed = JSON.parse(raw) as Partial<SegmentationCalibrationProfile>;
    if (!parsed?.params) return DEFAULT_CALIBRATION_PROFILE;
    return {
      ...DEFAULT_CALIBRATION_PROFILE,
      ...parsed,
      params: {
        ...DEFAULT_CALIBRATION_PROFILE.params,
        ...parsed.params,
      },
      perClassIoU: {
        ...DEFAULT_CALIBRATION_PROFILE.perClassIoU,
        ...(parsed.perClassIoU ?? {}),
      },
    };
  } catch {
    return DEFAULT_CALIBRATION_PROFILE;
  }
}

export function saveCalibrationProfile(profile: SegmentationCalibrationProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota errors
  }
}

export function resetCalibrationProfile(): SegmentationCalibrationProfile {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  return DEFAULT_CALIBRATION_PROFILE;
}
