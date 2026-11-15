import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  Ruler,
} from 'lucide-react';
import {
  BasemapMode,
  BuildingFeature,
  GisFeature,
  LayerVisibility,
  ParcelFeature,
  RoadFeature,
  VegetationFeature,
  VillageProject,
  WaterFeature,
} from '../../types/gis';

interface GisMapCanvasProps {
  project: VillageProject | undefined;
  features: GisFeature[];
  layers: LayerVisibility;
  onToggleLayer?: (key: keyof LayerVisibility) => void;
  selectedFeatureId: string | null;
  onSelectFeature?: (id: string | null) => void;
  basemap: BasemapMode;
  onChangeBasemap: (mode: BasemapMode) => void;
  zoomTargetFeatureId?: string | null;
  onZoomStateChange?: (zoom: number) => void;
  compact?: boolean;
  onUploadRequest?: () => void;
}

function getFeatureBounds(
  feature: GisFeature,
  viewW: number,
  viewH: number
): { cx: number; cy: number; span: number } {
  const pts =
    feature.featureClass === 'road'
      ? (feature as RoadFeature).polyline
      : (feature as BuildingFeature | WaterFeature | VegetationFeature | ParcelFeature).polygon;
  if (!pts.length) return { cx: viewW / 2, cy: viewH / 2, span: Math.min(viewW, viewH) * 0.35 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    span: Math.max(maxX - minX, maxY - minY),
  };
}

