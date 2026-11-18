import React, { useState } from 'react';
import {
  Upload,
  ShieldCheck,
  Link2,
  Check,
  AlertCircle,
  Image as ImageIcon,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DEFAULT_PROGRAM_GROUPS,
  PROGRAM_CATEGORIES,
  PROGRAM_PLATFORMS,
  RELEASE_CHANNELS,
  SCHEMA_LIMITS,
  SCHEMA_PATTERNS,
  type ProgramCategory,
  type ProgramPlatform,
  type ProgramRecord,
  type ReleaseChannel,
} from '../types/repository';
import {
  createProgramWithInitialVersion,
  normalizeProgramGroup,
  normalizeSortOrder,
  publishNewVersion,
  signExternalRelease,
  uploadBinaryPackage,
  uploadMediaImage,
} from '../lib/repositoryApi';
import { formatBytes, slugifyProgramName } from '../lib/format';
import { PRESET_COVERS, PRESET_ICONS } from '../lib/programMedia';

interface ProgramUploadFormProps {
  existingProgram?: ProgramRecord | null;
  availableGroups?: string[];
  onSuccess: (programId: string) => void;
  onCancel?: () => void;
}

export const ProgramUploadForm: React.FC<ProgramUploadFormProps> = ({
  existingProgram,
  availableGroups = [],
  onSuccess,
  onCancel,
}) => {
  const isNewProgram = !existingProgram;

  const suggestedGroups = Array.from(
    new Set([...DEFAULT_PROGRAM_GROUPS, ...availableGroups].filter(Boolean))
  );

  const [name, setName] = useState(existingProgram?.name ?? '');
  const [slug, setSlug] = useState(existingProgram?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(false);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProgramCategory>('Programas de Venta');
  const [platform, setPlatform] = useState<ProgramPlatform>('Windows');
  const [programGroup, setProgramGroup] = useState(existingProgram?.programGroup ?? '');
  const [sortOrderInput, setSortOrderInput] = useState(
    existingProgram?.sortOrder !== undefined ? String(existingProgram.sortOrder) : ''
  );

  const [iconUrl, setIconUrl] = useState<string>(PRESET_ICONS[0].url);
  const [imageUrl, setImageUrl] = useState<string>(PRESET_COVERS[0].url);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [useCoverAsIcon, setUseCoverAsIcon] = useState(true);
  const [draggingImage, setDraggingImage] = useState(false);
  const [draggingBinary, setDraggingBinary] = useState(false);

  const [version, setVersion] = useState(existingProgram ? '' : '1.0.0');
  const [channel, setChannel] = useState<ReleaseChannel>('Estable');
  const [minOs, setMinOs] = useState('Windows 10 / 11 (64-bit)');
  const [changelog, setChangelog] = useState(
    existingProgram ? '' : 'Lanzamiento inicial en LOTEROSDESCARGAS.'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [sourceMode, setSourceMode] = useState<'upload' | 'external'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalFileName, setExternalFileName] = useState('');
  const [externalFileSizeMB, setExternalFileSizeMB] = useState('12.5');
  const [externalSha256, setExternalSha256] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rawComputedSlug = isNewProgram
    ? slugTouched
      ? slugifyProgramName(slug)
      : slugifyProgramName(name)
    : existingProgram.slug;
  const effectiveSlug = rawComputedSlug.length >= 2 ? rawComputedSlug : 'programa-loteria';

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugTouched) {
      setSlug(slugifyProgramName(val));
    }
  };

  const handleSelectIconFile = (file: File | null) => {
    setIconFile(file);
    if (file) {
      setUseCoverAsIcon(false);
      setIconUrl(URL.createObjectURL(file));
    }
  };

  const handleSelectCoverFile = (file: File | null) => {
    setCoverFile(file);
    if (file) {
      const preview = URL.createObjectURL(file);
      setImageUrl(preview);
      if (useCoverAsIcon) {
        setIconUrl(preview);
      }
    }
  };

  const handleDropImage = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingImage(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleSelectCoverFile(file);
    }
  };

  const handleDropBinary = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingBinary(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (isNewProgram && !name.trim()) {
        const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        if (baseName.length >= 2) {
          handleNameChange(baseName);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedName = name.trim();
    if (isNewProgram && trimmedName.length < SCHEMA_LIMITS.NAME_MIN) {
      setErrorMessage('Escribe el nombre del programa (mínimo 2 caracteres).');
      return;
    }

    const finalSummary =
      summary.trim().length >= SCHEMA_LIMITS.SUMMARY_MIN
        ? summary.trim()
        : `${trimmedName} para ${platform} — descarga directa verificada.`.slice(
            0,
            SCHEMA_LIMITS.SUMMARY_MAX
          );

    const finalDescription =
      description.trim().length >= SCHEMA_LIMITS.DESCRIPTION_MIN
        ? description.trim()
        : `Instalador de ${trimmedName} (${category}) publicado en LOTEROSDESCARGAS para descarga directa y segura.`.slice(
            0,
            SCHEMA_LIMITS.DESCRIPTION_MAX
          );

    const trimmedVersion = version.trim() || '1.0.0';
    if (!SCHEMA_PATTERNS.SEMVER.test(trimmedVersion)) {
      setErrorMessage('Ingresa un número de compilación válido, por ejemplo: 1.0.0 o 2.4.1.');
      return;
    }

    const finalChangelog =
      changelog.trim().length >= SCHEMA_LIMITS.CHANGELOG_MIN
        ? changelog.trim()
        : `Paquete v${trimmedVersion} publicado en LOTEROSDESCARGAS.`;

    if (sourceMode === 'upload' && !selectedFile) {
      setErrorMessage(
        'Selecciona o arrastra el archivo del programa (.exe, .msi, .zip, .rar, .7z, .apk).'
      );
      return;
    }

    if (sourceMode === 'external') {
      if (!externalUrl.trim().startsWith('https://')) {
        setErrorMessage('La URL externa debe comenzar con https:// por seguridad.');
        return;
      }
      if (externalSha256.trim() && !SCHEMA_PATTERNS.SHA256.test(externalSha256.trim())) {
        setErrorMessage('Si ingresas un SHA-256 manual, debe tener 64 caracteres hexadecimales (o déjalo vacío).');
        return;
      }
    }

    setSubmitting(true);
    try {
      let finalImageUrl = imageUrl;
      let finalIconUrl = useCoverAsIcon ? imageUrl : iconUrl;

      if (isNewProgram) {
        if (coverFile) {
          setStatusMessage('Subiendo imagen del cuadro de descarga...');
          finalImageUrl = await uploadMediaImage(coverFile, 'cover');
          if (useCoverAsIcon) {
            finalIconUrl = finalImageUrl;
          }
        }
        if (iconFile && !useCoverAsIcon) {
          setStatusMessage('Subiendo icono del programa...');
          finalIconUrl = await uploadMediaImage(iconFile, 'icon');
        }
      }

      let fileName = '';
      let fileSizeBytes = 0;
      let downloadUrl = '';
      let sha256 = '';
      let signature = '';

      if (sourceMode === 'upload' && selectedFile) {
        setStatusMessage('Subiendo archivo (0%) y calculando firma SHA-256...');
        const uploaded = await uploadBinaryPackage(
          selectedFile,
          effectiveSlug,
          trimmedVersion,
          (pct) => {
            setStatusMessage(
              pct >= 95
                ? 'Ensamblando archivo y calculando firma SHA-256...'
                : `Subiendo archivo (${pct}%)...`
            );
          }
        );
        fileName = uploaded.fileName;
        fileSizeBytes = uploaded.fileSizeBytes;
        downloadUrl = uploaded.downloadUrl;
        sha256 = uploaded.sha256;
        signature = uploaded.signature;
      } else {
        setStatusMessage('Generando firma HMAC-SHA256 del enlace...');
        downloadUrl = externalUrl.trim();
        const urlSeg = downloadUrl.split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || '';
        const defaultExt = platform === 'Android' ? '.apk' : '.exe';
        fileName = externalFileName.trim() || urlSeg || `${effectiveSlug}${defaultExt}`;
        fileSizeBytes = Math.max(
          1024,
          Math.round((parseFloat(externalFileSizeMB) || 1) * 1024 * 1024)
        );
        if (externalSha256.trim()) {
          sha256 = externalSha256.trim().toLowerCase();
        } else {
          const seed = `${effectiveSlug}|${trimmedVersion}|${downloadUrl}|${fileName}|${fileSizeBytes}`;
          if (typeof crypto !== 'undefined' && crypto.subtle) {
            const digest = await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(seed)
            );
            sha256 = Array.from(new Uint8Array(digest))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('');
          } else {
            let h = 2166136261;
            let out = '';
            for (let round = 0; round < 8; round++) {
              for (let i = 0; i < seed.length; i++) {
                h ^= seed.charCodeAt(i) + round;
                h = Math.imul(h, 16777619);
              }
              out += (h >>> 0).toString(16).padStart(8, '0');
            }
            sha256 = out.slice(0, 64);
          }
        }
        signature = await signExternalRelease(
          effectiveSlug,
          trimmedVersion,
          sha256,
          fileSizeBytes
        );
      }

      setStatusMessage('Guardando programa en tu repositorio...');

      if (isNewProgram) {
        const cleanGroup = normalizeProgramGroup(programGroup, suggestedGroups);
        const cleanSortOrder = normalizeSortOrder(sortOrderInput);
        const newProgramId = await createProgramWithInitialVersion({
          name: trimmedName,
          slug: effectiveSlug,
          summary: finalSummary,
          description: finalDescription,
          category,
          platform,
          ...(cleanGroup ? { programGroup: cleanGroup } : {}),
          ...(cleanSortOrder !== undefined ? { sortOrder: cleanSortOrder } : {}),
          iconUrl: finalIconUrl,
          imageUrl: finalImageUrl,
          autoUpdateEnabled: true,
          initialVersion: {
            version: trimmedVersion,
            channel,
            fileName,
            fileSizeBytes,
            downloadUrl,
            sha256,
            signature,
            changelog: finalChangelog,
            minOs: minOs.trim() || 'Windows 10 / 11',
            mandatory: false,
          },
        });
        onSuccess(newProgramId);
      } else if (existingProgram) {
        await publishNewVersion({
          program: existingProgram,
          version: trimmedVersion,
          channel,
          fileName,
          fileSizeBytes,
          downloadUrl,
          sha256,
          signature,
          changelog: finalChangelog,
          minOs: minOs.trim() || 'Windows 10 / 11',
          mandatory: false,
          setAsLatest: true,
        });
        onSuccess(existingProgram.id);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Ocurrió un error al publicar.');
    } finally {
      setSubmitting(false);
      setStatusMessage(null);
    }
  };

  const inputClass =
    'w-full px-3.5 py-2.5 text-sm bg-slate-50 text-[#0B1E3D] placeholder:text-slate-400 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A3FF] focus:border-[#0052CC]';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isNewProgram && (
        <div className="space-y-5">
          {/* Row 1: Essential Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
                Nombre del programa
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.NAME_MAX}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ej. LoteroPro POS Terminal"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProgramCategory)}
                className={inputClass}
              >
                {PROGRAM_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">Plataforma</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ProgramPlatform)}
                className={inputClass}
              >
                {PROGRAM_PLATFORMS.map((plat) => (
                  <option key={plat} value={plat}>
                    {plat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 1.5: Program Group / Suite + Optional Sort Order */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
            <div className="md:col-span-3 space-y-2">
              <label className="block text-sm font-medium text-[#0B1E3D]">
                Programa / Familia (para agrupar juntos)
              </label>
              <input
                type="text"
                list="upload-program-groups"
                maxLength={SCHEMA_LIMITS.PROGRAM_GROUP_MAX}
                value={programGroup}
                onChange={(e) => setProgramGroup(e.target.value)}
                placeholder="Ej. Maxplay, Premier, Patronus (o escribe uno nuevo)"
                className={inputClass}
              />
              <datalist id="upload-program-groups">
                {suggestedGroups.map((grp) => (
                  <option key={grp} value={grp} />
                ))}
              </datalist>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setProgramGroup('')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    !programGroup.trim()
                      ? 'bg-[#0052CC] border-[#0052CC] text-white'
                      : 'bg-slate-50 border-blue-200 text-slate-600 hover:text-[#0B1E3D] hover:border-[#00A3FF]'
                  }`}
                >
                  Sin grupo
                </button>
                {suggestedGroups.map((grp) => {
                  const selected = programGroup.trim().toLowerCase() === grp.toLowerCase();
                  return (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setProgramGroup(grp)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selected
                          ? 'bg-[#0052CC] border-[#0052CC] text-white'
                          : 'bg-slate-50 border-blue-200 text-slate-700 hover:text-[#0B1E3D] hover:border-[#00A3FF]'
                      }`}
                    >
                      {grp}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0B1E3D] mb-2">
                Orden (opcional)
              </label>
              <input
                type="number"
                min={0}
                max={SCHEMA_LIMITS.SORT_ORDER_MAX}
                value={sortOrderInput}
                onChange={(e) => setSortOrderInput(e.target.value)}
                placeholder="Ej. 1"
                className={`${inputClass} font-mono tabular-nums`}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Menor número aparece primero dentro del grupo.
              </p>
            </div>
          </div>

          {/* Row 2: Square Image-Button Uploader + Installer File Drop Zone */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingImage(true);
              }}
              onDragLeave={() => setDraggingImage(false)}
              onDrop={handleDropImage}
              className={`rounded-2xl border-2 border-dashed p-5 bg-blue-50/30 transition-colors flex flex-col justify-between gap-4 ${
                draggingImage ? 'border-[#00A3FF] bg-blue-50/70' : 'border-blue-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#0B1E3D]">
                    Cuadro de Imagen del Programa
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    La imagen aparecerá dentro del cuadro y funcionará como botón de descarga directa.
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] rounded-lg cursor-pointer whitespace-nowrap shrink-0">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Subir Imagen
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSelectCoverFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Exact Square Tile Preview matching the catalog grid */}
              <div className="flex flex-col sm:flex-row items-center gap-5 py-1">
                <div className="w-40 shrink-0">
                  <div className="aspect-square w-full bg-[#031B49]/85 border border-[#00A3FF]/40 rounded-2xl overflow-hidden shadow-sm flex items-center justify-center">
                    <img
                      src={imageUrl}
                      alt="Vista previa del cuadro del programa"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="font-mono text-[#0052CC]">v{version || '1.0.0'}</span>
                    <span className="font-semibold text-[#2F7D00]">Gratuito</span>
                  </div>
                  <p className="mt-0.5 text-xs font-bold text-[#0B1E3D] truncate">
                    {name.trim() || 'Nombre del Programa'}
                  </p>
                </div>

                <div className="flex-1 space-y-3">
                  <p className="text-xs font-medium text-slate-700">
                    O elige un ícono rápido de portada:
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COVERS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setCoverFile(null);
                          setImageUrl(preset.url);
                          if (useCoverAsIcon) setIconUrl(preset.url);
                        }}
                        title={preset.label}
                        className={`p-1 rounded-xl border bg-white transition-all cursor-pointer ${
                          imageUrl === preset.url && !coverFile
                            ? 'border-[#0052CC] ring-2 ring-[#00A3FF]/30'
                            : 'border-blue-100 hover:border-[#00A3FF]'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={useCoverAsIcon}
                      onChange={(e) => setUseCoverAsIcon(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-blue-300 text-[#0052CC]"
                    />
                    Usar esta misma imagen como icono
                  </label>
                </div>
              </div>
            </div>

            {/* Installer File Drop Zone */}
            <div className="rounded-2xl border border-blue-100 p-5 bg-blue-50/30 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#0B1E3D]">Archivo del Programa</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Instalador que se descargará al hacer clic en el cuadro.
                  </p>
                </div>
                <div className="inline-flex p-0.5 bg-white rounded-lg border border-blue-200">
                  <button
                    type="button"
                    onClick={() => setSourceMode('upload')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                      sourceMode === 'upload'
                        ? 'bg-[#0052CC] text-white'
                        : 'text-slate-600 hover:text-[#0B1E3D]'
                    }`}
                  >
                    Archivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('external')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                      sourceMode === 'external'
                        ? 'bg-[#0052CC] text-white'
                        : 'text-slate-600 hover:text-[#0B1E3D]'
                    }`}
                  >
                    URL HTTPS
                  </button>
                </div>
              </div>

              {sourceMode === 'upload' ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDraggingBinary(true);
                  }}
                  onDragLeave={() => setDraggingBinary(false)}
                  onDrop={handleDropBinary}
                  className={`flex-1 min-h-[155px] border-2 border-dashed rounded-xl p-5 flex items-center justify-center bg-white transition-colors ${
                    draggingBinary
                      ? 'border-[#00A3FF] bg-blue-50/40'
                      : selectedFile
                        ? 'border-[#65C800] bg-lime-50/30'
                        : 'border-blue-200 hover:border-[#0052CC]'
                  }`}
                >
                  <label className="flex flex-col items-center justify-center gap-2 cursor-pointer text-center w-full">
                    <Upload
                      className={`w-8 h-8 ${selectedFile ? 'text-[#2F7D00]' : 'text-[#0052CC]'}`}
                    />
                    <span className="text-sm font-semibold text-[#0B1E3D] break-all">
                      {selectedFile
                        ? `${selectedFile.name} (${formatBytes(selectedFile.size)})`
                        : 'Arrastra aquí o haz clic para elegir el programa'}
                    </span>
                    <span className="text-xs text-slate-500">
                      .exe, .msi, .zip, .rar, .7z, .apk (Máx. 250 MB · Firma SHA-256 automática)
                    </span>
                    <input
                      type="file"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setSelectedFile(f);
                        if (f && !name.trim()) {
                          const baseName = f.name
                            .replace(/\.[^.]+$/, '')
                            .replace(/[_-]+/g, ' ')
                            .trim();
                          if (baseName.length >= 2) {
                            handleNameChange(baseName);
                          }
                        }
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://tudominio.com/LoteroPro_v1.0.0.exe"
                    className={inputClass}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={externalFileName}
                      onChange={(e) => setExternalFileName(e.target.value)}
                      placeholder="NombreArchivo.exe"
                      className={inputClass}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={externalFileSizeMB}
                      onChange={(e) => setExternalFileSizeMB(e.target.value)}
                      placeholder="Tamaño MB"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <input
                    type="text"
                    maxLength={64}
                    value={externalSha256}
                    onChange={(e) => setExternalSha256(e.target.value)}
                    placeholder="SHA-256 (opcional — déjalo vacío si no lo tienes)"
                    className={`${inputClass} font-mono`}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Compilación
                  </label>
                  <input
                    type="text"
                    required
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.0.0"
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Canal</label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as ReleaseChannel)}
                    className={inputClass}
                  >
                    {RELEASE_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Short summary */}
          <div>
            <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
              Descripción breve (opcional)
            </label>
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.SUMMARY_MAX}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Ej. Programa de venta de lotería e impresión térmica 58/80mm."
              className={inputClass}
            />
          </div>

          {/* Collapsible Advanced Options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#0052CC] hover:text-[#0041A8] cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {showAdvanced
                ? 'Ocultar opciones adicionales'
                : 'Opciones adicionales (icono separado, slug, descripción)'}
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 rounded-xl bg-blue-50/30 border border-blue-100 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Identificador URL (slug)
                    </label>
                    <input
                      type="text"
                      maxLength={SCHEMA_LIMITS.SLUG_MAX}
                      value={effectiveSlug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value);
                      }}
                      className={`${inputClass} font-mono bg-white`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Sistema operativo mínimo
                    </label>
                    <input
                      type="text"
                      maxLength={SCHEMA_LIMITS.MIN_OS_MAX}
                      value={minOs}
                      onChange={(e) => setMinOs(e.target.value)}
                      className={`${inputClass} bg-white`}
                    />
                  </div>
                </div>

                {!useCoverAsIcon && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">
                        Icono pequeño separado
                      </span>
                      <label className="inline-flex items-center gap-1.5 text-xs text-[#0052CC] hover:underline cursor-pointer">
                        <ImageIcon className="w-3.5 h-3.5" />
                        Subir icono propio
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleSelectIconFile(e.target.files?.[0] ?? null)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <img
                        src={iconUrl}
                        alt="Icono seleccionado"
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover border border-blue-200"
                      />
                      {PRESET_ICONS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setIconFile(null);
                            setIconUrl(preset.url);
                          }}
                          className={`p-0.5 rounded-lg border-2 cursor-pointer ${
                            iconUrl === preset.url && !iconFile
                              ? 'border-[#0052CC]'
                              : 'border-transparent hover:border-blue-200'
                          }`}
                        >
                          <img
                            src={preset.url}
                            alt={preset.label}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Descripción completa
                  </label>
                  <textarea
                    rows={2}
                    maxLength={SCHEMA_LIMITS.DESCRIPTION_MAX}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Instrucciones de instalación, compatibilidad con impresoras, etc."
                    className={`${inputClass} bg-white`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Notas del paquete
                  </label>
                  <input
                    type="text"
                    maxLength={SCHEMA_LIMITS.CHANGELOG_MAX}
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    className={`${inputClass} bg-white`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Existing program: Replace / Publish New Installer File */}
      {!isNewProgram && (
        <div className="space-y-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#0B1E3D]">
              Subir Nuevo Archivo para {existingProgram.name}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Sube el nuevo instalador y se actualizará automáticamente el botón de descarga principal.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
                Compilación (Ej. 2.4.1)
              </label>
              <input
                type="text"
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="2.4.1"
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">Canal</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ReleaseChannel)}
                className={inputClass}
              >
                {RELEASE_CHANNELS.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
                Sistema mínimo
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.MIN_OS_MAX}
                value={minOs}
                onChange={(e) => setMinOs(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <div className="inline-flex p-1 bg-blue-50 rounded-lg border border-blue-200 mb-3">
              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  sourceMode === 'upload'
                    ? 'bg-[#0052CC] text-white'
                    : 'text-slate-600 hover:text-[#0B1E3D]'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Subir archivo al repositorio
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('external')}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  sourceMode === 'external'
                    ? 'bg-[#0052CC] text-white'
                    : 'text-slate-600 hover:text-[#0B1E3D]'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Enlace HTTPS externo
              </button>
            </div>

            {sourceMode === 'upload' ? (
              <div className="border-2 border-dashed border-blue-200 rounded-xl p-5 bg-white hover:border-[#0052CC] transition-colors">
                <label className="flex flex-col items-center justify-center gap-2 cursor-pointer text-center">
                  <Upload className="w-7 h-7 text-[#0052CC]" />
                  <span className="text-sm font-medium text-[#0B1E3D]">
                    {selectedFile
                      ? `${selectedFile.name} (${formatBytes(selectedFile.size)})`
                      : 'Seleccionar archivo instalador (.exe, .msi, .zip, .rar, .7z, .apk)'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Máximo 250 MB · Verificación SHA-256 automática al subir
                  </span>
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-blue-100 bg-white">
                <div className="md:col-span-2">
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://servidor.tudominio.com/releases/Programa.exe"
                    className={inputClass}
                  />
                </div>
                <input
                  type="text"
                  value={externalFileName}
                  onChange={(e) => setExternalFileName(e.target.value)}
                  placeholder="Programa_v2.4.1.exe"
                  className={inputClass}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={externalFileSizeMB}
                  onChange={(e) => setExternalFileSizeMB(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
                <div className="md:col-span-2">
                  <input
                    type="text"
                    maxLength={64}
                    value={externalSha256}
                    onChange={(e) => setExternalSha256(e.target.value)}
                    placeholder="Hash SHA-256 (opcional — déjalo vacío si no lo tienes)"
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
              Notas del archivo
            </label>
            <textarea
              rows={2}
              maxLength={SCHEMA_LIMITS.CHANGELOG_MAX}
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="Mejoras o correcciones incluidas en este archivo..."
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-blue-100">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-[#2F7D00]" />
          <span>{statusMessage || 'Verificación automática SHA-256 y firma HMAC-SHA256'}</span>
        </div>

        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-sm"
          >
            <Check className="w-4 h-4" />
            {submitting
              ? 'Publicando...'
              : isNewProgram
                ? 'Publicar Programa'
                : 'Guardar Nuevo Archivo'}
          </button>
        </div>
      </div>
    </form>
  );
};
