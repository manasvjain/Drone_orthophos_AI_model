import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  BuildingFeature,
  GisFeature,
  ParcelFeature,
  RoadFeature,
  SystemSettings,
  VegetationFeature,
  VillageProject,
  WaterFeature,
} from '../types/gis';

interface StoredPoint {
  x: number;
  y: number;
}

function toStoredPoints(pts: [number, number][]): StoredPoint[] {
  return pts.slice(0, 390).map(([x, y]) => ({ x: Number(x), y: Number(y) }));
}

function fromStoredPoints(pts: unknown): [number, number][] {
  if (!Array.isArray(pts)) return [];
  return pts
    .filter(
      (p): p is { x: number; y: number } =>
        Boolean(p) && typeof (p as StoredPoint).x === 'number' && typeof (p as StoredPoint).y === 'number'
    )
    .map((p) => [p.x, p.y]);
}

function sanitizeImageUrl(url: string | undefined): string {
  if (!url) return '';
  // Never store giant base64 strings or ephemeral object URLs in Firestore documents
  if (url.startsWith('data:') || url.startsWith('blob:')) return '';
  return url.slice(0, 500);
}

export function sanitizeOrthophotoMeta(meta: NonNullable<VillageProject['orthophoto']>) {
  return {
    fileName: String(meta.fileName).slice(0, 180),
    fileSizeMb: Number(meta.fileSizeMb),
    format: meta.format,
    widthPx: Number(meta.widthPx),
    heightPx: Number(meta.heightPx),
    crs: String(meta.crs).slice(0, 120),
    bounds: {
      minLat: Number(meta.bounds.minLat),
      maxLat: Number(meta.bounds.maxLat),
      minLng: Number(meta.bounds.minLng),
      maxLng: Number(meta.bounds.maxLng),
    },
    resolutionCm: Number(meta.resolutionCm),
    bands: Number(meta.bands),
    imageUrl: sanitizeImageUrl(meta.imageUrl),
  };
}

function serializeProjectPayload(uid: string, p: VillageProject, isCreate: boolean) {
  const safeOrthophoto = p.orthophoto ? sanitizeOrthophotoMeta(p.orthophoto) : null;

  const segmentationSummary = p.segmentationOutputs
    ? {
        inferenceEngine: p.segmentationOutputs.inferenceEngine,
        tileSizeUsed: Number(p.segmentationOutputs.tileSizeUsed),
        inferenceDurationMs: Number(p.segmentationOutputs.inferenceDurationMs),
        pixelCoverage: {
          buildingsPct: Number(p.segmentationOutputs.pixelCoverage.buildingsPct),
          roadsPct: Number(p.segmentationOutputs.pixelCoverage.roadsPct),
          waterPct: Number(p.segmentationOutputs.pixelCoverage.waterPct),
          vegetationPct: Number(p.segmentationOutputs.pixelCoverage.vegetationPct),
        },
        coordWidth: p.segmentationOutputs.coordWidth ?? p.orthophoto?.widthPx ?? 1000,
        coordHeight: p.segmentationOutputs.coordHeight ?? p.orthophoto?.heightPx ?? 562.5,
      }
    : null;

  const base: Record<string, unknown> = {
    id: String(p.id).slice(0, 64),
    ownerId: uid,
    village: String(p.village).slice(0, 120),
    district: String(p.district).slice(0, 120),
    state: String(p.state).slice(0, 80),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    surveyDate: String(p.surveyDate).slice(0, 32),
    description: String(p.description).slice(0, 1000),
    status: p.status,
    progress: Number(p.progress),
    modelUsed: p.modelUsed,
    modelVersion: String(p.modelVersion).slice(0, 120),
    tileSize: Number(p.tileSize),
    enabledClasses: p.enabledClasses.slice(0, 4),
    orthophoto: safeOrthophoto,
    segmentationSummary,
    lastProcessedAt: String(p.lastProcessedAt).slice(0, 64),
    wards: p.wards.slice(0, 20).map((w) => String(w).slice(0, 120)),
    errorMessage: p.errorMessage ? String(p.errorMessage).slice(0, 500) : null,
    stages: p.stages.slice(0, 12).map((s) => ({
      step: s.step,
      name: s.name,
      status: s.status,
      ...(typeof s.durationSec === 'number' ? { durationSec: s.durationSec } : {}),
      ...(s.detail ? { detail: String(s.detail).slice(0, 200) } : {}),
    })),
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    base.createdAt = serverTimestamp();
  }
  return base;
}

