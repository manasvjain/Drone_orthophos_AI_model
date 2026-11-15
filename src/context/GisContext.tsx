import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  AnalyticsTabId,
  AppNotification,
  GisFeature,
  LayerVisibility,
  OrthophotoMetadata,
  PageId,
  SegmentationModelId,
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

interface CreateProjectInput {
  village: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  surveyDate: string;
  description: string;
}

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
}

const GisContext = createContext<GisContextValue | undefined>(undefined);

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

  // Store actual uploaded File objects by projectId so POST /api/analyze can send the real file
  const uploadedFilesRef = useRef<Map<string, File>>(new Map());
  const activeProjectIdRef = useRef<string>(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const initializedRef = useRef(false);

  const runBootstrapSegmentation = async () => {
    const bootstrapIds = ['PRJ-HR-2026-014', 'PRJ-UP-2026-021'];
    for (const pid of bootstrapIds) {
      const prj = INITIAL_PROJECTS.find((p) => p.id === pid);
      if (!prj?.orthophoto?.imageUrl) continue;
      try {
        const result = await runTiledDroneSegmentation(prj.orthophoto.imageUrl, prj);
        setProjects((prev) =>
          prev.map((p) =>
            p.id === pid
              ? {
                  ...p,
                  orthophoto: p.orthophoto
                    ? { ...p.orthophoto, widthPx: result.width, heightPx: result.height }
                    : null,
                  segmentationOutputs: result.outputs,
                }
              : p
          )
        );
        setFeatures((prev) => [
          ...prev.filter((f) => f.projectId !== pid),
          ...result.features,
        ]);
        if (activeProjectIdRef.current === pid) {
          const firstBld = result.features.find((f) => f.featureClass === 'building');
          if (firstBld) setSelectedFeatureId(firstBld.id);
        }
      } catch (err) {
        console.warn(`Initial segmentation skipped for ${pid}:`, err);
      }
    }
  };

  // Check Express /api/health & run initial real segmentation on the two uploaded UAV orthophotos
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

    void runBootstrapSegmentation();
  }, []);

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
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const createProject = (input: CreateProjectInput): VillageProject => {
    const code = input.state.slice(0, 2).toUpperCase() || 'IN';
    const nextNum = String(projects.length + 43).padStart(3, '0');
    const newProject: VillageProject = {
      id: `PRJ-${code}-2026-${nextNum}`,
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
      tileSize: 256,
      enabledClasses: ['Buildings', 'Roads', 'Water', 'Vegetation'],
      orthophoto: null,
      lastProcessedAt: 'Not processed',
      wards: ['Ward 01 - Central Abadi'],
      stages: buildStages(0),
    };
    setProjects((prev) => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
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
              stages: buildStages(2),
            }
          : p
      )
    );
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
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              modelUsed: config.modelUsed,
              modelVersion: versionMap[config.modelUsed],
              tileSize: config.tileSize,
              enabledClasses: config.enabledClasses,
            }
          : p
      )
    );
  };

  const startProcessing = (projectId: string, simulateFailure = false) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target || !target.orthophoto) return;

    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              status: 'Processing',
              progress: 12,
              errorMessage: undefined,
              stages: buildStages(1),
            }
          : p
      )
    );

    const runRealInference = async () => {
      try {
        // Step 1-4 progression
        for (const s of [2, 3, 4]) {
          await new Promise((r) => setTimeout(r, 220));
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectId
                ? { ...p, progress: Math.round((s / 9) * 100), stages: buildStages(s) }
                : p
            )
          );
        }

        if (simulateFailure) {
          await new Promise((r) => setTimeout(r, 260));
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    status: 'Failed',
                    progress: 48,
                    errorMessage:
                      'AI Inference halted: Corrupted raster band metadata in tile batch (x:08, y:12). Verify GeoTIFF CRS and retry.',
                    stages: buildStages(4, 5),
                  }
                : p
            )
          );
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

        // Stage 5: AI Inference via /api/analyze (forwards to Flask U-Net if running, else runs tiled CV engine)
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
          // Proceed with local tiled segmentation engine
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

        // Stages 6-9 completion
        for (const s of [6, 7, 8]) {
          await new Promise((r) => setTimeout(r, 180));
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

        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  status: 'Completed',
                  progress: 100,
                  lastProcessedAt: `Today ${nowStr} IST`,
                  orthophoto: p.orthophoto
                    ? {
                        ...p.orthophoto,
                        widthPx: segResult.width,
                        heightPx: segResult.height,
                      }
                    : null,
                  segmentationOutputs: segResult.outputs,
                  stages: buildStages(9),
                }
              : p
          )
        );

        setFeatures((prev) => [
          ...prev.filter((f) => f.projectId !== projectId),
          ...segResult.features,
        ]);

        const firstBld = segResult.features.find((f) => f.featureClass === 'building');
        if (firstBld && activeProjectIdRef.current === projectId) {
          setSelectedFeatureId(firstBld.id);
        }

        setNotifications((prev) => [
          {
            id: `NTF-${Date.now()}`,
            title: `${target.village} extraction completed`,
            detail: `Extracted ${segResult.features.length} vector features via ${
              segResult.outputs.inferenceEngine === 'pytorch-flask'
                ? 'PyTorch U-Net (ResNet-18)'
                : '256×256 Tiled Segmentation Engine'
            }.`,
            timestamp: 'Just now',
            read: false,
            type: 'success',
          },
          ...prev,
        ]);
      } catch (err) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  status: 'Failed',
                  progress: 48,
                  errorMessage:
                    err instanceof Error ? err.message : 'Failed to process orthophoto image.',
                  stages: buildStages(4, 5),
                }
              : p
          )
        );
      }
    };

    void runRealInference();
  };

  const deleteProject = (projectId: string) => {
    uploadedFilesRef.current.delete(projectId);
    setFeatures((prev) => prev.filter((f) => f.projectId !== projectId));
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== projectId);
      if (activeProjectIdRef.current === projectId) {
        setActiveProjectId(next[0]?.id ?? '');
      }
      return next;
    });
  };

  const clearAllProjects = () => {
    uploadedFilesRef.current.clear();
    setProjects([]);
    setFeatures([]);
    setActiveProjectId('');
    setSelectedFeatureId(null);
  };

  const resetDemoData = () => {
    uploadedFilesRef.current.clear();
    setProjects(INITIAL_PROJECTS);
    setFeatures(INITIAL_FEATURES);
    setActiveProjectId(INITIAL_PROJECTS[0].id);
    activeProjectIdRef.current = INITIAL_PROJECTS[0].id;
    setSelectedFeatureId(null);
    setNotifications(INITIAL_NOTIFICATIONS);
    void runBootstrapSegmentation();
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
