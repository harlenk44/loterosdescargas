import React from 'react';
import { ExternalLink, Megaphone, X } from 'lucide-react';
import type { PromotionPosition, PromotionRecord } from '../types/repository';

function AdCardContent({
  ad,
  compact,
  brokenImages,
  onImageError,
}: {
  ad: PromotionRecord;
  compact?: boolean;
  brokenImages: Record<string, boolean>;
  onImageError: (id: string) => void;
}) {
  const showImage = Boolean(ad.imageUrl) && !brokenImages[ad.id];
  const hasBannerText =
    (ad.title && ad.title !== 'Publicidad') || Boolean(ad.subtitle);
  const showCustomBadge = Boolean(ad.badgeText) && ad.badgeText !== 'Publicidad';

  if (
    ad.placement === 'skyscraper' ||
    ad.placement === 'vertical' ||
    ad.placement === 'rectangulo'
  ) {
    const showTextBlock = hasBannerText || showCustomBadge || Boolean(ad.linkUrl) || !showImage;
    return (
      <div className="w-[160px] rounded-2xl overflow-hidden bg-[#041B47]/92 backdrop-blur-md border border-[#00A3FF]/45 hover:border-[#7FE000] transition-all shadow-[0_14px_34px_rgba(0,10,36,0.58)] flex flex-col">
        {showImage ? (
          <div className="w-[160px] h-[min(600px,78vh)] bg-[#021230] overflow-hidden flex items-center justify-center">
            <img
              src={ad.imageUrl}
              alt={ad.title || 'Publicidad'}
              referrerPolicy="no-referrer"
              onError={() => onImageError(ad.id)}
              className="w-full h-full object-contain block"
            />
          </div>
        ) : (
          <div className="w-[160px] h-[min(600px,78vh)] bg-gradient-to-b from-[#06245C] to-[#021230] flex flex-col items-center justify-center p-4 text-center gap-2">
            <Megaphone className="w-6 h-6 text-[#7FE000]" />
            <span className="font-display text-sm font-bold text-white leading-snug">
              {ad.title || 'Publicidad'}
            </span>
          </div>
        )}

        {showTextBlock && (
          <div className="px-2.5 py-2 flex items-center justify-between gap-1.5 border-t border-white/10">
            <div className="space-y-0.5 min-w-0">
              {showCustomBadge && (
                <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-[#7FE000]">
                  {ad.badgeText}
                </span>
              )}
              {hasBannerText && (
                <h3 className="font-display text-xs font-bold text-white leading-snug truncate">
                  {ad.title}
                </h3>
              )}
              {ad.subtitle && (
                <p className="text-[11px] text-blue-100/80 line-clamp-2">{ad.subtitle}</p>
              )}
            </div>
            {ad.linkUrl && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#7AD7FF] shrink-0">
                Ver
                <ExternalLink className="w-3 h-3" />
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (ad.placement === 'banner' && !compact) {
    return (
      <div className="relative rounded-2xl overflow-hidden bg-[#041B47]/88 backdrop-blur-md border border-[#00A3FF]/40 hover:border-[#7FE000] transition-all shadow-[0_10px_28px_rgba(0,10,36,0.45)] flex flex-col">
        {showImage && (
          <div className="w-full overflow-hidden bg-[#021230]">
            <img
              src={ad.imageUrl}
              alt={ad.title || 'Publicidad'}
              referrerPolicy="no-referrer"
              onError={() => onImageError(ad.id)}
              className="w-full max-h-60 object-contain mx-auto block"
            />
          </div>
        )}
        {(hasBannerText || !showImage || ad.linkUrl) && (
          <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t border-white/10">
            <div className="space-y-0.5 min-w-0">
              {ad.badgeText && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#7FE000]">
                  {ad.badgeText}
                </span>
              )}
              {hasBannerText && (
                <h3 className="font-display text-sm sm:text-base font-bold text-white leading-snug">
                  {ad.title}
                </h3>
              )}
              {ad.subtitle && (
                <p className="text-xs text-blue-100/85 line-clamp-2">{ad.subtitle}</p>
              )}
            </div>
            {ad.linkUrl && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0052CC] text-white text-xs font-semibold shrink-0 self-start sm:self-center">
                Ver más
                <ExternalLink className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`h-full rounded-2xl overflow-hidden bg-[#041B47]/92 backdrop-blur-md border border-[#00A3FF]/45 hover:border-[#7FE000] transition-all shadow-[0_12px_32px_rgba(0,10,36,0.55)] flex flex-col ${
        compact ? 'w-full' : ''
      }`}
    >
      {showImage && (
        <div className={`${compact ? 'max-h-36' : 'h-36'} w-full overflow-hidden bg-[#021230]`}>
          <img
            src={ad.imageUrl}
            alt={ad.title || 'Publicidad'}
            referrerPolicy="no-referrer"
            onError={() => onImageError(ad.id)}
            className={`w-full ${compact ? 'max-h-36 object-contain' : 'h-full object-cover'}`}
          />
        </div>
      )}
      {(hasBannerText || !showImage || ad.linkUrl || ad.badgeText) && (
        <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
          <div className="space-y-1">
            {ad.badgeText && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#7FE000]">
                {ad.badgeText}
              </span>
            )}
            {(hasBannerText || !showImage) && (
              <h3 className="font-display text-sm font-bold text-white leading-snug">
                {ad.title}
              </h3>
            )}
            {ad.subtitle && (
              <p className="text-xs text-blue-100/80 line-clamp-2">{ad.subtitle}</p>
            )}
          </div>
          {ad.linkUrl && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#7AD7FF]">
              Abrir enlace
              <ExternalLink className="w-3 h-3" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const InlinePromotionSlot: React.FC<{
  promotions: PromotionRecord[];
  position: PromotionPosition;
  brokenImages: Record<string, boolean>;
  onImageError: (id: string) => void;
}> = ({ promotions, position, brokenImages, onImageError }) => {
  const matching = promotions.filter(
    (ad) =>
      ad.status === 'Activo' &&
      (ad.displayStyle ?? 'fija') === 'fija' &&
      (ad.position ?? 'bajo_logo') === position
  );

  if (matching.length === 0) return null;

  const banners = matching.filter((ad) => ad.placement === 'banner');
  const cardsAndRects = matching.filter((ad) => ad.placement !== 'banner');

  const isRightAligned =
    position === 'flotante_derecha' || position === 'lateral_derecho';
  const isLeftAligned =
    position === 'flotante_izquierda' || position === 'lateral_izquierdo';
  const isLateralOnlyDesktop =
    position === 'lateral_izquierdo' || position === 'lateral_derecho';

  const cardAlignClass = isRightAligned
    ? 'flex flex-wrap justify-end gap-4'
    : isLeftAligned
      ? 'flex flex-wrap justify-start gap-4'
      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';

  return (
    <div className={`space-y-3 ${isLateralOnlyDesktop ? 'hidden lg:block' : ''}`}>
      {banners.map((ad) =>
        ad.linkUrl ? (
          <a
            key={ad.id}
            href={ad.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <AdCardContent
              ad={ad}
              brokenImages={brokenImages}
              onImageError={onImageError}
            />
          </a>
        ) : (
          <div key={ad.id}>
            <AdCardContent
              ad={ad}
              brokenImages={brokenImages}
              onImageError={onImageError}
            />
          </div>
        )
      )}

      {cardsAndRects.length > 0 && (
        <div className={cardAlignClass}>
          {cardsAndRects.map((ad) => {
            const widthClass =
              ad.placement === 'skyscraper' ||
              ad.placement === 'vertical' ||
              ad.placement === 'rectangulo'
                ? 'w-[160px]'
                : isRightAligned || isLeftAligned
                  ? 'w-full sm:w-80'
                  : 'h-full';
            return ad.linkUrl ? (
              <a
                key={ad.id}
                href={ad.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`block ${widthClass}`}
              >
                <AdCardContent
                  ad={ad}
                  brokenImages={brokenImages}
                  onImageError={onImageError}
                />
              </a>
            ) : (
              <div key={ad.id} className={widthClass}>
                <AdCardContent
                  ad={ad}
                  brokenImages={brokenImages}
                  onImageError={onImageError}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const FLOATING_ZONE_CLASSES: Record<PromotionPosition, string> = {
  arriba: 'flex top-20 left-1/2 -translate-x-1/2 w-[min(94vw,760px)]',
  bajo_logo: 'flex top-24 right-4 sm:right-6 w-[min(90vw,340px)]',
  sobre_programas: 'flex top-24 left-4 sm:left-6 w-[min(90vw,340px)]',
  abajo: 'flex bottom-4 left-1/2 -translate-x-1/2 w-[min(94vw,760px)]',
  flotante_derecha: 'flex bottom-4 right-4 sm:right-6 w-[min(90vw,330px)]',
  flotante_izquierda: 'flex bottom-4 left-4 sm:left-6 w-[min(90vw,330px)]',
  lateral_izquierdo:
    'hidden lg:flex left-3 xl:left-5 top-1/2 -translate-y-1/2 w-[160px] max-h-[86vh] overflow-y-auto',
  lateral_derecho:
    'hidden lg:flex right-3 xl:right-5 top-1/2 -translate-y-1/2 w-[160px] max-h-[86vh] overflow-y-auto',
};

export const FloatingPromotionsOverlay: React.FC<{
  promotions: PromotionRecord[];
  dismissedIds: Record<string, boolean>;
  onDismiss: (id: string) => void;
  brokenImages: Record<string, boolean>;
  onImageError: (id: string) => void;
}> = ({ promotions, dismissedIds, onDismiss, brokenImages, onImageError }) => {
  const floatingAds = promotions.filter(
    (ad) =>
      ad.status === 'Activo' &&
      ad.displayStyle === 'flotante' &&
      !dismissedIds[ad.id]
  );

  if (floatingAds.length === 0) return null;

  const byZone = new Map<PromotionPosition, PromotionRecord[]>();
  for (const ad of floatingAds) {
    const pos = ad.position ?? 'flotante_derecha';
    const list = byZone.get(pos) ?? [];
    list.push(ad);
    byZone.set(pos, list);
  }

  return (
    <>
      {Array.from(byZone.entries()).map(([pos, ads]) => (
        <div
          key={pos}
          aria-label={`Publicidad flotante ${pos}`}
          className={`fixed z-40 flex-col gap-3 pointer-events-none ${FLOATING_ZONE_CLASSES[pos]}`}
        >
          {ads.map((ad) => {
            const isWide =
              (pos === 'arriba' || pos === 'abajo') && ad.placement === 'banner';
            const inner = (
              <div className="relative pointer-events-auto">
                <button
                  type="button"
                  aria-label="Cerrar publicidad"
                  title="Cerrar publicidad"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDismiss(ad.id);
                  }}
                  className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-[#021230]/95 hover:bg-red-600 border border-white/30 text-white flex items-center justify-center cursor-pointer transition-colors shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FE000]"
                >
                  <X className="w-4 h-4" />
                </button>
                <AdCardContent
                  ad={ad}
                  compact={!isWide}
                  brokenImages={brokenImages}
                  onImageError={onImageError}
                />
              </div>
            );

            return ad.linkUrl ? (
              <a
                key={ad.id}
                href={ad.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block pointer-events-auto"
              >
                {inner}
              </a>
            ) : (
              <div key={ad.id} className="pointer-events-auto">
                {inner}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
};