export function serializeFeatureDoc(uid: string, f: GisFeature) {
  const pts =
    f.featureClass === 'road'
      ? toStoredPoints((f as RoadFeature).polyline)
      : toStoredPoints(
          (f as BuildingFeature | WaterFeature | VegetationFeature | ParcelFeature).polygon
        );

  const docData: Record<string, unknown> = {
    id: String(f.id).slice(0, 64),
    projectId: String(f.projectId).slice(0, 64),
    ownerId: uid,
    featureClass: f.featureClass,
    ward: String(f.ward).slice(0, 120),
    confidence: Number(f.confidence),
    modelVersion: String(f.modelVersion).slice(0, 120),
    processingDate: String(f.processingDate).slice(0, 32),
    points: pts,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (f.featureClass === 'building') {
    const b = f as BuildingFeature;
    docData.areaSqm = Number(b.areaSqm);
    docData.perimeterM = Number(b.perimeterM);
    docData.roofType = b.roofType;
    docData.roofConfidence = Number(b.roofConfidence);
    if (b.roofClassifier) docData.roofClassifier = String(b.roofClassifier).slice(0, 64);
    docData.centroidLat = Number(b.centroid[0]);
    docData.centroidLng = Number(b.centroid[1]);
  } else if (f.featureClass === 'road') {
    const r = f as RoadFeature;
    docData.lengthM = Number(r.lengthM);
    docData.surfaceClass = String(r.surfaceClass).slice(0, 120);
    docData.widthM = Number(r.widthM);
  } else if (f.featureClass === 'water') {
    const w = f as WaterFeature;
    docData.areaSqm = Number(w.areaSqm);
    docData.perimeterM = Number(w.perimeterM);
    docData.waterType = String(w.waterType).slice(0, 64);
  } else if (f.featureClass === 'vegetation') {
    const v = f as VegetationFeature;
    docData.areaSqm = Number(v.areaSqm);
    docData.coveragePct = Number(v.coveragePct);
    docData.canopyType = String(v.canopyType).slice(0, 120);
  } else if (f.featureClass === 'parcel') {
    const pcl = f as ParcelFeature;
    docData.parcelNo = String(pcl.parcelNo).slice(0, 64);
    docData.areaSqm = Number(pcl.areaSqm);
  }

  return docData;
}

export function deserializeProjectDoc(data: Record<string, unknown>): VillageProject {
  const seg = data.segmentationSummary as
    | {
        inferenceEngine?: 'pytorch-flask' | 'tiled-cv-engine';
        tileSizeUsed?: number;
        inferenceDurationMs?: number;
        pixelCoverage?: {
          buildingsPct: number;
          roadsPct: number;
          waterPct: number;
          vegetationPct: number;
        };
        coordWidth?: number;
        coordHeight?: number;
      }
    | null
    | undefined;

  return {
    id: String(data.id),
    village: String(data.village),
    district: String(data.district),
    state: String(data.state),
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    surveyDate: String(data.surveyDate),
    description: String(data.description),
    status: data.status as VillageProject['status'],
    progress: Number(data.progress),
    modelUsed: data.modelUsed as VillageProject['modelUsed'],
    modelVersion: String(data.modelVersion),
    tileSize: Number(data.tileSize) as 256 | 512 | 1024,
    enabledClasses: (data.enabledClasses as VillageProject['enabledClasses']) ?? [
      'Buildings',
      'Roads',
      'Water',
      'Vegetation',
    ],
    orthophoto: (data.orthophoto as VillageProject['orthophoto']) ?? null,
    segmentationOutputs: seg
      ? {
          overlayUrl: '',
          buildingsMaskUrl: '',
          roadsMaskUrl: '',
          inferenceEngine: seg.inferenceEngine ?? 'tiled-cv-engine',
          tileSizeUsed: Number(seg.tileSizeUsed ?? 256),
          inferenceDurationMs: Number(seg.inferenceDurationMs ?? 0),
          pixelCoverage: seg.pixelCoverage ?? {
            buildingsPct: 0,
            roadsPct: 0,
            waterPct: 0,
            vegetationPct: 0,
          },
          coordWidth: seg.coordWidth,
          coordHeight: seg.coordHeight,
        }
      : undefined,
    lastProcessedAt: String(data.lastProcessedAt ?? ''),
    wards: (data.wards as string[]) ?? ['Ward 01 - Central Abadi'],
    errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
    stages: (data.stages as VillageProject['stages']) ?? [],
  };
}

export function deserializeFeatureDoc(data: Record<string, unknown>): GisFeature | null {
  const featureClass = data.featureClass as GisFeature['featureClass'];
  const pts = fromStoredPoints(data.points);
  if (pts.length < 2) return null;

  const base = {
    id: String(data.id),
    projectId: String(data.projectId),
    ward: String(data.ward ?? 'Ward 01'),
    confidence: Number(data.confidence ?? 0.85),
    modelVersion: String(data.modelVersion ?? 'U-Net ResNet-18'),
    processingDate: String(data.processingDate ?? '2026-11-15'),
  };

  if (featureClass === 'building') {
    const b: BuildingFeature = {
      ...base,
      featureClass: 'building',
      polygon: pts,
      areaSqm: Number(data.areaSqm ?? 0),
      perimeterM: Number(data.perimeterM ?? 0),
      roofType: (data.roofType as BuildingFeature['roofType']) ?? 'Unknown',
      roofConfidence: Number(data.roofConfidence ?? 0.75),
      roofClassifier:
        typeof data.roofClassifier === 'string' ? data.roofClassifier : 'CNN-2D (TensorFlow.js RoofNet)',
      centroid: [Number(data.centroidLat ?? 0), Number(data.centroidLng ?? 0)],
    };
    return b;
  }
  if (featureClass === 'road') {
    const r: RoadFeature = {
      ...base,
      featureClass: 'road',
      polyline: pts,
      lengthM: Number(data.lengthM ?? 0),
      surfaceClass: String(data.surfaceClass ?? 'Village Road'),
      widthM: Number(data.widthM ?? 3.5),
    };
    return r;
  }
  if (featureClass === 'water') {
    const w: WaterFeature = {
      ...base,
      featureClass: 'water',
      polygon: pts,
      areaSqm: Number(data.areaSqm ?? 0),
      perimeterM: Number(data.perimeterM ?? 0),
      waterType:
        (data.waterType as WaterFeature['waterType']) ?? 'Village Pond (Johad)',
    };
    return w;
  }
  if (featureClass === 'vegetation') {
    const v: VegetationFeature = {
      ...base,
      featureClass: 'vegetation',
      polygon: pts,
      areaSqm: Number(data.areaSqm ?? 0),
      coveragePct: Number(data.coveragePct ?? 0),
      canopyType: String(data.canopyType ?? 'Tree Canopy'),
    };
    return v;
  }
  const pcl: ParcelFeature = {
    ...base,
    featureClass: 'parcel',
    polygon: pts,
    parcelNo: String(data.parcelNo ?? 'ABADI-BLK-01'),
    areaSqm: Number(data.areaSqm ?? 0),
  };
  return pcl;
}

export async function ensureUserAccountRecords(
  user: User,
  defaultSettings: SystemSettings
): Promise<{ initializedDemo: boolean; settings: SystemSettings }> {
  const uid = user.uid;
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;
  const prefsPath = `users/${uid}/preferences/default`;

  let initializedDemo = false;
  let loadedSettings = defaultSettings;

  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const displayName = (user.displayName || 'GIS Analyst').slice(0, 120);

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        displayName,
        role: 'GIS Analyst',
        initializedDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      initializedDemo = Boolean(snap.data()?.initializedDemo);
      await updateDoc(userRef, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  try {
    const privRef = doc(db, 'users', uid, 'private', 'info');
    const privSnap = await getDoc(privRef);
    const email = (user.email || 'analyst@svamitva.local').slice(0, 200);
    if (!privSnap.exists()) {
      await setDoc(privRef, {
        uid,
        email,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(privRef, {
        email,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }

  try {
    const prefsRef = doc(db, 'users', uid, 'preferences', 'default');
    const prefsSnap = await getDoc(prefsRef);
    if (!prefsSnap.exists()) {
      await setDoc(prefsRef, {
        ownerId: uid,
        defaultCrs: defaultSettings.defaultCrs,
        defaultTileSize: defaultSettings.defaultTileSize,
        defaultConfidenceThreshold: defaultSettings.defaultConfidenceThreshold,
        autoVectorizePostInference: defaultSettings.autoVectorizePostInference,
        snapParcelToleranceM: defaultSettings.snapParcelToleranceM,
        exportIncludeMetadata: defaultSettings.exportIncludeMetadata,
        updatedAt: serverTimestamp(),
      });
    } else {
      const d = prefsSnap.data();
      loadedSettings = {
        defaultCrs: d.defaultCrs ?? defaultSettings.defaultCrs,
        defaultTileSize: d.defaultTileSize ?? defaultSettings.defaultTileSize,
        defaultConfidenceThreshold:
          d.defaultConfidenceThreshold ?? defaultSettings.defaultConfidenceThreshold,
        autoVectorizePostInference:
          d.autoVectorizePostInference ?? defaultSettings.autoVectorizePostInference,
        snapParcelToleranceM: d.snapParcelToleranceM ?? defaultSettings.snapParcelToleranceM,
        exportIncludeMetadata: d.exportIncludeMetadata ?? defaultSettings.exportIncludeMetadata,
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, prefsPath);
  }

  return { initializedDemo, settings: loadedSettings };
}

export async function markDemoInitialized(uid: string, value: boolean) {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      initializedDemo: value,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveUserPreferences(uid: string, settings: SystemSettings) {
  const path = `users/${uid}/preferences/default`;
  try {
    await updateDoc(doc(db, 'users', uid, 'preferences', 'default'), {
      defaultCrs: settings.defaultCrs,
      defaultTileSize: settings.defaultTileSize,
      defaultConfidenceThreshold: settings.defaultConfidenceThreshold,
      autoVectorizePostInference: settings.autoVectorizePostInference,
      snapParcelToleranceM: settings.snapParcelToleranceM,
      exportIncludeMetadata: settings.exportIncludeMetadata,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function createProjectInFirestore(uid: string, project: VillageProject) {
  const path = `projects/${project.id}`;
  try {
    await setDoc(doc(db, 'projects', project.id), serializeProjectPayload(uid, project, true));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateProjectFieldsInFirestore(
  projectId: string,
  fields: Record<string, unknown>
) {
  const path = `projects/${projectId}`;
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function persistProcessedProjectAndFeatures(
  uid: string,
  project: VillageProject,
  nextFeatures: GisFeature[]
) {
  const projectPath = `projects/${project.id}`;
  const featuresPath = `projects/${project.id}/features`;

  // Delete previous feature docs cleanly first
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'projects', project.id, 'features'), where('ownerId', '==', uid))
    );
    if (!existingSnap.empty) {
      const delBatch = writeBatch(db);
      existingSnap.docs.forEach((d) => delBatch.delete(d.ref));
      await delBatch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, featuresPath);
  }

  // Update project completion fields using allowed Action branch keys
  const payload = serializeProjectPayload(uid, project, false);
  try {
    await updateDoc(doc(db, 'projects', project.id), {
      status: payload.status,
      progress: payload.progress,
      lastProcessedAt: payload.lastProcessedAt,
      orthophoto: payload.orthophoto,
      segmentationSummary: payload.segmentationSummary,
      errorMessage: payload.errorMessage,
      stages: payload.stages,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, projectPath);
  }

  // Write newly extracted features in chunked atomic batches
  for (let i = 0; i < nextFeatures.length; i += 350) {
    const chunk = nextFeatures.slice(i, i + 350);
    const batch = writeBatch(db);
    for (const feat of chunk) {
      batch.set(
        doc(db, 'projects', project.id, 'features', feat.id),
        serializeFeatureDoc(uid, feat)
      );
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, featuresPath);
    }
  }
}

export async function seedProjectsAndFeaturesToFirestore(
  uid: string,
  projects: VillageProject[],
  features: GisFeature[]
) {
  for (const prj of projects) {
    const projPath = `projects/${prj.id}`;
    const featPath = `projects/${prj.id}/features`;
    const batch = writeBatch(db);
    batch.set(doc(db, 'projects', prj.id), serializeProjectPayload(uid, prj, true));
    const projFeatures = features.filter((f) => f.projectId === prj.id).slice(0, 350);
    for (const feat of projFeatures) {
      batch.set(
        doc(db, 'projects', prj.id, 'features', feat.id),
        serializeFeatureDoc(uid, feat)
      );
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${projPath} & ${featPath}`);
    }
  }
  await markDemoInitialized(uid, true);
}

export async function deleteProjectAndFeaturesFromFirestore(uid: string, projectId: string) {
  const featPath = `projects/${projectId}/features`;
  const projPath = `projects/${projectId}`;
  try {
    const snap = await getDocs(
      query(collection(db, 'projects', projectId, 'features'), where('ownerId', '==', uid))
    );
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, featPath);
  }
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, projPath);
  }
}

export async function clearAllUserProjectsInFirestore(uid: string) {
  const path = 'projects';
  try {
    const snap = await getDocs(
      query(collection(db, 'projects'), where('ownerId', '==', uid))
    );
    for (const prjDoc of snap.docs) {
      await deleteProjectAndFeaturesFromFirestore(uid, prjDoc.id);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}
