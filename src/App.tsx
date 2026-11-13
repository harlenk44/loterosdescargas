import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Download,
  FolderArchive,
  Image as ImageIcon,
  LayoutGrid,
  Lock,
  Monitor,
  PackagePlus,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { auth, googleProvider } from './lib/firebase';
import {
  checkAdminStatus,
  createProgramWithInitialVersion,
  deleteProgramAndSubcollections,
  fetchStarterCatalog,
  recordProgramDownload,
  subscribePrograms,
  subscribeProgramVersions,
  updateProgramSettings,
  uploadMediaImage,
} from './lib/repositoryApi';
import {
  PROGRAM_PLATFORMS,
  type ProgramCategory,
  type ProgramRecord,
  type ProgramVersionRecord,
  type StarterProgramItem,
} from './types/repository';
import { TopBar, type AppSection } from './components/TopBar';
import { ProgramUploadForm } from './components/ProgramUploadForm';
import { ProgramDetailView } from './components/ProgramDetailView';
import { getDefaultMediaForProgram } from './lib/programMedia';

const LOGO_URL = '/assets/aistudio/Loteros_Descargas__Logo_Tecnol_gico_06091cd3.png';
const PAGE_BG_URL = '/assets/aistudio/Gemini_Generated_Image_gezu0vgezu0vgezu_bd6c7c79.jfif';

