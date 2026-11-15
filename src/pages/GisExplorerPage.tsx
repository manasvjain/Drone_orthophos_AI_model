import { useEffect, useMemo, useState } from 'react';
import { Filter, Layers, PanelLeft, PanelRight, RotateCcw } from 'lucide-react';
import { useGis } from '../context/GisContext';
import {
  BasemapMode,
  BuildingFeature,
  ExplorerFilters,
  FeatureClass,
  LayerVisibility,
  RoofType,
} from '../types/gis';
import { LayerToggle } from '../components/ui/LayerToggle';
import { GisMapCanvas } from '../components/map/GisMapCanvas';
import { FeatureInspector } from '../components/map/FeatureInspector';
import { EmptyState } from '../components/ui/StateBlocks';

const DEFAULT_FILTERS: ExplorerFilters = {
  featureType: 'all',
  roofTypes: ['RCC', 'Tiled', 'Tin', 'Other', 'Unknown'],
  minArea: 0,
  maxArea: 2500,
  minConfidence: 0.6,
  ward: 'All',
  modelVersion: 'All',
};

export function GisExplorerPage() {
  const {
    activeProject,
    activeProjectFeatures,
    selectedFeatureId,
    setSelectedFeatureId,
    layers,
    setLayers,
    setActivePage,
  } = useGis();

  const [basemap, setBasemap] = useState<BasemapMode>('orthophoto');
  const [draftFilters, setDraftFilters] = useState<ExplorerFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ExplorerFilters>(DEFAULT_FILTERS);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [zoomTargetId, setZoomTargetId] = useState<string | null>(null);
  const [activeLayerLabel, setActiveLayerLabel] = useState<string>('Building Footprints');
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  useEffect(() => {
    setZoomTargetId(null);
  }, [activeProject?.id]);

  const wardsList = useMemo(() => {
    const set = new Set(activeProjectFeatures.map((f) => f.ward));
    return ['All', ...Array.from(set)];
  }, [activeProjectFeatures]);

  const modelVersions = useMemo(() => {
    const set = new Set(activeProjectFeatures.map((f) => f.modelVersion));
    return ['All', ...Array.from(set)];
  }, [activeProjectFeatures]);

  const filteredFeatures = useMemo(() => {
    return activeProjectFeatures.filter((f) => {
      if (appliedFilters.featureType !== 'all' && f.featureClass !== appliedFilters.featureType) {
        return false;
      }
      if (f.confidence < appliedFilters.minConfidence) return false;
      if (appliedFilters.ward !== 'All' && f.ward !== appliedFilters.ward) return false;
      if (
        appliedFilters.modelVersion !== 'All' &&
        f.modelVersion !== appliedFilters.modelVersion
      ) {
        return false;
      }
      if (f.featureClass === 'building') {
        const b = f as BuildingFeature;
        if (!appliedFilters.roofTypes.includes(b.roofType)) return false;
        if (b.areaSqm < appliedFilters.minArea || b.areaSqm > appliedFilters.maxArea) {
          return false;
        }
      }
      return true;
    });
  }, [activeProjectFeatures, appliedFilters]);

  const countsByClass = useMemo(() => {
    return {
      building: filteredFeatures.filter((f) => f.featureClass === 'building').length,
      road: filteredFeatures.filter((f) => f.featureClass === 'road').length,
      water: filteredFeatures.filter((f) => f.featureClass === 'water').length,
      vegetation: filteredFeatures.filter((f) => f.featureClass === 'vegetation').length,
      parcel: filteredFeatures.filter((f) => f.featureClass === 'parcel').length,
    };
  }, [filteredFeatures]);

  const visibleFeaturesCount = useMemo(() => {
    return filteredFeatures.filter((f) => {
      if (f.featureClass === 'building') return layers.buildings;
      if (f.featureClass === 'road') return layers.roads;
      if (f.featureClass === 'water') return layers.water;
      if (f.featureClass === 'vegetation') return layers.vegetation;
      if (f.featureClass === 'parcel') return layers.parcels;
      return true;
    }).length;
  }, [filteredFeatures, layers]);

  const selectedFeature = useMemo(
    () => activeProjectFeatures.find((f) => f.id === selectedFeatureId),
    [activeProjectFeatures, selectedFeatureId]
  );

  const toggleLayer = (key: keyof LayerVisibility, label?: string) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
    if (label) setActiveLayerLabel(label);
  };

  const toggleRoofType = (rt: RoofType) => {
    setDraftFilters((prev) => {
      const exists = prev.roofTypes.includes(rt);
      const next = exists ? prev.roofTypes.filter((t) => t !== rt) : [...prev.roofTypes, rt];
      return { ...prev, roofTypes: next };
    });
  };

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const handleClearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const currentScale = `1 : ${Math.round(1500 / zoomLevel).toLocaleString()}`;

  const leftPanelContent = (
    <div className="h-full flex flex-col bg-white border-r border-[#E4E6DF] w-[250px] shrink-0 overflow-y-auto">
      {/* Layer Manager */}
      <div className="p-3.5 border-b border-[#E4E6DF] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#252A27]">
            <Layers size={13} strokeWidth={1.75} className="text-[#496B54]" />
            <span>Layer Manager</span>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[#727A75]">
            {visibleFeaturesCount} visible
          </span>
        </div>

        <div className="space-y-1">
          <LayerToggle
            label="Original Orthophoto"
            checked={layers.orthophoto}
            onChange={() => toggleLayer('orthophoto', 'Original Orthophoto')}
            swatchColor="#8F9689"
            swatchStyle="raster"
          />
          <LayerToggle
            label="U-Net Pixel Mask Overlay"
            checked={layers.segmentationOverlay}
            onChange={() => toggleLayer('segmentationOverlay', 'U-Net Pixel Mask Overlay')}
            swatchColor="#496B54"
            swatchStyle="raster"
          />
          <LayerToggle
            label="Building Footprints"
            checked={layers.buildings}
            onChange={() => toggleLayer('buildings', 'Building Footprints')}
            swatchColor="#B77B61"
            count={countsByClass.building}
          />
          <LayerToggle
            label="Roads"
            checked={layers.roads}
            onChange={() => toggleLayer('roads', 'Roads')}
            swatchColor="#C88E41"
            swatchStyle="line"
            count={countsByClass.road}
          />
          <LayerToggle
            label="Water Bodies"
            checked={layers.water}
            onChange={() => toggleLayer('water', 'Water Bodies')}
            swatchColor="#567C94"
            count={countsByClass.water}
          />
          <LayerToggle
            label="Vegetation"
            checked={layers.vegetation}
            onChange={() => toggleLayer('vegetation', 'Vegetation')}
            swatchColor="#5E8061"
            count={countsByClass.vegetation}
          />
          <LayerToggle
            label="Candidate Parcels"
            checked={layers.parcels}
            onChange={() => toggleLayer('parcels', 'Candidate Parcels')}
            swatchColor="#7B7387"
            swatchStyle="dashed"
            count={countsByClass.parcel}
          />
        </div>

        {/* Compact Symbology Legend */}
        <div className="pt-2 border-t border-[#E4E6DF]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#727A75] mb-1.5">
            Cartographic Legend
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[#4B524E]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#B77B61]/55 border border-[#8E533B] rounded-[1px]" />
              <span>Buildings</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-[2.5px] bg-[#C88E41]" />
              <span>Roads</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#567C94]/55 border border-[#3E6278] rounded-[1px]" />
              <span>Water</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#5E8061]/45 border border-[#4B6C4E] rounded-[1px]" />
              <span>Vegetation</span>
            </div>
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="w-2.5 h-2.5 border border-dashed border-[#7B7387] rounded-[1px]" />
              <span>Candidate Parcel Boundary</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="p-3.5 space-y-3 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#252A27]">
          <Filter size={13} strokeWidth={1.75} className="text-[#496B54]" />
          <span>Attribute Filters</span>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#727A75] mb-1">
            Feature Type
          </label>
          <select
            value={draftFilters.featureType}
            onChange={(e) =>
              setDraftFilters((prev) => ({
                ...prev,
                featureType: e.target.value as 'all' | FeatureClass,
              }))
            }
            className="w-full h-8 px-2 text-xs bg-[#FAFBF8] border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
          >
            <option value="all">All Feature Classes</option>
            <option value="building">Buildings</option>
            <option value="road">Roads</option>
            <option value="water">Water Bodies</option>
            <option value="vegetation">Vegetation</option>
            <option value="parcel">Candidate Parcels</option>
          </select>
        </div>

        <div>
          <div className="text-[11px] font-medium text-[#727A75] mb-1">Roof Type</div>
          <div className="flex flex-wrap gap-1.5">
            {(['RCC', 'Tiled', 'Tin', 'Other', 'Unknown'] as RoofType[]).map((rt) => {
              const active = draftFilters.roofTypes.includes(rt);
              return (
                <button
                  key={rt}
                  type="button"
                  onClick={() => toggleRoofType(rt)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-[3px] border transition-colors ${
                    active
                      ? 'bg-[#EEF2EE] border-[#496B54] text-[#2F4A38]'
                      : 'bg-white border-[#E4E6DF] text-[#727A75]'
                  }`}
                >
                  {rt}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] text-[#727A75] mb-1">
            <span>Building Area (m²)</span>
            <span className="font-mono tabular-nums text-[#252A27]">
              {draftFilters.minArea}–{draftFilters.maxArea}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="number"
              min={0}
              max={draftFilters.maxArea}
              value={draftFilters.minArea}
              onChange={(e) =>
                setDraftFilters((p) => ({ ...p, minArea: Number(e.target.value) || 0 }))
              }
              aria-label="Minimum building area"
              className="h-7 px-2 text-xs font-mono tabular-nums border border-[#E4E6DF] rounded-[4px]"
            />
            <input
              type="number"
              min={draftFilters.minArea}
              max={10000}
              value={draftFilters.maxArea}
              onChange={(e) =>
                setDraftFilters((p) => ({ ...p, maxArea: Number(e.target.value) || 2500 }))
              }
              aria-label="Maximum building area"
              className="h-7 px-2 text-xs font-mono tabular-nums border border-[#E4E6DF] rounded-[4px]"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] text-[#727A75] mb-1">
            <span>Minimum Confidence</span>
            <span className="font-mono tabular-nums font-medium text-[#252A27]">
              {(draftFilters.minConfidence * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={0.98}
            step={0.02}
            value={draftFilters.minConfidence}
            onChange={(e) =>
              setDraftFilters((p) => ({
                ...p,
                minConfidence: Number.parseFloat(e.target.value),
              }))
            }
            className="w-full accent-[#496B54]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#727A75] mb-1">
            Revenue Ward
          </label>
          <select
            value={draftFilters.ward}
            onChange={(e) => setDraftFilters((p) => ({ ...p, ward: e.target.value }))}
            className="w-full h-8 px-2 text-xs bg-[#FAFBF8] border border-[#E4E6DF] rounded-[4px]"
          >
            {wardsList.map((w) => (
              <option key={w} value={w}>
                {w === 'All' ? 'All Wards' : w}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#727A75] mb-1">
            Model Version
          </label>
          <select
            value={draftFilters.modelVersion}
            onChange={(e) =>
              setDraftFilters((p) => ({ ...p, modelVersion: e.target.value }))
            }
            className="w-full h-8 px-2 text-xs bg-[#FAFBF8] border border-[#E4E6DF] rounded-[4px]"
          >
            {modelVersions.map((mv) => (
              <option key={mv} value={mv}>
                {mv === 'All' ? 'All Model Versions' : mv}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleApplyFilters}
            className="h-8 px-2.5 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] whitespace-nowrap"
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={handleClearFilters}
            className="h-8 px-2.5 bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] text-[#252A27] text-xs font-medium rounded-[4px] inline-flex items-center justify-center gap-1 whitespace-nowrap"
          >
            <RotateCcw size={11} />
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden bg-[#F7F7F2]">
      {/* Compact Workspace Sub-header */}
      <div className="px-4 py-2 bg-white border-b border-[#E4E6DF] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold text-[#252A27] whitespace-nowrap">
            Geospatial Explorer
          </h1>
          <span className="hidden md:inline text-xs text-[#727A75] truncate">
            Explore, inspect and analyse AI-extracted village features.
          </span>
        </div>

        {/* Tablet/Mobile Panel Toggles */}
        <div className="flex items-center gap-2 xl:hidden">
          <button
            type="button"
            onClick={() => setLeftDrawerOpen((v) => !v)}
            className="h-7 px-2.5 text-xs font-medium border border-[#E4E6DF] rounded-[4px] bg-[#FAFBF8] inline-flex items-center gap-1.5"
          >
            <PanelLeft size={13} />
            <span>Layers</span>
          </button>
          <button
            type="button"
            onClick={() => setRightDrawerOpen((v) => !v)}
            className="h-7 px-2.5 text-xs font-medium border border-[#E4E6DF] rounded-[4px] bg-[#FAFBF8] inline-flex items-center gap-1.5"
          >
            <PanelRight size={13} />
            <span>Inspector</span>
          </button>
        </div>
      </div>

      {/* 3-Zone GIS Workbench */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* LEFT PANEL (Desktop fixed, Tablet/Mobile overlay) */}
        <div className="hidden xl:block h-full">{leftPanelContent}</div>
        {leftDrawerOpen && (
          <div className="xl:hidden fixed inset-y-14 left-0 z-30 shadow-lg flex">
            {leftPanelContent}
            <div
              className="fixed inset-0 -z-10 bg-[#252A27]/30"
              onClick={() => setLeftDrawerOpen(false)}
            />
          </div>
        )}

        {/* CENTER MAP CANVAS (~70-75% of workspace) */}
        <div className="flex-1 min-w-0 p-2.5 bg-[#EFEFEA] relative flex flex-col">
          {activeProject &&
          activeProject.orthophoto &&
          activeProjectFeatures.length === 0 ? (
            <div className="flex-1 flex flex-col gap-2.5">
              <div className="flex-1">
                <GisMapCanvas
                  project={activeProject}
                  features={[]}
                  layers={layers}
                  onToggleLayer={(key) => toggleLayer(key)}
                  selectedFeatureId={null}
                  basemap={basemap}
                  onChangeBasemap={setBasemap}
                  onZoomStateChange={setZoomLevel}
                  onUploadRequest={() => setActivePage('processing')}
                />
              </div>
              <div className="bg-white border border-[#E4E6DF] rounded-[4px] px-4 py-2.5 flex items-center justify-between gap-3">
                <span className="text-xs text-[#727A75]">
                  No AI-extracted vector features stored for {activeProject.village} yet.
                </span>
                <button
                  type="button"
                  onClick={() => setActivePage('processing')}
                  className="px-3 py-1.5 bg-[#496B54] text-white text-xs font-medium rounded-[4px] whitespace-nowrap"
                >
                  Run Extraction Pipeline
                </button>
              </div>
            </div>
          ) : activeProject &&
            activeProjectFeatures.length > 0 &&
            filteredFeatures.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                title="No features match active filters"
                description="Adjust confidence threshold, roof type, or ward filters in the left panel to display extracted vectors."
                actionLabel="Clear Filters"
                onAction={handleClearFilters}
              />
            </div>
          ) : (
            <GisMapCanvas
              project={activeProject}
              features={filteredFeatures}
              layers={layers}
              onToggleLayer={(key) => toggleLayer(key)}
              selectedFeatureId={selectedFeatureId}
              onSelectFeature={(id) => {
                setSelectedFeatureId(id);
                const feat = filteredFeatures.find((f) => f.id === id);
                if (feat) {
                  const nameMap: Record<FeatureClass, string> = {
                    building: 'Building Footprints',
                    road: 'Roads',
                    water: 'Water Bodies',
                    vegetation: 'Vegetation',
                    parcel: 'Candidate Parcels',
                  };
                  setActiveLayerLabel(nameMap[feat.featureClass]);
                }
              }}
              basemap={basemap}
              onChangeBasemap={setBasemap}
              zoomTargetFeatureId={zoomTargetId}
              onZoomStateChange={setZoomLevel}
              onUploadRequest={() => setActivePage('processing')}
            />
          )}
        </div>

        {/* RIGHT PANEL: Feature Inspector */}
        <div className="hidden lg:block w-[280px] xl:w-[295px] h-full bg-white border-l border-[#E4E6DF] shrink-0">
          <FeatureInspector
            feature={selectedFeature}
            crs={activeProject?.orthophoto?.crs ?? 'EPSG:32643'}
            orthophoto={activeProject?.orthophoto}
            coordDims={{
              w:
                activeProject?.segmentationOutputs?.coordWidth ??
                activeProject?.orthophoto?.widthPx ??
                1000,
              h:
                activeProject?.segmentationOutputs?.coordHeight ??
                activeProject?.orthophoto?.heightPx ??
                562.5,
            }}
            onZoomToFeature={(id) => {
              setZoomTargetId(null);
              window.requestAnimationFrame(() => setZoomTargetId(id));
            }}
          />
        </div>
        {rightDrawerOpen && (
          <div className="lg:hidden fixed inset-y-14 right-0 z-30 w-[290px] bg-white border-l border-[#E4E6DF] shadow-lg">
            <FeatureInspector
              feature={selectedFeature}
              crs={activeProject?.orthophoto?.crs ?? 'EPSG:32643'}
              orthophoto={activeProject?.orthophoto}
              coordDims={{
                w:
                  activeProject?.segmentationOutputs?.coordWidth ??
                  activeProject?.orthophoto?.widthPx ??
                  1000,
                h:
                  activeProject?.segmentationOutputs?.coordHeight ??
                  activeProject?.orthophoto?.heightPx ??
                  562.5,
              }}
              onZoomToFeature={(id) => {
                setZoomTargetId(null);
                window.requestAnimationFrame(() => setZoomTargetId(id));
                setRightDrawerOpen(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom GIS Information Bar */}
      <footer className="h-8 px-4 bg-white border-t border-[#E4E6DF] flex items-center justify-between gap-4 text-[11px] text-[#727A75] shrink-0 overflow-x-auto">
        <div className="flex items-center gap-4 whitespace-nowrap">
          <span>
            Visible Features:{' '}
            <strong className="font-mono tabular-nums text-[#252A27]">
              {visibleFeaturesCount}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Scale:{' '}
            <strong className="font-mono tabular-nums text-[#252A27]">{currentScale}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            CRS:{' '}
            <strong className="font-mono text-[#252A27]">
              {activeProject?.orthophoto?.crs ?? 'EPSG:32643'}
            </strong>
          </span>
        </div>
        <div className="flex items-center gap-4 whitespace-nowrap">
          <span>
            Layer: <strong className="text-[#252A27]">{activeLayerLabel}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Project:{' '}
            <strong className="text-[#252A27]">
              {activeProject ? `${activeProject.village} (${activeProject.id})` : 'None'}
            </strong>
          </span>
        </div>
      </footer>
    </div>
  );
}
