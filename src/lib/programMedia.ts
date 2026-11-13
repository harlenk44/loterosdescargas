import posCover from '../assets/images/pos_loteria_cover_1794527184909.jpg';
import posIcon from '../assets/images/pos_loteria_icon_1794527183991.jpg';
import printerCover from '../assets/images/printer_loteria_cover_1794527185723.jpg';
import printerIcon from '../assets/images/printer_loteria_icon_1794527184772.jpg';
import cierreCover from '../assets/images/cierre_loteria_cover_1794527185983.jpg';
import cierreIcon from '../assets/images/cierre_loteria_icon_1794527185589.jpg';
import updaterCover from '../assets/images/updater_loteria_cover_1794527186782.jpg';
import updaterIcon from '../assets/images/updater_loteria_icon_1794527187201.jpg';
import type { ProgramCategory } from '../types/repository';

export const PRESET_ICONS = [
  { id: 'pos', label: 'Ticket POS', url: posIcon },
  { id: 'printer', label: 'Impresora', url: printerIcon },
  { id: 'cierre', label: 'Taquilla', url: cierreIcon },
  { id: 'updater', label: 'Soporte', url: updaterIcon },
] as const;

export const PRESET_COVERS = [
  { id: 'pos-icon', label: 'Ticket Lotería', url: posIcon },
  { id: 'printer-icon', label: 'Impresora 58/80mm', url: printerIcon },
  { id: 'cierre-icon', label: 'Taquilla Pro', url: cierreIcon },
  { id: 'updater-icon', label: 'Respaldo Seguro', url: updaterIcon },
  { id: 'pos-cover', label: 'Terminal POS', url: posCover },
  { id: 'cierre-cover', label: 'Agencia Venta', url: cierreCover },
] as const;

export function getDefaultMediaForProgram(slugOrCategory: string): { iconUrl: string; imageUrl: string } {
  const key = slugOrCategory.toLowerCase();
  if (key.includes('bancamovil') || key.includes('android')) {
    return { iconUrl: posCover, imageUrl: posCover };
  }
  if (key.includes('impresion-bluetooth') || key.includes('printbt')) {
    return { iconUrl: updaterCover, imageUrl: updaterCover };
  }
  if (key.includes('impresora') || key.includes('driver-termico') || key.includes('printer') || key.includes('térmica')) {
    return { iconUrl: printerIcon, imageUrl: printerIcon };
  }
  if (key.includes('taquilla')) {
    return { iconUrl: cierreIcon, imageUrl: cierreIcon };
  }
  if (key.includes('soporte') || key.includes('respaldo') || key.includes('utilidades')) {
    return { iconUrl: printerCover, imageUrl: printerCover };
  }
  return { iconUrl: posIcon, imageUrl: posIcon };
}

export function getDefaultMediaByCategory(category: ProgramCategory): { iconUrl: string; imageUrl: string } {
  switch (category) {
    case 'Impresión Térmica':
      return { iconUrl: printerIcon, imageUrl: printerIcon };
    case 'Utilidades y Drivers':
      return { iconUrl: updaterIcon, imageUrl: updaterIcon };
    default:
      return { iconUrl: posIcon, imageUrl: posIcon };
  }
}