export function GisMapCanvas({
  project,
  features,
  layers,
  onToggleLayer,
  selectedFeatureId,
  onSelectFeature,
  basemap,
  onChangeBasemap,
  zoomTargetFeatureId,
  onZoomStateChange,
  compact = false,
  onUploadRequest,
}: GisMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const movedDuringDragRef = useRef(false);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layerPopoverOpen, setLayerPopoverOpen] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [imgFailed, setImgFailed] = useState(false);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 960, h: 540 });

  const viewW = project?.segmentationOutputs?.coordWidth ?? project?.orthophoto?.widthPx ?? 1000;
  const viewH = project?.segmentationOutputs?.coordHeight ?? project?.orthophoto?.heightPx ?? 562.5;
  const vScale = Math.max(0.6, viewW / 1000);
  const gsdM = (project?.orthophoto?.resolutionCm ?? 5.0) / 100;
  const metersPerNatPx = Math.max(0.05, Math.min(0.8, (400 / viewW) * (gsdM / 0.05)));

  useEffect(() => {
    setImgFailed(false);
  }, [project?.id, project?.orthophoto?.imageUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          w: Math.max(1, entry.contentRect.width),
          h: Math.max(1, entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    onZoomStateChange?.(zoom);
  }, [zoom, onZoomStateChange]);

  // Reset extent on project switch
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setMeasurePoints([]);
  }, [project?.id]);

  // Programmatic Zoom-to-Feature (accounts for exact object-cover / xMidYMid slice scale)
  useEffect(() => {
    if (!zoomTargetFeatureId) return;
    const target = features.find((f) => f.id === zoomTargetFeatureId);
    if (!target || !containerRef.current) return;
    const { cx, cy, span } = getFeatureBounds(target, viewW, viewH);
    const minDim = Math.min(viewW, viewH);
    const nextZoom = Math.min(3.8, Math.max(1.6, (minDim * 0.52) / Math.max(span, minDim * 0.1)));
    const rect = containerRef.current.getBoundingClientRect();
    const coverScale = Math.max(rect.width / viewW, rect.height / viewH);
    const nextPanX = (viewW / 2 - cx) * nextZoom * coverScale;
    const nextPanY = (viewH / 2 - cy) * nextZoom * coverScale;
    setZoom(Number(nextZoom.toFixed(2)));
    setPan({ x: nextPanX, y: nextPanY });
  }, [zoomTargetFeatureId, features, viewW, viewH]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomBy = (delta: number) => {
    setZoom((z) => {
      const next = Math.min(4, Math.max(1, Number((z + delta).toFixed(2))));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    handleZoomBy(delta);
  };

  const screenToViewBox = (clientX: number, clientY: number, rect: DOMRect): [number, number] => {
    const coverScale = Math.max(rect.width / viewW, rect.height / viewH);
    const vx = viewW / 2 + (clientX - rect.left - rect.width / 2 - pan.x) / (zoom * coverScale);
    const vy = viewH / 2 + (clientY - rect.top - rect.height / 2 - pan.y) / (zoom * coverScale);
    return [Math.max(0, Math.min(viewW, vx)), Math.max(0, Math.min(viewH, vy))];
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    if (measureMode && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const [vx, vy] = screenToViewBox(e.clientX, e.clientY, rect);
      setMeasurePoints((prev) => (prev.length >= 2 ? [[vx, vy]] : [...prev, [vx, vy]]));
      return;
    }

    setIsDragging(true);
    movedDuringDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (containerRef.current && project?.orthophoto) {
      const rect = containerRef.current.getBoundingClientRect();
      const [vx, vy] = screenToViewBox(e.clientX, e.clientY, rect);
      const u = vx / viewW;
      const v = vy / viewH;
      const b = project.orthophoto.bounds;
      const lat = b.maxLat - v * (b.maxLat - b.minLat);
      const lng = b.minLng + u * (b.maxLng - b.minLng);
      setCursorCoords({ lat, lng });
    }

    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedDuringDragRef.current = true;
    }
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const buildings = useMemo(
    () => features.filter((f): f is BuildingFeature => f.featureClass === 'building'),
    [features]
  );
  const roads = useMemo(
    () => features.filter((f): f is RoadFeature => f.featureClass === 'road'),
    [features]
  );
  const waterBodies = useMemo(
    () => features.filter((f): f is WaterFeature => f.featureClass === 'water'),
    [features]
  );
  const vegetation = useMemo(
    () => features.filter((f): f is VegetationFeature => f.featureClass === 'vegetation'),
    [features]
  );
  const parcels = useMemo(
    () => features.filter((f): f is ParcelFeature => f.featureClass === 'parcel'),
    [features]
  );

  // Ground distance matching metersPerNatPx used during feature extraction
  const measuredDistanceM = useMemo(() => {
    if (measurePoints.length < 2) return null;
    const [[x1, y1], [x2, y2]] = measurePoints;
    const pxDist = Math.hypot(x2 - x1, y2 - y1);
    return (pxDist * metersPerNatPx).toFixed(1);
  }, [measurePoints, metersPerNatPx]);

  const coverScaleNow = Math.max(containerSize.w / viewW, containerSize.h / viewH);
  const scaleMeters = Math.max(1, Math.round((56 / (zoom * coverScaleNow)) * metersPerNatPx));

  if (!project || !project.orthophoto) {
    return (
      <div className="w-full h-full min-h-[360px] bg-[#EFEFEA] border border-[#E4E6DF] rounded-[4px] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-11 h-11 rounded-[4px] bg-white border border-[#E4E6DF] flex items-center justify-center text-[#727A75]">
          <Crosshair size={18} strokeWidth={1.6} />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-[#252A27]">
          No Orthophoto Imagery Loaded
        </h3>
        <p className="mt-1 text-xs text-[#727A75] max-w-sm leading-relaxed">
          {project
            ? `${project.village} (${project.district}) has no drone orthophoto uploaded yet. Upload a GeoTIFF or UAV orthomosaic to inspect vector layers.`
            : 'Select or create a village project to load spatial layers.'}
        </p>
        {onUploadRequest && project && (
          <button
            type="button"
            onClick={onUploadRequest}
            className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#496B54] hover:bg-[#3D5B47] rounded-[4px] transition-colors whitespace-nowrap"
          >
            Upload Orthophoto
          </button>
        )}
      </div>
    );
  }

  const ptsToAttr = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className={`relative w-full h-full overflow-hidden border border-[#E4E6DF] rounded-[4px] select-none ${
        measureMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${basemap === 'orthophoto' ? 'bg-[#2B302C]' : 'bg-[#F4F5F0]'}`}
    >
      {/* Transformed Map Viewport */}
      <div
        className="w-full h-full relative"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Basemap Raster / CAD Layer */}
        {basemap === 'orthophoto' && layers.orthophoto && !imgFailed ? (
          <>
            <img
              src={project.orthophoto.imageUrl}
              alt={`${project.village} drone orthophoto`}
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover pointer-events-none"
            />
            {layers.segmentationOverlay && project.segmentationOutputs?.overlayUrl && (
              <img
                src={project.segmentationOutputs.overlayUrl}
                alt={`${project.village} segmentation overlay`}
                referrerPolicy="no-referrer"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-85"
              />
            )}
          </>
        ) : (
          <div
            className="w-full h-full"
            style={{
              backgroundColor: basemap === 'topographic' ? '#EDEFE7' : '#F9FAF6',
              backgroundImage:
                basemap === 'topographic'
                  ? 'radial-gradient(#C7CBC0 1px, transparent 1px), linear-gradient(to right, #E2E5DC 1px, transparent 1px), linear-gradient(to bottom, #E2E5DC 1px, transparent 1px)'
                  : 'linear-gradient(to right, #E4E6DF 1px, transparent 1px), linear-gradient(to bottom, #E4E6DF 1px, transparent 1px)',
              backgroundSize: basemap === 'topographic' ? '40px 40px, 80px 80px, 80px 80px' : '50px 50px',
            }}
          />
        )}

        {/* Vector Overlay SVG */}
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full"
        >
          {/* Vegetation Layer */}
          {layers.vegetation &&
            vegetation.map((veg) => {
              const selected = selectedFeatureId === veg.id;
              const hovered = hoveredId === veg.id;
              return (
                <polygon
                  key={veg.id}
                  points={ptsToAttr(veg.polygon)}
                  fill="#5E8061"
                  fillOpacity={selected ? 0.48 : hovered ? 0.38 : 0.26}
                  stroke={selected ? '#2F4A38' : '#4B6C4E'}
                  strokeWidth={(selected ? 2.4 : 1.3) * vScale}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredId(veg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!movedDuringDragRef.current) onSelectFeature?.(veg.id);
                  }}
                />
              );
            })}

          {/* Water Bodies Layer */}
          {layers.water &&
            waterBodies.map((wb) => {
              const selected = selectedFeatureId === wb.id;
              const hovered = hoveredId === wb.id;
              return (
                <polygon
                  key={wb.id}
                  points={ptsToAttr(wb.polygon)}
                  fill="#567C94"
                  fillOpacity={selected ? 0.56 : hovered ? 0.46 : 0.36}
                  stroke={selected ? '#264459' : '#3E6278'}
                  strokeWidth={(selected ? 2.6 : 1.5) * vScale}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredId(wb.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!movedDuringDragRef.current) onSelectFeature?.(wb.id);
                  }}
                />
              );
            })}

          {/* Candidate Parcel Boundaries Layer */}
          {layers.parcels &&
            parcels.map((pcl) => {
              const selected = selectedFeatureId === pcl.id;
              return (
                <g key={pcl.id}>
                  <polygon
                    points={ptsToAttr(pcl.polygon)}
                    fill="#7B7387"
                    fillOpacity={selected ? 0.14 : 0.04}
                    stroke="#7B7387"
                    strokeWidth={(selected ? 2.2 : 1.4) * vScale}
                    strokeDasharray={`${6 * vScale} ${4 * vScale}`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!movedDuringDragRef.current) onSelectFeature?.(pcl.id);
                    }}
                  />
                </g>
              );
            })}

          {/* Roads Layer */}
          {layers.roads &&
            roads.map((rd) => {
              const selected = selectedFeatureId === rd.id;
              const hovered = hoveredId === rd.id;
              return (
                <g
                  key={rd.id}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredId(rd.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!movedDuringDragRef.current) onSelectFeature?.(rd.id);
                  }}
                >
                  {/* Casing */}
                  <polyline
                    points={ptsToAttr(rd.polyline)}
                    fill="none"
                    stroke={selected ? '#5E3D10' : '#7C5620'}
                    strokeWidth={(selected ? 8 : hovered ? 7 : 6) * vScale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity={0.75}
                  />
                  {/* Centerline */}
                  <polyline
                    points={ptsToAttr(rd.polyline)}
                    fill="none"
                    stroke={selected ? '#E5A952' : '#C88E41'}
                    strokeWidth={(selected ? 4.5 : 3.5) * vScale}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

          {/* Building Footprints Layer */}
          {layers.buildings &&
            buildings.map((bld) => {
              const selected = selectedFeatureId === bld.id;
              const hovered = hoveredId === bld.id;
              return (
                <polygon
                  key={bld.id}
                  points={ptsToAttr(bld.polygon)}
                  fill={selected ? '#A65D42' : '#B77B61'}
                  fillOpacity={selected ? 0.62 : hovered ? 0.52 : 0.38}
                  stroke={selected ? '#FFFFFF' : '#8E533B'}
                  strokeWidth={(selected ? 2.4 : 1.4) * vScale}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredId(bld.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!movedDuringDragRef.current) onSelectFeature?.(bld.id);
                  }}
                />
              );
            })}

          {/* Measurement Polyline */}
          {measurePoints.length > 0 && (
            <g>
              {measurePoints.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={(4 * vScale) / zoom}
                  fill="#252A27"
                  stroke="#FFFFFF"
                  strokeWidth={(1.5 * vScale) / zoom}
                />
              ))}
              {measurePoints.length === 2 && (
                <line
                  x1={measurePoints[0][0]}
                  y1={measurePoints[0][1]}
                  x2={measurePoints[1][0]}
                  y2={measurePoints[1][1]}
                  stroke="#252A27"
                  strokeWidth={(2 * vScale) / zoom}
                  strokeDasharray={`${4 * vScale} ${3 * vScale}`}
                />
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Top-Left Toolbar: Basemap Selector & Measure Tool */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 flex-wrap">
        <div className="bg-white/95 border border-[#E4E6DF] rounded-[4px] shadow-sm flex items-center p-0.5">
          {(['orthophoto', 'topographic', 'vector'] as BasemapMode[]).map((mode) => {
            const label =
              mode === 'orthophoto' ? 'Orthophoto' : mode === 'topographic' ? 'Topo' : 'Vector';
            const active = basemap === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeBasemap(mode)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-[3px] transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#496B54] text-white'
                    : 'text-[#4B524E] hover:text-[#252A27] hover:bg-[#F7F7F2]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {!compact && (
          <button
            type="button"
            onClick={() => {
              setMeasureMode((m) => !m);
              setMeasurePoints([]);
            }}
            className={`h-7 px-2.5 rounded-[4px] border text-[11px] font-medium inline-flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap ${
              measureMode
                ? 'bg-[#252A27] text-white border-[#252A27]'
                : 'bg-white/95 text-[#252A27] border-[#E4E6DF] hover:bg-[#F7F7F2]'
            }`}
            title="Measure distance between two points"
          >
            <Ruler size={13} strokeWidth={1.75} />
            <span>{measureMode ? 'Measuring' : 'Measure'}</span>
          </button>
        )}

        {measureMode && measuredDistanceM && (
          <div className="h-7 px-2.5 bg-white/95 border border-[#E4E6DF] rounded-[4px] shadow-sm flex items-center text-[11px] font-mono tabular-nums text-[#252A27]">
            Distance: {measuredDistanceM} m
          </div>
        )}
      </div>

      {/* Top-Right Controls: North Arrow, Zoom, Layer Popover, Fullscreen */}
      <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          {/* North Indicator */}
          <div
            className="h-8 px-2 bg-white/95 border border-[#E4E6DF] rounded-[4px] shadow-sm flex items-center gap-1 text-[11px] font-mono font-semibold text-[#252A27]"
            title="True North"
          >
            <Compass size={13} strokeWidth={1.75} className="text-[#496B54]" />
            <span>N</span>
          </div>

          {/* Quick Layer Popover Button */}
          {onToggleLayer && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setLayerPopoverOpen((v) => !v)}
                className="h-8 px-2.5 bg-white/95 border border-[#E4E6DF] rounded-[4px] shadow-sm flex items-center gap-1.5 text-[11px] font-medium text-[#252A27] hover:bg-[#F7F7F2] whitespace-nowrap"
              >
                <Layers size={13} strokeWidth={1.75} className="text-[#496B54]" />
                <span>Layers</span>
              </button>
              {layerPopoverOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-[#E4E6DF] rounded-[4px] shadow-md p-2 space-y-1 z-30">
                  {(
                    [
                      ['orthophoto', 'Orthophoto'],
                      ['segmentationOverlay', 'U-Net Pixel Mask'],
                      ['buildings', 'Building Footprints'],
                      ['roads', 'Road Network'],
                      ['water', 'Water Bodies'],
                      ['vegetation', 'Vegetation'],
                      ['parcels', 'Parcel Boundaries'],
                    ] as [keyof LayerVisibility, string][]
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-2 px-1.5 py-1 text-xs text-[#252A27] hover:bg-[#F7F7F2] rounded-[3px] cursor-pointer"
                    >
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={layers[key]}
                        onChange={() => onToggleLayer(key)}
                        className="accent-[#496B54]"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fullscreen */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="h-8 w-8 bg-white/95 border border-[#E4E6DF] rounded-[4px] shadow-sm flex items-center justify-center text-[#252A27] hover:bg-[#F7F7F2]"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 size={14} strokeWidth={1.75} />
            ) : (
              <Maximize2 size={14} strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* Zoom Stack */}
        <div className="bg-white/95 border border-[#E4E6DF] rounded-[4px] shadow-sm flex flex-col divide-y divide-[#E4E6DF]">
          <button
            type="button"
            onClick={() => handleZoomBy(0.35)}
            className="w-8 h-8 flex items-center justify-center text-[#252A27] hover:bg-[#F7F7F2]"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => handleZoomBy(-0.35)}
            className="w-8 h-8 flex items-center justify-center text-[#252A27] hover:bg-[#F7F7F2]"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="w-8 h-8 flex items-center justify-center text-[#727A75] hover:text-[#252A27] hover:bg-[#F7F7F2]"
            aria-label="Reset map extent"
            title="Reset extent"
          >
            <RotateCcw size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Bottom-Left HUD: Scale Bar & Live Coordinates */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 flex-wrap pointer-events-none">
        <div className="bg-white/95 border border-[#E4E6DF] rounded-[4px] px-2.5 py-1 shadow-sm flex items-center gap-2">
          <div className="w-14 h-[6px] border-x border-b border-[#252A27]" />
          <span className="text-[11px] font-mono tabular-nums text-[#252A27]">
            {scaleMeters} m
          </span>
        </div>

        <div className="bg-white/95 border border-[#E4E6DF] rounded-[4px] px-2.5 py-1 shadow-sm text-[11px] font-mono tabular-nums text-[#252A27]">
          {cursorCoords
            ? `${cursorCoords.lat.toFixed(5)}° N, ${cursorCoords.lng.toFixed(5)}° E`
            : `${project.latitude.toFixed(5)}° N, ${project.longitude.toFixed(5)}° E`}
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredId && (
        <div className="absolute bottom-3 right-3 z-20 bg-[#252A27]/90 text-white px-2.5 py-1 rounded-[3px] text-[11px] font-mono pointer-events-none">
          Feature: {hoveredId}
        </div>
      )}
    </div>
  );
}
