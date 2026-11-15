import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  AnalyticsTabId,
  AppNotification,
  BuildingFeature,
  GisFeature,
  LayerVisibility,
  OrthophotoMetadata,
  PageId,
  SegmentationModelId,
  SegmentationOutputs,
  SystemSettings,
  VillageProject,
} from '../types/gis';
import {
  buildStages,
  INITIAL_FEATURES,
  INITIAL_NOTIFICATIONS,
  INITIAL_PROJECTS,
  INITIAL_SETTINGS,
} from '../data/mockGisData';
import { runTiledDroneSegmentation } from '../utils/droneSegmentationEngine';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGooglePopup,
  signOutFirebase,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  clearAllUserProjectsInFirestore,
  createProjectInFirestore,
  deleteProjectAndFeaturesFromFirestore,
  deserializeFeatureDoc,
  deserializeProjectDoc,
  ensureUserAccountRecords,
  markDemoInitialized,
  persistProcessedProjectAndFeatures,
  sanitizeOrthophotoMeta,
  saveUserPreferences,
  seedProjectsAndFeaturesToFirestore,
  updateProjectFieldsInFirestore,
} from '../lib/firestoreSync';

interface CreateProjectInput {
  village: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  surveyDate: string;
  description: string;
}

export type DbSyncStatus = 'local' | 'syncing' | 'synced' | 'error';

interface GisContextValue {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  analyticsTab: AnalyticsTabId;
  setAnalyticsTab: (tab: AnalyticsTabId) => void;
  projects: VillageProject[];
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  activeProject: VillageProject | undefined;
  features: GisFeature[];
  activeProjectFeatures: GisFeature[];
  selectedFeatureId: string | null;
  setSelectedFeatureId: (id: string | null) => void;
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  notifications: AppNotification[];
  markAllNotificationsRead: () => void;
  settings: SystemSettings;
  updateSettings: (partial: Partial<SystemSettings>) => void;
  createProject: (input: CreateProjectInput) => VillageProject;
  attachOrthophoto: (projectId: string, meta: OrthophotoMetadata, rawFile?: File | null) => void;
  updateProcessingConfig: (
    projectId: string,
    config: {
      modelUsed: SegmentationModelId;
      tileSize: 256 | 512 | 1024;
      enabledClasses: ('Buildings' | 'Roads' | 'Water' | 'Vegetation')[];
    }
  ) => void;
  startProcessing: (projectId: string, simulateFailure?: boolean) => void;
  deleteProject: (projectId: string) => void;
  clearAllProjects: () => void;
  resetDemoData: () => void;
  layers: LayerVisibility;
  setLayers: React.Dispatch<React.SetStateAction<LayerVisibility>>;
  isLoggedOut: boolean;
  setIsLoggedOut: (val: boolean) => void;
  backendHealth: {
    checked: boolean;
    pythonBridgeReachable: boolean;
    modelFilePresent: boolean;
    activeEngine: string;
  };
  authUser: User | null;
  authReady: boolean;
  firestoreConnected: boolean;
  dbSyncStatus: DbSyncStatus;
  firebaseError: string | null;
  clearFirebaseError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutAccount: () => Promise<void>;
}

const GisContext = createContext<GisContextValue | undefined>(undefined);

function formatFirebaseErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
    if (parsed?.error) {
      if (parsed.error.toLowerCase().includes('permission')) {
        return `Cloud Firestore permission check blocked ${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'document'}. Verify Google sign-in & rules.`;
      }
      return parsed.error;
    }
  } catch {
    // Plain error message
  }
  return raw;
}