const FEATURED_CATEGORIES: Array<{
  id: 'Todos' | ProgramCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'Todos', label: 'Todos los Programas', icon: LayoutGrid },
  { id: 'Programas de Venta', label: 'Programas de Venta', icon: Monitor },
  { id: 'Impresión Térmica', label: 'Impresión Térmica', icon: Printer },
  { id: 'Utilidades y Drivers', label: 'Utilidades y Drivers', icon: Wrench },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('catalogo');
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  // Auth & Role State
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Catalog Data State
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [starterItems, setStarterItems] = useState<StarterProgramItem[]>([]);
  const [importingAllStarter, setImportingAllStarter] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters & Quick Owner Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Todos' | ProgramCategory>('Todos');
  const [platformFilter, setPlatformFilter] = useState<string>('Todas');
  const [hideStarter, setHideStarter] = useState<boolean>(() => {
    try {
      return localStorage.getItem('loteros_hide_starter') === '1';
    } catch {
      return false;
    }
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingImageId, setUpdatingImageId] = useState<string | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  // Version cache per program for direct square-image downloads
  const [versionsByProgram, setVersionsByProgram] = useState<Record<string, ProgramVersionRecord[]>>({});

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const adminFlag = await checkAdminStatus(
            nextUser.uid,
            nextUser.email,
            nextUser.emailVerified
          );
          setIsAdmin(adminFlag);
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    setProgramsLoading(true);
    const unsubPrograms = subscribePrograms(
      (list) => {
        setPrograms(list);
        setProgramsLoading(false);
      },
      (err) => {
        setDataError(err.message);
        setProgramsLoading(false);
      }
    );

    void fetchStarterCatalog().then(setStarterItems);

    return () => unsubPrograms();
  }, []);

  useEffect(() => {
    if (programs.length === 0) return;
    const unsubs = programs.map((prog) =>
      subscribeProgramVersions(prog.id, (vers) => {
        setVersionsByProgram((prev) => ({ ...prev, [prog.id]: vers }));
      })
    );
    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [programs]);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    await signOut(auth);
    if (activeSection === 'subir') {
      setActiveSection('catalogo');
    }
  };

  const handleNavigate = (section: AppSection) => {
    if (section === 'subir' && !isAdmin) {
      setActiveSection('catalogo');
      return;
    }
    setActiveSection(section);
    setSelectedProgramId(null);
  };

  const starterCatalogView = useMemo(() => {
    return starterItems.map((item) => {
      const media = getDefaultMediaForProgram(item.slug);
      const program: ProgramRecord = {
        id: item.id,
        slug: item.slug,
        name: item.name,
        summary: item.summary,
        description: item.description,
        category: item.category,
        platform: item.platform,
        iconUrl: media.iconUrl,
        imageUrl: media.imageUrl,
        latestVersion: item.version,
        latestChannel: item.channel,
        downloadCount: 0,
        commentCount: 0,
        autoUpdateEnabled: true,
        status: 'Activo',
        ownerId: 'starter',
        ownerName: 'LOTEROSDESCARGAS',
      };
      const version: ProgramVersionRecord = {
        id: `${item.id}_v1`,
        programId: item.id,
        version: item.version,
        channel: item.channel,
        fileName: item.fileName,
        fileSizeBytes: item.fileSizeBytes,
        downloadUrl: item.downloadUrl,
        sha256: item.sha256,
        signature: item.signature,
        changelog: item.changelog,
        minOs: item.minOs,
        mandatory: false,
        isLatest: true,
        revoked: false,
        downloads: 0,
        authorId: 'starter',
      };
      return { program, version };
    });
  }, [starterItems]);

  const showingStarterFallback =
    !programsLoading && programs.length === 0 && starterCatalogView.length > 0 && !hideStarter;

  const displayPrograms = useMemo(() => {
    if (showingStarterFallback) {
      return starterCatalogView.map((s) => s.program);
    }
    return programs;
  }, [showingStarterFallback, starterCatalogView, programs]);

  const filteredPrograms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return displayPrograms.filter((p) => {
      if (categoryFilter !== 'Todos') {
        const matchesVentaAlias =
          categoryFilter === 'Programas de Venta' &&
          (p.category as string) === 'Punto de Venta';
        if (p.category !== categoryFilter && !matchesVentaAlias) return false;
      }
      if (platformFilter !== 'Todas' && p.platform !== platformFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q)
      );
    });
  }, [displayPrograms, searchQuery, categoryFilter, platformFilter]);

  const selectedProgram = useMemo(
    () => displayPrograms.find((p) => p.id === selectedProgramId) ?? null,
    [displayPrograms, selectedProgramId]
  );

  const selectedStarterVersion = useMemo(() => {
    if (!showingStarterFallback || !selectedProgramId) return null;
    return starterCatalogView.find((s) => s.program.id === selectedProgramId)?.version ?? null;
  }, [showingStarterFallback, selectedProgramId, starterCatalogView]);

  const getLatestVersionForProgram = (programId: string): ProgramVersionRecord | null => {
    if (showingStarterFallback) {
      return starterCatalogView.find((s) => s.program.id === programId)?.version ?? null;
    }
    const list = versionsByProgram[programId] ?? [];
    return list.find((v) => v.isLatest && !v.revoked) || list.find((v) => !v.revoked) || null;
  };

  const handleDirectDownload = async (prog: ProgramRecord) => {
    const latest = getLatestVersionForProgram(prog.id);
    if (!latest) {
      setSelectedProgramId(prog.id);
      return;
    }

    setDownloadFeedback(`Descargando ${prog.name} (${latest.fileName})...`);
    setTimeout(() => {
      setDownloadFeedback((prev) => (prev?.includes(prog.name) ? null : prev));
    }, 3500);

    const link = document.createElement('a');
    link.href = latest.downloadUrl;
    link.download = latest.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (!showingStarterFallback && user && user.emailVerified) {
      try {
        await recordProgramDownload(prog, latest);
      } catch {
        // Non-blocking download increment
      }
    }
  };

  const handleCardImageReplace = async (prog: ProgramRecord, file: File | null) => {
    if (!file || !isAdmin || showingStarterFallback) return;
    setUpdatingImageId(prog.id);
    setDataError(null);
    try {
      const mediaUrl = await uploadMediaImage(file, 'cover');
      await updateProgramSettings(prog.id, {
        imageUrl: mediaUrl,
        iconUrl: mediaUrl,
      });
    } catch (err) {
      setDataError(
        err instanceof Error ? err.message : 'No se pudo actualizar la imagen del cuadro.'
      );
    } finally {
      setUpdatingImageId(null);
    }
  };

  const handleCardDelete = async (prog: ProgramRecord) => {
    if (!isAdmin || showingStarterFallback) return;
    setDeletingId(prog.id);
    setDataError(null);
    try {
      await deleteProgramAndSubcollections(prog.id, prog.slug);
      setConfirmDeleteId(null);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'No se pudo eliminar el programa.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStarterVisibility = (hide: boolean) => {
    setHideStarter(hide);
    try {
      localStorage.setItem('loteros_hide_starter', hide ? '1' : '0');
    } catch {
      // Ignore storage failures
    }
  };

  const importStarterItemToFirestore = async (item: StarterProgramItem) => {
    const media = getDefaultMediaForProgram(item.slug);
    return createProgramWithInitialVersion({
      name: item.name,
      slug: item.slug,
      summary: item.summary,
      description: item.description,
      category: item.category,
      platform: item.platform,
      iconUrl: media.iconUrl,
      imageUrl: media.imageUrl,
      autoUpdateEnabled: true,
      initialVersion: {
        version: item.version,
        channel: item.channel,
        fileName: item.fileName,
        fileSizeBytes: item.fileSizeBytes,
        downloadUrl: item.downloadUrl,
        sha256: item.sha256,
        signature: item.signature,
        changelog: item.changelog,
        minOs: item.minOs,
        mandatory: false,
      },
    });
  };

  const handleImportAllStarter = async () => {
    if (!isAdmin || starterItems.length === 0) return;
    setImportingAllStarter(true);
    setDataError(null);
    try {
      for (const item of starterItems) {
        await importStarterItemToFirestore(item);
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error importando el catálogo inicial.');
    } finally {
      setImportingAllStarter(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col text-white overflow-x-hidden">
      {/* Full-page fixed background image & readability overlay */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none select-none">
        <img
          src={PAGE_BG_URL}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center scale-[1.01]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#021233]/65 via-[#031B4A]/45 to-[#02102B]/85" />
      </div>

      <TopBar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        user={user}
        isAdmin={isAdmin}
        authLoading={authLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {authError && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-red-300/40 bg-red-950/85 backdrop-blur-md text-red-100 text-sm flex items-center justify-between gap-4"
          >
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="text-xs font-semibold underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {dataError && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-amber-300/40 bg-amber-950/85 backdrop-blur-md text-amber-100 text-sm flex items-center justify-between gap-4"
          >
            <span>{dataError}</span>
            <button
              type="button"
              onClick={() => setDataError(null)}
              className="text-xs font-semibold underline cursor-pointer shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {downloadFeedback && (
          <div
            role="status"
            className="p-3.5 rounded-xl border border-[#7FE000]/50 bg-[#041B47]/90 backdrop-blur-md text-white text-sm flex items-center gap-2.5 shadow-lg"
          >
            <Download className="w-4 h-4 text-[#7FE000] shrink-0" />
            <span className="font-medium">{downloadFeedback}</span>
          </div>
        )}

        {/* Program Detail Workspace */}
        {selectedProgram ? (
          <ProgramDetailView
            program={selectedProgram}
            isStarterOnly={showingStarterFallback}
            starterVersion={selectedStarterVersion}
            onImportStarter={
              showingStarterFallback && isAdmin
                ? async () => {
                    const starter = starterItems.find((s) => s.id === selectedProgram.id);
                    if (starter) {
                      const newId = await importStarterItemToFirestore(starter);
                      setSelectedProgramId(newId);
                    }
                  }
                : undefined
            }
            user={user}
            isAdmin={isAdmin}
            onBack={() => setSelectedProgramId(null)}
            onSignIn={handleSignIn}
          />
        ) : activeSection === 'catalogo' ? (
          <>
            {/* Top 4 Category Shortcut Boxes (Translucent Navy Glass + Cyan-to-Lime Gradient Border) */}
            <section aria-label="Categorías destacadas" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {FEATURED_CATEGORIES.map((cat) => {
                const IconComp = cat.icon;
                const isSelected = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setCategoryFilter((prev) =>
                        cat.id === 'Todos' ? 'Todos' : prev === cat.id ? 'Todos' : cat.id
                      )
                    }
                    className="group p-[1.5px] rounded-xl bg-gradient-to-r from-[#00A3FF] via-[#2ED8FF] to-[#7FE000] text-left transition-all hover:-translate-y-0.5 cursor-pointer shadow-[0_8px_24px_rgba(0,14,48,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FE000]"
                  >
                    <div
                      className={`h-full rounded-[10.5px] px-4 py-3.5 flex items-center gap-3.5 backdrop-blur-md transition-colors ${
                        isSelected
                          ? 'bg-[#09327A]/92'
                          : 'bg-[#041B47]/85 group-hover:bg-[#072863]/90'
                      }`}
                    >
                      <span className="w-9 h-9 rounded-lg bg-[#00A3FF]/15 border border-[#00A3FF]/40 flex items-center justify-center shrink-0">
                        <IconComp className="w-5 h-5 text-[#7FE000]" />
                      </span>
                      <span className="text-sm font-semibold text-white leading-tight">
                        {cat.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </section>

            {/* Catalog Section Header + Platform Underline Tabs (Windows / Android only) */}
            <section className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-sm">
                    Lo último en programas de venta de lotería
                  </h1>
                  {categoryFilter !== 'Todos' && (
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('Todos')}
                      className="text-xs font-semibold text-[#8CFF1A] hover:underline cursor-pointer"
                    >
                      {categoryFilter} (Ver todos)
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#7AD7FF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar programa..."
                      aria-label="Buscar programa"
                      className="w-full sm:w-64 pl-9 pr-3.5 py-2 text-sm bg-[#041B47]/80 backdrop-blur-md text-white placeholder:text-blue-200/65 border border-[#00A3FF]/35 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7FE000]/70 focus:border-[#00A3FF]"
                    />
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleNavigate('subir')}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-[0_4px_16px_rgba(127,224,0,0.3)]"
                    >
                      <PackagePlus className="w-4 h-4" />
                      Subir Programa
                    </button>
                  )}
                </div>
              </div>

              {/* Clean Platform Underline Tabs (Todos | Windows | Android) */}
              <div className="border-b border-white/15 flex items-center gap-6 overflow-x-auto">
                {['Todas', ...PROGRAM_PLATFORMS].map((plat) => {
                  const active = platformFilter === plat;
                  return (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => setPlatformFilter(plat)}
                      className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'border-[#7FE000] text-white font-semibold'
                          : 'border-transparent text-blue-100/75 hover:text-white'
                      }`}
                    >
                      {plat === 'Todas' ? 'Todos' : plat}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Starter notice strictly for owner */}
            {showingStarterFallback && isAdmin && (
              <div className="p-4 rounded-xl bg-[#041B47]/85 backdrop-blur-md border border-[#00A3FF]/35 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-lg">
                <p className="text-sm text-blue-50">
                  Mostrando los 6 programas base para Windows y Android. Sube tus propios programas con &quot;Subir Programa&quot;, impórtalos para editarlos u ocúltalos de la vista.
                </p>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleStarterVisibility(true)}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    Ocultar Ejemplos
                  </button>
                  <button
                    type="button"
                    disabled={importingAllStarter}
                    onClick={handleImportAllStarter}
                    className="px-4 py-2 text-xs font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    {importingAllStarter ? 'Importando...' : 'Importar Ejemplos para Editar'}
                  </button>
                </div>
              </div>
            )}

            {/* FIRST VISUAL ANCHOR: 6-Column Square Program Tiles */}
            {programsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                {[1, 2, 3, 4, 5, 6].map((idx) => (
                  <div key={idx} className="space-y-2.5 animate-pulse">
                    <div className="aspect-square bg-[#06245C]/70 rounded-2xl border border-[#00A3FF]/25" />
                    <div className="h-3 bg-[#06245C]/70 rounded w-1/2" />
                    <div className="h-4 bg-[#06245C]/70 rounded w-4/5" />
                  </div>
                ))}
              </div>
            ) : filteredPrograms.length === 0 ? (
              <div className="py-14 px-6 text-center bg-[#041B47]/85 backdrop-blur-md border border-dashed border-[#00A3FF]/45 rounded-2xl space-y-4 shadow-lg">
                <FolderArchive className="w-10 h-10 text-[#7AD7FF] mx-auto" />
                <div className="space-y-1">
                  <p className="text-base font-semibold text-white">
                    {programs.length === 0
                      ? 'Tu repositorio está listo para tus programas'
                      : 'No se encontraron programas con los filtros actuales'}
                  </p>
                  <p className="text-sm text-blue-100/80">
                    {programs.length === 0
                      ? 'Sube un programa y su imagen cuadrada para crear un botón de descarga directa.'
                      : 'Prueba seleccionando otra plataforma o limpiando la búsqueda.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleNavigate('subir')}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] rounded-lg cursor-pointer"
                    >
                      <PackagePlus className="w-4 h-4" />
                      Subir Programa
                    </button>
                  )}
                  {programs.length === 0 && hideStarter && isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleToggleStarterVisibility(false)}
                      className="px-4 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg cursor-pointer"
                    >
                      Mostrar Ejemplos Base
                    </button>
                  )}
                  {(searchQuery || categoryFilter !== 'Todos' || platformFilter !== 'Todas') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setCategoryFilter('Todos');
                        setPlatformFilter('Todas');
                      }}
                      className="px-4 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg cursor-pointer"
                    >
                      Limpiar Filtros
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <section
                aria-label="Catálogo de programas"
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5"
              >
                {filteredPrograms.map((prog) => {
                  const defaults = getDefaultMediaForProgram(prog.slug || prog.category);
                  const tileSrc = prog.imageUrl || prog.iconUrl || defaults.imageUrl;

                  return (
                    <article key={prog.id} className="flex flex-col">
                      {/* SQUARE FRAMED PROGRAM IMAGE-BUTTON */}
                      <button
                        type="button"
                        onClick={() => handleDirectDownload(prog)}
                        aria-label={`Descargar ${prog.name}`}
                        title={`Clic para descargar ${prog.name}`}
                        className="group relative aspect-square w-full bg-white/95 border border-[#00A3FF]/35 rounded-2xl p-3 shadow-[0_10px_28px_rgba(0,10,36,0.45)] hover:border-[#7FE000] hover:shadow-[0_14px_32px_rgba(0,163,255,0.35)] transition-all flex items-center justify-center overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FE000]"
                      >
                        <img
                          src={tileSrc}
                          alt={`Descargar ${prog.name}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover rounded-xl shadow-sm group-hover:scale-[1.04] transition-transform duration-200"
                        />
                        <span className="absolute inset-x-3 bottom-3 py-1.5 px-2.5 rounded-lg bg-[#031B49]/95 border border-[#00A3FF]/40 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shadow-md">
                          <Download className="w-3.5 h-3.5 text-[#7FE000]" />
                          Descargar
                        </span>
                      </button>

                      {/* Clean unboxed metadata row below square frame */}
                      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-[#7AD7FF] font-semibold tabular-nums truncate">
                          {prog.platform}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedProgramId(prog.id)}
                          className="font-semibold text-[#8CFF1A] hover:text-white cursor-pointer shrink-0"
                        >
                          Detalles
                        </button>
                      </div>

                      {/* Bold Program Title below */}
                      <h2
                        onClick={() => setSelectedProgramId(prog.id)}
                        className="mt-1 text-sm font-bold text-white leading-snug line-clamp-2 cursor-pointer hover:text-[#7AD7FF] transition-colors drop-shadow-sm"
                      >
                        {prog.name}
                      </h2>

                      {/* Owner Quick Inline Controls (only on Firestore programs when signed in as owner) */}
                      {isAdmin && !showingStarterFallback && (
                        <div className="mt-2 pt-2 border-t border-white/15 flex items-center justify-between gap-2 text-[11px]">
                          <label className="inline-flex items-center gap-1 font-medium text-[#7AD7FF] hover:text-white cursor-pointer">
                            <ImageIcon className="w-3 h-3" />
                            <span>{updatingImageId === prog.id ? '...' : 'Imagen'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={updatingImageId === prog.id}
                              onChange={(e) =>
                                handleCardImageReplace(prog, e.target.files?.[0] ?? null)
                              }
                              className="sr-only"
                            />
                          </label>

                          {confirmDeleteId === prog.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={deletingId === prog.id}
                                onClick={() => handleCardDelete(prog)}
                                className="px-1.5 py-0.5 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                              >
                                {deletingId === prog.id ? '...' : 'Sí'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 text-[11px] text-white bg-white/15 rounded cursor-pointer"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(prog.id)}
                              className="inline-flex items-center gap-1 font-medium text-rose-300 hover:text-rose-200 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              Eliminar
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </>
        ) : (
          <section className="bg-white/95 backdrop-blur-md text-[#0B1E3D] border border-[#00A3FF]/35 rounded-2xl p-6 sm:p-8 max-w-4xl mx-auto shadow-[0_16px_42px_rgba(0,12,42,0.45)]">
            <div className="pb-6 mb-6 border-b border-blue-100 flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0B1E3D]">
                  Subir Nuevo Programa al Repositorio
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Sube tu programa y su imagen cuadrada para publicarlo como botón de descarga directa.
                </p>
              </div>
              <ShieldCheck className="w-6 h-6 text-[#2F7D00] shrink-0" />
            </div>

            {!isAdmin ? (
              <div className="py-10 text-center space-y-4">
                <Lock className="w-8 h-8 text-[#0052CC]/60 mx-auto" />
                <p className="text-sm font-semibold text-[#0B1E3D]">
                  Acceso Exclusivo del Propietario
                </p>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Solo la cuenta propietaria de LOTEROSDESCARGAS tiene autorización para subir o modificar programas.
                </p>
                {!user && (
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0052CC] hover:bg-[#0041A8] rounded-lg transition-colors cursor-pointer"
                  >
                    Iniciar Sesión
                  </button>
                )}
              </div>
            ) : (
              <ProgramUploadForm
                onSuccess={() => {
                  setActiveSection('catalogo');
                  setSelectedProgramId(null);
                }}
                onCancel={() => handleNavigate('catalogo')}
              />
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-[#00A3FF]/25 bg-[#021230]/85 backdrop-blur-md mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-blue-100/80">
          <div className="flex items-center gap-3">
            <img
              src={LOGO_URL}
              alt="Loteros descargas"
              referrerPolicy="no-referrer"
              className="h-8 w-auto object-contain"
            />
            <span aria-hidden="true" className="text-white/25">
              |
            </span>
            <span>Repositorio de Programas de Venta de Lotería</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => handleNavigate('catalogo')}
              className="font-medium hover:text-[#7FE000] cursor-pointer"
            >
              Catálogo
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleNavigate('subir')}
                className="font-medium hover:text-[#7FE000] cursor-pointer"
              >
                Subir Programa
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
