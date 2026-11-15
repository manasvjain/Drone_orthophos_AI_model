export type PageId =
  | 'dashboard'
  | 'projects'
  | 'processing'
  | 'explorer'
  | 'analytics'
  | 'model-lab'
  | 'reports'
  | 'registry'
  | 'settings';

export type AnalyticsTabId = 'village' | 'comparison' | 'explainable' | 'training' | 'exports';

export type ProcessingStatus =
  | 'Completed'
  | 'Processing'
  | 'Pending'
  | 'Failed'
  | 'Draft';

export type SegmentationModelId = 'U-Net' | 'DeepLabV3+' | 'SegFormer';

export type RoofType = 'RCC' | 'Tiled' | 'Tin' | 'Other' | 'Unknown';

export type FeatureClass = 'building' | 'road' | 'water' | 'vegetation' | 'parcel';

export type BasemapMode = 'orthophoto' | 'topographic' | 'vector';

export interface OrthophotoMetadata {
  fileName: string;
  fileSizeMb: number;
  format: 'GeoTIFF' | 'TIFF' | 'JPG' | 'PNG';
  widthPx: number;
  heightPx: number;
  crs: string;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  resolutionCm: number;
  bands: number;
  imageUrl: string;
}

export interface ProcessingStage {
  step: number;
  name: string;
  status: 'completed' | 'active' | 'pending' | 'failed';
  durationSec?: number;
  detail?: string;
}

export interface SegmentationOutputs {
  overlayUrl: string;
  buildingsMaskUrl: string;
  roadsMaskUrl: string;
  inferenceEngine: 'pytorch-flask' | 'tiled-cv-engine';
  tileSizeUsed: number;
  inferenceDurationMs: number;
  pixelCoverage: {
    buildingsPct: number;
    roadsPct: number;
    waterPct: number;
    vegetationPct: number;
  };
  coordWidth?: number;
  coordHeight?: number;
}

export interface VillageProject {
  id: string;
  village: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  surveyDate: string;
  description: string;
  status: ProcessingStatus;
  progress: number;
  modelUsed: SegmentationModelId;
  modelVersion: string;
  tileSize: 256 | 512 | 1024;
  enabledClasses: ('Buildings' | 'Roads' | 'Water' | 'Vegetation')[];
  orthophoto: OrthophotoMetadata | null;
  segmentationOutputs?: SegmentationOutputs;
  lastProcessedAt: string;
  wards: string[];
  errorMessage?: string;
  stages: ProcessingStage[];
}

export interface GisFeatureBase {
  id: string;
  projectId: string;
  featureClass: FeatureClass;
  ward: string;
  confidence: number;
  modelVersion: string;
  processingDate: string;
}

export interface BuildingFeature extends GisFeatureBase {
  featureClass: 'building';
  polygon: [number, number][]; // Native orthophoto pixel space [0..coordWidth, 0..coordHeight]
  areaSqm: number;
  perimeterM: number;
  roofType: RoofType;
  roofConfidence: number;
  roofClassifier?: string;
  centroid: [number, number]; // [lat, lng]
  roofPreviewUrl?: string;
}

export interface RoadFeature extends GisFeatureBase {
  featureClass: 'road';
  polyline: [number, number][];
  lengthM: number;
  surfaceClass: string;
  widthM: number;
}

export interface WaterFeature extends GisFeatureBase {
  featureClass: 'water';
  polygon: [number, number][];
  areaSqm: number;
  perimeterM: number;
  waterType: 'Village Pond (Johad)' | 'Irrigation Canal' | 'Drainage Channel';
}

export interface VegetationFeature extends GisFeatureBase {
  featureClass: 'vegetation';
  polygon: [number, number][];
  areaSqm: number;
  coveragePct: number;
  canopyType: string;
}

export interface ParcelFeature extends GisFeatureBase {
  featureClass: 'parcel';
  polygon: [number, number][];
  parcelNo: string;
  areaSqm: number;
}

export type GisFeature =
  | BuildingFeature
  | RoadFeature
  | WaterFeature
  | VegetationFeature
  | ParcelFeature;

export interface LayerVisibility {
  orthophoto: boolean;
  segmentationOverlay: boolean;
  buildings: boolean;
  roads: boolean;
  water: boolean;
  vegetation: boolean;
  parcels: boolean;
}

export interface ExplorerFilters {
  featureType: 'all' | FeatureClass;
  roofTypes: RoofType[];
  minArea: number;
  maxArea: number;
  minConfidence: number;
  ward: string;
  modelVersion: string;
}

export interface ModelBenchmark {
  id: SegmentationModelId;
  fullName: string;
  version: string;
  backbone: string;
  evaluated: boolean;
  meanIoU: number | null;
  diceScore: number | null;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  inferenceTimeSec: number | null;
  paramsMillions: number;
  inputTilePx: number;
  perClassIoU: {
    buildings: number | null;
    roads: number | null;
    water: number | null;
    vegetation: number | null;
  };
  notes: string;
}

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  read: boolean;
  type: 'info' | 'success' | 'warning';
}

export interface SystemSettings {
  defaultCrs: 'EPSG:32643' | 'EPSG:32644' | 'EPSG:4326';
  defaultTileSize: 256 | 512 | 1024;
  defaultConfidenceThreshold: number;
  autoVectorizePostInference: boolean;
  snapParcelToleranceM: number;
  exportIncludeMetadata: boolean;
}
