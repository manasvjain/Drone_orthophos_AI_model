import { useState } from 'react';
import { Check, Database, RotateCcw, Trash2 } from 'lucide-react';
import { MODEL_BENCHMARKS } from '../data/mockGisData';
import { useGis } from '../context/GisContext';
import { ConfirmDialog } from '../components/ui/Modal';

export function ModelRegistryPage() {
  const { setActivePage, setAnalyticsTab, backendHealth } = useGis();

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4E6DF] pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#252A27]">Model Registry</h1>
          <p className="text-xs text-[#727A75] mt-0.5">
            Registered semantic segmentation and roof classification checkpoints.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAnalyticsTab('comparison');
            setActivePage('model-lab');
          }}
          className="h-9 px-3.5 bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] text-xs font-medium text-[#252A27] rounded-[4px] whitespace-nowrap"
        >
          Open Model Comparison
        </button>
      </div>

      <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <div className="text-[11px] text-[#727A75]">Active Inference Gateway</div>
          <div className="font-mono font-semibold text-[#252A27] mt-0.5">
            {backendHealth.activeEngine === 'pytorch-flask'
              ? 'PyTorch Flask (final_drone_model.pth)'
              : '256×256 Tiled Segmentation Engine'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[#727A75]">Flask PyTorch Bridge (/api/analyze)</div>
          <div className="font-medium text-[#252A27] mt-0.5">
            {backendHealth.pythonBridgeReachable && backendHealth.modelFilePresent
              ? 'Connected (final_drone_model.pth loaded)'
              : 'Standby (using browser tiled segmentation)'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[#727A75]">Default Tiling & Classes</div>
          <div className="font-mono text-[#252A27] mt-0.5">
            256×256 px · Classes: 1:Bld, 2:Veg, 3:Water, 4:Road
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#E4E6DF] rounded-[4px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E6DF] bg-[#FAFBF8] text-[11px] font-semibold text-[#727A75]">
                <th className="py-2.5 px-4">Checkpoint</th>
                <th className="py-2.5 px-4">Backbone</th>
                <th className="py-2.5 px-4">Version</th>
                <th className="py-2.5 px-4 text-right">Tile Input</th>
                <th className="py-2.5 px-4 text-right">Parameters</th>
                <th className="py-2.5 px-4">Validation Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E6DF]">
              {MODEL_BENCHMARKS.map((m) => (
                <tr key={m.id} className="hover:bg-[#FAFBF8]">
                  <td className="py-3 px-4 font-semibold text-[#252A27]">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-[#496B54]" />
                      <span>{m.fullName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[#4B524E]">{m.backbone}</td>
                  <td className="py-3 px-4 font-mono text-[#252A27]">{m.version}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#252A27]">
                    {m.inputTilePx}×{m.inputTilePx}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#727A75]">
                    {m.paramsMillions}M
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs font-medium ${
                        m.evaluated ? 'text-[#3C5C47]' : 'text-[#727A75]'
                      }`}
                    >
                      {m.evaluated ? 'Benchmarked' : 'Unbenchmarked (N/A)'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, clearAllProjects, resetDemoData } = useGis();
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const handleSave = () => {
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2400);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[960px]">
      <div className="border-b border-[#E4E6DF] pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-[#252A27]">Settings</h1>
        <p className="text-xs text-[#727A75] mt-0.5">
          Configure spatial defaults, inference parameters, and demonstration dataset state.
        </p>
      </div>

      <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[#252A27]">Geospatial & Pipeline Defaults</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#252A27] mb-1">
              Default Coordinate Reference System
            </label>
            <select
              value={settings.defaultCrs}
              onChange={(e) =>
                updateSettings({
                  defaultCrs: e.target.value as 'EPSG:32643' | 'EPSG:32644' | 'EPSG:4326',
                })
              }
              className="w-full h-9 px-3 text-xs font-mono border border-[#E4E6DF] rounded-[4px] bg-[#FAFBF8]"
            >
              <option value="EPSG:32643">EPSG:32643 (WGS 84 / UTM 43N)</option>
              <option value="EPSG:32644">EPSG:32644 (WGS 84 / UTM 44N)</option>
              <option value="EPSG:4326">EPSG:4326 (WGS 84 Geographic)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#252A27] mb-1">
              Default Orthophoto Tile Size
            </label>
            <select
              value={settings.defaultTileSize}
              onChange={(e) =>
                updateSettings({
                  defaultTileSize: Number(e.target.value) as 256 | 512 | 1024,
                })
              }
              className="w-full h-9 px-3 text-xs font-mono border border-[#E4E6DF] rounded-[4px] bg-[#FAFBF8]"
            >
              <option value={256}>256 × 256 px</option>
              <option value={512}>512 × 512 px</option>
              <option value={1024}>1024 × 1024 px</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#252A27] mb-1">
              Default Confidence Threshold ({Math.round(settings.defaultConfidenceThreshold * 100)}%)
            </label>
            <input
              type="range"
              min={0.5}
              max={0.95}
              step={0.05}
              value={settings.defaultConfidenceThreshold}
              onChange={(e) =>
                updateSettings({
                  defaultConfidenceThreshold: Number.parseFloat(e.target.value),
                })
              }
              className="w-full accent-[#496B54]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#252A27] mb-1">
              Parcel Snap Tolerance (meters)
            </label>
            <input
              type="number"
              step={0.05}
              min={0.1}
              max={2.0}
              value={settings.snapParcelToleranceM}
              onChange={(e) =>
                updateSettings({
                  snapParcelToleranceM: Number.parseFloat(e.target.value) || 0.45,
                })
              }
              className="w-full h-9 px-3 text-xs font-mono tabular-nums border border-[#E4E6DF] rounded-[4px]"
            />
          </div>
        </div>

        <div className="pt-2 space-y-2">
          <label className="flex items-center gap-2.5 text-xs text-[#252A27] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoVectorizePostInference}
              onChange={(e) =>
                updateSettings({ autoVectorizePostInference: e.target.checked })
              }
              className="accent-[#496B54]"
            />
            <span>Automatically vectorize & simplify polygons after AI inference</span>
          </label>
          <label className="flex items-center gap-2.5 text-xs text-[#252A27] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.exportIncludeMetadata}
              onChange={(e) =>
                updateSettings({ exportIncludeMetadata: e.target.checked })
              }
              className="accent-[#496B54]"
            />
            <span>Include model checkpoint & confidence metadata in GeoJSON/CSV exports</span>
          </label>
        </div>

        <div className="pt-3 border-t border-[#E4E6DF] flex items-center justify-between gap-3">
          {savedNotice ? (
            <span className="text-xs font-medium text-[#3C5C47] inline-flex items-center gap-1.5">
              <Check size={14} />
              Preferences updated for active session.
            </span>
          ) : (
            <span className="text-[11px] text-[#727A75]">Changes apply to new processing jobs.</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="h-9 px-4 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px]"
          >
            Save Preferences
          </button>
        </div>
      </div>

      {/* Workspace State Controls (helps test empty states cleanly) */}
      <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[#252A27]">Demonstration Dataset Controls</h2>
        <p className="text-xs text-[#727A75]">
          Restore the pre-loaded SVAMITVA village survey projects or clear workspace data to inspect empty states.
        </p>
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={resetDemoData}
            className="h-9 px-3.5 bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] text-xs font-medium text-[#252A27] rounded-[4px] inline-flex items-center gap-1.5"
          >
            <RotateCcw size={13} />
            <span>Reset Demo Data</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="h-9 px-3.5 bg-white border border-[#E6C5C0] hover:bg-[#FDF7F6] text-xs font-medium text-[#A64438] rounded-[4px] inline-flex items-center gap-1.5"
          >
            <Trash2 size={13} />
            <span>Clear All Projects</span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={clearAllProjects}
        title="Clear Workspace Projects"
        message="This removes all village projects from the current session so you can test empty states or create a project from scratch. You can restore them anytime via Reset Demo Data."
        confirmLabel="Clear Workspace"
        destructive
      />
    </div>
  );
}
