import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Megaphone,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  createPromotion,
  deletePromotion,
  updatePromotion,
  uploadMediaImage,
} from '../lib/repositoryApi';
import {
  SCHEMA_LIMITS,
  type PromotionPlacement,
  type PromotionRecord,
  type PromotionStatus,
} from '../types/repository';

interface PromotionsManagerProps {
  promotions: PromotionRecord[];
  onDone?: () => void;
}

export const PromotionsManager: React.FC<PromotionsManagerProps> = ({
  promotions,
  onDone,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [badgeText, setBadgeText] = useState('Publicidad');
  const [linkUrl, setLinkUrl] = useState('');
  const [placement, setPlacement] = useState<PromotionPlacement>('banner');
  const [status, setStatus] = useState<PromotionStatus>('Activo');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [dragging, setDragging] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setBadgeText('Publicidad');
    setLinkUrl('');
    setPlacement('banner');
    setStatus('Activo');
    setImageFile(null);
    setImagePreview('');
    setErrorMessage(null);
  };

  const handleSelectImage = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('El archivo debe ser una imagen (.png, .jpg, .webp).');
      return;
    }
    setErrorMessage(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleEditStart = (promo: PromotionRecord) => {
    setEditingId(promo.id);
    setTitle(promo.title);
    setSubtitle(promo.subtitle);
    setBadgeText(promo.badgeText);
    setLinkUrl(promo.linkUrl);
    setPlacement(promo.placement);
    setStatus(promo.status);
    setImageFile(null);
    setImagePreview(promo.imageUrl);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const hasImage = Boolean(imageFile || (imagePreview && !imagePreview.startsWith('blob:')));
    const resolvedTitle =
      title.trim().length >= 2
        ? title.trim()
        : hasImage
          ? 'Publicidad'
          : '';

    if (resolvedTitle.length < 2) {
      setErrorMessage('Escribe un título o sube una imagen para publicar la publicidad.');
      return;
    }

    setSubmitting(true);
    try {
      let finalImageUrl = imagePreview;
      if (imageFile) {
        finalImageUrl = await uploadMediaImage(
          imageFile,
          placement === 'banner' ? 'banner' : 'cover'
        );
      } else if (finalImageUrl.startsWith('blob:')) {
        finalImageUrl = '';
      }

      if (editingId) {
        await updatePromotion(editingId, {
          title: resolvedTitle,
          subtitle,
          badgeText,
          imageUrl: finalImageUrl,
          linkUrl,
          placement,
          status,
        });
        setSuccessMessage('Publicidad actualizada y visible en la página.');
      } else {
        await createPromotion({
          title: resolvedTitle,
          subtitle,
          badgeText,
          imageUrl: finalImageUrl,
          linkUrl,
          placement,
          status,
        });
        setSuccessMessage(
          status === 'Activo'
            ? 'Publicidad creada y publicada en la página principal.'
            : 'Publicidad guardada como Pausado (cámbiala a Activo para mostrarla).'
        );
      }
      resetForm();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo guardar la publicidad.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (promo: PromotionRecord) => {
    setBusyId(promo.id);
    setErrorMessage(null);
    try {
      const nextStatus: PromotionStatus = promo.status === 'Activo' ? 'Pausado' : 'Activo';
      await updatePromotion(promo.id, { status: nextStatus });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (promoId: string) => {
    setBusyId(promoId);
    setErrorMessage(null);
    try {
      await deletePromotion(promoId);
      if (editingId === promoId) {
        resetForm();
      }
      setConfirmDeleteId(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo eliminar la publicidad.');
    } finally {
      setBusyId(null);
    }
  };

  const inputClass =
    'w-full px-3.5 py-2.5 text-sm bg-slate-50 text-[#0B1E3D] placeholder:text-slate-400 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A3FF] focus:border-[#0052CC]';

  return (
    <div className="space-y-8">
      {/* Create / Edit Advertisement Form */}
      <section className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 sm:p-8 shadow-[0_16px_42px_rgba(0,12,42,0.45)]">
        <div className="pb-5 mb-6 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#0052CC]/10 border border-[#0052CC]/25 flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-[#0052CC]" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#0B1E3D]">
                {editingId ? 'Editar Publicidad' : 'Crear Publicidad en la Página'}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Publica banners o anuncios con imagen y enlace directo visibles en el catálogo principal.
              </p>
            </div>
          </div>

          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="px-4 py-2 text-xs font-semibold text-[#0052CC] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer shrink-0"
            >
              Ver en Catálogo
            </button>
          )}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-5 flex items-center justify-between gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm">
            <div className="flex items-center gap-2.5">
              <Check className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            {onDone && (
              <button
                type="button"
                onClick={onDone}
                className="text-xs font-bold underline cursor-pointer shrink-0"
              >
                Ir a la página
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
                Título del anuncio (opcional si subes banner con imagen)
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.PROMO_TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Pizarra Animal Digital — Resultados en Vivo"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
                Etiqueta (opcional)
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.PROMO_BADGE_MAX}
                value={badgeText}
                onChange={(e) => setBadgeText(e.target.value)}
                placeholder="Publicidad"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
              Descripción o mensaje corto (opcional)
            </label>
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.PROMO_SUBTITLE_MAX}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Ej. Soporte 24/7, impresión rápida en 58mm y resultados en vivo."
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
                Enlace al hacer clic (opcional)
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.URL_MAX}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://tupagina.com o wa.me/..."
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">Formato</label>
                <select
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as PromotionPlacement)}
                  className={inputClass}
                >
                  <option value="banner">Banner ancho</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">Estado</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PromotionStatus)}
                  className={inputClass}
                >
                  <option value="Activo">Activo</option>
                  <option value="Pausado">Pausado</option>
                </select>
              </div>
            </div>
          </div>

          {/* Image Upload Zone */}
          <div>
            <label className="block text-sm font-medium text-[#0B1E3D] mb-1.5">
              Imagen publicitaria (opcional — recomendada 1200×320 px para banner o 600×400 px para tarjeta)
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleSelectImage(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`p-4 rounded-xl border-2 border-dashed transition-colors flex flex-col sm:flex-row items-center gap-4 ${
                dragging ? 'border-[#0052CC] bg-blue-50/70' : 'border-blue-200 bg-blue-50/30'
              }`}
            >
              {imagePreview ? (
                <div className="w-full sm:w-52 h-28 rounded-xl overflow-hidden bg-[#031B49] border border-[#00A3FF]/35 shrink-0">
                  <img
                    src={imagePreview}
                    alt="Vista previa de publicidad"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-full sm:w-52 h-28 rounded-xl bg-white border border-blue-200 flex flex-col items-center justify-center text-slate-400 text-xs shrink-0">
                  <ImagePlus className="w-6 h-6 text-[#0052CC] mb-1" />
                  <span>Sin imagen</span>
                </div>
              )}

              <div className="flex-1 text-center sm:text-left space-y-2">
                <p className="text-xs text-slate-600">
                  Arrastra una imagen aquí o selecciónala desde tu computadora (.png, .jpg, .webp).
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] rounded-lg cursor-pointer transition-colors">
                    <ImagePlus className="w-3.5 h-3.5" />
                    {imagePreview ? 'Cambiar Imagen' : 'Subir Imagen'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleSelectImage(e.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                  </label>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview('');
                      }}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Quitar imagen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {(errorMessage || successMessage) && (
            <div className="space-y-2">
              {errorMessage && (
                <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                  {errorMessage}
                </p>
              )}
              {successMessage && (
                <div className="text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <span>{successMessage}</span>
                  {onDone && (
                    <button
                      type="button"
                      onClick={onDone}
                      className="px-3 py-1 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md cursor-pointer shrink-0"
                    >
                      Ver en Catálogo
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-blue-100 flex items-center justify-end gap-3">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancelar edición
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] disabled:opacity-60 rounded-lg cursor-pointer shadow-sm"
            >
              <Check className="w-4 h-4" />
              {submitting
                ? 'Guardando...'
                : editingId
                  ? 'Guardar Cambios'
                  : 'Publicar Publicidad'}
            </button>
          </div>
        </form>
      </section>

      {/* Existing Promotions List */}
      <section className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 sm:p-8 shadow-lg space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-[#0B1E3D]">
            Publicidad creada ({promotions.length})
          </h2>
        </div>

        {promotions.length === 0 ? (
          <p className="text-sm text-slate-600 py-6 text-center border border-dashed border-blue-200 rounded-xl bg-blue-50/30">
            Aún no has creado publicidad. Usa el formulario de arriba para publicar tu primer banner o tarjeta promocional.
          </p>
        ) : (
          <div className="space-y-3">
            {promotions.map((promo) => (
              <div
                key={promo.id}
                className="p-4 rounded-xl border border-blue-100 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {promo.imageUrl ? (
                    <img
                      src={promo.imageUrl}
                      alt={promo.title}
                      className="w-20 h-14 object-cover rounded-lg border border-blue-200 shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-14 rounded-lg bg-[#031B49] text-[#7FE000] flex items-center justify-center shrink-0">
                      <Megaphone className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-[#0B1E3D] truncate">
                        {promo.title}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          promo.status === 'Activo'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {promo.status}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {promo.placement === 'banner' ? 'Banner ancho' : 'Tarjeta'}
                      </span>
                    </div>
                    {promo.subtitle && (
                      <p className="text-xs text-slate-600 truncate">{promo.subtitle}</p>
                    )}
                    {promo.linkUrl && (
                      <a
                        href={promo.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#0052CC] hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate max-w-xs">{promo.linkUrl}</span>
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === promo.id}
                    onClick={() => handleToggleStatus(promo)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    {promo.status === 'Activo' ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Pausar
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Activar
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditStart(promo)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0052CC] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  {confirmDeleteId === promo.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busyId === promo.id}
                        onClick={() => handleDelete(promo.id)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                      >
                        Sí, eliminar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(promo.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
