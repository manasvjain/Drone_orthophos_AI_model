import { useState } from 'react';
import { Code2, Download, Focus, MapPin } from 'lucide-react';
import {
  BuildingFeature,
  GisFeature,
  OrthophotoMetadata,
  ParcelFeature,
  RoadFeature,
  VegetationFeature,
  WaterFeature,
} from '../../types/gis';
import { Modal } from '../ui/Modal';

interface FeatureInspectorProps {
  feature: GisFeature | undefined;
  crs: string;
  orthophoto?: OrthophotoMetadata | null;
  coordDims?: { w: number; h: number };
  onZoomToFeature: (id: string) => void;
}

export function FeatureInspector({
  feature,
  crs,
  orthophoto,
  coordDims,
  onZoomToFeature,
}: FeatureInspectorProps) {
  const [geometryModalOpen, setGeometryModalOpen] = useState(false);

  if (!feature) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-5 text-center">
        <div className="w-9 h-9 rounded-[4px] bg-[#F7F7F2] border border-[#E4E6DF] flex items-center justify-center text-[#727A75]">
          <MapPin size={16} strokeWidth={1.6} />
        </div>
        <div className="mt-3 text-xs font-semibold text-[#252A27]">No Feature Selected</div>
        <p className="mt-1 text-[11px] text-[#727A75] leading-relaxed">
          Click any building polygon, road centerline, water body, or vegetation cluster on the map
          to inspect its attributes and geometry.
        </p>
      </div>
    );
  }

  const projectPoint = ([x, y]: [number, number]): [number, number] => {
    if (!orthophoto?.bounds || !coordDims?.w || !coordDims?.h) return [x, y];
    const b = orthophoto.bounds;
    const lng = b.minLng + (x / coordDims.w) * (b.maxLng - b.minLng);
    const lat = b.maxLat - (y / coordDims.h) * (b.maxLat - b.minLat);
    return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
  };

  const handleExportFeature = () => {
    let geometryCoords: [number, number][] | [number, number][][];
    if (feature.featureClass === 'road') {
      geometryCoords = (feature as RoadFeature).polyline.map(projectPoint);
    } else {
      const poly = (
        feature as BuildingFeature | WaterFeature | VegetationFeature | ParcelFeature
      ).polygon;
      const ring = poly.length > 0 ? [...poly, poly[0]].map(projectPoint) : [];
      geometryCoords = [ring];
    }

    const geojson = {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: orthophoto?.bounds ? 'EPSG:4326' : crs } },
      features: [
        {
          type: 'Feature',
          id: feature.id,
          properties: {
            ...feature,
            polygon: undefined,
            polyline: undefined,
          },
          geometry: {
            type: feature.featureClass === 'road' ? 'LineString' : 'Polygon',
            coordinates: geometryCoords,
          },
        },
      ],
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${feature.id.toLowerCase()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderRows = () => {
    if (feature.featureClass === 'building') {
      const b = feature as BuildingFeature;
      return [
        ['Building ID', b.id, true],
        ['Building Area', `${b.areaSqm.toFixed(1)} m²`, true],
        ['Perimeter', `${b.perimeterM.toFixed(1)} m`, true],
        ['Roof Type', b.roofType, false],
        ['Roof Confidence', `${(b.roofConfidence * 100).toFixed(1)}%`, true],
        ['Roof Classifier', b.roofClassifier ?? 'CNN-2D (TensorFlow.js RoofNet)', false],
        ['Segmentation Conf.', `${(b.confidence * 100).toFixed(1)}%`, true],
        ['Centroid Coords', `${b.centroid[0].toFixed(5)}° N, ${b.centroid[1].toFixed(5)}° E`, true],
        ['Revenue Ward', b.ward, false],
        ['Model Version', b.modelVersion, false],
        ['Processing Date', b.processingDate, true],
      ] as [string, string, boolean][];
    }

    if (feature.featureClass === 'road') {
      const r = feature as RoadFeature;
      return [
        ['Road ID', r.id, true],
        ['Length', `${r.lengthM.toFixed(1)} m`, true],
        ['Est. Width', `${r.widthM.toFixed(1)} m`, true],
        ['Surface Class', r.surfaceClass, false],
        ['Confidence', `${(r.confidence * 100).toFixed(1)}%`, true],
        ['Revenue Ward', r.ward, false],
        ['Model Version', r.modelVersion, false],
        ['Processing Date', r.processingDate, true],
      ] as [string, string, boolean][];
    }

    if (feature.featureClass === 'water') {
      const w = feature as WaterFeature;
      return [
        ['Water Body ID', w.id, true],
        ['Water Class', w.waterType, false],
        ['Area', `${w.areaSqm.toFixed(1)} m²`, true],
        ['Perimeter', `${w.perimeterM.toFixed(1)} m`, true],
        ['Confidence', `${(w.confidence * 100).toFixed(1)}%`, true],
        ['Revenue Ward', w.ward, false],
        ['Model Version', w.modelVersion, false],
      ] as [string, string, boolean][];
    }

    if (feature.featureClass === 'vegetation') {
      const v = feature as VegetationFeature;
      return [
        ['Vegetation ID', v.id, true],
        ['Canopy Type', v.canopyType, false],
        ['Area', `${v.areaSqm.toFixed(1)} m²`, true],
        ['Coverage Pct.', `${v.coveragePct.toFixed(1)}%`, true],
        ['Confidence', `${(v.confidence * 100).toFixed(1)}%`, true],
        ['Revenue Ward', v.ward, false],
        ['Model Version', v.modelVersion, false],
      ] as [string, string, boolean][];
    }

    const p = feature as ParcelFeature;
    return [
      ['Parcel ID', p.id, true],
      ['Parcel Block', p.parcelNo, true],
      ['Area', `${p.areaSqm.toFixed(1)} m²`, true],
      ['Confidence', `${(p.confidence * 100).toFixed(1)}%`, true],
      ['Revenue Ward', p.ward, false],
    ] as [string, string, boolean][];
  };

  const rows = renderRows();
  const buildingFeature = feature.featureClass === 'building' ? (feature as BuildingFeature) : null;

  const wktPreview = (() => {
    if (feature.featureClass === 'road') {
      const pts = (feature as RoadFeature).polyline.map(([x, y]) => `${x} ${y}`).join(', ');
      return `LINESTRING (${pts})`;
    }
    const poly = (feature as BuildingFeature | WaterFeature | VegetationFeature | ParcelFeature).polygon;
    const closed = [...poly, poly[0]].map(([x, y]) => `${x} ${y}`).join(', ');
    return `POLYGON ((${closed}))`;
  })();

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[#E4E6DF] flex items-center justify-between gap-2 bg-[#FAFBF8]">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#727A75]">
            Feature Inspector
          </div>
          <div className="text-sm font-mono font-semibold text-[#252A27] truncate mt-0.5">
            {feature.id}
          </div>
        </div>
        <span className="text-[11px] font-medium capitalize text-[#496B54]">
          {feature.featureClass}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Roof Image Preview if Building has one */}
        {buildingFeature && (
          <div>
            <div className="text-[11px] font-medium text-[#727A75] mb-1.5">
              Roof Orthophoto Patch ({buildingFeature.roofType})
            </div>
            {buildingFeature.roofPreviewUrl ? (
              <div className="border border-[#E4E6DF] rounded-[4px] overflow-hidden bg-[#F7F7F2]">
                <img
                  src={buildingFeature.roofPreviewUrl}
                  alt={`Roof crop for ${buildingFeature.id}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-32 object-cover"
                />
              </div>
            ) : (
              <div className="h-24 border border-[#E4E6DF] rounded-[4px] bg-[#F7F7F2] flex items-center justify-center text-[11px] text-[#727A75] px-3 text-center">
                No dedicated high-zoom roof patch archived for this {buildingFeature.roofType} roof.
              </div>
            )}
          </div>
        )}

        {/* Attribute Table */}
        <dl className="divide-y divide-[#E4E6DF] border-y border-[#E4E6DF]">
          {rows.map(([label, value, isMono]) => (
            <div key={label} className="py-2 flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-[#727A75] shrink-0">{label}</dt>
              <dd
                className={`text-xs text-[#252A27] text-right truncate ${
                  isMono ? 'font-mono tabular-nums font-medium' : 'font-medium'
                }`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => onZoomToFeature(feature.id)}
            className="w-full h-8 px-3 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Focus size={13} strokeWidth={1.75} />
            <span>Zoom to Feature</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setGeometryModalOpen(true)}
              className="h-8 px-2.5 bg-white hover:bg-[#F7F7F2] text-[#252A27] border border-[#E4E6DF] text-xs font-medium rounded-[4px] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Code2 size={13} strokeWidth={1.75} />
              <span>View Geometry</span>
            </button>
            <button
              type="button"
              onClick={handleExportFeature}
              className="h-8 px-2.5 bg-white hover:bg-[#F7F7F2] text-[#252A27] border border-[#E4E6DF] text-xs font-medium rounded-[4px] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download size={13} strokeWidth={1.75} />
              <span>Export Feature</span>
            </button>
          </div>
        </div>
      </div>

      {/* Geometry Modal */}
      <Modal
        open={geometryModalOpen}
        onClose={() => setGeometryModalOpen(false)}
        title={`Vector Geometry — ${feature.id}`}
        subtitle={`CRS: ${crs} · Model: ${feature.modelVersion}`}
      >
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#727A75] mb-1">
              Well-Known Text (WKT)
            </div>
            <pre className="p-3 bg-[#F7F7F2] border border-[#E4E6DF] rounded-[4px] text-[11px] font-mono text-[#252A27] whitespace-pre-wrap break-all">
              {wktPreview}
            </pre>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleExportFeature}
              className="px-3.5 py-2 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] inline-flex items-center gap-1.5"
            >
              <Download size={13} strokeWidth={1.75} />
              <span>Download GeoJSON</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
