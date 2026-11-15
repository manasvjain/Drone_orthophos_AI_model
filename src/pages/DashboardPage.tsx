import { useMemo, useState } from 'react';
import { ArrowRight, FolderPlus, Upload } from 'lucide-react';
import { useGis } from '../context/GisContext';
import {
  BasemapMode,
  BuildingFeature,
  RoadFeature,
  RoofType,
  VegetationFeature,
  WaterFeature,
} from '../types/gis';
import { GisMapCanvas } from '../components/map/GisMapCanvas';
import { MetricBlock } from '../components/ui/MetricBlock';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { EmptyState } from '../components/ui/StateBlocks';

export function DashboardPage() {
  const {
    projects,
    activeProject,
    setActiveProjectId,
    features,
    activeProjectFeatures,
    selectedFeatureId,
    setSelectedFeatureId,
    layers,
    setLayers,
    setActivePage,
  } = useGis();

  const [basemap, setBasemap] = useState<BasemapMode>('orthophoto');

  const stats = useMemo(() => {
    const processedVillages = projects.filter((p) => p.status === 'Completed').length;
    const buildings = features.filter((f): f is BuildingFeature => f.featureClass === 'building');
    const roads = features.filter((f): f is RoadFeature => f.featureClass === 'road');
    const water = features.filter((f): f is WaterFeature => f.featureClass === 'water');
    const veg = features.filter((f): f is VegetationFeature => f.featureClass === 'vegetation');

    const roadKm = roads.reduce((acc, r) => acc + r.lengthM, 0) / 1000;
    const waterHa = water.reduce((acc, w) => acc + w.areaSqm, 0) / 10000;
    const avgVegPct =
      veg.length > 0 ? veg.reduce((acc, v) => acc + v.coveragePct, 0) : 0;

    return {
      totalProjects: projects.length,
      processedVillages,
      buildingsCount: buildings.length,
      roadKm: roadKm.toFixed(2),
      waterHa: waterHa.toFixed(2),
      vegPct: avgVegPct.toFixed(1),
    };
  }, [projects, features]);

  const roofDistribution = useMemo(() => {
    const blds = activeProjectFeatures.filter(
      (f): f is BuildingFeature => f.featureClass === 'building'
    );
    const counts: Record<RoofType, number> = {
      RCC: 0,
      Tiled: 0,
      Tin: 0,
      Other: 0,
      Unknown: 0,
    };
    blds.forEach((b) => {
      counts[b.roofType] += 1;
    });
    const total = blds.length || 1;
    return (Object.keys(counts) as RoofType[]).map((type) => ({
      type,
      count: counts[type],
      pct: Math.round((counts[type] / total) * 100),
    }));
  }, [activeProjectFeatures]);

  const featureSummary = useMemo(() => {
    const blds = activeProjectFeatures.filter(
      (f): f is BuildingFeature => f.featureClass === 'building'
    );
    const roads = activeProjectFeatures.filter(
      (f): f is RoadFeature => f.featureClass === 'road'
    );
    const water = activeProjectFeatures.filter(
      (f): f is WaterFeature => f.featureClass === 'water'
    );
    const veg = activeProjectFeatures.filter(
      (f): f is VegetationFeature => f.featureClass === 'vegetation'
    );
    return [
      {
        label: 'Building Footprints',
        count: blds.length,
        metric: `${blds.reduce((s, b) => s + b.areaSqm, 0).toFixed(0)} m²`,
        color: '#B77B61',
      },
      {
        label: 'Road Network',
        count: roads.length,
        metric: `${(roads.reduce((s, r) => s + r.lengthM, 0) / 1000).toFixed(2)} km`,
        color: '#C88E41',
      },
      {
        label: 'Water Bodies',
        count: water.length,
        metric: `${water.reduce((s, w) => s + w.areaSqm, 0).toFixed(0)} m²`,
        color: '#567C94',
      },
      {
        label: 'Vegetation Regions',
        count: veg.length,
        metric: `${veg.reduce((s, v) => s + v.areaSqm, 0).toFixed(0)} m²`,
        color: '#5E8061',
      },
    ];
  }, [activeProjectFeatures]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Page Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4E6DF] pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-[#727A75]">
            <span className="font-mono tabular-nums">14 Nov 2026</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">
              Active Village:{' '}
              <strong className="font-semibold text-[#252A27]">
                {activeProject ? `${activeProject.village}, ${activeProject.district}` : 'None'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[11px] font-medium text-[#68775B]">DEMO DATA</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#252A27]">Dashboard</h1>
          <p className="text-xs text-[#727A75] mt-0.5">
            Monitor village projects, geospatial processing and extracted features.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setActivePage('projects')}
            className="h-9 px-3.5 bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] text-[#252A27] text-xs font-medium rounded-[4px] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <FolderPlus size={14} strokeWidth={1.75} className="text-[#496B54]" />
            <span>New Project</span>
          </button>
          <button
            type="button"
            onClick={() => setActivePage('processing')}
            className="h-9 px-3.5 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload size={14} strokeWidth={1.75} />
            <span>Upload Orthophoto</span>
          </button>
        </div>
      </div>

      {/* Six Compact Metric Blocks */}
      <section aria-label="Platform Summary Metrics" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricBlock label="Total Projects" value={stats.totalProjects} subtext="SVAMITVA survey blocks" />
        <MetricBlock
          label="Processed Villages"
          value={stats.processedVillages}
          subtext={`of ${stats.totalProjects} registered`}
        />
        <MetricBlock
          label="Buildings Identified"
          value={stats.buildingsCount}
          subtext="Vectorized footprints"
        />
        <MetricBlock
          label="Total Road Length"
          value={stats.roadKm}
          unit="km"
          subtext="Extracted centerlines"
        />
        <MetricBlock
          label="Water Body Area"
          value={stats.waterHa}
          unit="ha"
          subtext="Ponds & canals"
        />
        <MetricBlock
          label="Vegetation Coverage"
          value={`${stats.vegPct}%`}
          subtext="Canopy share"
        />
      </section>

      {/* Main Geographic Preview + Recent Processing Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left/Center: Map Preview (8/12 columns ~67-70%) */}
        <div className="xl:col-span-8 bg-white border border-[#E4E6DF] rounded-[4px] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E6DF] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[#252A27] truncate">
                Village Orthophoto & Extracted Overlays
                {activeProject ? ` — ${activeProject.village}` : ''}
              </h2>
              <p className="text-[11px] text-[#727A75] truncate mt-0.5">
                {activeProject?.orthophoto
                  ? `${activeProject.orthophoto.crs} · ${activeProject.orthophoto.resolutionCm} cm GSD`
                  : 'Select a village with uploaded orthophoto imagery'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('explorer')}
              className="text-xs font-medium text-[#496B54] hover:text-[#3D5B47] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Open GIS Explorer</span>
              <ArrowRight size={13} strokeWidth={1.75} />
            </button>
          </div>
          <div className="h-[400px] lg:h-[440px] p-3 bg-[#FAFBF8]">
            <GisMapCanvas
              project={activeProject}
              features={activeProjectFeatures}
              layers={layers}
              onToggleLayer={(key) =>
                setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
              }
              selectedFeatureId={selectedFeatureId}
              onSelectFeature={(id) => setSelectedFeatureId(id)}
              basemap={basemap}
              onChangeBasemap={setBasemap}
              compact
              onUploadRequest={() => setActivePage('processing')}
            />
          </div>
        </div>

        {/* Right Side Panel: Recent Processing Activity */}
        <div className="xl:col-span-4 bg-white border border-[#E4E6DF] rounded-[4px] flex flex-col">
          <div className="px-4 py-3 border-b border-[#E4E6DF] flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#252A27]">Recent Processing Activity</h2>
            <button
              type="button"
              onClick={() => setActivePage('processing')}
              className="text-[11px] font-medium text-[#496B54] hover:underline whitespace-nowrap"
            >
              View Pipeline
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="p-4 flex-1 flex items-center justify-center">
              <EmptyState
                title="No processing runs"
                description="Create a village project and upload an orthophoto to initiate feature extraction."
                actionLabel="Create Project"
                onAction={() => setActivePage('projects')}
              />
            </div>
          ) : (
            <div className="divide-y divide-[#E4E6DF] flex-1 overflow-y-auto">
              {projects.map((prj) => (
                <div
                  key={prj.id}
                  onClick={() => setActiveProjectId(prj.id)}
                  className={`px-4 py-3 cursor-pointer transition-colors ${
                    prj.id === activeProject?.id ? 'bg-[#F7F7F2]' : 'hover:bg-[#FAFBF8]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#252A27] truncate">
                      {prj.village}, {prj.district}
                    </span>
                    <StatusIndicator status={prj.status} compact />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#727A75]">
                    <span className="font-mono tabular-nums">{prj.lastProcessedAt}</span>
                    <span aria-hidden="true">·</span>
                    <span>{prj.modelUsed}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-[#ECEDE7] rounded-[2px] overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          prj.status === 'Failed'
                            ? 'bg-[#A64438]'
                            : prj.status === 'Completed'
                            ? 'bg-[#496B54]'
                            : 'bg-[#C88E41]'
                        }`}
                        style={{ width: `${prj.progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-[#727A75] w-8 text-right">
                      {prj.progress}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Roof Type Distribution, Feature Extraction Summary, Recent Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Roof Type Distribution */}
        <div className="lg:col-span-4 bg-white border border-[#E4E6DF] rounded-[4px] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#252A27]">Roof Type Distribution</h2>
            <span className="text-[11px] text-[#727A75]">
              {activeProject?.village ?? 'Active Project'}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {roofDistribution.map((item) => (
              <div key={item.type} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#252A27]">{item.type}</span>
                  <span className="font-mono tabular-nums text-[#727A75]">
                    {item.count} ({item.pct}%)
                  </span>
                </div>
                <div className="h-2 bg-[#F1F2EC] rounded-[2px] overflow-hidden">
                  <div
                    className="h-full bg-[#B77B61]"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Extraction Summary */}
        <div className="lg:col-span-3 bg-white border border-[#E4E6DF] rounded-[4px] p-4">
          <h2 className="text-sm font-semibold text-[#252A27]">Feature Extraction Summary</h2>
          <p className="text-[11px] text-[#727A75] mt-0.5">Active project vector inventory</p>
          <div className="mt-3 divide-y divide-[#E4E6DF]">
            {featureSummary.map((row) => (
              <div key={row.label} className="py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="text-xs text-[#252A27] truncate">{row.label}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono tabular-nums font-semibold text-[#252A27]">
                    {row.count}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[#727A75]">
                    {row.metric}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Projects Table */}
        <div className="lg:col-span-5 bg-white border border-[#E4E6DF] rounded-[4px] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#E4E6DF] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#252A27]">Recent Survey Projects</h2>
            <button
              type="button"
              onClick={() => setActivePage('projects')}
              className="text-[11px] font-medium text-[#496B54] hover:underline"
            >
              Manage All
            </button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E4E6DF] bg-[#FAFBF8] text-[11px] font-semibold text-[#727A75]">
                  <th className="py-2 px-3">Village</th>
                  <th className="py-2 px-3">Survey Date</th>
                  <th className="py-2 px-3">Model</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E6DF] text-xs">
                {projects.slice(0, 5).map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => {
                      setActiveProjectId(p.id);
                      setActivePage('explorer');
                    }}
                    className="hover:bg-[#F7F7F2] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium text-[#252A27]">
                      {p.village}
                      <span className="block text-[11px] font-normal text-[#727A75]">
                        {p.district}, {p.state}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#727A75] whitespace-nowrap">
                      {p.surveyDate}
                    </td>
                    <td className="py-2.5 px-3 text-[#252A27] whitespace-nowrap">{p.modelUsed}</td>
                    <td className="py-2.5 px-3">
                      <StatusIndicator status={p.status} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
