import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  CreditCard,
  Mail,
  MessageCircle,
  Pencil,
  Send,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { saveContactPaymentSettings } from '../lib/repositoryApi';
import type { SiteSettingsRecord } from '../types/repository';

interface ContactPaymentViewProps {
  siteSettings: SiteSettingsRecord | null;
  isAdmin: boolean;
  onBack: () => void;
  contextProgramName?: string;
}

function cleanWhatsappDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export const ContactPaymentView: React.FC<ContactPaymentViewProps> = ({
  siteSettings,
  isAdmin,
  onBack,
  contextProgramName,
}) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Admin editor fields
  const [contactHeadline, setContactHeadline] = useState('');
  const [contactSubtitle, setContactSubtitle] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTelegram, setContactTelegram] = useState('');
  const [contactSchedule, setContactSchedule] = useState('');
  const [paymentPagoMovil, setPaymentPagoMovil] = useState('');
  const [paymentZelle, setPaymentZelle] = useState('');
  const [paymentBinance, setPaymentBinance] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Visitor quick inquiry / receipt form
  const [visitorName, setVisitorName] = useState('');
  const [inquiryTopic, setInquiryTopic] = useState(
    contextProgramName
      ? `Información o publicidad relacionada con ${contextProgramName}`
      : 'Publicidad en la página'
  );
  const [paymentMethodChoice, setPaymentMethodChoice] = useState('Pago Móvil');
  const [visitorMessage, setVisitorMessage] = useState('');
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setContactHeadline(siteSettings?.contactHeadline || '');
    setContactSubtitle(siteSettings?.contactSubtitle || '');
    setContactWhatsapp(siteSettings?.contactWhatsapp || '');
    setContactEmail(siteSettings?.contactEmail || '');
    setContactTelegram(siteSettings?.contactTelegram || '');
    setContactSchedule(siteSettings?.contactSchedule || '');
    setPaymentPagoMovil(siteSettings?.paymentPagoMovil || '');
    setPaymentZelle(siteSettings?.paymentZelle || '');
    setPaymentBinance(siteSettings?.paymentBinance || '');
    setPaymentNotes(siteSettings?.paymentNotes || '');
  }, [siteSettings]);

  const displayHeadline =
    siteSettings?.contactHeadline?.trim() || 'Contacto Directo y Métodos de Pago';
  const displaySubtitle =
    siteSettings?.contactSubtitle?.trim() ||
    'Solicita espacios de publicidad en LOTEROSDESCARGAS, soporte técnico o activación de licencias y envía tu comprobante de pago directamente.';
  const whatsappRaw = siteSettings?.contactWhatsapp?.trim() || '';
  const whatsappDigits = cleanWhatsappDigits(whatsappRaw);
  const emailRaw = siteSettings?.contactEmail?.trim() || '';
  const telegramRaw = siteSettings?.contactTelegram?.trim() || '';
  const scheduleRaw = siteSettings?.contactSchedule?.trim() || 'Lunes a Sábado · 8:00 AM – 7:00 PM';
  const pagoMovilRaw = siteSettings?.paymentPagoMovil?.trim() || '';
  const zelleRaw = siteSettings?.paymentZelle?.trim() || '';
  const binanceRaw = siteSettings?.paymentBinance?.trim() || '';
  const notesRaw = siteSettings?.paymentNotes?.trim() || '';

  const hasAnyPaymentConfigured = Boolean(pagoMovilRaw || zelleRaw || binanceRaw || notesRaw);
  const hasAnyContactConfigured = Boolean(whatsappDigits || emailRaw || telegramRaw);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      await saveContactPaymentSettings({
        contactHeadline,
        contactSubtitle,
        contactWhatsapp,
        contactEmail,
        contactTelegram,
        contactSchedule,
        paymentPagoMovil,
        paymentZelle,
        paymentBinance,
        paymentNotes,
      });
      setSaveSuccess(true);
      setEditing(false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'No se pudieron guardar los datos de contacto y pago.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    if (visitorName.trim().length < 2) {
      setFormFeedback('Por favor escribe tu nombre o nombre de tu agencia.');
      return;
    }

    const composed = [
      `Hola, te escribo desde LOTEROSDESCARGAS.`,
      `Nombre: ${visitorName.trim()}`,
      `Motivo: ${inquiryTopic}`,
      `Método de pago / consulta: ${paymentMethodChoice}`,
      visitorMessage.trim() ? `Detalle o referencia: ${visitorMessage.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (whatsappDigits.length >= 7) {
      const waUrl = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(composed)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setFormFeedback('Se abrió WhatsApp con tu mensaje listo para enviar.');
      return;
    }

    if (emailRaw) {
      const mailto = `mailto:${encodeURIComponent(emailRaw)}?subject=${encodeURIComponent(
        `LOTEROSDESCARGAS - ${inquiryTopic}`
      )}&body=${encodeURIComponent(composed)}`;
      window.location.href = mailto;
      setFormFeedback('Se abrió tu aplicación de correo con el mensaje preparado.');
      return;
    }

    await handleCopy('inquiry_msg', composed);
    setFormFeedback(
      'Mensaje copiado al portapapeles. El administrador aún no ha publicado su número de WhatsApp.'
    );
  };

  const inputClass =
    'w-full px-3.5 py-2.5 text-sm bg-slate-50 text-[#0B1E3D] placeholder:text-slate-400 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00A3FF] focus:border-[#0052CC]';

  const paymentMethods = [
    { id: 'pagomovil', title: 'Pago Móvil / Banco Nacional', value: pagoMovilRaw },
    { id: 'zelle', title: 'Zelle', value: zelleRaw },
    { id: 'binance', title: 'Binance Pay / USDT', value: binanceRaw },
  ].filter((item) => Boolean(item.value));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-[#041B47]/80 hover:bg-[#082A6A] border border-[#00A3FF]/35 backdrop-blur-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#7FE000]" />
          Volver al catálogo
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setEditing((prev) => !prev);
              setSaveError(null);
              setSaveSuccess(false);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
          >
            <Pencil className="w-3.5 h-3.5" />
            {editing ? 'Cerrar Editor' : 'Editar Contacto y Pago'}
          </button>
        )}
      </div>

      {saveSuccess && (
        <div className="p-4 rounded-xl border border-emerald-300/40 bg-emerald-950/85 text-emerald-100 text-sm flex items-center gap-2.5">
          <Check className="w-4 h-4 text-[#7FE000] shrink-0" />
          <span>Datos de contacto y pago actualizados y visibles para todos tus visitantes.</span>
        </div>
      )}

      {editing && isAdmin && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/40 rounded-2xl p-6 sm:p-8 shadow-lg space-y-5"
        >
          <div className="pb-4 border-b border-blue-100">
            <h2 className="font-display text-lg font-bold text-[#0B1E3D]">
              Configurar Página de Contacto y Pago
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Estos datos se guardan en Firestore y se mostrarán a los visitantes cuando entren desde los anuncios o desde el menú superior.
            </p>
          </div>

          {saveError && (
            <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {saveError}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Título de la página
              </label>
              <input
                type="text"
                maxLength={120}
                value={contactHeadline}
                onChange={(e) => setContactHeadline(e.target.value)}
                placeholder="Contacto Directo y Métodos de Pago"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Horario de atención
              </label>
              <input
                type="text"
                maxLength={120}
                value={contactSchedule}
                onChange={(e) => setContactSchedule(e.target.value)}
                placeholder="Lunes a Sábado · 8:00 AM – 7:00 PM"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Descripción o mensaje principal
            </label>
            <input
              type="text"
              maxLength={300}
              value={contactSubtitle}
              onChange={(e) => setContactSubtitle(e.target.value)}
              placeholder="Solicita publicidad en nuestra web, licencias de programas o soporte técnico."
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                WhatsApp (con código de país)
              </label>
              <input
                type="text"
                maxLength={40}
                value={contactWhatsapp}
                onChange={(e) => setContactWhatsapp(e.target.value)}
                placeholder="Ej. +58 412 1234567"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Correo de contacto
              </label>
              <input
                type="email"
                maxLength={120}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="soporte@tudominio.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Telegram o enlace adicional (opcional)
              </label>
              <input
                type="text"
                maxLength={120}
                value={contactTelegram}
                onChange={(e) => setContactTelegram(e.target.value)}
                placeholder="https://t.me/tuusuario o @tuusuario"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pago Móvil / Transferencia
              </label>
              <textarea
                rows={3}
                maxLength={300}
                value={paymentPagoMovil}
                onChange={(e) => setPaymentPagoMovil(e.target.value)}
                placeholder="Banco: Banesco (0134)&#10;C.I. / RIF: V-12345678&#10;Tel: 0412-1234567"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Zelle
              </label>
              <textarea
                rows={3}
                maxLength={200}
                value={paymentZelle}
                onChange={(e) => setPaymentZelle(e.target.value)}
                placeholder="Correo: pagos@tudominio.com&#10;Titular: Nombre y Apellido"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Binance Pay / USDT
              </label>
              <textarea
                rows={3}
                maxLength={200}
                value={paymentBinance}
                onChange={(e) => setPaymentBinance(e.target.value)}
                placeholder="Binance ID: 123456789&#10;Red TRC20 / BEP20"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Planes de publicidad, precios o instrucciones de pago
            </label>
            <textarea
              rows={3}
              maxLength={1200}
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="Ej. Banner lateral 160x600 mensual, anuncio en ficha de programas, envío de comprobante por WhatsApp para activación inmediata."
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-blue-100">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Guardando...' : 'Guardar Contacto y Pago'}
            </button>
          </div>
        </form>
      )}

      {/* Hero Header Card */}
      <section className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 sm:p-8 shadow-[0_14px_38px_rgba(0,12,42,0.4)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-[#0052CC]">LOTEROSDESCARGAS</span>
              <span aria-hidden="true">·</span>
              <span>Publicidad, Soporte y Pagos</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-slate-600">
                <Clock className="w-3.5 h-3.5 text-[#0052CC]" />
                {scheduleRaw}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1E3D] tracking-tight">
              {displayHeadline}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              {displaySubtitle}
            </p>
          </div>

          {whatsappDigits.length >= 7 && (
            <a
              href={`https://wa.me/${whatsappDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-[#2F7D00] hover:bg-[#256300] rounded-xl transition-colors whitespace-nowrap shrink-0 shadow-sm border border-[#65C800]/40"
            >
              <MessageCircle className="w-4 h-4 text-[#7FE000]" />
              Escribir por WhatsApp
            </a>
          )}
        </div>
      </section>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Direct Contact Channels + Payment Details */}
        <div className="lg:col-span-7 space-y-6">
          {/* Direct Channels */}
          <section className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 shadow-lg space-y-4">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-5 h-5 text-[#0052CC]" />
              <h2 className="font-display text-lg font-bold text-[#0B1E3D]">
                Canales de Contacto
              </h2>
            </div>

            {hasAnyContactConfigured ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {whatsappRaw && (
                  <div className="p-4 rounded-xl bg-blue-50/45 border border-blue-100 space-y-2">
                    <p className="text-xs font-semibold text-slate-500">WhatsApp Directo</p>
                    <p className="font-mono text-sm font-bold text-[#0B1E3D] tabular-nums">
                      {whatsappRaw}
                    </p>
                    {whatsappDigits.length >= 7 && (
                      <a
                        href={`https://wa.me/${whatsappDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F7D00] hover:underline"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Abrir chat de WhatsApp
                      </a>
                    )}
                  </div>
                )}

                {emailRaw && (
                  <div className="p-4 rounded-xl bg-blue-50/45 border border-blue-100 space-y-2">
                    <p className="text-xs font-semibold text-slate-500">Correo Electrónico</p>
                    <p className="text-sm font-semibold text-[#0B1E3D] break-all">{emailRaw}</p>
                    <a
                      href={`mailto:${encodeURIComponent(emailRaw)}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0052CC] hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Enviar correo
                    </a>
                  </div>
                )}

                {telegramRaw && (
                  <div className="p-4 rounded-xl bg-blue-50/45 border border-blue-100 space-y-2 sm:col-span-2">
                    <p className="text-xs font-semibold text-slate-500">Telegram / Canal</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#0B1E3D] break-all">
                        {telegramRaw}
                      </span>
                      {telegramRaw.startsWith('http') && (
                        <a
                          href={telegramRaw}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[#0052CC] hover:underline"
                        >
                          Abrir enlace
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-blue-50/40 border border-dashed border-blue-200 text-sm text-slate-600">
                {isAdmin
                  ? 'Aún no has configurado tu WhatsApp o correo. Haz clic en "Editar Contacto y Pago" arriba para agregar tus datos.'
                  : 'Usa el formulario de la derecha para enviarnos tu consulta o solicitar información publicitaria.'}
              </div>
            )}
          </section>

          {/* Payment Methods */}
          <section className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 shadow-lg space-y-4">
            <div className="flex items-center gap-2.5">
              <CreditCard className="w-5 h-5 text-[#2F7D00]" />
              <h2 className="font-display text-lg font-bold text-[#0B1E3D]">
                Métodos de Pago Disponibles
              </h2>
            </div>

            {hasAnyPaymentConfigured ? (
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className="p-4 rounded-xl bg-slate-50 border border-blue-100 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-bold text-[#0052CC]">{method.title}</p>
                      <p className="text-sm font-mono text-[#0B1E3D] whitespace-pre-line break-words">
                        {method.value}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(method.id, method.value)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1E3D] bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start"
                    >
                      {copiedKey === method.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#2F7D00]" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#0052CC]" />
                          Copiar datos
                        </>
                      )}
                    </button>
                  </div>
                ))}

                {notesRaw && (
                  <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-1.5">
                    <p className="text-xs font-bold text-[#0B1E3D]">
                      Planes, Tarifas e Instrucciones
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                      {notesRaw}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-blue-50/40 border border-dashed border-blue-200 text-sm text-slate-600">
                {isAdmin
                  ? 'Agrega tus cuentas de Pago Móvil, Zelle o Binance Pay haciendo clic en "Editar Contacto y Pago".'
                  : 'Solicita los datos de pago vigentes mediante el formulario de contacto para activar tu publicidad o licencia.'}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Interactive Contact & Payment Receipt Form */}
        <section className="lg:col-span-5 bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 shadow-lg space-y-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-[#0B1E3D]">
              Enviar Consulta o Comprobante
            </h2>
            <p className="text-xs text-slate-600">
              Completa tus datos para solicitar un espacio publicitario, soporte técnico o reportar tu pago.
            </p>
          </div>

          <form onSubmit={handleSendInquiry} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tu nombre o banca
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                placeholder="Ej. Carlos Pérez / Agencia Central"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motivo del contacto
              </label>
              <select
                value={inquiryTopic}
                onChange={(e) => setInquiryTopic(e.target.value)}
                className={inputClass}
              >
                {contextProgramName && (
                  <option value={`Información o publicidad relacionada con ${contextProgramName}`}>
                    Consulta sobre {contextProgramName}
                  </option>
                )}
                <option value="Publicidad en la página">Publicidad en LOTEROSDESCARGAS</option>
                <option value="Activación o licencia de programa">
                  Activación o licencia de programa
                </option>
                <option value="Soporte técnico e instalación">
                  Soporte técnico e instalación
                </option>
                <option value="Reportar comprobante de pago">
                  Reportar comprobante de pago
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Método de pago / preferencia
              </label>
              <select
                value={paymentMethodChoice}
                onChange={(e) => setPaymentMethodChoice(e.target.value)}
                className={inputClass}
              >
                <option value="Pago Móvil">Pago Móvil / Transferencia</option>
                <option value="Zelle">Zelle</option>
                <option value="Binance Pay / USDT">Binance Pay / USDT</option>
                <option value="Solo consulta previa">Solo consulta previa</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mensaje o número de referencia
              </label>
              <textarea
                rows={4}
                maxLength={500}
                value={visitorMessage}
                onChange={(e) => setVisitorMessage(e.target.value)}
                placeholder="Indica qué tipo de anuncio buscas, programa o los últimos dígitos de tu comprobante..."
                className={inputClass}
              />
            </div>

            {formFeedback && (
              <p className="text-xs font-medium text-[#0B1E3D] bg-blue-50 border border-blue-200 rounded-lg p-3">
                {formFeedback}
              </p>
            )}

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-[#0052CC] hover:bg-[#0041A8] rounded-xl transition-colors whitespace-nowrap cursor-pointer shadow-sm"
            >
              <Send className="w-4 h-4" />
              {whatsappDigits.length >= 7 ? 'Enviar por WhatsApp' : 'Preparar Mensaje'}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
              <ShieldCheck className="w-4 h-4 text-[#2F7D00] shrink-0" />
              <span>Atención directa con el administrador oficial de LOTEROSDESCARGAS.</span>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};
