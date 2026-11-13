import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Download,
  ShieldCheck,
  MessageSquare,
  Upload,
  Trash2,
  Pin,
  Star,
  Image as ImageIcon,
  Pencil,
} from 'lucide-react';
import {
  COMMENT_CATEGORIES,
  PROGRAM_CATEGORIES,
  PROGRAM_PLATFORMS,
  SCHEMA_LIMITS,
  type CommentCategory,
  type ProgramCategory,
  type ProgramCommentRecord,
  type ProgramPlatform,
  type ProgramRecord,
  type ProgramVersionRecord,
} from '../types/repository';
import {
  createComment,
  deleteComment,
  deleteProgramAndSubcollections,
  moderateComment,
  recordProgramDownload,
  subscribeProgramComments,
  subscribeProgramVersions,
  updateProgramSettings,
  uploadMediaImage,
  verifyUpdateSignature,
} from '../lib/repositoryApi';
import { formatBytes, formatTimestamp } from '../lib/format';
import { getDefaultMediaForProgram } from '../lib/programMedia';
import { ProgramUploadForm } from './ProgramUploadForm';

interface ProgramDetailViewProps {
  program: ProgramRecord;
  isStarterOnly?: boolean;
  starterVersion?: ProgramVersionRecord | null;
  onImportStarter?: () => Promise<void>;
  user: User | null;
  isAdmin: boolean;
  onBack: () => void;
  onSignIn: () => void;
}

type DetailTab = 'resumen' | 'comentarios';

function normalizeCategory(raw: string): ProgramCategory {
  if (raw === 'Punto de Venta' || raw === 'Programas de Venta') return 'Programas de Venta';
  if (raw === 'Impresión Térmica') return 'Impresión Térmica';
  if (raw === 'Utilidades y Drivers') return 'Utilidades y Drivers';
  return 'Programas de Venta';
}

function normalizePlatform(raw: string): ProgramPlatform {
  return raw === 'Android' ? 'Android' : 'Windows';
}

