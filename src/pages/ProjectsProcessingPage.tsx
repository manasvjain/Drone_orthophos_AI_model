import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileImage,
  FolderPlus,
  Map as MapIcon,
  Play,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useGis } from '../context/GisContext';
import { DRONE_IMG_1, DRONE_IMG_2 } from '../data/mockGisData';
import {
  OrthophotoMetadata,
  ProcessingStatus,
  SegmentationModelId,
  VillageProject,
} from '../types/gis';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { EmptyState, ErrorState } from '../components/ui/StateBlocks';
import { ProcessingStepper } from '../components/ui/ProcessingStepper';

interface ProjectsProcessingPageProps {
  initialFocus?: 'projects' | 'processing';
}

export function ProjectsProcessingPage({
  initialFocus = 'projects',
}: ProjectsProcessingPageProps) {
  const {
    projects,
    activeProject,
    setActiveProjectId,
    createProject,
    attachOrthophoto,
    updateProcessingConfig,
    startProcessing,
    deleteProject,
    setActivePage,
    setLayers,
  } = useGis();

  const [maskPreviewTab, setMaskPreviewTab] = useState<'overlay' | 'buildings' | 'roads'>('overlay');

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('All');
  const [districtFilter, setDistrictFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | ProcessingStatus>('All');

  // Create project modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [formVillage, setFormVillage] = useState('');
  const [formDistrict, setFormDistrict] = useState('');
  const [formState, setFormState] = useState('');
  const [formLat, setFormLat] = useState('28.6139');
  const [formLng, setFormLng] = useState('77.2090');
  const [formDate, setFormDate] = useState('2026-11-14');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousBlobUrlRef = useRef<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VillageProject | null>(null);

  const statesList = useMemo(
    () => ['All', ...Array.from(new Set(projects.map((p) => p.state)))],
    [projects]
  );
  const districtsList = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(
          projects
            .filter((p) => stateFilter === 'All' || p.state === stateFilter)
            .map((p) => p.district)
        )
      ),
    ],
    [projects, stateFilter]
  );

  const filteredProjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return projects.filter((p) => {
      if (stateFilter !== 'All' && p.state !== stateFilter) return false;
      if (districtFilter !== 'All' && p.district !== districtFilter) return false;
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (
        q &&
        !p.village.toLowerCase().includes(q) &&
        !p.id.toLowerCase().includes(q) &&
        !p.district.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [projects, searchTerm, stateFilter, districtFilter, statusFilter]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVillage.trim() || !formDistrict.trim() || !formState.trim()) {
      setFormError('Village name, district, and state are required.');
      return;
    }
    const lat = Number.parseFloat(formLat);
    const lng = Number.parseFloat(formLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setFormError('Please enter valid decimal latitude and longitude coordinates.');
      return;
    }
    createProject({
      village: formVillage.trim(),
      district: formDistrict.trim(),
      state: formState.trim(),
      latitude: lat,
      longitude: lng,
      surveyDate: formDate,
      description:
        formDesc.trim() || 'UAV orthophoto mapping project under SVAMITVA village survey.',
    });
    setFormVillage('');
    setFormDistrict('');
    setFormState('');
    setFormDesc('');
    setFormError('');
    setCreateOpen(false);
  };

  const simulateFileUpload = (
    file: File | null,
    sampleImg?: { url: string; name: string }
  ) => {
    if (!activeProject) return;
    setUploadError(null);

    if (!sampleImg && file) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const accepted = ['jpg', 'jpeg', 'png'];
      if (!accepted.includes(ext)) {
        setUploadError(
          `Unsupported file format ".${ext}". Accepted formats: JPG, PNG.`
        );
        return;
      }
      if (['tif', 'tiff', 'geotiff'].includes(ext)) {
        setUploadError(
          'GeoTIFF/TIFF upload is not fully supported yet. Export the orthophoto as PNG or JPG first; the current workflow cannot preserve GeoTIFF georeferencing.'
        );
        return;
      }
    }

    setUploadProgress(15);
    const finishUpload = (widthPx: number, heightPx: number, imageUrl: string) => {
      const formatGuess: OrthophotoMetadata['format'] = sampleImg
        ? 'JPG'
        : file?.name.toLowerCase().endsWith('.png')
        ? 'PNG'
        : file?.name.toLowerCase().endsWith('.jpg') ||
          file?.name.toLowerCase().endsWith('.jpeg')
        ? 'JPG'
        : 'PNG';

      const meta: OrthophotoMetadata = {
        fileName: sampleImg ? sampleImg.name : file?.name ?? 'orthophoto.tif',
        fileSizeMb: sampleImg
          ? 5.1
          : Number(Math.max(0.4, (file?.size ?? 4_800_000) / (1024 * 1024)).toFixed(1)),
        format: formatGuess,
        widthPx,
        heightPx,
        crs: 'Not georeferenced',
        georeferenced: false,
        bounds: {
          minLat: Number((activeProject.latitude - 0.0025).toFixed(4)),
          maxLat: Number((activeProject.latitude + 0.0025).toFixed(4)),
          minLng: Number((activeProject.longitude - 0.0046).toFixed(4)),
          maxLng: Number((activeProject.longitude + 0.0046).toFixed(4)),
        },
        resolutionCm: 0,
        bands: formatGuess === 'JPG' ? 3 : 4,
        imageUrl,
      };
      setUploadProgress(null);
      if (
        previousBlobUrlRef.current &&
        previousBlobUrlRef.current !== imageUrl &&
        previousBlobUrlRef.current.startsWith('blob:')
      ) {
        URL.revokeObjectURL(previousBlobUrlRef.current);
      }
      previousBlobUrlRef.current = imageUrl.startsWith('blob:') ? imageUrl : null;
      attachOrthophoto(activeProject.id, meta, file);
    };

    const isRasterImage = !sampleImg && file && /\.(png|jpe?g)$/i.test(file.name);
    const targetUrl = sampleImg
      ? sampleImg.url
      : isRasterImage
      ? URL.createObjectURL(file)
      : DRONE_IMG_2;

    const probe = new Image();
    probe.onload = () => {
      setUploadProgress(85);
      window.setTimeout(() => {
        finishUpload(probe.naturalWidth || 1024, probe.naturalHeight || 768, targetUrl);
      }, 220);
    };
    probe.onerror = () => {
      if (targetUrl.startsWith('blob:')) URL.revokeObjectURL(targetUrl);
      setUploadProgress(null);
      setUploadError(
        `Could not decode "${file?.name ?? 'image'}". Verify the file is a valid PNG or JPG orthophoto.`
      );
    };
    probe.src = targetUrl;
  };

  const toggleClass = (cls: 'Buildings' | 'Roads' | 'Water' | 'Vegetation') => {
    if (!activeProject) return;
    const exists = activeProject.enabledClasses.includes(cls);
    const next = exists
      ? activeProject.enabledClasses.filter((c) => c !== cls)
      : [...activeProject.enabledClasses, cls];
    if (next.length === 0) return;
    updateProcessingConfig(activeProject.id, {
      modelUsed: activeProject.modelUsed,
      tileSize: activeProject.tileSize,
      enabledClasses: next,
    });
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4E6DF] pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#252A27]">
            {initialFocus === 'processing' ? 'Processing Jobs & Orthophotos' : 'Village Projects'}
          </h1>
          <p className="text-xs text-[#727A75] mt-0.5">
            Manage survey projects and drone orthophoto processing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="h-9 px-4 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <FolderPlus size={14} strokeWidth={1.75} />
          <span>Create Project</span>
        </button>
      </div>

      {/* Project Overview Filter Bar & Table */}
      <section className="bg-white border border-[#E4E6DF] rounded-[4px] overflow-hidden">
        <div className="p-3.5 border-b border-[#E4E6DF] bg-[#FAFBF8] flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={13}
              strokeWidth={1.75}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#727A75]"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search projects by ID, village, district..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
            />
          </div>

          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setDistrictFilter('All');
            }}
            aria-label="Filter by state"
            className="h-8 px-2.5 text-xs bg-white border border-[#E4E6DF] rounded-[4px] text-[#252A27] focus:outline-none focus:border-[#496B54]"
          >
            {statesList.map((st) => (
              <option key={st} value={st}>
                {st === 'All' ? 'All States' : st}
              </option>
            ))}
          </select>

          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            aria-label="Filter by district"
            className="h-8 px-2.5 text-xs bg-white border border-[#E4E6DF] rounded-[4px] text-[#252A27] focus:outline-none focus:border-[#496B54]"
          >
            {districtsList.map((d) => (
              <option key={d} value={d}>
                {d === 'All' ? 'All Districts' : d}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | ProcessingStatus)}
            aria-label="Filter by processing status"
            className="h-8 px-2.5 text-xs bg-white border border-[#E4E6DF] rounded-[4px] text-[#252A27] focus:outline-none focus:border-[#496B54]"
          >
            {['All', 'Completed', 'Processing', 'Pending', 'Failed', 'Draft'].map((st) => (
              <option key={st} value={st}>
                {st === 'All' ? 'All Statuses' : st}
              </option>
            ))}
          </select>
        </div>

        {projects.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No village projects registered"
              description="Register a new SVAMITVA village survey project to upload drone orthophotos and run automated AI feature extraction."
              actionLabel="Create First Project"
              onAction={() => setCreateOpen(true)}
            />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No matching projects"
              description="No village projects match your current search or filter criteria."
              actionLabel="Reset Filters"
              onAction={() => {
                setSearchTerm('');
                setStateFilter('All');
                setDistrictFilter('All');
                setStatusFilter('All');
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E4E6DF] bg-[#FAFBF8] text-[11px] font-semibold text-[#727A75]">
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Project ID</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Village</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">District</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">State</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Survey Date</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Orthophoto</th>
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Processing Status</th>
                  <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E6DF] text-xs">
                {filteredProjects.map((prj) => {
                  const isSelected = activeProject?.id === prj.id;
                  return (
                    <tr
                      key={prj.id}
                      onClick={() => setActiveProjectId(prj.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#EEF2EE]/60' : 'hover:bg-[#FAFBF8]'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono tabular-nums font-medium text-[#252A27] whitespace-nowrap">
                        {prj.id}
                      </td>
                      <td className="py-2.5 px-3.5 font-semibold text-[#252A27] whitespace-nowrap">
                        {prj.village}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#4B524E] whitespace-nowrap">
                        {prj.district}
                      </td>
                      <td className="py-2.5 px-3.5 text-[#4B524E] whitespace-nowrap">
                        {prj.state}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono tabular-nums text-[#727A75] whitespace-nowrap">
                        {prj.surveyDate}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {prj.orthophoto ? (
                          <span className="font-mono text-[11px] text-[#252A27]">
                            {prj.orthophoto.format} ({prj.orthophoto.fileSizeMb} MB)
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#9AA09C]">Not uploaded</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <StatusIndicator status={prj.status} />
                      </td>
                      <td
                        className="py-2.5 px-3.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveProjectId(prj.id);
                              setActivePage('explorer');
                            }}
                            className="px-2 py-1 text-[11px] font-medium text-[#496B54] hover:bg-[#EEF2EE] rounded-[3px] inline-flex items-center gap-1"
                            title="Inspect in GIS Explorer"
                          >
                            <MapIcon size={12} strokeWidth={1.75} />
                            <span>Map</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(prj)}
                            className="p-1 text-[#727A75] hover:text-[#A64438] rounded-[3px]"
                            aria-label={`Delete ${prj.village}`}
                            title="Delete project"
                          >
                            <Trash2 size={13} strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Active Project Workspace: Orthophoto Upload, Config & 9-Stage Pipeline */}
      {activeProject && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Left 7 cols: Orthophoto Upload + Processing Configuration */}
          <div className="xl:col-span-7 space-y-4">
            {/* Orthophoto Upload Zone */}
            <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#252A27]">
                    Orthophoto Upload — {activeProject.village}
                  </h2>
                  <p className="text-[11px] text-[#727A75] mt-0.5">
                    Accepted formats: JPG, PNG · GeoTIFF support with CRS preservation is coming soon
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      simulateFileUpload(null, { url: DRONE_IMG_1, name: 'img1_ec33c0f1.jpeg' })
                    }
                    className="px-2.5 py-1.5 text-xs font-medium text-[#496B54] bg-[#F4F7F4] border border-[#C9D6CB] hover:bg-[#E8EFE9] rounded-[4px] whitespace-nowrap shrink-0"
                  >
                    Load Drone Image 1
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      simulateFileUpload(null, { url: DRONE_IMG_2, name: 'img2_be6ffe69.jpeg' })
                    }
                    className="px-2.5 py-1.5 text-xs font-medium text-[#496B54] bg-[#F4F7F4] border border-[#C9D6CB] hover:bg-[#E8EFE9] rounded-[4px] whitespace-nowrap shrink-0"
                  >
                    Load Drone Image 2
                  </button>
                </div>
              </div>

              {uploadError && (
                <ErrorState
                  title="Upload Failed"
                  message={uploadError}
                  onRetry={() => setUploadError(null)}
                  retryLabel="Dismiss"
                />
              )}

              {/* Drag and Drop Area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(false);
                  const file = e.dataTransfer.files?.[0] ?? null;
                  if (file) simulateFileUpload(file);
                }}
                className={`border border-dashed rounded-[4px] p-6 text-center transition-colors ${
                  isDraggingOver
                    ? 'border-[#496B54] bg-[#EEF2EE]/50'
                    : 'border-[#C8CCC1] bg-[#FAFBF8]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tif,.tiff,.geotiff,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) simulateFileUpload(file);
                    e.target.value = '';
                  }}
                />
                <div className="w-9 h-9 mx-auto rounded-[4px] bg-white border border-[#E4E6DF] flex items-center justify-center text-[#496B54]">
                  <UploadCloud size={18} strokeWidth={1.75} />
                </div>
                <div className="mt-2.5 text-xs font-medium text-[#252A27]">
                  Drag and drop georeferenced village orthophoto here
                </div>
                <div className="mt-1 text-[11px] text-[#727A75]">
                  Supports single-band or 3/4-band RGB+NIR orthomosaics
                </div>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-1.5 text-xs font-medium bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] text-[#252A27] rounded-[4px]"
                  >
                    Browse Files
                  </button>
                </div>

                {uploadProgress !== null && (
                  <div className="mt-4 max-w-sm mx-auto">
                    <div className="flex items-center justify-between text-[11px] text-[#727A75] mb-1">
                      <span>Uploading & validating header...</span>
                      <span className="font-mono tabular-nums">{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-[#E4E6DF] rounded-[2px] overflow-hidden">
                      <div
                        className="h-full bg-[#496B54] transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata Preview after upload */}
              {activeProject.orthophoto ? (
                <div className="border border-[#E4E6DF] rounded-[4px] bg-[#FAFBF8] p-3.5">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E4E6DF]">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileImage size={15} strokeWidth={1.75} className="text-[#496B54] shrink-0" />
                      <span className="text-xs font-mono font-medium text-[#252A27] truncate">
                        {activeProject.orthophoto.fileName}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-[#3C5C47] inline-flex items-center gap-1 shrink-0">
                      <CheckCircle2 size={12} strokeWidth={2} />
                      Metadata Verified
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-[11px] text-[#727A75]">Dimensions</div>
                      <div className="font-mono tabular-nums font-medium text-[#252A27] mt-0.5">
                        {activeProject.orthophoto.widthPx.toLocaleString()} ×{' '}
                        {activeProject.orthophoto.heightPx.toLocaleString()} px
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#727A75]">CRS</div>
                      <div className="font-mono font-medium text-[#252A27] mt-0.5 truncate">
                        {activeProject.orthophoto.crs}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#727A75]">Ground Resolution</div>
                      <div className="font-mono tabular-nums font-medium text-[#252A27] mt-0.5">
                        {activeProject.orthophoto.resolutionCm} cm / px
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#727A75]">File Size & Bands</div>
                      <div className="font-mono tabular-nums font-medium text-[#252A27] mt-0.5">
                        {activeProject.orthophoto.fileSizeMb} MB · {activeProject.orthophoto.bands}{' '}
                        bands
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] text-[#727A75]">Geographic Bounds</div>
                      <div className="font-mono tabular-nums text-[11px] font-medium text-[#252A27] mt-0.5">
                        [{activeProject.orthophoto.bounds.minLat}°,{' '}
                        {activeProject.orthophoto.bounds.minLng}°] to [
                        {activeProject.orthophoto.bounds.maxLat}°,{' '}
                        {activeProject.orthophoto.bounds.maxLng}°]
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-[#E4E6DF] rounded-[4px] bg-[#FAFBF8] p-3 text-xs text-[#727A75]">
                  No orthophoto attached to {activeProject.village}. Upload a raster file or click
                  "Load Sample UAV GeoTIFF" above to enable AI processing.
                </div>
              )}
            </div>

            {/* Processing Configuration */}
            <div className="bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-4">
              <h2 className="text-sm font-semibold text-[#252A27]">Processing Configuration</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Segmentation Model */}
                <div>
                  <div className="text-xs font-medium text-[#252A27] mb-1.5">
                    Segmentation Model
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['U-Net', 'DeepLabV3+', 'SegFormer'] as SegmentationModelId[]).map((m) => {
                      const active = activeProject.modelUsed === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            updateProcessingConfig(activeProject.id, {
                              modelUsed: m,
                              tileSize: activeProject.tileSize,
                              enabledClasses: activeProject.enabledClasses,
                            })
                          }
                          className={`py-2 px-2 text-xs font-medium rounded-[4px] border transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-[#496B54] text-white border-[#496B54]'
                              : 'bg-white text-[#252A27] border-[#E4E6DF] hover:bg-[#F7F7F2]'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tile Size */}
                <div>
                  <div className="text-xs font-medium text-[#252A27] mb-1.5">Tile Size (px)</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([256, 512, 1024] as (256 | 512 | 1024)[]).map((sz) => {
                      const active = activeProject.tileSize === sz;
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() =>
                            updateProcessingConfig(activeProject.id, {
                              modelUsed: activeProject.modelUsed,
                              tileSize: sz,
                              enabledClasses: activeProject.enabledClasses,
                            })
                          }
                          className={`py-2 px-2 text-xs font-mono tabular-nums font-medium rounded-[4px] border transition-colors ${
                            active
                              ? 'bg-[#496B54] text-white border-[#496B54]'
                              : 'bg-white text-[#252A27] border-[#E4E6DF] hover:bg-[#F7F7F2]'
                          }`}
                        >
                          {sz}×{sz}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Feature Classes */}
              <div>
                <div className="text-xs font-medium text-[#252A27] mb-1.5">
                  Target Feature Classes
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['Buildings', 'Roads', 'Water', 'Vegetation'] as const).map((cls) => {
                    const checked = activeProject.enabledClasses.includes(cls);
                    return (
                      <label
                        key={cls}
                        className={`px-3 py-1.5 rounded-[4px] border text-xs font-medium inline-flex items-center gap-2 cursor-pointer select-none ${
                          checked
                            ? 'bg-[#F4F7F4] border-[#B6C7B9] text-[#252A27]'
                            : 'bg-white border-[#E4E6DF] text-[#727A75]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClass(cls)}
                          className="accent-[#496B54]"
                        />
                        <span>{cls}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Start Processing Actions */}
              <div className="pt-2 border-t border-[#E4E6DF] flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-[#727A75]">
                  {activeProject.orthophoto
                    ? `Ready to process ${activeProject.orthophoto.fileName} with ${activeProject.modelUsed}`
                    : 'Upload an orthophoto above to unlock processing.'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!activeProject.orthophoto || activeProject.status === 'Processing'}
                    onClick={() => startProcessing(activeProject.id, true)}
                    className="h-9 px-3 bg-white border border-[#E4E6DF] hover:bg-[#F7F7F2] disabled:opacity-45 text-[#727A75] text-xs font-medium rounded-[4px] whitespace-nowrap"
                    title="Test pipeline failure handling"
                  >
                    Test Error Run
                  </button>
                  <button
                    type="button"
                    disabled={!activeProject.orthophoto || activeProject.status === 'Processing'}
                    onClick={() => startProcessing(activeProject.id, false)}
                    className="h-9 px-4 bg-[#496B54] hover:bg-[#3D5B47] disabled:opacity-45 text-white text-xs font-medium rounded-[4px] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Play size={13} strokeWidth={1.85} />
                    <span>
                      {activeProject.status === 'Processing'
                        ? 'Processing...'
                        : 'Start Processing'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 cols: 9-Stage Processing Timeline */}
          <div className="xl:col-span-5 bg-white border border-[#E4E6DF] rounded-[4px] p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#E4E6DF] pb-3">
              <div>
                <h2 className="text-sm font-semibold text-[#252A27]">Processing Timeline</h2>
                <p className="text-[11px] text-[#727A75] mt-0.5">
                  9-stage automated geospatial pipeline
                </p>
              </div>
              <StatusIndicator status={activeProject.status} />
            </div>

            {activeProject.status === 'Failed' && activeProject.errorMessage && (
              <ErrorState
                title="Pipeline Execution Failed"
                message={activeProject.errorMessage}
                onRetry={() => startProcessing(activeProject.id, false)}
                retryLabel="Retry Pipeline"
              />
            )}

            <ProcessingStepper stages={activeProject.stages} orientation="vertical" />

            {activeProject.status === 'Completed' && (
              <div className="pt-2 border-t border-[#E4E6DF] flex items-center justify-between gap-3">
                <span className="text-[11px] text-[#3C5C47] font-medium">
                  Vector layers indexed and ready for inspection.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLayers((prev) => ({ ...prev, segmentationOverlay: true }));
                    setActivePage('explorer');
                  }}
                  className="px-3 py-1.5 bg-[#496B54] hover:bg-[#3D5B47] text-white text-xs font-medium rounded-[4px] whitespace-nowrap"
                >
                  Open in GIS Explorer
                </button>
              </div>
            )}

            {/* Segmentation Output Masks (Overlay, Buildings, Roads) */}
            {activeProject.segmentationOutputs && (
              <div className="pt-3 border-t border-[#E4E6DF] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#252A27]">
                    Model Output Masks ({activeProject.segmentationOutputs.tileSizeUsed}px tiles)
                  </span>
                  <span className="text-[11px] font-mono text-[#727A75] tabular-nums">
                    {activeProject.segmentationOutputs.inferenceDurationMs} ms ·{' '}
                    {activeProject.segmentationOutputs.inferenceEngine === 'pytorch-flask'
                      ? 'PyTorch Flask'
                      : 'Tiled CV'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#F7F7F2] border border-[#E4E6DF] rounded-[4px]">
                  {(
                    [
                      ['overlay', 'Overlay'],
                      ['buildings', 'Buildings Mask'],
                      ['roads', 'Roads Mask'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMaskPreviewTab(id)}
                      className={`py-1.5 text-[11px] font-medium rounded-[3px] transition-colors whitespace-nowrap ${
                        maskPreviewTab === id
                          ? 'bg-white text-[#252A27] shadow-sm'
                          : 'text-[#727A75] hover:text-[#252A27]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="border border-[#E4E6DF] rounded-[4px] overflow-hidden bg-[#1D211E]">
                  <img
                    src={
                      maskPreviewTab === 'overlay'
                        ? activeProject.segmentationOutputs.overlayUrl
                        : maskPreviewTab === 'buildings'
                        ? activeProject.segmentationOutputs.buildingsMaskUrl
                        : activeProject.segmentationOutputs.roadsMaskUrl
                    }
                    alt={`${activeProject.village} ${maskPreviewTab} mask`}
                    className="w-full h-44 object-contain"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center border border-[#E4E6DF] rounded-[4px] py-2 bg-[#FAFBF8] text-[11px]">
                  <div>
                    <div className="text-[#727A75]">Buildings</div>
                    <div className="font-mono tabular-nums font-semibold text-[#B77B61]">
                      {activeProject.segmentationOutputs.pixelCoverage.buildingsPct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[#727A75]">Roads</div>
                    <div className="font-mono tabular-nums font-semibold text-[#C88E41]">
                      {activeProject.segmentationOutputs.pixelCoverage.roadsPct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[#727A75]">Water</div>
                    <div className="font-mono tabular-nums font-semibold text-[#567C94]">
                      {activeProject.segmentationOutputs.pixelCoverage.waterPct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[#727A75]">Vegetation</div>
                    <div className="font-mono tabular-nums font-semibold text-[#5E8061]">
                      {activeProject.segmentationOutputs.pixelCoverage.vegetationPct}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Village Survey Project"
        subtitle="Register a new SVAMITVA drone survey boundary and project metadata."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-3.5">
          {formError && (
            <ErrorState title="Validation Error" message={formError} />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#252A27] mb-1">
                Village Name *
              </label>
              <input
                type="text"
                value={formVillage}
                onChange={(e) => setFormVillage(e.target.value)}
                placeholder="e.g., Sultanpur Majra"
                className="w-full h-9 px-3 text-xs border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#252A27] mb-1">
                District *
              </label>
              <input
                type="text"
                value={formDistrict}
                onChange={(e) => setFormDistrict(e.target.value)}
                placeholder="e.g., Sonipat"
                className="w-full h-9 px-3 text-xs border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#252A27] mb-1">State *</label>
              <input
                type="text"
                value={formState}
                onChange={(e) => setFormState(e.target.value)}
                placeholder="e.g., Haryana"
                className="w-full h-9 px-3 text-xs border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#252A27] mb-1">
                Survey Date
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#252A27] mb-1">
                Latitude (WGS 84)
              </label>
              <input
                type="text"
                value={formLat}
                onChange={(e) => setFormLat(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono tabular-nums border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#252A27] mb-1">
                Longitude (WGS 84)
              </label>
              <input
                type="text"
                value={formLng}
                onChange={(e) => setFormLng(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono tabular-nums border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#252A27] mb-1">Description</label>
            <textarea
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Scope of UAV orthomosaic survey, Abadi Deh limits, and parcel notes..."
              className="w-full p-3 text-xs border border-[#E4E6DF] rounded-[4px] focus:outline-none focus:border-[#496B54]"
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-xs font-medium bg-white border border-[#E4E6DF] rounded-[4px] hover:bg-[#F7F7F2]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-[#496B54] hover:bg-[#3D5B47] rounded-[4px]"
            >
              Register Project
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteProject(deleteTarget.id);
        }}
        title="Delete Survey Project"
        message={`Are you sure you want to remove "${deleteTarget?.village}" (${deleteTarget?.id}) from the active workspace?`}
        confirmLabel="Delete Project"
        destructive
      />
    </div>
  );
}
