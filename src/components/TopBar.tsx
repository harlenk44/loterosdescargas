import React from 'react';
import type { User } from 'firebase/auth';

export type AppSection = 'catalogo' | 'subir';

const LOGO_URL = '/assets/aistudio/Loteros_Descargas__Logo_Tecnol_gico_06091cd3.png';

interface TopBarProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  user: User | null;
  isAdmin: boolean;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onNavigate,
  user,
  isAdmin,
  authLoading,
  onSignIn,
  onSignOut,
}) => {
  const navItems: Array<{ id: AppSection; label: string }> = [
    { id: 'catalogo', label: 'Catálogo' },
    ...(isAdmin ? [{ id: 'subir' as const, label: 'Subir Programa' }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#031538]/82 backdrop-blur-md border-b border-[#00A3FF]/25 shadow-[0_4px_24px_rgba(0,12,42,0.4)]">
      <div className="h-[2.5px] w-full bg-gradient-to-r from-[#0052CC] via-[#00A3FF] to-[#7FE000]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Uploaded Brand Logo */}
        <button
          type="button"
          onClick={() => onNavigate('catalogo')}
          aria-label="Ir al catálogo de LOTEROSDESCARGAS"
          className="flex items-center shrink-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FE000]"
        >
          <img
            src={LOGO_URL}
            alt="Loteros descargas"
            referrerPolicy="no-referrer"
            className="h-10 sm:h-11 w-auto object-contain drop-shadow-[0_2px_10px_rgba(0,163,255,0.35)]"
          />
        </button>

        {/* Zone 2: Concise single-line nav links */}
        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FE000] ${
                  isActive
                    ? 'border-[#7FE000] text-white font-semibold'
                    : 'border-transparent text-blue-100/80 hover:text-white hover:border-[#00A3FF]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          {authLoading ? (
            <span className="text-sm text-blue-200/70 whitespace-nowrap shrink-0">
              Verificando...
            </span>
          ) : user ? (
            <button
              type="button"
              onClick={onSignOut}
              title={
                isAdmin
                  ? `Propietario: ${user.displayName || user.email}`
                  : `Usuario: ${user.displayName || user.email}`
              }
              className="px-4 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-[#00A3FF]/35 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FE000]"
            >
              Cerrar Sesión ({(user.displayName || user.email || 'Cuenta').split(' ')[0]})
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-[0_4px_16px_rgba(127,224,0,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Iniciar Sesión
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        aria-label="Navegación móvil"
        className="flex md:hidden items-center gap-4 px-4 py-2 border-t border-white/10 overflow-x-auto text-xs font-medium bg-[#021230]/80"
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`py-1 whitespace-nowrap shrink-0 ${
                isActive ? 'text-[#7FE000] font-semibold' : 'text-blue-100/80'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