export const ProgramDetailView: React.FC<ProgramDetailViewProps> = ({
  program,
  isStarterOnly = false,
  starterVersion = null,
  onImportStarter,
  user,
  isAdmin,
  onBack,
  onSignIn,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('resumen');
  const [versions, setVersions] = useState<ProgramVersionRecord[]>(
    starterVersion ? [starterVersion] : []
  );
  const [comments, setComments] = useState<ProgramCommentRecord[]>([]);
  const [showReplaceFileForm, setShowReplaceFileForm] = useState(false);

  const [verifyState, setVerifyState] = useState<{
    checked: boolean;
    valid: boolean;
    message: string;
  } | null>(null);

  const [commentCategory, setCommentCategory] = useState<CommentCategory>('Opinión');
  const [commentRating, setCommentRating] = useState(5);
  const [commentVersionTag, setCommentVersionTag] = useState(program.latestVersion);
  const [commentBody, setCommentBody] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const [confirmDeleteProgram, setConfirmDeleteProgram] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importingStarter, setImportingStarter] = useState(false);
  const [mediaUpdating, setMediaUpdating] = useState(false);

  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState(program.name);
  const [editSummary, setEditSummary] = useState(program.summary);
  const [editDescription, setEditDescription] = useState(program.description);
  const [editCategory, setEditCategory] = useState<ProgramCategory>(
    normalizeCategory(program.category)
  );
  const [editPlatform, setEditPlatform] = useState<ProgramPlatform>(
    normalizePlatform(program.platform)
  );
  const [savingInfo, setSavingInfo] = useState(false);

  const defaults = getDefaultMediaForProgram(program.slug || program.category);
  const displayCover = program.imageUrl || program.iconUrl || defaults.imageUrl;
  const displayCategory = normalizeCategory(program.category);

  useEffect(() => {
    if (isStarterOnly) {
      setVersions(starterVersion ? [starterVersion] : []);
      return;
    }

    const unsubV = subscribeProgramVersions(
      program.id,
      (list) => setVersions(list),
      (err) => setActionError(err.message)
    );

    const unsubC = subscribeProgramComments(
      program.id,
      (list) => setComments(list),
      (err) => setActionError(err.message)
    );

    return () => {
      unsubV();
      unsubC();
    };
  }, [program.id, isStarterOnly, starterVersion]);

  useEffect(() => {
    setCommentVersionTag(program.latestVersion);
    setEditName(program.name);
    setEditSummary(program.summary);
    setEditDescription(program.description);
    setEditCategory(normalizeCategory(program.category));
    setEditPlatform(normalizePlatform(program.platform));
  }, [program]);

  const latestVersionObj =
    versions.find((v) => v.isLatest && !v.revoked) ||
    versions.find((v) => !v.revoked) ||
    null;

  const handleDownloadVersion = async (ver: ProgramVersionRecord) => {
    setActionError(null);
    if (ver.revoked) {
      setActionError('Este archivo ha sido deshabilitado por seguridad y no puede descargarse.');
      return;
    }

    const link = document.createElement('a');
    link.href = ver.downloadUrl;
    link.download = ver.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (!isStarterOnly && user && user.emailVerified) {
      try {
        await recordProgramDownload(program, ver);
      } catch {
        // Non-blocking download increment
      }
    }
  };

  const handleVerifyIntegrity = async (ver: ProgramVersionRecord) => {
    try {
      const res = await verifyUpdateSignature({
        slug: program.slug,
        version: ver.version,
        sha256: ver.sha256,
        fileSizeBytes: ver.fileSizeBytes,
        signature: ver.signature,
      });
      setVerifyState({
        checked: true,
        valid: res.valid,
        message: res.valid
          ? `Firma ${res.algorithm} válida para v${ver.version} (prefijo ${res.expectedPrefix ?? ''}).`
          : 'La firma no coincide con los metadatos registrados.',
      });
    } catch {
      setVerifyState({
        checked: true,
        valid: false,
        message: 'No se pudo contactar al verificador del servidor.',
      });
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCommentError(null);
    if (isStarterOnly) {
      setCommentError(
        'El propietario debe importar este programa en Firestore para habilitar comentarios.'
      );
      return;
    }
    if (commentBody.trim().length < SCHEMA_LIMITS.COMMENT_BODY_MIN) {
      setCommentError('El comentario debe tener al menos 3 caracteres.');
      return;
    }
    setCommentSubmitting(true);
    try {
      await createComment({
        program,
        versionTag: commentVersionTag || program.latestVersion,
        category: commentCategory,
        rating: commentRating,
        body: commentBody,
      });
      setCommentBody('');
      setCommentRating(5);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Error al publicar comentario.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleReplaceMedia = async (file: File | null) => {
    if (!file || isStarterOnly || !isAdmin) return;
    setMediaUpdating(true);
    try {
      const mediaUrl = await uploadMediaImage(file, 'cover');
      await updateProgramSettings(program.id, {
        imageUrl: mediaUrl,
        iconUrl: mediaUrl,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error actualizando la imagen.');
    } finally {
      setMediaUpdating(false);
    }
  };

  const handleSaveProgramInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStarterOnly || !isAdmin) return;
    if (editName.trim().length < SCHEMA_LIMITS.NAME_MIN) {
      setActionError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    setSavingInfo(true);
    setActionError(null);
    try {
      await updateProgramSettings(program.id, {
        name: editName.trim().slice(0, SCHEMA_LIMITS.NAME_MAX),
        summary: (editSummary.trim().length >= 5
          ? editSummary.trim()
          : `${editName.trim()} para ${editPlatform}`
        ).slice(0, SCHEMA_LIMITS.SUMMARY_MAX),
        description: (editDescription.trim().length >= 10
          ? editDescription.trim()
          : `Programa ${editName.trim()} disponible en LOTEROSDESCARGAS.`
        ).slice(0, SCHEMA_LIMITS.DESCRIPTION_MAX),
        category: editCategory,
        platform: editPlatform,
      });
      setEditingInfo(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleDeleteProgram = async () => {
    if (isStarterOnly || !isAdmin) return;
    try {
      await deleteProgramAndSubcollections(program.id, program.slug);
      onBack();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo eliminar el programa.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-[#041B47]/80 hover:bg-[#082A6A] border border-[#00A3FF]/35 backdrop-blur-md transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#7FE000]" />
          Volver al catálogo
        </button>

        {isAdmin && !isStarterOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingInfo((prev) => !prev);
                setShowReplaceFileForm(false);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#041B47]/85 hover:bg-[#082A6A] border border-[#00A3FF]/35 backdrop-blur-md rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-[#7AD7FF]" />
              {editingInfo ? 'Cerrar Edición' : 'Editar Info'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReplaceFileForm((prev) => !prev);
                setEditingInfo(false);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              {showReplaceFileForm ? 'Cerrar Subida' : 'Actualizar Archivo'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteProgram(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-100 bg-rose-950/75 hover:bg-rose-900/85 border border-rose-400/40 backdrop-blur-md rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar Programa
            </button>
          </div>
        )}
      </div>

      {isStarterOnly && isAdmin && (
        <div className="p-4 rounded-2xl border border-[#00A3FF]/40 bg-white/95 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <p className="text-sm text-[#0B1E3D]">
            Este programa es un ejemplo base. Impórtalo a tu repositorio para editar su información, cambiar la imagen o habilitar comentarios.
          </p>
          {onImportStarter && (
            <button
              type="button"
              disabled={importingStarter}
              onClick={async () => {
                setImportingStarter(true);
                await onImportStarter();
                setImportingStarter(false);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              {importingStarter ? 'Importando...' : 'Importar a Mi Repositorio'}
            </button>
          )}
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm flex items-center justify-between gap-4">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {showReplaceFileForm && isAdmin && !isStarterOnly && (
        <div className="p-6 rounded-2xl border border-[#00A3FF]/40 bg-white/95 backdrop-blur-md text-[#0B1E3D] shadow-lg">
          <ProgramUploadForm
            existingProgram={program}
            onSuccess={() => setShowReplaceFileForm(false)}
            onCancel={() => setShowReplaceFileForm(false)}
          />
        </div>
      )}

      {editingInfo && isAdmin && !isStarterOnly && (
        <form
          onSubmit={handleSaveProgramInfo}
          className="p-6 rounded-2xl border border-[#00A3FF]/40 bg-white/95 backdrop-blur-md text-[#0B1E3D] space-y-4 shadow-lg"
        >
          <h2 className="font-display text-base font-semibold text-[#0B1E3D]">
            Editar Información del Programa
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre</label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.NAME_MAX}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 text-[#0B1E3D] border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Categoría</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as ProgramCategory)}
                className="w-full px-3 py-2 text-sm bg-slate-50 text-[#0B1E3D] border border-blue-200 rounded-lg"
              >
                {PROGRAM_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Plataforma</label>
              <select
                value={editPlatform}
                onChange={(e) => setEditPlatform(e.target.value as ProgramPlatform)}
                className="w-full px-3 py-2 text-sm bg-slate-50 text-[#0B1E3D] border border-blue-200 rounded-lg"
              >
                {PROGRAM_PLATFORMS.map((plat) => (
                  <option key={plat} value={plat}>
                    {plat}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Resumen corto</label>
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.SUMMARY_MAX}
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 text-[#0B1E3D] border border-blue-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Descripción completa
            </label>
            <textarea
              rows={3}
              maxLength={SCHEMA_LIMITS.DESCRIPTION_MAX}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 text-[#0B1E3D] border border-blue-200 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingInfo(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingInfo}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] rounded-lg cursor-pointer"
            >
              {savingInfo ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      )}

      {confirmDeleteProgram && (
        <div className="p-5 rounded-2xl border border-red-200 bg-red-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-red-950 text-sm">
              Confirmar eliminación de {program.name}
            </p>
            <p className="text-xs text-red-800 mt-1">
              Se eliminarán el programa del catálogo, sus archivos asociados y sus comentarios.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmDeleteProgram(false)}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDeleteProgram}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
            >
              Confirmar Eliminación
            </button>
          </div>
        </div>
      )}

      {/* Program Header with Square Framed Image-Button */}
      <section className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl overflow-hidden shadow-[0_14px_38px_rgba(0,12,42,0.4)]">
        <div className="p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 min-w-0 flex-1">
            {/* Clickable Square Image Download Button */}
            <button
              type="button"
              disabled={!latestVersionObj}
              onClick={() => latestVersionObj && handleDownloadVersion(latestVersionObj)}
              title={
                latestVersionObj
                  ? `Clic en la imagen para descargar ${program.name}`
                  : program.name
              }
              aria-label={`Descargar ${program.name}`}
              className="group relative w-32 h-32 sm:w-36 sm:h-36 shrink-0 bg-white border border-blue-100 rounded-2xl p-2.5 shadow-sm hover:border-[#0052CC] hover:shadow-md transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0052CC]"
            >
              <img
                src={displayCover}
                alt={`Botón de descarga de ${program.name}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover rounded-xl group-hover:scale-[1.03] transition-transform duration-200"
              />
              {latestVersionObj && (
                <span className="absolute inset-x-2.5 bottom-2.5 py-1 px-2 rounded-lg bg-[#0046AD]/90 text-white text-[11px] font-semibold flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  <Download className="w-3 h-3 text-[#7FE000]" />
                  Descargar
                </span>
              )}
            </button>

            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-medium text-[#0052CC]">{displayCategory}</span>
                <span aria-hidden="true">·</span>
                <span>{normalizePlatform(program.platform)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[#0B1E3D] font-semibold">
                  v{program.latestVersion}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-[#2F7D00] font-semibold">Gratuito</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1E3D] tracking-tight">
                {program.name}
              </h1>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-2xl">
                {program.summary}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-2.5 shrink-0 w-full md:w-auto">
            {latestVersionObj && (
              <button
                type="button"
                onClick={() => handleDownloadVersion(latestVersionObj)}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-[#2F7D00] hover:bg-[#256300] rounded-xl transition-colors whitespace-nowrap cursor-pointer shadow-sm border border-[#65C800]/40"
              >
                <Download className="w-4 h-4 text-[#7FE000]" />
                Descargar Gratis ({formatBytes(latestVersionObj.fileSizeBytes)})
              </button>
            )}
          </div>
        </div>

        <div className="px-6 sm:px-8 border-t border-blue-100 flex items-center gap-6 overflow-x-auto bg-blue-50/30">
          {(
            [
              { id: 'resumen', label: 'Resumen y Seguridad' },
              { id: 'comentarios', label: `Comentarios (${comments.length})` },
            ] as Array<{ id: DetailTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'border-[#0052CC] text-[#0B1E3D] font-semibold'
                  : 'border-transparent text-slate-600 hover:text-[#0052CC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'resumen' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 space-y-6 shadow-lg">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#0B1E3D]">
                Descripción del Programa
              </h2>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {program.description}
              </p>
            </div>

            {latestVersionObj && (
              <div className="pt-6 border-t border-blue-100">
                <h3 className="font-display text-base font-semibold text-[#0B1E3D]">
                  Notas del Archivo ({latestVersionObj.fileName})
                </h3>
                <p className="mt-2 text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                  {latestVersionObj.changelog}
                </p>
              </div>
            )}
          </div>

          <div className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 space-y-5 shadow-lg">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#2F7D00]" />
              <h2 className="font-display text-base font-semibold text-[#0B1E3D]">
                Integridad del Archivo
              </h2>
            </div>

            {latestVersionObj ? (
              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-slate-500">Archivo instalador</dt>
                  <dd className="font-mono text-[#0B1E3D] mt-0.5 break-all">
                    {latestVersionObj.fileName}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Requisitos mínimos</dt>
                  <dd className="text-[#0B1E3D] mt-0.5">{latestVersionObj.minOs}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Resumen SHA-256</dt>
                  <dd className="font-mono text-slate-800 bg-blue-50/40 border border-blue-100 rounded-lg p-2 mt-1 break-all select-all">
                    {latestVersionObj.sha256}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Firma HMAC-SHA256</dt>
                  <dd className="font-mono text-slate-800 bg-blue-50/40 border border-blue-100 rounded-lg p-2 mt-1 break-all select-all">
                    {latestVersionObj.signature}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-slate-500">No hay archivo activo para verificar.</p>
            )}

            {latestVersionObj && (
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => handleVerifyIntegrity(latestVersionObj)}
                  className="w-full px-3.5 py-2 text-xs font-semibold text-[#0052CC] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                >
                  Verificar Firma en Servidor
                </button>
                {verifyState && (
                  <p
                    className={`text-xs font-medium ${
                      verifyState.valid ? 'text-[#2F7D00]' : 'text-red-600'
                    }`}
                  >
                    {verifyState.message}
                  </p>
                )}
              </div>
            )}

            {isAdmin && !isStarterOnly && (
              <div className="pt-4 border-t border-blue-100 space-y-3">
                <p className="text-xs font-semibold text-[#0B1E3D]">Controles del Propietario</p>

                <label className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#0B1E3D] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5 text-[#0052CC]" />
                  {mediaUpdating ? 'Subiendo...' : 'Cambiar Imagen del Cuadro'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleReplaceMedia(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'comentarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 space-y-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[#0B1E3D]">
                Comentarios y Reportes de Usuarios
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {comments.length} publicaciones
              </span>
            </div>

            {comments.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-blue-200 rounded-xl bg-blue-50/20">
                <MessageSquare className="w-7 h-7 text-[#0052CC]/60 mx-auto mb-2" />
                <p className="text-sm font-medium text-[#0B1E3D]">
                  Aún no hay comentarios para {program.name}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Sé el primero en compartir tu experiencia o reportar compatibilidad con impresoras.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-blue-50">
                {comments.map((cmt) => (
                  <article key={cmt.id} className="py-5 first:pt-0 last:pb-0 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-[#0B1E3D] text-sm">
                          {cmt.authorName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{cmt.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#0052CC]">v{cmt.versionTag}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatTimestamp(cmt.createdAt)}</span>
                        {cmt.pinned && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#0052CC] font-semibold inline-flex items-center gap-1">
                              <Pin className="w-3 h-3" />
                              Fijado
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-amber-500 text-xs font-mono tabular-nums">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="text-[#0B1E3D] font-semibold">{cmt.rating}/5</span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {cmt.body}
                    </p>

                    {cmt.adminReply && (
                      <div className="mt-3 p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs space-y-1">
                        <p className="font-semibold text-[#0052CC]">Respuesta del Propietario</p>
                        <p className="text-slate-700 leading-relaxed">{cmt.adminReply}</p>
                      </div>
                    )}

                    {user && (user.uid === cmt.authorId || isAdmin) && (
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                moderateComment(program.id, cmt.id, { pinned: !cmt.pinned })
                              }
                              className="text-slate-600 hover:text-[#0B1E3D] font-medium cursor-pointer"
                            >
                              {cmt.pinned ? 'Desfijar' : 'Fijar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTargetId(replyTargetId === cmt.id ? null : cmt.id);
                                setReplyDraft(cmt.adminReply || '');
                              }}
                              className="text-[#0052CC] hover:underline font-medium cursor-pointer"
                            >
                              {cmt.adminReply ? 'Editar Respuesta' : 'Responder'}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteComment(program.id, cmt.id)}
                          className="text-red-600 hover:text-red-700 font-medium cursor-pointer"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}

                    {replyTargetId === cmt.id && isAdmin && (
                      <div className="mt-3 flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          maxLength={SCHEMA_LIMITS.ADMIN_REPLY_MAX}
                          value={replyDraft}
                          onChange={(e) => setReplyDraft(e.target.value)}
                          placeholder="Escribe una respuesta oficial..."
                          className="flex-1 px-3 py-2 text-xs bg-slate-50 text-[#0B1E3D] border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await moderateComment(program.id, cmt.id, {
                              adminReply: replyDraft.trim(),
                            });
                            setReplyTargetId(null);
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] rounded-lg cursor-pointer"
                        >
                          Guardar Respuesta
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 h-fit space-y-4 shadow-lg">
            <h3 className="font-display text-base font-semibold text-[#0B1E3D]">
              Dejar un Comentario
            </h3>

            {!user ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Inicia sesión con tu cuenta de Google para comentar programas, calificar el rendimiento o reportar incidencias.
                </p>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] rounded-lg transition-colors cursor-pointer"
                >
                  Iniciar Sesión para Comentar
                </button>
              </div>
            ) : (
              <form onSubmit={handlePostComment} className="space-y-4">
                {commentError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {commentError}
                  </p>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
                  <select
                    value={commentCategory}
                    onChange={(e) => setCommentCategory(e.target.value as CommentCategory)}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 text-[#0B1E3D] border border-blue-200 rounded-lg"
                  >
                    {COMMENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Calificación ({commentRating}/5)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setCommentRating(score)}
                        className={`px-2.5 py-1 text-xs font-mono rounded-lg border cursor-pointer ${
                          commentRating >= score
                            ? 'bg-[#0052CC] border-[#0052CC] text-white font-semibold'
                            : 'bg-slate-50 border-blue-200 text-slate-600'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tu comentario
                  </label>
                  <textarea
                    required
                    rows={4}
                    maxLength={SCHEMA_LIMITS.COMMENT_BODY_MAX}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Comparte cómo funciona en tu punto de venta o qué mejora sugieres..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 text-[#0B1E3D] placeholder:text-slate-400 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={commentSubmitting || isStarterOnly}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  {commentSubmitting ? 'Publicando...' : 'Publicar Comentario'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
