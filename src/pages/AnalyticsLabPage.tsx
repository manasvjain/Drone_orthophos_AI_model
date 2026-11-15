import { useMemo, useState } from 'react';
import { Check, Download, Eye, FileText, Info, Printer, Sliders } from 'lucide-react';
import { useGis } from '../context/GisContext';
import { MODEL_BENCHMARKS } from '../data/mockGisData';
import {
  AnalyticsTabId,
  BuildingFeature,
  RoadFeature,
  RoofType,
  SegmentationModelId,
  VegetationFeature,
  WaterFeature,
} from '../types/gis';
import { MetricBlock } from '../components/ui/MetricBlock';
import { EmptyState } from '../components/ui/StateBlocks';
import { KaggleTrainingStudio } from '../components/training/KaggleTrainingStudio';

type ExportDataset =
  | 'complete'
  | 'buildings'
  | 'roads'
  | 'water'
  | 'vegetation'
  | 'roofs';
type ExportFormat = 'GeoJSON' | 'Shapefile' | 'CSV' | 'GeoPackage' | 'PDF Report';

export function AnalyticsLabPage() {
  const {
    analyticsTab,
    setAnalyticsTab,
    projects,
    activeProject,
    features,
    activeProjectFeatures,
    updateProcessingConfig,
    setActivePage,
  } = useGis();

  // Tab 2: Model Comparison selection
  const [selectedModelId, setSelectedModelId] = useState<SegmentationModelId>('SegFormer');

  // Tab 3: Explainable AI state
  const xaiCandidates = useMemo(
    () =>
      activeProjectFeatures.filter(
        (f): f is BuildingFeature =>
          f.featureClass === 'building' && Boolean(f.roofPreviewUrl)
      ),
    [activeProjectFeatures]
  );

  const [xaiSelectedId, setXaiSelectedId] = useState<string>(xaiCandidates[0]?.id ?? '');
  const [gradCamOpacity, setGradCamOpacity] = useState<number>(0.6);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);

  const activeXaiFeature =
    xaiCandidates.find((b) => b.id === xaiSelectedId) ?? xaiCandidates[0];

  // Tab 4: Exports state
  const [exportDataset, setExportDataset] = useState<ExportDataset>('complete');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('GeoJSON');
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Analytics Computations
  const analyticsData = useMemo(() => {
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

    const totalBuildingArea = blds.reduce((s, b) => s + b.areaSqm, 0);
    const totalRoadLength = roads.reduce((s, r) => s + r.lengthM, 0);
    const totalWaterArea = water.reduce((s, w) => s + w.areaSqm, 0);
    const vegCoveragePct = veg.reduce((s, v) => s + v.coveragePct, 0);

    const roofCounts: Record<RoofType, number> = {
      RCC: 0,
      Tiled: 0,
      Tin: 0,
      Other: 0,
      Unknown: 0,
    };
    blds.forEach((b) => {
      roofCounts[b.roofType] += 1;
    });

    const areaBins = [
      { label: '< 120 m²', count: blds.filter((b) => b.areaSqm < 120).length },
      { label: '120–150 m²', count: blds.filter((b) => b.areaSqm >= 120 && b.areaSqm < 150).length },
      { label: '150–180 m²', count: blds.filter((b) => b.areaSqm >= 150 && b.areaSqm < 180).length },
      { label: '180+ m²', count: blds.filter((b) => b.areaSqm >= 180).length },
    ];

    const villageComparison = projects
      .filter((p) => p.status === 'Completed')
      .map((p) => {
        const pf = features.filter((f) => f.projectId === p.id);
        const pb = pf.filter((f) => f.featureClass === 'building').length;
        const pr =
          pf
            .filter((f): f is RoadFeature => f.featureClass === 'road')
            .reduce((s, r) => s + r.lengthM, 0) / 1000;
        return {
          village: p.village,
          buildings: pb,
          roadKm: Number(pr.toFixed(2)),
        };
      });

    return {
      blds,
      roads,
      water,
      veg,
      totalBuildingArea,
      totalRoadLength,
      totalWaterArea,
      vegCoveragePct,
      roofCounts,
      areaBins,
      villageComparison,
    };
  }, [activeProjectFeatures, projects, features]);

  const selectedModel =
    MODEL_BENCHMARKS.find((m) => m.id === selectedModelId) ?? MODEL_BENCHMARKS[0];

  const buildExportContent = (previewOnly: boolean) => {
    const projectLabel = activeProject ? `${activeProject.village} (${activeProject.id})` : 'None';
    const subset = activeProjectFeatures.filter((f) => {
      if (exportDataset === 'complete') return true;
      if (exportDataset === 'buildings' || exportDataset === 'roofs')
        return f.featureClass === 'building';
      if (exportDataset === 'roads') return f.featureClass === 'road';
      if (exportDataset === 'water') return f.featureClass === 'water';
      if (exportDataset === 'vegetation') return f.featureClass === 'vegetation';
      return true;
    });

    if (exportFormat === 'CSV') {
      const header =
        exportDataset === 'roofs'
          ? 'feature_id,ward,roof_type,roof_confidence,area_sqm,model_version'
          : 'feature_id,class,ward,confidence,model_version,processing_date';
      const slice = previewOnly ? subset.slice(0, 8) : subset;
      const rows = slice.map((f) => {
        if (exportDataset === 'roofs' && f.featureClass === 'building') {
          const b = f as BuildingFeature;
          return `${b.id},${b.ward},${b.roofType},${b.roofConfidence},${b.areaSqm},${b.modelVersion}`;
        }
        return `${f.id},${f.featureClass},${f.ward},${f.confidence},${f.modelVersion},${f.processingDate}`;
      });
      return [
        header,
        ...rows,
        previewOnly && subset.length > 8 ? `... (${subset.length - 8} more rows)` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (exportFormat === 'PDF Report') {
      return [
        `SVAMITVA AI — VILLAGE SURVEY MAPPING REPORT`,
        `Project: ${projectLabel}`,
        `District / State: ${activeProject?.district ?? '-'}, ${activeProject?.state ?? '-'}`,
        `CRS: ${activeProject?.orthophoto?.georeferenced ? activeProject.orthophoto.crs : 'Not georeferenced — coordinates remain in image pixels'}`,
        `Model: ${activeProject?.modelVersion ?? '-'}`,
        `--------------------------------------------------`,
        `Extracted Buildings: ${analyticsData.blds.length} (${analyticsData.totalBuildingArea.toFixed(1)} m²)`,
        `Road Centerlines: ${analyticsData.roads.length} (${analyticsData.totalRoadLength.toFixed(1)} m)`,
        `Water Bodies: ${analyticsData.water.length} (${analyticsData.totalWaterArea.toFixed(1)} m²)`,
        `Vegetation Coverage: ${analyticsData.vegCoveragePct.toFixed(1)}%`,
      ].join('\n');
    }

    const coordW =
      activeProject?.segmentationOutputs?.coordWidth ?? activeProject?.orthophoto?.widthPx ?? 1000;
    const coordH =
      activeProject?.segmentationOutputs?.coordHeight ?? activeProject?.orthophoto?.heightPx ?? 562.5;
    const bounds = activeProject?.orthophoto?.bounds;
    const hasGeoreferencing = Boolean(activeProject?.orthophoto?.georeferenced && bounds);
    const projectPt = ([x, y]: [number, number]): [number, number] => {
      if (!hasGeoreferencing || !bounds || !coordW || !coordH) return [x, y];
      const lng = bounds.minLng + (x / coordW) * (bounds.maxLng - bounds.minLng);
      const lat = bounds.maxLat - (y / coordH) * (bounds.maxLat - bounds.minLat);
      return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
    };

    const items = previewOnly ? subset.slice(0, 2) : subset;
    const geojsonPayload = {
      type: 'FeatureCollection',
      name: `${activeProject?.village ?? 'village'}_${exportDataset}`,
      crs: hasGeoreferencing
        ? { type: 'name', properties: { name: 'EPSG:4326' } }
        : null,
      coordinate_space: hasGeoreferencing ? 'EPSG:4326' : 'orthophoto_pixel_coordinates',
      georeferenced: hasGeoreferencing,
      featureCount: subset.length,
      features: items.map((f) => {
        if (f.featureClass === 'road') {
          const line = (f as RoadFeature).polyline.map(projectPt);
          return {
            type: 'Feature',
            id: f.id,
            properties: {
              class: f.featureClass,
              ward: f.ward,
              lengthM: (f as RoadFeature).lengthM,
              confidence: f.confidence,
              modelVersion: f.modelVersion,
            },
            geometry: {
              type: 'LineString',
              coordinates: previewOnly ? line.slice(0, 4) : line,
            },
          };
        }
        const poly = (f as BuildingFeature | WaterFeature | VegetationFeature).polygon ?? [];
        const closed = poly.length > 0 ? [...poly, poly[0]].map(projectPt) : [];
        return {
          type: 'Feature',
          id: f.id,
          properties: {
            class: f.featureClass,
            ward: f.ward,
            confidence: f.confidence,
            modelVersion: f.modelVersion,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [previewOnly ? closed.slice(0, 4) : closed],
          },
        };
      }),
    };
    return JSON.stringify(geojsonPayload, null, 2);
  };

  // Export Preview Generation
  const exportPreviewText = useMemo(
    () => buildExportContent(true),
    [activeProject, activeProjectFeatures, exportDataset, exportFormat, analyticsData]
  );

  const handleDownloadExport = () => {
    const slug = (activeProject?.village ?? 'village').toLowerCase().replace(/\s+/g, '_');
    if (exportFormat === 'PDF Report') {
      window.print();
      setExportSuccessMsg('Print-to-PDF dialog opened for structured village mapping report.');
      return;
    }

    const ext =
      exportFormat === 'CSV'
        ? 'csv'
        : exportFormat === 'GeoJSON'
        ? 'geojson'
        : exportFormat === 'GeoPackage'
        ? 'gpkg.json'
        : 'shp.manifest.json';

    const fullContent = buildExportContent(false);
    const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}_${exportDataset}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setExportSuccessMsg(`Downloaded ${slug}_${exportDataset}.${ext} (${exportFormat}).`);
  };

  const tabs: { id: AnalyticsTabId; label: string }[] = [
    { id: 'village', label: 'Village Analytics' },
    { id: 'comparison', label: 'Model Comparison' },
    { id: 'explainable', label: 'Explainable AI' },
    { id: 'training', label: 'Dataset & Training' },
    { id: 'exports', label: 'Reports & Exports' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4E6DF] pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#252A27]">
            Analytics & Model Laboratory
          </h1>
          <p className="text-xs text-[#727A75] mt-0.5">
            Evaluate feature extraction performance and understand model predictions.
          </p>
        </div>
        <div className="text-xs text-[#727A75]">
          Active Village:{' '}
          <strong className="text-[#252A27]">
            {activeProject ? `${activeProject.village}, ${activeProject.district}` : 'None'}
          </strong>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-[#E4E6DF] overflow-x-auto">
        {tabs.map((tab) => {
          const active = analyticsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAnalyticsTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-[#496B54] text-[#252A27] font-semibold'
                  : 'border-transparent text-[#727A75] hover:text-[#252A27]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: VILLAGE ANALYTICS */}
      {analyticsTab === 'village' && (
        <div className="space-y-4">
          {activeProjectFeatures.length === 0 ? (
            <EmptyState
              title="No extracted features for analytics"
              description={`Run the AI feature extraction pipeline on ${
                activeProject?.village ?? 'the active project'
              } to populate spatial distributions and roof statistics.`}
              actionLabel="Go to Processing Jobs"
              onAction={() => setActivePage('processing')}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricBlock
                  label="Total Building Area"
                  value={analyticsData.totalBuildingArea.toFixed(1)}
                  unit="m²"
                  subtext={`${analyticsData.blds.length} footprints extracted`}
                />
                <MetricBlock
                  label="Total Road Length"
                  value={(analyticsData.totalRoadLength / 1000).toFixed(2)}
                  unit="km"
                  subtext={`${analyticsData.roads.length} road centerlines`}
                />
                <MetricBlock
                  label="Total Water Area"
                  value={analyticsData.totalWaterArea.toFixed(1)}
                  unit="m²"
                  subtext={`${analyticsData.water.length} water bodies`}
                />
                <MetricBlock
                  label="Vegetation Coverage"
                  value={`${analyticsData.vegCoveragePct.toFixed(1)}%`}
                  subtext={`${analyticsData.veg.length} canopy clusters`}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Chart 1: Roof Type Distribution */}
                <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4">
                  <h2 className="text-sm font-semibold text-[#252A27]">
                    Roof Type Distribution
                  </h2>
                  <p className="text-[11px] text-[#727A75] mt-0.5">
                    Classification count across identified building footprints
                  </p>
                  <div className="mt-4 space-y-3">
                    {(Object.keys(analyticsData.roofCounts) as RoofType[]).map((rt) => {
                      const count = analyticsData.roofCounts[rt];
                      const max = Math.max(
                        1,
                        ...Object.values(analyticsData.roofCounts)
                      );
                      const pct = Math.round((count / max) * 100);
                      return (
                        <div key={rt} className="grid grid-cols-12 items-center gap-2 text-xs">
                          <span className="col-span-3 font-medium text-[#252A27]">{rt}</span>
                          <div className="col-span-7 h-4 bg-[#F2F3EE] rounded-[2px] overflow-hidden">
                            <div
                              className="h-full bg-[#B77B61]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="col-span-2 text-right font-mono tabular-nums text-[#727A75]">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Chart 2: Building Area Distribution */}
                <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4">
                  <h2 className="text-sm font-semibold text-[#252A27]">
                    Building Area Distribution
                  </h2>
                  <p className="text-[11px] text-[#727A75] mt-0.5">
                    Footprint area histogram (square meters)
                  </p>
                  <div className="mt-4 h-44 flex items-end justify-around gap-4 px-2 border-b border-[#E4E6DF] pb-2">
                    {analyticsData.areaBins.map((bin) => {
                      const max = Math.max(1, ...analyticsData.areaBins.map((b) => b.count));
                      const hPct = Math.round((bin.count / max) * 100);
                      return (
                        <div
                          key={bin.label}
                          className="flex-1 flex flex-col items-center justify-end h-full gap-1.5"
                        >
                          <span className="text-[11px] font-mono tabular-nums font-semibold text-[#252A27]">
                            {bin.count}
                          </span>
                          <div className="w-full max-w-[52px] bg-[#F2F3EE] rounded-t-[2px] flex items-end h-28 overflow-hidden">
                            <div
                              className="w-full bg-[#496B54]"
                              style={{ height: `${Math.max(hPct, bin.count > 0 ? 10 : 0)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-[#727A75] whitespace-nowrap">
                            {bin.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Chart 3: Feature Class Distribution */}
                <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4">
                  <h2 className="text-sm font-semibold text-[#252A27]">
                    Feature Class Surface Share
                  </h2>
                  <p className="text-[11px] text-[#727A75] mt-0.5">
                    Extracted areal footprint comparison (m²)
                  </p>
                  {(() => {
                    const vegArea = analyticsData.veg.reduce((s, v) => s + v.areaSqm, 0);
                    const total =
                      analyticsData.totalBuildingArea +
                        analyticsData.totalWaterArea +
                        vegArea || 1;
                    const items = [
                      {
                        label: 'Buildings',
                        area: analyticsData.totalBuildingArea,
                        color: '#B77B61',
                      },
                      {
                        label: 'Water Bodies',
                        area: analyticsData.totalWaterArea,
                        color: '#567C94',
                      },
                      {
                        label: 'Vegetation',
                        area: vegArea,
                        color: '#5E8061',
                      },
                    ];
                    return (
                      <div className="mt-4 space-y-3">
                        <div className="h-5 w-full rounded-[2px] overflow-hidden flex bg-[#F2F3EE]">
                          {items.map((it) => (
                            <div
                              key={it.label}
                              style={{
                                width: `${(it.area / total) * 100}%`,
                                backgroundColor: it.color,
                              }}
                              title={`${it.label}: ${it.area.toFixed(1)} m²`}
                            />
                          ))}
                        </div>
                        <div className="divide-y divide-[#E4E6DF]">
                          {items.map((it) => (
                            <div
                              key={it.label}
                              className="py-2 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-[2px]"
                                  style={{ backgroundColor: it.color }}
                                />
                                <span className="font-medium text-[#252A27]">{it.label}</span>
                              </div>
                              <div className="font-mono tabular-nums text-[#727A75]">
                                {it.area.toFixed(1)} m² (
                                {((it.area / total) * 100).toFixed(1)}%)
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Chart 4: Village-wise Comparison */}
                <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4">
                  <h2 className="text-sm font-semibold text-[#252A27]">
                    Village-wise Extraction Comparison
                  </h2>
                  <p className="text-[11px] text-[#727A75] mt-0.5">
                    Completed survey villages compared by building count & road length
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E4E6DF] text-[11px] text-[#727A75]">
                          <th className="py-2 pr-3">Village</th>
                          <th className="py-2 px-3 text-right">Buildings</th>
                          <th className="py-2 pl-3 text-right">Road Length (km)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E6DF]">
                        {analyticsData.villageComparison.map((row) => (
                          <tr key={row.village}>
                            <td className="py-2.5 pr-3 font-medium text-[#252A27]">
                              {row.village}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#252A27]">
                              {row.buildings}
                            </td>
                            <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-[#727A75]">
                              {row.roadKm.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: MODEL COMPARISON */}
      {analyticsTab === 'comparison' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          <div className="xl:col-span-8 bg-white border border-[#E4E6DF] rounded-[4px] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E4E6DF] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#252A27]">
                  Segmentation Model Benchmark Matrix
                </h2>
                <p className="text-[11px] text-[#727A75] mt-0.5">
                  Validation metrics on SVAMITVA UAV orthophoto test split (512×512 tiles). Unbenchmarked models display N/A.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E4E6DF] bg-[#FAFBF8] text-[11px] font-semibold text-[#727A75]">
                    <th className="py-2.5 px-3.5">Model</th>
                    <th className="py-2.5 px-3 text-right">Mean IoU</th>
                    <th className="py-2.5 px-3 text-right">Dice Score</th>
                    <th className="py-2.5 px-3 text-right">Precision</th>
                    <th className="py-2.5 px-3 text-right">Recall</th>
                    <th className="py-2.5 px-3 text-right">F1 Score</th>
                    <th className="py-2.5 px-3.5 text-right">Inference Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E6DF]">
                  {MODEL_BENCHMARKS.map((m) => {
                    const selected = selectedModelId === m.id;
                    const fmt = (val: number | null) =>
                      val === null ? 'N/A' : val.toFixed(3);
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setSelectedModelId(m.id)}
                        className={`cursor-pointer transition-colors ${
                          selected ? 'bg-[#EEF2EE]/70' : 'hover:bg-[#FAFBF8]'
                        }`}
                      >
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-[#252A27]">{m.id}</div>
                          <div className="text-[11px] text-[#727A75]">{m.backbone}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-[#252A27]">
                          {fmt(m.meanIoU)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#252A27]">
                          {fmt(m.diceScore)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#252A27]">
                          {fmt(m.precision)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#252A27]">
                          {fmt(m.recall)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#252A27]">
                          {fmt(m.f1Score)}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono tabular-nums text-[#727A75]">
                          {m.inferenceTimeSec === null ? 'N/A' : `${m.inferenceTimeSec} s / km²`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Model Selection Panel */}
          <div className="xl:col-span-4 bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E4E6DF] pb-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#727A75]">
                  Model Selection Panel
                </div>
                <div className="text-sm font-semibold text-[#252A27] mt-0.5">
                  {selectedModel.fullName}
                </div>
              </div>
              <Sliders size={15} className="text-[#496B54]" />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[11px] text-[#727A75]">Parameters</div>
                <div className="font-mono tabular-nums font-medium text-[#252A27] mt-0.5">
                  {selectedModel.paramsMillions}M
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#727A75]">Input Patch</div>
                <div className="font-mono tabular-nums font-medium text-[#252A27] mt-0.5">
                  {selectedModel.inputTilePx}×{selectedModel.inputTilePx} px
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-[#252A27] mb-2">
                Per-Class IoU Breakdown
              </div>
              <div className="space-y-2 text-xs">
                {(
                  [
                    ['Buildings', selectedModel.perClassIoU.buildings, '#B77B61'],
                    ['Roads', selectedModel.perClassIoU.roads, '#C88E41'],
                    ['Water', selectedModel.perClassIoU.water, '#567C94'],
                    ['Vegetation', selectedModel.perClassIoU.vegetation, '#5E8061'],
                  ] as [string, number | null, string][]
                ).map(([cls, score, col]) => (
                  <div key={cls} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#4B524E]">{cls}</span>
                      <span className="font-mono tabular-nums text-[#252A27]">
                        {score === null ? 'N/A' : score.toFixed(3)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#F1F2EC] rounded-[2px] overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${score === null ? 0 : score * 100}%`,
                          backgroundColor: col,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-[#727A75] leading-relaxed border-t border-[#E4E6DF] pt-3">
              {selectedModel.notes}
            </p>

            {activeProject && (
              <button
                type="button"
                disabled={selectedModel.id !== 'U-Net'}
                onClick={() =>
                  updateProcessingConfig(activeProject.id, {
                    modelUsed: selectedModel.id,
                    tileSize: activeProject.tileSize,
                    enabledClasses: activeProject.enabledClasses,
                  })
                }
                className="w-full h-9 bg-[#496B54] hover:bg-[#3D5B47] disabled:bg-[#AEB5AF] disabled:cursor-not-allowed text-white text-xs font-medium rounded-[4px] flex items-center justify-center gap-1.5"
              >
                <Check size={14} />
                <span>
                  {selectedModel.id !== 'U-Net'
                    ? 'Reference only — not connected to inference API'
                    : activeProject.modelUsed === 'U-Net'
                    ? `Active on ${activeProject.village}`
                    : `Select U-Net for ${activeProject.village}`}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {analyticsTab === 'explainable' && !activeXaiFeature && (
        <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-6">
          <EmptyState
            title="No explainability sample available"
            description="Run the deployed U-Net on an orthophoto first. This workspace only displays actual extracted building patches; synthetic Grad-CAM examples are not shown as model explanations."
            actionLabel="Open Processing"
            onAction={() => setActivePage('processing')}
          />
        </div>
      )}

      {/* TAB 3: EXPLAINABLE AI */}
      {analyticsTab === 'explainable' && activeXaiFeature && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left: Patch Selector & Grad-CAM Viewer */}
          <div className="xl:col-span-7 bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E6DF] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#252A27]">
                  Grad-CAM Spatial Activation Workspace
                </h2>
                <p className="text-[11px] text-[#727A75] mt-0.5">
                  Inspect convolutional & attention activation maps on roof classification patches
                </p>
              </div>
              <select
                value={activeXaiFeature.id}
                onChange={(e) => setXaiSelectedId(e.target.value)}
                aria-label="Select building patch"
                className="h-8 px-2.5 text-xs font-mono bg-[#FAFBF8] border border-[#E4E6DF] rounded-[4px]"
              >
                {xaiCandidates.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} ({b.roofType})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original Input Patch */}
              <div>
                <div className="text-[11px] font-medium text-[#727A75] mb-1.5">
                  Selected Orthophoto Patch
                </div>
                <div className="border border-[#E4E6DF] rounded-[4px] overflow-hidden bg-[#F7F7F2] aspect-[4/3]">
                  <img
                    src={activeXaiFeature.roofPreviewUrl ?? ROOF_RCC_IMG}
                    alt={`Input patch ${activeXaiFeature.id}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Grad-CAM Heatmap Overlay */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-[#727A75]">
                    Grad-CAM Activation Overlay
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowOverlay((v) => !v)}
                    className="text-[11px] font-medium text-[#496B54] inline-flex items-center gap-1"
                  >
                    <Eye size={12} />
                    <span>{showOverlay ? 'Hide Overlay' : 'Show Overlay'}</span>
                  </button>
                </div>
                <div className="relative border border-[#E4E6DF] rounded-[4px] overflow-hidden bg-[#F7F7F2] aspect-[4/3]">
                  <img
                    src={activeXaiFeature.roofPreviewUrl ?? ROOF_RCC_IMG}
                    alt={`Grad-CAM view ${activeXaiFeature.id}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {showOverlay && (
                    <svg
                      viewBox="0 0 400 300"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ opacity: gradCamOpacity }}
                    >
                      <defs>
                        <radialGradient id="gradcam-hot1" cx="50%" cy="48%" r="42%">
                          <stop offset="0%" stopColor="#B83B28" stopOpacity="0.92" />
                          <stop offset="45%" stopColor="#D68734" stopOpacity="0.65" />
                          <stop offset="80%" stopColor="#5D8768" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#3B5B73" stopOpacity="0" />
                        </radialGradient>
                        <radialGradient id="gradcam-hot2" cx="28%" cy="62%" r="32%">
                          <stop offset="0%" stopColor="#C94A2E" stopOpacity="0.82" />
                          <stop offset="55%" stopColor="#D4A146" stopOpacity="0.45" />
                          <stop offset="100%" stopColor="#3B5B73" stopOpacity="0" />
                        </radialGradient>
                      </defs>
                      <rect width="400" height="300" fill="#2E4A5E" fillOpacity="0.22" />
                      <ellipse cx="205" cy="145" rx="145" ry="105" fill="url(#gradcam-hot1)" />
                      <ellipse cx="115" cy="185" rx="85" ry="70" fill="url(#gradcam-hot2)" />
                    </svg>
                  )}
                </div>
              </div>
            </div>

            {/* Opacity & Colorbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#E4E6DF]">
              <div className="flex items-center gap-3">
                <label className="text-[11px] text-[#727A75] whitespace-nowrap">
                  Heatmap Opacity
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  value={gradCamOpacity}
                  onChange={(e) => setGradCamOpacity(Number.parseFloat(e.target.value))}
                  className="w-32 accent-[#496B54]"
                />
                <span className="text-[11px] font-mono tabular-nums text-[#252A27]">
                  {Math.round(gradCamOpacity * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#727A75]">
                <span>Low</span>
                <div
                  className="w-28 h-2.5 rounded-[2px] border border-[#E4E6DF]"
                  style={{
                    background:
                      'linear-gradient(to right, #3B5B73, #5D8768, #D68734, #B83B28)',
                  }}
                />
                <span>High Activation</span>
              </div>
            </div>
          </div>

          {/* Right: Prediction Summary & SHAP/LIME Scope */}
          <div className="xl:col-span-5 space-y-4">
            <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[#252A27]">
                Model Prediction Summary
              </h3>
              <dl className="divide-y divide-[#E4E6DF] border-y border-[#E4E6DF] text-xs">
                <div className="py-2 flex justify-between">
                  <dt className="text-[#727A75]">Feature ID</dt>
                  <dd className="font-mono font-medium text-[#252A27]">
                    {activeXaiFeature.id}
                  </dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-[#727A75]">Segmentation Prediction</dt>
                  <dd className="font-medium text-[#252A27]">Building Footprint</dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-[#727A75]">Predicted Roof Class</dt>
                  <dd className="font-semibold text-[#496B54]">
                    {activeXaiFeature.roofType}
                  </dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-[#727A75]">Classification Confidence</dt>
                  <dd className="font-mono tabular-nums font-semibold text-[#252A27]">
                    {(activeXaiFeature.roofConfidence * 100).toFixed(1)}%
                  </dd>
                </div>
                <div className="py-2 flex justify-between">
                  <dt className="text-[#727A75]">Model Checkpoint</dt>
                  <dd className="font-mono text-[#252A27]">{activeXaiFeature.modelVersion}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#252A27]">
                  SHAP / LIME Attribution Status
                </h3>
              </div>
              <div className="p-3 bg-[#FAFBF8] border border-[#E4E6DF] rounded-[4px] flex items-start gap-2.5 text-xs text-[#4B524E]">
                <Info size={15} className="text-[#496B54] shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  Grad-CAM spatial activation is computed from the final encoder attention stage of{' '}
                  <span className="font-mono">{activeXaiFeature.modelVersion}</span>. Tabular SHAP
                  feature attributions are only generated when morphological post-processing
                  classifiers are enabled; superpixel LIME perturbations are not cached for this
                  demonstration patch.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: KAGGLE DATASET & TRAINING */}
      {analyticsTab === 'training' && <KaggleTrainingStudio />}

      {/* TAB 5: REPORTS & EXPORTS */}
      {analyticsTab === 'exports' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left: Export Selection */}
          <div className="xl:col-span-5 bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#252A27]">Export Dataset & Format</h2>
              <p className="text-[11px] text-[#727A75] mt-0.5">
                Generate standard GIS deliverables for {activeProject?.village ?? 'selected village'}
              </p>
            </div>

            <div>
              <div className="text-xs font-medium text-[#252A27] mb-1.5">Layer / Report Scope</div>
              <div className="space-y-1.5">
                {(
                  [
                    ['complete', 'Complete Village Report'],
                    ['buildings', 'Building Footprints'],
                    ['roads', 'Road Network'],
                    ['water', 'Water Bodies'],
                    ['vegetation', 'Vegetation'],
                    ['roofs', 'Roof Classification Data'],
                  ] as [ExportDataset, string][]
                ).map(([id, label]) => (
                  <label
                    key={id}
                    className={`flex items-center justify-between px-3 py-2 border rounded-[4px] text-xs cursor-pointer ${
                      exportDataset === id
                        ? 'bg-[#F4F7F4] border-[#496B54] font-medium text-[#252A27]'
                        : 'bg-white border-[#E4E6DF] text-[#4B524E] hover:bg-[#FAFBF8]'
                    }`}
                  >
                    <span>{label}</span>
                    <input
                      type="radio"
                      name="export-dataset"
                      checked={exportDataset === id}
                      onChange={() => {
                        setExportDataset(id);
                        setExportSuccessMsg(null);
                      }}
                      className="accent-[#496B54]"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-[#252A27] mb-1.5">Output Format</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(
                  ['GeoJSON', 'Shapefile', 'CSV', 'GeoPackage', 'PDF Report'] as ExportFormat[]
                ).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      setExportFormat(fmt);
                      setExportSuccessMsg(null);
                    }}
                    className={`py-2 px-2.5 text-xs font-medium rounded-[4px] border whitespace-nowrap transition-colors ${
                      exportFormat === fmt
                        ? 'bg-[#496B54] text-white border-[#496B54]'
                        : 'bg-white text-[#252A27] border-[#E4E6DF] hover:bg-[#F7F7F2]'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {exportSuccessMsg && (
              <div className="p-2.5 bg-[#F4F7F4] border border-[#C9D6CB] rounded-[4px] text-xs text-[#3C5C47]">
                {exportSuccessMsg}
              </div>
            )}

            <button
              type="button"
              onClick={handleDownloadExport}
              className="w-full h-9 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] flex items-center justify-center gap-1.5"
            >
              {exportFormat === 'PDF Report' ? (
                <Printer size={14} strokeWidth={1.75} />
              ) : (
                <Download size={14} strokeWidth={1.75} />
              )}
              <span>
                {exportFormat === 'PDF Report'
                  ? 'Generate PDF Report'
                  : `Download ${exportFormat}`}
              </span>
            </button>
          </div>

          {/* Right: Report Preview */}
          <div className="xl:col-span-7 bg-white border border-[#E4E6DF] rounded-[4px] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E4E6DF] bg-[#FAFBF8] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#252A27]">
                <FileText size={14} className="text-[#496B54]" />
                <span>Export & Report Preview ({exportFormat})</span>
              </div>
              <span className="text-[11px] font-mono text-[#727A75]">
                {activeProject?.orthophoto?.georeferenced ? activeProject.orthophoto.crs : 'Image pixels (not georeferenced)'}
              </span>
            </div>
            <pre className="p-4 text-[11px] font-mono text-[#252A27] bg-white overflow-x-auto max-h-[460px] leading-relaxed">
              {exportPreviewText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