export function GisProvider({ children }: { children: React.ReactNode }) {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTabId>('village');
  const [projects, setProjects] = useState<VillageProject[]>(INITIAL_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState<string>(INITIAL_PROJECTS[0].id);
  const [features, setFeatures] = useState<GisFeature[]>(INITIAL_FEATURES);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  const [isLoggedOut, setIsLoggedOut] = useState<boolean>(false);
  const [layers, setLayers] = useState<LayerVisibility>({
    orthophoto: true,
    segmentationOverlay: false,
    buildings: true,
    roads: true,
    water: true,
    vegetation: true,
    parcels: true,
  });

  const [backendHealth, setBackendHealth] = useState({
    checked: false,
    pythonBridgeReachable: false,
    modelFilePresent: false,
    activeEngine: 'tiled-cv-segmentation',
  });

  // Firebase Auth + Cloud Firestore state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);
  const [dbSyncStatus, setDbSyncStatus] = useState<DbSyncStatus>('local');
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  // Refs for session-local files, high-res masks, roof crops, and snapshot subscriptions
  const uploadedFilesRef = useRef<Map<string, File>>(new Map());
  const localOrthoUrlsRef = useRef<Map<string, string>>(new Map());
  const localMasksRef = useRef<Map<string, SegmentationOutputs>>(new Map());
  const localRoofCropsRef = useRef<Map<string, string>>(new Map());
  const hydratedStaticRef = useRef<Set<string>>(new Set());
  const activeProjectIdRef = useRef<string>(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const authUserRef = useRef<User | null>(authUser);
  authUserRef.current = authUser;
  const initializedRef = useRef(false);

  const captureLocalArtifacts = (
    projectId: string,
    outputs: SegmentationOutputs,
    extracted: GisFeature[]
  ) => {
    localMasksRef.current.set(projectId, outputs);
    for (const f of extracted) {
      if (f.featureClass === 'building') {
        const b = f as BuildingFeature;
        if (b.roofPreviewUrl) {
          localRoofCropsRef.current.set(`${projectId}::${b.id}`, b.roofPreviewUrl);
        }
      }
    }
  };

  const computeBootstrapData = async (): Promise<{
    projects: VillageProject[];
    features: GisFeature[];
  }> => {
    const nextProjects = INITIAL_PROJECTS.map((p) => ({ ...p }));
    const nextFeatures: GisFeature[] = [];
    const bootstrapIds = ['PRJ-HR-2026-014', 'PRJ-UP-2026-021'];

    for (const pid of bootstrapIds) {
      const idx = nextProjects.findIndex((p) => p.id === pid);
      const prj = nextProjects[idx];
      if (!prj?.orthophoto?.imageUrl) continue;
      try {
        const result = await runTiledDroneSegmentation(prj.orthophoto.imageUrl, prj);
        hydratedStaticRef.current.add(pid);
        captureLocalArtifacts(pid, result.outputs, result.features);
        nextProjects[idx] = {
          ...prj,
          orthophoto: { ...prj.orthophoto, widthPx: result.width, heightPx: result.height },
          segmentationOutputs: result.outputs,
        };
        nextFeatures.push(...result.features);
      } catch (err) {
        console.warn(`Initial segmentation skipped for ${pid}:`, err);
      }
    }
    return { projects: nextProjects, features: nextFeatures };
  };

  const runLocalBootstrapSegmentation = async () => {
    const { projects: seededProjects, features: seededFeatures } = await computeBootstrapData();
    if (authUserRef.current) return;
    setProjects(seededProjects);
    setFeatures(seededFeatures);
    const activeBld = seededFeatures.find(
      (f) => f.projectId === activeProjectIdRef.current && f.featureClass === 'building'
    );
    if (activeBld) setSelectedFeatureId(activeBld.id);
  };

  // Lazy in-memory mask/crop hydration for Completed static-asset projects loaded from Firestore after reload
  const hydrateStaticMasksIfNeeded = async (prj: VillageProject) => {
    if (
      prj.status !== 'Completed' ||
      !prj.orthophoto?.imageUrl ||
      prj.orthophoto.imageUrl.startsWith('data:') ||
      prj.orthophoto.imageUrl.startsWith('blob:') ||
      localMasksRef.current.has(prj.id) ||
      hydratedStaticRef.current.has(prj.id)
    ) {
      return;
    }
    hydratedStaticRef.current.add(prj.id);
    try {
      const res = await runTiledDroneSegmentation(prj.orthophoto.imageUrl, prj, {
        tileSize: prj.tileSize,
        enabledClasses: prj.enabledClasses,
      });
      captureLocalArtifacts(prj.id, res.outputs, res.features);

      setProjects((prev) =>
        prev.map((p) =>
          p.id === prj.id
            ? {
                ...p,
                segmentationOutputs: p.segmentationOutputs
                  ? {
                      ...p.segmentationOutputs,
                      overlayUrl: res.outputs.overlayUrl,
                      buildingsMaskUrl: res.outputs.buildingsMaskUrl,
                      roadsMaskUrl: res.outputs.roadsMaskUrl,
                    }
                  : res.outputs,
              }
            : p
        )
      );

      setFeatures((prev) =>
        prev.map((f) => {
          if (f.projectId !== prj.id || f.featureClass !== 'building') return f;
          const crop = localRoofCropsRef.current.get(`${prj.id}::${f.id}`);
          return crop ? { ...f, roofPreviewUrl: crop } : f;
        })
      );
    } catch (err) {
      console.warn(`Mask hydration skipped for ${prj.id}:`, err);
    }
  };

  // Check Express /api/health, test Firestore server connectivity, and run initial local segmentation
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setBackendHealth({
            checked: true,
            pythonBridgeReachable: Boolean(data.pythonBridgeReachable),
            modelFilePresent: Boolean(data.modelFilePresent),
            activeEngine: data.activeEngine || 'tiled-cv-segmentation',
          });
        }
      })
      .catch(() => {
        setBackendHealth((prev) => ({ ...prev, checked: true }));
      });

    void testFirestoreConnection().then((ok) => setFirestoreConnected(ok));
    void runLocalBootstrapSegmentation();
  }, []);

  // Firebase Auth & Real-Time Firestore Listeners
  useEffect(() => {
    let cancelled = false;
    let projectsUnsub: (() => void) | null = null;
    const featureUnsubs = new Map<string, () => void>();
    const featuresByProject = new Map<string, GisFeature[]>();

    const cleanupListeners = () => {
      if (projectsUnsub) {
        projectsUnsub();
        projectsUnsub = null;
      }
      featureUnsubs.forEach((unsub) => unsub());
      featureUnsubs.clear();
      featuresByProject.clear();
    };

    const emitMergedFeatures = () => {
      const merged: GisFeature[] = [];
      featuresByProject.forEach((list) => {
        for (const f of list) {
          if (f.featureClass === 'building') {
            const crop = localRoofCropsRef.current.get(`${f.projectId}::${f.id}`);
            merged.push(crop ? { ...f, roofPreviewUrl: crop } : f);
          } else {
            merged.push(f);
          }
        }
      });
      setFeatures(merged);
    };

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      cleanupListeners();
      setAuthUser(user);
      setAuthReady(true);

      if (!user) {
        setDbSyncStatus('local');
        setFirebaseError(null);
        return;
      }

      setDbSyncStatus('syncing');
      setFirebaseError(null);

      try {
        const account = await ensureUserAccountRecords(user, INITIAL_SETTINGS);
        if (cancelled) return;
        setSettings(account.settings);

        if (!account.initializedDemo) {
          const seeded = await computeBootstrapData();
          if (cancelled) return;
          await seedProjectsAndFeaturesToFirestore(user.uid, seeded.projects, seeded.features);
        }

        if (cancelled) return;

        const projectsQuery = query(
          collection(db, 'projects'),
          where('ownerId', '==', user.uid)
        );

        projectsUnsub = onSnapshot(
          projectsQuery,
          (snapshot) => {
            if (cancelled) return;
            const docs = snapshot.docs.map((d) => {
              const raw = deserializeProjectDoc(d.data() as Record<string, unknown>);
              const localUrl = localOrthoUrlsRef.current.get(raw.id);
              const localMask = localMasksRef.current.get(raw.id);

              const hydratedOrtho =
                raw.orthophoto && !raw.orthophoto.imageUrl && localUrl
                  ? { ...raw.orthophoto, imageUrl: localUrl }
                  : raw.orthophoto;

              const hydratedSeg =
                raw.segmentationOutputs && localMask
                  ? {
                      ...raw.segmentationOutputs,
                      overlayUrl: localMask.overlayUrl,
                      buildingsMaskUrl: localMask.buildingsMaskUrl,
                      roadsMaskUrl: localMask.roadsMaskUrl,
                    }
                  : raw.segmentationOutputs;

              const mergedPrj: VillageProject = {
                ...raw,
                orthophoto: hydratedOrtho,
                segmentationOutputs: hydratedSeg,
              };

              if (mergedPrj.status === 'Completed' && (!hydratedSeg || !hydratedSeg.overlayUrl)) {
                void hydrateStaticMasksIfNeeded(mergedPrj);
              }
              return mergedPrj;
            });

            docs.sort((a, b) => (a.id > b.id ? 1 : -1));
            setProjects(docs);
            setDbSyncStatus('synced');

            if (docs.length > 0 && !docs.some((p) => p.id === activeProjectIdRef.current)) {
              setActiveProjectId(docs[0].id);
            } else if (docs.length === 0) {
              setActiveProjectId('');
            }

            // Reconcile per-project /features subcollection listeners
            const currentIds = new Set(docs.map((d) => d.id));
            for (const [pid, unsub] of featureUnsubs.entries()) {
              if (!currentIds.has(pid)) {
                unsub();
                featureUnsubs.delete(pid);
                featuresByProject.delete(pid);
              }
            }

            for (const prj of docs) {
              if (!featureUnsubs.has(prj.id)) {
                const featQ = query(
                  collection(db, 'projects', prj.id, 'features'),
                  where('ownerId', '==', user.uid)
                );
                const fUnsub = onSnapshot(
                  featQ,
                  (fSnap) => {
                    if (cancelled) return;
                    const parsed = fSnap.docs
                      .map((fd) => deserializeFeatureDoc(fd.data() as Record<string, unknown>))
                      .filter((f): f is GisFeature => Boolean(f));
                    featuresByProject.set(prj.id, parsed);
                    emitMergedFeatures();
                  },
                  (err) => {
                    setDbSyncStatus('error');
                    setFirebaseError(formatFirebaseErrorMessage(err));
                    handleFirestoreError(err, OperationType.LIST, `projects/${prj.id}/features`);
                  }
                );
                featureUnsubs.set(prj.id, fUnsub);
              }
            }
            emitMergedFeatures();
          },
          (err) => {
            setDbSyncStatus('error');
            setFirebaseError(formatFirebaseErrorMessage(err));
            handleFirestoreError(err, OperationType.LIST, 'projects');
          }
        );
      } catch (err) {
        if (!cancelled) {
          setDbSyncStatus('error');
          setFirebaseError(formatFirebaseErrorMessage(err));
        }
      }
    });

    return () => {
      cancelled = true;
      unsubAuth();
      cleanupListeners();
    };
  }, []);

  const signInWithGoogle = async () => {
    setFirebaseError(null);
    try {
      await signInWithGooglePopup();
      setIsLoggedOut(false);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      setFirebaseError(formatFirebaseErrorMessage(err));
    }
  };

  const signOutAccount = async () => {
    try {
      if (auth.currentUser) {
        await signOutFirebase();
      }
      setIsLoggedOut(true);
    } catch (err) {
      setFirebaseError(formatFirebaseErrorMessage(err));
    }
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const activeProjectFeatures = activeProject
    ? features.filter((f) => f.projectId === activeProject.id)
    : [];

  useEffect(() => {
    if (!activeProject) {
      setSelectedFeatureId(null);
      return;
    }
    const belongs = features.some(
      (f) => f.id === selectedFeatureId && f.projectId === activeProject.id
    );
    if (!belongs) {
      const firstBuilding = features.find(
        (f) => f.projectId === activeProject.id && f.featureClass === 'building'
      );
      setSelectedFeatureId(firstBuilding ? firstBuilding.id : null);
    }
  }, [activeProjectId, activeProject, features, selectedFeatureId]);

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const updateSettings = (partial: Partial<SystemSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      if (authUserRef.current) {
        void saveUserPreferences(authUserRef.current.uid, next).catch((err) => {
          setDbSyncStatus('error');
          setFirebaseError(formatFirebaseErrorMessage(err));
        });
      }
      return next;
    });
  };

  const createProject = (input: CreateProjectInput): VillageProject => {
    const cleanCode =
      input.state
        .replace(/[^a-zA-Z]/g, '')
        .slice(0, 2)
        .toUpperCase() || 'IN';
    const suffix = `${String(projects.length + 43).padStart(3, '0')}-${String(Date.now()).slice(-4)}`;
    const newProject: VillageProject = {
      id: `PRJ-${cleanCode}-2026-${suffix}`,
      village: input.village,
      district: input.district,
      state: input.state,
      latitude: input.latitude,
      longitude: input.longitude,
      surveyDate: input.surveyDate,
      description: input.description,
      status: 'Draft',
      progress: 0,
      modelUsed: 'U-Net',
      modelVersion: 'U-Net ResNet-18 (final_drone_model)',
      tileSize: settings.defaultTileSize,
      enabledClasses: ['Buildings', 'Roads', 'Water', 'Vegetation'],
      orthophoto: null,
      lastProcessedAt: 'Not processed',
      wards: ['Ward 01 - Central Abadi'],
      stages: buildStages(0),
    };
    setProjects((prev) => [newProject, ...prev]);
    setActiveProjectId(newProject.id);

    if (authUserRef.current) {
      setDbSyncStatus('syncing');
      void createProjectInFirestore(authUserRef.current.uid, newProject)
        .then(() => setDbSyncStatus('synced'))
        .catch((err) => {
          setDbSyncStatus('error');
          setFirebaseError(formatFirebaseErrorMessage(err));
        });
    }
    return newProject;
  };

  const attachOrthophoto = (
    projectId: string,
    meta: OrthophotoMetadata,
    rawFile?: File | null
  ) => {
    if (rawFile) {
      uploadedFilesRef.current.set(projectId, rawFile);
    } else {
      uploadedFilesRef.current.delete(projectId);
    }
    if (meta.imageUrl) {
      localOrthoUrlsRef.current.set(projectId, meta.imageUrl);
    }
    localMasksRef.current.delete(projectId);

    const nextStages = buildStages(2);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              orthophoto: meta,
              segmentationOutputs: undefined,
              status: 'Pending',
              progress: 0,
              errorMessage: undefined,
              stages: nextStages,
            }
          : p
      )
    );

    if (authUserRef.current) {
      setDbSyncStatus('syncing');
      void updateProjectFieldsInFirestore(projectId, {
        orthophoto: sanitizeOrthophotoMeta(meta),
        segmentationSummary: null,
        status: 'Pending',
        progress: 0,
        errorMessage: null,
        stages: nextStages,
      })
        .then(() => setDbSyncStatus('synced'))
        .catch((err) => {
          setDbSyncStatus('error');
          setFirebaseError(formatFirebaseErrorMessage(err));
        });
    }
  };

  const updateProcessingConfig = (
    projectId: string,
    config: {
      modelUsed: SegmentationModelId;
      tileSize: 256 | 512 | 1024;
      enabledClasses: ('Buildings' | 'Roads' | 'Water' | 'Vegetation')[];
    }
  ) => {
    const versionMap: Record<SegmentationModelId, string> = {
      SegFormer: 'SegFormer-B4 v2.3',
      'DeepLabV3+': 'DeepLabV3+ v1.8',
      'U-Net': 'U-Net ResNet-18 (final_drone_model)',
    };
    const modelVersion = versionMap[config.modelUsed];

    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              modelUsed: config.modelUsed,
              modelVersion,
              tileSize: config.tileSize,
              enabledClasses: config.enabledClasses,
            }
          : p
      )
    );

    if (authUserRef.current) {
      void updateProjectFieldsInFirestore(projectId, {
        modelUsed: config.modelUsed,
        modelVersion,
        tileSize: config.tileSize,
        enabledClasses: config.enabledClasses,
      }).catch((err) => {
        setDbSyncStatus('error');
        setFirebaseError(formatFirebaseErrorMessage(err));
      });
    }
  };

  const startProcessing = (projectId: string, simulateFailure = false) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target || !target.orthophoto) return;

    const processingStages = buildStages(1);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              status: 'Processing',
              progress: 12,
              errorMessage: undefined,
              stages: processingStages,
            }
          : p
      )
    );

    if (authUserRef.current) {
      setDbSyncStatus('syncing');
      void updateProjectFieldsInFirestore(projectId, {
        status: 'Processing',
        progress: 12,
        errorMessage: null,
        stages: processingStages,
      }).catch((err) => {
        setDbSyncStatus('error');
        setFirebaseError(formatFirebaseErrorMessage(err));
      });
    }

    const runRealInference = async () => {
      try {
        for (const s of [2, 3, 4]) {
          await new Promise((r) => setTimeout(r, 200));
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectId
                ? { ...p, progress: Math.round((s / 9) * 100), stages: buildStages(s) }
                : p
            )
          );
        }

        if (simulateFailure) {
          await new Promise((r) => setTimeout(r, 240));
          const failMsg =
            'AI Inference halted: Corrupted raster band metadata in tile batch (x:08, y:12). Verify GeoTIFF CRS and retry.';
          const failStages = buildStages(4, 5);
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    status: 'Failed',
                    progress: 48,
                    errorMessage: failMsg,
                    stages: failStages,
                  }
                : p
            )
          );
          if (authUserRef.current) {
            void updateProjectFieldsInFirestore(projectId, {
              status: 'Failed',
              progress: 48,
              errorMessage: failMsg,
              stages: failStages,
            }).catch((err) => {
              setDbSyncStatus('error');
              setFirebaseError(formatFirebaseErrorMessage(err));
            });
          }
          setNotifications((prev) => [
            {
              id: `NTF-${Date.now()}`,
              title: `${target.village} processing failed`,
              detail: 'Inference halted at Stage 5 (AI Inference). Check tile configuration.',
              timestamp: 'Just now',
              read: false,
              type: 'warning',
            },
            ...prev,
          ]);
          return;
        }

        let flaskMasks:
          | { overlayUrl: string; buildingsMaskUrl: string; roadsMaskUrl: string }
          | undefined;

        try {
          const form = new FormData();
          const storedFile = uploadedFilesRef.current.get(projectId);
          if (storedFile) {
            form.append('image', storedFile);
          } else {
            const imgResp = await fetch(target.orthophoto!.imageUrl);
            const blob = await imgResp.blob();
            form.append('image', blob, target.orthophoto!.fileName);
          }

          const apiRes = await fetch('/api/analyze', {
            method: 'POST',
            body: form,
          });
          if (apiRes.ok) {
            const payload = (await apiRes.json()) as {
              source?: string;
              overlay?: string;
              buildings?: string;
              roads?: string;
            };
            if (
              payload.source === 'pytorch-flask' &&
              payload.overlay &&
              payload.buildings &&
              payload.roads
            ) {
              flaskMasks = {
                overlayUrl: payload.overlay,
                buildingsMaskUrl: payload.buildings,
                roadsMaskUrl: payload.roads,
              };
            }
          }
        } catch {
          // Proceed with local tiled CV + TensorFlow.js RoofNet CNN
        }

        const segResult = await runTiledDroneSegmentation(
          target.orthophoto!.imageUrl,
          target,
          {
            tileSize: target.tileSize,
            enabledClasses: target.enabledClasses,
            flaskMasks,
          }
        );

        captureLocalArtifacts(projectId, segResult.outputs, segResult.features);

        for (const s of [6, 7, 8]) {
          await new Promise((r) => setTimeout(r, 160));
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectId
                ? { ...p, progress: Math.round((s / 9) * 100), stages: buildStages(s) }
                : p
            )
          );
        }

        const nowStr = new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const completedProject: VillageProject = {
          ...target,
          status: 'Completed',
          progress: 100,
          lastProcessedAt: `Today ${nowStr} IST`,
          orthophoto: target.orthophoto
            ? {
                ...target.orthophoto,
                widthPx: segResult.width,
                heightPx: segResult.height,
              }
            : null,
          segmentationOutputs: segResult.outputs,
          errorMessage: undefined,
          stages: buildStages(9),
        };

        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? completedProject : p))
        );

        setFeatures((prev) => [
          ...prev.filter((f) => f.projectId !== projectId),
          ...segResult.features,
        ]);

        if (authUserRef.current) {
          setDbSyncStatus('syncing');
          await persistProcessedProjectAndFeatures(
            authUserRef.current.uid,
            completedProject,
            segResult.features
          );
          setDbSyncStatus('synced');
        }

        const firstBld = segResult.features.find((f) => f.featureClass === 'building');
        if (firstBld && activeProjectIdRef.current === projectId) {
          setSelectedFeatureId(firstBld.id);
        }

        setNotifications((prev) => [
          {
            id: `NTF-${Date.now()}`,
            title: `${target.village} extraction completed`,
            detail: `Extracted ${segResult.features.length} features with TensorFlow.js RoofNet-2D CNN${
              authUserRef.current ? ' & saved to Firestore' : ''
            }.`,
            timestamp: 'Just now',
            read: false,
            type: 'success',
          },
          ...prev,
        ]);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'Failed to process orthophoto image.';
        const failStages = buildStages(4, 5);
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  status: 'Failed',
                  progress: 48,
                  errorMessage: errMsg,
                  stages: failStages,
                }
              : p
          )
        );
        if (authUserRef.current) {
          setDbSyncStatus('error');
          setFirebaseError(formatFirebaseErrorMessage(err));
          void updateProjectFieldsInFirestore(projectId, {
            status: 'Failed',
            progress: 48,
            errorMessage: errMsg.slice(0, 500),
            stages: failStages,
          }).catch(() => undefined);
        }
      }
    };

    void runRealInference();
  };

  const deleteProject = (projectId: string) => {
    uploadedFilesRef.current.delete(projectId);
    localOrthoUrlsRef.current.delete(projectId);
    localMasksRef.current.delete(projectId);
    setFeatures((prev) => prev.filter((f) => f.projectId !== projectId));
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== projectId);
      if (activeProjectIdRef.current === projectId) {
        setActiveProjectId(next[0]?.id ?? '');
      }
      return next;
    });
    if (authUserRef.current) {
      setDbSyncStatus('syncing');
      void deleteProjectAndFeaturesFromFirestore(authUserRef.current.uid, projectId)
        .then(() => setDbSyncStatus('synced'))
        .catch((err) => {
          setDbSyncStatus('error');
          setFirebaseError(formatFirebaseErrorMessage(err));
        });
    }
  };

  const clearAllProjects = () => {
    uploadedFilesRef.current.clear();
    localOrthoUrlsRef.current.clear();
    localMasksRef.current.clear();
    setProjects([]);
    setFeatures([]);
    setActiveProjectId('');
    setSelectedFeatureId(null);

    if (authUserRef.current) {
      setDbSyncStatus('syncing');
      void clearAllUserProjectsInFirestore(authUserRef.current.uid)
        .then(() => setDbSyncStatus('synced'))
        .catch((err) => {
          setDbSyncStatus('error');
          setFirebaseError(formatFirebaseErrorMessage(err));
        });
    }
  };

  const resetDemoData = () => {
    uploadedFilesRef.current.clear();
    localOrthoUrlsRef.current.clear();
    localMasksRef.current.clear();
    hydratedStaticRef.current.clear();

    if (authUserRef.current) {
      const uid = authUserRef.current.uid;
      setDbSyncStatus('syncing');
      void (async () => {
        try {
          await clearAllUserProjectsInFirestore(uid);
          await markDemoInitialized(uid, false);
          const seeded = await computeBootstrapData();
          await seedProjectsAndFeaturesToFirestore(uid, seeded.projects, seeded.features);
          setActiveProjectId(INITIAL_PROJECTS[0].id);
          setNotifications(INITIAL_NOTIFICATIONS);
          setDbSyncStatus('synced');
        } catch (err) {
          setDbSyncStatus('error');
          setFirebaseError(formatFirebaseErrorMessage(err));
        }
      })();
      return;
    }

    setProjects(INITIAL_PROJECTS);
    setFeatures(INITIAL_FEATURES);
    setActiveProjectId(INITIAL_PROJECTS[0].id);
    activeProjectIdRef.current = INITIAL_PROJECTS[0].id;
    setSelectedFeatureId(null);
    setNotifications(INITIAL_NOTIFICATIONS);
    void runLocalBootstrapSegmentation();
  };

  return (
    <GisContext.Provider
      value={{
        activePage,
        setActivePage,
        analyticsTab,
        setAnalyticsTab,
        projects,
        activeProjectId,
        setActiveProjectId,
        activeProject,
        features,
        activeProjectFeatures,
        selectedFeatureId,
        setSelectedFeatureId,
        globalSearch,
        setGlobalSearch,
        notifications,
        markAllNotificationsRead,
        settings,
        updateSettings,
        createProject,
        attachOrthophoto,
        updateProcessingConfig,
        startProcessing,
        deleteProject,
        clearAllProjects,
        resetDemoData,
        layers,
        setLayers,
        isLoggedOut,
        setIsLoggedOut,
        backendHealth,
        authUser,
        authReady,
        firestoreConnected,
        dbSyncStatus,
        firebaseError,
        clearFirebaseError: () => setFirebaseError(null),
        signInWithGoogle,
        signOutAccount,
      }}
    >
      {children}
    </GisContext.Provider>
  );
}

export function useGis() {
  const ctx = useContext(GisContext);
  if (!ctx) throw new Error('useGis must be used inside GisProvider');
  return ctx;
}
