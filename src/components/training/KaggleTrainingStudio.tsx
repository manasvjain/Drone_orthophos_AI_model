import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  FolderUp,
  Layers,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Upload,
} from 'lucide-react';
import { useGis } from '../../context/GisContext';
import { BuildingFeature, RoofType } from '../../types/gis';
import {
  getRoofCnnStatus,
  resetRoofCnnWeights,
  RoofCnnStatus,
  RoofTrainingEpochLog,
  trainRoofCnnOnSamples,
} from '../../utils/roofCnnClassifier';
import {
  getActiveCalibrationProfile,
  resetCalibrationProfile,
  SegmentationCalibrationProfile,
} from '../../utils/segmentationCalibration';
import {
  CalibrationTrainingResult,
  KaggleImageMaskPair,
  pairUploadedDatasetFiles,
  trainCalibrationFromPairs,
} from '../../utils/segmentationTrainer';

const ROOF_OPTIONS: RoofType[] = ['RCC', 'Tiled', 'Tin', 'Other'];

const KAGGLE_TRAIN_CMD = `pip install torch torchvision segmentation-models-pytorch albumentations opencv-python pillow kagglehub
python scripts/train_svamitva_unet.py --epochs 40 --batch-size 16 --tile-size 256 --out final_drone_model.pth`;

export function KaggleTrainingStudio() {
  const { activeProject, activeProjectFeatures, startProcessing, setActivePage } = useGis();

  // Calibration & Kaggle pair state
  const [calProfile, setCalProfile] = useState<SegmentationCalibrationProfile>(() =>
    getActiveCalibrationProfile()
  );
  const [pairs, setPairs] = useState<KaggleImageMaskPair[]>([]);
  const [unpairedNotice, setUnpairedNotice] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calProgress, setCalProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [calResult, setCalResult] = useState<CalibrationTrainingResult | null>(null);
  const [calError, setCalError] = useState<string | null>(null);

  // Manual side-by-side single pair upload fallback
  const [singleImgFile, setSingleImgFile] = useState<File | null>(null);
  const [singleMaskFile, setSingleMaskFile] = useState<File | null>(null);

  // RoofNet-2D CNN interactive training state
  const [cnnStatus, setCnnStatus] = useState<RoofCnnStatus>(() => getRoofCnnStatus());
  const [labelOverrides, setLabelOverrides] = useState<Record<string, RoofType>>({});
  const [isTrainingCnn, setIsTrainingCnn] = useState(false);
  const [cnnEpochs, setCnnEpochs] = useState<number>(12);
  const [cnnLogs, setCnnLogs] = useState<RoofTrainingEpochLog[]>([]);
  const [cnnError, setCnnError] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const buildingPatches = useMemo(() => {
    const activeCrops = activeProjectFeatures
      .filter((f): f is BuildingFeature => f.featureClass === 'building' && Boolean(f.roofPreviewUrl))
      .slice(0, 12)
      .map((b) => ({
        id: b.id,
        sourceName: `${activeProject?.village ?? 'Village'} (${b.id})`,
        patchDataUrl: b.roofPreviewUrl!,
        suggestedLabel: b.roofType === 'Unknown' ? ('Other' as RoofType) : b.roofType,
        confidence: b.roofConfidence,
      }));

    const gtPatches = calResult?.extractedRoofPatches ?? [];
    return [...gtPatches, ...activeCrops].slice(0, 18);
  }, [activeProjectFeatures, activeProject, calResult]);

  const handleBulkFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setCalError(null);
    const { pairs: matched, unpairedCount } = pairUploadedDatasetFiles(Array.from(fileList));
    if (matched.length === 0) {
      setCalError(
        'No matched (image, mask) pairs detected. Name masks like "<id>_mask.png" or place them inside separate images/ and masks/ folders.'
      );
      return;
    }
    setPairs((prev) => [...prev, ...matched].slice(0, 24));
    setUnpairedNotice(
      unpairedCount > 0
        ? `Matched ${matched.length} pairs (${unpairedCount} unpaired images ignored).`
        : `Matched ${matched.length} image/mask pairs ready for IoU optimization.`
    );
  };

  const handleAddExplicitPair = () => {
    if (!singleImgFile || !singleMaskFile) return;
    const pair: KaggleImageMaskPair = {
      id: `manual-${Date.now()}`,
      imageName: singleImgFile.name,
      maskName: singleMaskFile.name,
      imageUrl: URL.createObjectURL(singleImgFile),
      maskUrl: URL.createObjectURL(singleMaskFile),
    };
    setPairs((prev) => [...prev, pair]);
    setSingleImgFile(null);
    setSingleMaskFile(null);
    setCalError(null);
  };

  const handleRunCalibration = async () => {
    if (pairs.length === 0) return;
    setIsCalibrating(true);
    setCalError(null);
    try {
      const res = await trainCalibrationFromPairs(
        pairs,
        'utkarshsaxenadn/svamitva-drone-aerial-images',
        (pct, stage) => setCalProgress({ pct, stage })
      );
      setCalResult(res);
      setCalProfile(res.optimizedProfile);
    } catch (err) {
      setCalError(err instanceof Error ? err.message : 'Failed to evaluate image/mask pairs.');
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleResetCalibration = () => {
    const reset = resetCalibrationProfile();
    setCalProfile(reset);
    setCalResult(null);
    setCalProgress(null);
  };

  const handleTrainCnn = async () => {
    const samples = buildingPatches.map((p) => ({
      imageDataUrl: p.patchDataUrl,
      label: labelOverrides[p.id] ?? p.suggestedLabel,
    }));
    if (samples.length < 2) {
      setCnnError('At least 2 building roof patches are required for training.');
      return;
    }
    setIsTrainingCnn(true);
    setCnnError(null);
    setCnnLogs([]);
    try {
      const status = await trainRoofCnnOnSamples(samples, {
        epochs: cnnEpochs,
        learningRate: 0.008,
        onEpoch: (log) => {
          setCnnLogs((prev) => [...prev, log]);
        },
      });
      setCnnStatus(status);
    } catch (err) {
      setCnnError(err instanceof Error ? err.message : 'TensorFlow.js training failed.');
    } finally {
      setIsTrainingCnn(false);
    }
  };

  const handleResetCnn = async () => {
    const status = await resetRoofCnnWeights();
    setCnnStatus(status);
    setCnnLogs([]);
  };

  const handleCopyCommand = () => {
    void navigator.clipboard?.writeText(KAGGLE_TRAIN_CMD);
    setCopiedCmd(true);
    window.setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Banner summarizing Kaggle dataset linkage */}
      <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-[#496B54]" />
            <h2 className="text-sm font-semibold text-[#252A27]">
              Kaggle Dataset Calibration & Model Training Studio
            </h2>
          </div>
          <p className="text-xs text-[#727A75] max-w-3xl leading-relaxed">
            Target dataset:{' '}
            <a
              href="https://www.kaggle.com/datasets/utkarshsaxenadn/svamitva-drone-aerial-images/data"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[#496B54] underline"
            >
              utkarshsaxenadn/svamitva-drone-aerial-images
            </a>{' '}
            (Buildings, Vegetation, Water, Roads). Upload downloaded image/mask pairs below to optimize
            in-browser segmentation IoU, fine-tune the TensorFlow.js RoofNet-2D CNN in IndexedDB, or
            train full PyTorch ResNet-18 U-Net weights for the Flask backend.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeProject?.orthophoto && (
            <button
              type="button"
              onClick={() => {
                startProcessing(activeProject.id);
                setActivePage('explorer');
              }}
              className="h-9 px-3.5 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Play size={13} />
              <span>Re-Run Inference on {activeProject.village}</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: Kaggle Image/Mask Calibration */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-7 bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E4E6DF] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#252A27]">
                1. Ground-Truth Segmentation Calibration (Kaggle Image + Mask Pairs)
              </h3>
              <p className="text-[11px] text-[#727A75] mt-0.5">
                Supports PNG/JPG drone tiles and binary (0/255) or multi-class semantic masks
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#496B54] bg-[#EEF2EE] px-2 py-1 rounded-[3px]">
              {pairs.length} pairs loaded
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Folder / Multi-file Auto-Pair Upload */}
            <label className="border border-dashed border-[#CBD0C6] hover:border-[#496B54] bg-[#FAFBF8] rounded-[4px] p-3.5 cursor-pointer flex flex-col justify-between gap-2 transition-colors">
              <div className="flex items-center gap-2 text-xs font-medium text-[#252A27]">
                <FolderUp size={15} className="text-[#496B54]" />
                <span>Upload Kaggle Folder / Batch</span>
              </div>
              <p className="text-[11px] text-[#727A75]">
                Select both images and masks (or a folder containing <code className="font-mono">images/</code> and{' '}
                <code className="font-mono">masks/</code>) to auto-pair by filename.
              </p>
              <input
                type="file"
                multiple
                accept="image/*"
                // @ts-expect-error webkitdirectory supported by Chromium/modern browsers for dataset folders
                webkitdirectory=""
                onChange={(e) => handleBulkFiles(e.target.files)}
                className="hidden"
              />
            </label>

            {/* Multi-file flat upload without directory attribute */}
            <label className="border border-dashed border-[#CBD0C6] hover:border-[#496B54] bg-[#FAFBF8] rounded-[4px] p-3.5 cursor-pointer flex flex-col justify-between gap-2 transition-colors">
              <div className="flex items-center gap-2 text-xs font-medium text-[#252A27]">
                <Upload size={15} className="text-[#496B54]" />
                <span>Select Individual Image + Mask Files</span>
              </div>
              <p className="text-[11px] text-[#727A75]">
                Select multiple files at once (e.g. <code className="font-mono">tile_01.png</code> &amp;{' '}
                <code className="font-mono">tile_01_mask.png</code>).
              </p>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleBulkFiles(e.target.files)}
                className="hidden"
              />
            </label>
          </div>

          {/* Explicit single pair fallback */}
          <div className="border border-[#E4E6DF] rounded-[4px] p-3 bg-[#FAFBF8] flex flex-wrap items-center gap-2.5 text-xs">
            <span className="text-[11px] font-medium text-[#727A75]">Manual Pair:</span>
            <label className="px-2.5 py-1 bg-white border border-[#E4E6DF] rounded-[3px] cursor-pointer hover:bg-[#F7F7F2] truncate max-w-[170px]">
              {singleImgFile ? singleImgFile.name : 'Choose Drone Image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setSingleImgFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="px-2.5 py-1 bg-white border border-[#E4E6DF] rounded-[3px] cursor-pointer hover:bg-[#F7F7F2] truncate max-w-[170px]">
              {singleMaskFile ? singleMaskFile.name : 'Choose Ground-Truth Mask'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setSingleMaskFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              disabled={!singleImgFile || !singleMaskFile}
              onClick={handleAddExplicitPair}
              className="px-2.5 py-1 bg-[#496B54] disabled:opacity-40 text-white rounded-[3px] font-medium"
            >
              Add Pair
            </button>
          </div>

          {unpairedNotice && (
            <div className="text-xs text-[#3C5C47] bg-[#EEF2EE] px-3 py-2 rounded-[4px]">
              {unpairedNotice}
            </div>
          )}
          {calError && (
            <div className="text-xs text-[#A64438] bg-[#FDF7F6] border border-[#E6C5C0] px-3 py-2 rounded-[4px]">
              {calError}
            </div>
          )}

          {pairs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
              {pairs.map((p) => (
                <div
                  key={p.id}
                  className="border border-[#E4E6DF] rounded-[3px] overflow-hidden bg-[#F7F7F2]"
                >
                  <div className="grid grid-cols-2 h-14">
                    <img src={p.imageUrl} alt={p.imageName} className="w-full h-full object-cover" />
                    <img src={p.maskUrl} alt={p.maskName} className="w-full h-full object-cover" />
                  </div>
                  <div className="px-1.5 py-1 text-[10px] font-mono text-[#252A27] truncate bg-white border-t border-[#E4E6DF]">
                    {p.imageName}
                  </div>
                </div>
              ))}
            </div>
          )}

          {calProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-[#727A75]">
                <span>{calProgress.stage}</span>
                <span className="font-mono tabular-nums">{calProgress.pct}%</span>
              </div>
              <div className="h-1.5 bg-[#E4E6DF] rounded-[2px] overflow-hidden">
                <div
                  className="h-full bg-[#496B54] transition-all"
                  style={{ width: `${calProgress.pct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E4E6DF]">
            <button
              type="button"
              onClick={handleResetCalibration}
              className="h-9 px-3 bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] text-xs font-medium text-[#252A27] rounded-[4px] inline-flex items-center gap-1.5"
            >
              <RotateCcw size={13} />
              <span>Reset Calibration</span>
            </button>
            <button
              type="button"
              disabled={pairs.length === 0 || isCalibrating}
              onClick={() => void handleRunCalibration()}
              className="h-9 px-4 bg-[#496B54] hover:bg-[#3D5B47] disabled:opacity-45 text-white text-xs font-medium rounded-[4px] inline-flex items-center gap-1.5"
            >
              <Sparkles size={13} />
              <span>
                {isCalibrating ? 'Optimizing Parameters...' : 'Evaluate & Calibrate on Pairs'}
              </span>
            </button>
          </div>
        </div>

        {/* Right: Active Calibration Metrics */}
        <div className="xl:col-span-5 bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#E4E6DF] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#252A27]">Active Calibration Profile</h3>
              <p className="text-[11px] text-[#727A75] mt-0.5">{calProfile.profileName}</p>
            </div>
            <Layers size={15} className="text-[#496B54]" />
          </div>

          <dl className="divide-y divide-[#E4E6DF] text-xs border-b border-[#E4E6DF]">
            <div className="py-2 flex justify-between">
              <dt className="text-[#727A75]">Dataset Samples Evaluated</dt>
              <dd className="font-mono font-medium text-[#252A27]">{calProfile.samplesTrained}</dd>
            </div>
            <div className="py-2 flex justify-between">
              <dt className="text-[#727A75]">Baseline → Tuned Mean IoU</dt>
              <dd className="font-mono font-semibold text-[#3C5C47]">
                {calProfile.baselineMeanIoU !== null && calProfile.calibratedMeanIoU !== null
                  ? `${calProfile.baselineMeanIoU.toFixed(3)} → ${calProfile.calibratedMeanIoU.toFixed(3)}`
                  : 'Run calibration with masks'}
              </dd>
            </div>
            <div className="py-2 flex justify-between">
              <dt className="text-[#727A75]">Buildings IoU</dt>
              <dd className="font-mono text-[#252A27]">
                {calProfile.perClassIoU.buildings !== null
                  ? calProfile.perClassIoU.buildings.toFixed(3)
                  : 'N/A'}
              </dd>
            </div>
            <div className="py-2 flex justify-between">
              <dt className="text-[#727A75]">Roads IoU</dt>
              <dd className="font-mono text-[#252A27]">
                {calProfile.perClassIoU.roads !== null
                  ? calProfile.perClassIoU.roads.toFixed(3)
                  : 'N/A'}
              </dd>
            </div>
            <div className="py-2 flex justify-between">
              <dt className="text-[#727A75]">Water / Vegetation IoU</dt>
              <dd className="font-mono text-[#252A27]">
                {calProfile.perClassIoU.water !== null
                  ? calProfile.perClassIoU.water.toFixed(3)
                  : 'N/A'}{' '}
                /{' '}
                {calProfile.perClassIoU.vegetation !== null
                  ? calProfile.perClassIoU.vegetation.toFixed(3)
                  : 'N/A'}
              </dd>
            </div>
          </dl>

          <div>
            <div className="text-[11px] font-semibold text-[#727A75] uppercase tracking-wider mb-1.5">
              Tuned Thresholds Applied to Inference
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-[#FAFBF8] p-2.5 border border-[#E4E6DF] rounded-[4px]">
              <div>rccBrightDelta: {calProfile.params.rccBrightDelta}</div>
              <div>terracottaRbDiff: {calProfile.params.terracottaRbDiff}</div>
              <div>vegExgThresh: {calProfile.params.vegExgThresh}</div>
              <div>waterMaxStd: {calProfile.params.waterMaxStd}</div>
              <div>roadMaxStd: {calProfile.params.roadMaxStd}</div>
              <div>shadowLumRatio: {calProfile.params.shadowLumRatio}</div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Interactive TensorFlow.js RoofNet-2D CNN Supervised Training */}
      <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E4E6DF] pb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#252A27]">
              2. Fine-Tune RoofNet-2D CNN (Live TensorFlow.js Backpropagation)
            </h3>
            <p className="text-[11px] text-[#727A75] mt-0.5">
              Verify or correct roof labels on building patches below, then train conv2d + dense softmax weights and persist to IndexedDB.
            </p>
          </div>
          <div className="text-[11px] font-mono text-[#252A27] bg-[#FAFBF8] border border-[#E4E6DF] px-2.5 py-1.5 rounded-[4px]">
            {cnnStatus.fineTuned
              ? `Fine-Tuned (${cnnStatus.epochsTrained} epochs · Acc ${
                  cnnStatus.lastAccuracy !== null ? `${Math.round(cnnStatus.lastAccuracy * 100)}%` : '—'
                })`
              : 'Base RoofNet-2D Weights Active'}
          </div>
        </div>

        {buildingPatches.length === 0 ? (
          <div className="p-4 bg-[#FAFBF8] border border-[#E4E6DF] rounded-[4px] text-xs text-[#727A75]">
            No building roof patches available yet. Select a completed village project or upload Kaggle pairs above.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            {buildingPatches.map((patch) => {
              const currentLabel = labelOverrides[patch.id] ?? patch.suggestedLabel;
              return (
                <div
                  key={patch.id}
                  className="border border-[#E4E6DF] rounded-[4px] overflow-hidden bg-white flex flex-col"
                >
                  <div className="h-20 bg-[#F7F7F2]">
                    <img
                      src={patch.patchDataUrl}
                      alt={patch.id}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2 space-y-1.5">
                    <div className="text-[10px] font-mono text-[#727A75] truncate" title={patch.sourceName}>
                      {patch.id}
                    </div>
                    <select
                      value={currentLabel}
                      onChange={(e) =>
                        setLabelOverrides((prev) => ({
                          ...prev,
                          [patch.id]: e.target.value as RoofType,
                        }))
                      }
                      aria-label={`Roof label for ${patch.id}`}
                      className="w-full h-7 px-1.5 text-[11px] font-medium border border-[#E4E6DF] rounded-[3px] bg-[#FAFBF8]"
                    >
                      {ROOF_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {cnnError && (
          <div className="text-xs text-[#A64438] bg-[#FDF7F6] border border-[#E6C5C0] px-3 py-2 rounded-[4px]">
            {cnnError}
          </div>
        )}

        {cnnLogs.length > 0 && (
          <div className="p-3 bg-[#FAFBF8] border border-[#E4E6DF] rounded-[4px] space-y-1.5">
            <div className="text-[11px] font-semibold text-[#252A27]">
              Training Telemetry (Adam · Categorical Cross-Entropy)
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono text-[#4B524E]">
              {cnnLogs.slice(-6).map((l) => (
                <span key={l.epoch} className="px-2 py-0.5 bg-white border border-[#E4E6DF] rounded-[3px]">
                  Ep {l.epoch}: loss={l.loss.toFixed(3)} acc={Math.round(l.accuracy * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4E6DF]">
          <div className="flex items-center gap-3 text-xs">
            <label className="text-[#727A75]">Epochs:</label>
            <select
              value={cnnEpochs}
              onChange={(e) => setCnnEpochs(Number(e.target.value))}
              className="h-8 px-2 font-mono border border-[#E4E6DF] rounded-[4px] bg-[#FAFBF8]"
            >
              <option value={6}>6</option>
              <option value={12}>12</option>
              <option value={20}>20</option>
            </select>
            {cnnStatus.fineTuned && (
              <button
                type="button"
                onClick={() => void handleResetCnn()}
                className="h-8 px-2.5 bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] text-xs font-medium text-[#252A27] rounded-[4px]"
              >
                Reset CNN Weights
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={isTrainingCnn || buildingPatches.length < 2}
            onClick={() => void handleTrainCnn()}
            className="h-9 px-4 bg-[#496B54] hover:bg-[#3D5B47] disabled:opacity-45 text-white text-xs font-medium rounded-[4px] inline-flex items-center gap-1.5"
          >
            <Sparkles size={13} />
            <span>{isTrainingCnn ? 'Training RoofNet-2D...' : 'Train RoofNet-2D CNN Now'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 3: Full PyTorch U-Net Training Script for Kaggle GPU */}
      <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-[#496B54]" />
            <h3 className="text-sm font-semibold text-[#252A27]">
              3. Full PyTorch U-Net GPU Training (scripts/train_svamitva_unet.py)
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCopyCommand}
            className="h-8 px-3 bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] text-xs font-medium text-[#252A27] rounded-[4px] inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            {copiedCmd ? <Check size={13} className="text-[#496B54]" /> : <Copy size={13} />}
            <span>{copiedCmd ? 'Copied CLI' : 'Copy Command'}</span>
          </button>
        </div>
        <p className="text-xs text-[#727A75]">
          Downloads <code className="font-mono">utkarshsaxenadn/svamitva-drone-aerial-images</code> via{' '}
          <code className="font-mono">kagglehub</code>, trains <code className="font-mono">smp.Unet(resnet18)</code>{' '}
          with Dice + Cross-Entropy loss on 256×256 tiles, and exports{' '}
          <code className="font-mono">final_drone_model.pth</code> for the Python Flask bridge (<code className="font-mono">/api/analyze</code>).
        </p>
        <pre className="p-3 bg-[#F7F7F2] border border-[#E4E6DF] rounded-[4px] text-[11px] font-mono text-[#252A27] overflow-x-auto">
          {KAGGLE_TRAIN_CMD}
        </pre>
      </div>
    </div>
  );
}
