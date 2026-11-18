import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Unsubscribe } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  DEFAULT_FEATURED_LINK,
  DEFAULT_PROGRAM_GROUPS,
  SCHEMA_LIMITS,
  SCHEMA_PATTERNS,
  type AutoUpdateCheckResponse,
  type CommentCategory,
  type ProgramCategory,
  type ProgramCommentRecord,
  type ProgramPlatform,
  type ProgramRecord,
  type ProgramStatus,
  type ProgramVersionRecord,
  type PromotionDisplayStyle,
  type PromotionPlacement,
  type PromotionPosition,
  type PromotionRecord,
  type PromotionStatus,
  type ReleaseChannel,
  type SiteSettingsRecord,
  type StarterProgramItem,
  type UploadPackageResult,
} from '../types/repository';
import { compareSemverDesc, makeSafeId, slugifyProgramName } from './format';

export function normalizeProgramGroup(
  raw: string | undefined | null,
  knownGroups: readonly string[] = []
): string {
  const cleaned = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, SCHEMA_LIMITS.PROGRAM_GROUP_MAX);
  if (!cleaned) return '';
  const lower = cleaned.toLowerCase();
  for (const existing of [...knownGroups, ...DEFAULT_PROGRAM_GROUPS]) {
    if (existing.trim().toLowerCase() === lower) {
      return existing.trim();
    }
  }
  return cleaned;
}

export function normalizeSortOrder(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return undefined;
  return Math.min(SCHEMA_LIMITS.SORT_ORDER_MAX, Math.max(0, Math.round(num)));
}

export async function checkAdminStatus(
  _uid: string,
  email: string | null,
  emailVerified: boolean
): Promise<boolean> {
  return Boolean(emailVerified && email === BOOTSTRAPPED_ADMIN_EMAIL);
}

type FirestoreRestField = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
};

function decodeRestField(val: FirestoreRestField | undefined): unknown {
  if (!val) return undefined;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.timestampValue !== undefined) {
    const ms = Date.parse(val.timestampValue);
    return Number.isFinite(ms) ? Timestamp.fromMillis(ms) : null;
  }
  return undefined;
}

async function runFirestoreRestQuery<T>(structuredQuery: Record<string, unknown>): Promise<T[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    throw new Error(`REST query failed (${res.status})`);
  }
  const rows = (await res.json()) as Array<{
    document?: { name?: string; fields?: Record<string, FirestoreRestField> };
  }>;
  const results: T[] = [];
  for (const row of rows) {
    if (!row.document?.fields) continue;
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row.document.fields)) {
      obj[k] = decodeRestField(v);
    }
    if (!obj.id && row.document.name) {
      obj.id = row.document.name.split('/').pop();
    }
    results.push(obj as T);
  }
  return results;
}

function sanitizeProgramRecord(raw: Partial<ProgramRecord> & { id?: string }, fallbackId = ''): ProgramRecord {
  const safeId = typeof raw.id === 'string' && raw.id ? raw.id : fallbackId || 'prog_unknown';
  const safeName = typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Programa';
  const safeSlug =
    typeof raw.slug === 'string' && raw.slug.trim()
      ? raw.slug
      : slugifyProgramName(safeName) || safeId;
  return {
    id: safeId,
    slug: safeSlug,
    name: safeName,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    category: (typeof raw.category === 'string' && raw.category ? raw.category : 'Banca Comercial') as ProgramCategory,
    platform: (typeof raw.platform === 'string' && raw.platform ? raw.platform : 'Windows') as ProgramPlatform,
    ...(typeof raw.programGroup === 'string' && raw.programGroup.trim()
      ? { programGroup: raw.programGroup.trim() }
      : {}),
    ...(typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder)
      ? { sortOrder: raw.sortOrder }
      : {}),
    iconUrl: typeof raw.iconUrl === 'string' ? raw.iconUrl : '',
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : '',
    latestVersion: typeof raw.latestVersion === 'string' && raw.latestVersion ? raw.latestVersion : '1.0.0',
    latestChannel: (typeof raw.latestChannel === 'string' && raw.latestChannel ? raw.latestChannel : 'Estable') as ReleaseChannel,
    downloadCount: typeof raw.downloadCount === 'number' && Number.isFinite(raw.downloadCount) ? raw.downloadCount : 0,
    commentCount: typeof raw.commentCount === 'number' && Number.isFinite(raw.commentCount) ? raw.commentCount : 0,
    autoUpdateEnabled: Boolean(raw.autoUpdateEnabled),
    status: (typeof raw.status === 'string' && raw.status ? raw.status : 'Activo') as ProgramStatus,
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : '',
    ownerName: typeof raw.ownerName === 'string' ? raw.ownerName : 'LOTEROSDESCARGAS',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function subscribePrograms(
  onData: (programs: ProgramRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'programs';
  const q = query(collection(db, path), where('status', 'in', ['Activo', 'Archivado']));
  let settledFromSnapshot = false;
  let cancelled = false;

  const sortPrograms = (items: ProgramRecord[]) => {
    items.sort((a, b) => {
      const sa = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
      const sb = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      const ta = a.createdAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
      if (tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });
    return items;
  };

  const fallbackTimer = setTimeout(() => {
    if (settledFromSnapshot || cancelled) return;
    void runFirestoreRestQuery<ProgramRecord>({
      from: [{ collectionId: 'programs' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'IN',
          value: {
            arrayValue: {
              values: [{ stringValue: 'Activo' }, { stringValue: 'Archivado' }],
            },
          },
        },
      },
    })
      .then((items) => {
        if (!settledFromSnapshot && !cancelled) {
          onData(sortPrograms(items.map((item) => sanitizeProgramRecord(item))));
        }
      })
      .catch(() => {
        // Snapshot listener remains active and handles retries/errors
      });
  }, 7000);

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      settledFromSnapshot = true;
      clearTimeout(fallbackTimer);
      const items = snapshot.docs.map((d) =>
        sanitizeProgramRecord(d.data() as Partial<ProgramRecord>, d.id)
      );
      onData(sortPrograms(items));
    },
    (error) => {
      clearTimeout(fallbackTimer);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  return () => {
    cancelled = true;
    clearTimeout(fallbackTimer);
    unsub();
  };
}

function sortProgramVersions(items: ProgramVersionRecord[]): ProgramVersionRecord[] {
  items.sort((a, b) => {
    if (a.isLatest !== b.isLatest) return a.isLatest ? -1 : 1;
    return compareSemverDesc(a.version || '0.0.0', b.version || '0.0.0');
  });
  return items;
}

export async function fetchProgramVersionsOnce(programId: string): Promise<ProgramVersionRecord[]> {
  const path = `programs/${programId}/versions`;
  const q = query(collection(db, path), where('programId', '==', programId));
  try {
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => d.data() as ProgramVersionRecord);
    return sortProgramVersions(items);
  } catch {
    try {
      const items = await runFirestoreRestQuery<ProgramVersionRecord>({
        from: [{ collectionId: 'versions' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'programId' },
            op: 'EQUAL',
            value: { stringValue: programId },
          },
        },
      });
      return sortProgramVersions(items);
    } catch {
      return [];
    }
  }
}

export function subscribeProgramVersions(
  programId: string,
  onData: (versions: ProgramVersionRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `programs/${programId}/versions`;
  const q = query(collection(db, path), where('programId', '==', programId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as ProgramVersionRecord);
      onData(sortProgramVersions(items));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeProgramComments(
  programId: string,
  onData: (comments: ProgramCommentRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `programs/${programId}/comments`;
  const q = query(collection(db, path), where('programId', '==', programId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as ProgramCommentRecord);
      items.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function fetchStarterCatalog(): Promise<StarterProgramItem[]> {
  const res = await fetch('/api/starter-catalog');
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: StarterProgramItem[] };
  return data.items ?? [];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

async function parseJsonResponse<T>(
  response: Response,
  fallbackError: string,
  endpointLabel: string
): Promise<T> {
  const rawText = await response.text();
  let data: unknown = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      if (response.status === 413) {
        throw new Error('El archivo excedió el límite de tamaño de la petición HTTP.');
      }
      const titleMatch = rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
      const hint = titleMatch ? ` — ${titleMatch[1].trim()}` : '';
      throw new Error(
        `El servidor respondió con formato no-JSON en ${endpointLabel} (HTTP ${response.status}${hint}). Recarga la página e intenta de nuevo.`
      );
    }
  }
  if (!response.ok) {
    const errMsg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `${fallbackError} (HTTP ${response.status})`;
    throw new Error(errMsg);
  }
  return (data ?? {}) as T;
}

const MAX_PERSISTENT_DATA_URL_CHARS = 280_000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.readAsDataURL(blob);
  });
}

async function encodeImageToPersistentDataUrl(
  file: File,
  kind: 'icon' | 'cover' | 'banner' | 'skyscraper' | 'rectangulo' | 'vertical'
): Promise<string | null> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif' || file.type === 'image/x-icon') {
    const direct = await blobToDataUrl(file);
    return direct.length <= MAX_PERSISTENT_DATA_URL_CHARS ? direct : null;
  }

  return new Promise<string | null>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxWidth =
        kind === 'banner'
          ? 1280
          : kind === 'skyscraper'
            ? 320
            : kind === 'rectangulo'
              ? 960
              : kind === 'vertical'
                ? 720
                : 600;
      const maxHeight =
        kind === 'banner'
          ? 640
          : kind === 'skyscraper'
            ? 1200
            : kind === 'rectangulo'
              ? 720
              : kind === 'vertical'
                ? 1440
                : 600;
      let scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
      const qualities = [0.88, 0.78, 0.66, 0.54, 0.42];

      const attemptDraw = (currentScale: number): string | null => {
        const width = Math.max(1, Math.round(img.width * currentScale));
        const height = Math.max(1, Math.round(img.height * currentScale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, width, height);

        for (const q of qualities) {
          const webp = canvas.toDataURL('image/webp', q);
          if (webp.startsWith('data:image/webp') && webp.length <= MAX_PERSISTENT_DATA_URL_CHARS) {
            return webp;
          }
        }
        const jpeg = canvas.toDataURL('image/jpeg', 0.72);
        if (jpeg.length <= MAX_PERSISTENT_DATA_URL_CHARS) {
          return jpeg;
        }
        return null;
      };

      let encoded = attemptDraw(scale);
      if (!encoded) {
        encoded = attemptDraw(scale * 0.72);
      }
      resolve(encoded);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

async function prepareImageForUpload(file: File): Promise<File> {
  const maxDirectBytes = 900 * 1024;
  if (
    file.size <= maxDirectBytes ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif' ||
    file.type === 'image/x-icon'
  ) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagen';
          resolve(new File([blob], `${baseName}.webp`, { type: 'image/webp' }));
        },
        'image/webp',
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export async function uploadMediaImage(
  file: File,
  kind: 'icon' | 'cover' | 'banner' | 'skyscraper' | 'rectangulo' | 'vertical'
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Debes iniciar sesión como administrador para subir imágenes.');

  const persistentDataUrl = await encodeImageToPersistentDataUrl(file, kind);
  if (persistentDataUrl) {
    return persistentDataUrl;
  }

  const token = await user.getIdToken();
  const readyFile = await prepareImageForUpload(file);
  const base64Data = await blobToBase64(readyFile);

  const response = await fetch('/api/upload-media-json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Auth': token,
    },
    body: JSON.stringify({
      kind,
      fileName: readyFile.name,
      base64Data,
    }),
  });

  const data = await parseJsonResponse<{ mediaUrl: string }>(
    response,
    'Error subiendo la imagen.',
    '/api/upload-media-json'
  );
  return data.mediaUrl;
}

const CHUNK_SIZE_BYTES = 512 * 1024; // 512 KB raw binary per request (safe under 1 MB proxy limit)
const CHUNK_CONCURRENCY = 3;

async function uploadSingleChunkWithRetry(
  slice: Blob,
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  getToken: (forceRefresh?: boolean) => Promise<string>
): Promise<void> {
  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const forceRefresh = attempt > 0;
    const token = await getToken(forceRefresh);

    // On final retry after a 403/415 on binary endpoint, try JSON base64 fallback
    const useJsonFallback = attempt === maxAttempts - 1 && lastError?.message.includes('HTTP 403');

    try {
      const response = useJsonFallback
        ? await fetch('/api/upload-chunk-json', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Firebase-Auth': token,
            },
            body: JSON.stringify({
              uploadId,
              chunkIndex,
              base64Data: await blobToBase64(slice),
            }),
          })
        : await fetch(
            `/api/upload-chunk-bin?uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${chunkIndex}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'X-Firebase-Auth': token,
              },
              body: slice,
            }
          );

      await parseJsonResponse<{ received: boolean }>(
        response,
        `Error subiendo fragmento ${chunkIndex + 1} de ${totalChunks}.`,
        useJsonFallback ? '/api/upload-chunk-json' : '/api/upload-chunk-bin'
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        const delayMs = 600 * (attempt + 1);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastError ?? new Error(`Error subiendo fragmento ${chunkIndex + 1} de ${totalChunks}.`);
}

export async function uploadBinaryPackage(
  file: File,
  slug: string,
  version: string,
  onProgress?: (percent: number) => void
): Promise<UploadPackageResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Debes iniciar sesión como administrador para subir archivos.');

  let cachedToken = await user.getIdToken();
  const getToken = async (forceRefresh = false): Promise<string> => {
    if (forceRefresh) {
      cachedToken = await user.getIdToken(true);
    }
    return cachedToken;
  };

  const uploadId = makeSafeId('upl');
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));
  let completedChunks = 0;
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const chunkIndex = nextIndex++;
      if (chunkIndex >= totalChunks) return;

      const start = chunkIndex * CHUNK_SIZE_BYTES;
      const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
      const slice = file.slice(start, end);

      await uploadSingleChunkWithRetry(slice, uploadId, chunkIndex, totalChunks, getToken);

      completedChunks++;
      const pct = Math.min(95, Math.round((completedChunks / totalChunks) * 95));
      onProgress?.(pct);
    }
  };

  const workers = Array.from({ length: Math.min(CHUNK_CONCURRENCY, totalChunks) }, () => worker());
  await Promise.all(workers);

  const finalToken = await user.getIdToken(true);
  const finalizeRes = await fetch('/api/upload-finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Auth': finalToken,
    },
    body: JSON.stringify({
      uploadId,
      totalChunks,
      slug,
      version,
      fileName: file.name,
    }),
  });

  const result = await parseJsonResponse<UploadPackageResult>(
    finalizeRes,
    'Error finalizando la subida del programa.',
    '/api/upload-finalize'
  );
  onProgress?.(100);
  return result;
}

export async function signExternalRelease(
  slug: string,
  version: string,
  sha256: string,
  fileSizeBytes: number
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Debes iniciar sesión como administrador.');
  const token = await user.getIdToken();

  const response = await fetch('/api/sign-external', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Auth': token,
    },
    body: JSON.stringify({ slug, version, sha256, fileSizeBytes }),
  });

  const data = await parseJsonResponse<{ signature: string }>(
    response,
    'No se pudo firmar la versión externa.',
    '/api/sign-external'
  );
  return data.signature;
}

export interface CreateProgramInput {
  name: string;
  slug?: string;
  summary: string;
  description: string;
  category: ProgramCategory;
  platform: ProgramPlatform;
  programGroup?: string;
  sortOrder?: number;
  iconUrl: string;
  imageUrl: string;
  autoUpdateEnabled: boolean;
  initialVersion: {
    version: string;
    channel: ReleaseChannel;
    fileName: string;
    fileSizeBytes: number;
    downloadUrl: string;
    sha256: string;
    signature: string;
    changelog: string;
    minOs: string;
    mandatory: boolean;
  };
}

export async function createProgramWithInitialVersion(input: CreateProgramInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión requerida.');

  const programId = makeSafeId('prog');
  const versionId = makeSafeId('ver');
  const cleanSlug = (input.slug ? slugifyProgramName(input.slug) : slugifyProgramName(input.name)).slice(
    0,
    SCHEMA_LIMITS.SLUG_MAX
  );

  if (!SCHEMA_PATTERNS.SLUG.test(cleanSlug) || cleanSlug.length < SCHEMA_LIMITS.SLUG_MIN) {
    throw new Error('El identificador (slug) debe contener al menos 2 caracteres alfanuméricos.');
  }
  if (!SCHEMA_PATTERNS.SEMVER.test(input.initialVersion.version.trim())) {
    throw new Error('La versión debe usar formato semántico (ej. 1.0.0 o 2.4.1-beta).');
  }
  if (!SCHEMA_PATTERNS.SHA256.test(input.initialVersion.sha256.trim())) {
    throw new Error('El hash SHA-256 debe tener exactamente 64 caracteres hexadecimales.');
  }

  const batch = writeBatch(db);
  const programRef = doc(db, 'programs', programId);
  const versionRef = doc(db, 'programs', programId, 'versions', versionId);

  const ownerName = (user.displayName || user.email?.split('@')[0] || 'Administrador').slice(
    0,
    SCHEMA_LIMITS.OWNER_NAME_MAX
  );
  const cleanGroup = normalizeProgramGroup(input.programGroup);
  const cleanSortOrder = normalizeSortOrder(input.sortOrder);

  batch.set(programRef, {
    id: programId,
    slug: cleanSlug,
    name: input.name.trim().slice(0, SCHEMA_LIMITS.NAME_MAX),
    summary: input.summary.trim().slice(0, SCHEMA_LIMITS.SUMMARY_MAX),
    description: input.description.trim().slice(0, SCHEMA_LIMITS.DESCRIPTION_MAX),
    category: input.category,
    platform: input.platform,
    ...(cleanGroup ? { programGroup: cleanGroup } : {}),
    ...(cleanSortOrder !== undefined ? { sortOrder: cleanSortOrder } : {}),
    iconUrl: input.iconUrl.trim().slice(0, SCHEMA_LIMITS.MEDIA_URL_MAX),
    imageUrl: input.imageUrl.trim().slice(0, SCHEMA_LIMITS.MEDIA_URL_MAX),
    latestVersion: input.initialVersion.version.trim().slice(0, SCHEMA_LIMITS.VERSION_MAX),
    latestChannel: input.initialVersion.channel,
    downloadCount: 0,
    commentCount: 0,
    autoUpdateEnabled: Boolean(input.autoUpdateEnabled),
    status: 'Activo' as ProgramStatus,
    ownerId: user.uid,
    ownerName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(versionRef, {
    id: versionId,
    programId,
    version: input.initialVersion.version.trim().slice(0, SCHEMA_LIMITS.VERSION_MAX),
    channel: input.initialVersion.channel,
    fileName: input.initialVersion.fileName.trim().slice(0, SCHEMA_LIMITS.FILENAME_MAX),
    fileSizeBytes: Math.max(0, Math.round(input.initialVersion.fileSizeBytes)),
    downloadUrl: input.initialVersion.downloadUrl.trim().slice(0, SCHEMA_LIMITS.URL_MAX),
    sha256: input.initialVersion.sha256.trim().toLowerCase(),
    signature: input.initialVersion.signature.trim().toLowerCase(),
    changelog: input.initialVersion.changelog.trim().slice(0, SCHEMA_LIMITS.CHANGELOG_MAX),
    minOs: input.initialVersion.minOs.trim().slice(0, SCHEMA_LIMITS.MIN_OS_MAX),
    mandatory: Boolean(input.initialVersion.mandatory),
    isLatest: true,
    revoked: false,
    downloads: 0,
    authorId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return programId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `programs/${programId}`);
  }
}

export interface PublishVersionInput {
  program: ProgramRecord;
  version: string;
  channel: ReleaseChannel;
  fileName: string;
  fileSizeBytes: number;
  downloadUrl: string;
  sha256: string;
  signature: string;
  changelog: string;
  minOs: string;
  mandatory: boolean;
  setAsLatest: boolean;
}

export async function publishNewVersion(input: PublishVersionInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión de administrador requerida.');

  const cleanVer = input.version.trim().slice(0, SCHEMA_LIMITS.VERSION_MAX);
  if (!SCHEMA_PATTERNS.SEMVER.test(cleanVer)) {
    throw new Error('La versión debe usar formato semántico (ej. 2.5.0).');
  }
  if (!SCHEMA_PATTERNS.SHA256.test(input.sha256.trim())) {
    throw new Error('El hash SHA-256 debe tener exactamente 64 caracteres hexadecimales.');
  }

  const versionId = makeSafeId('ver');
  const batch = writeBatch(db);
  const versionsPath = `programs/${input.program.id}/versions`;

  if (input.setAsLatest) {
    const existingSnap = await getDocs(
      query(collection(db, versionsPath), where('programId', '==', input.program.id))
    );
    existingSnap.forEach((docSnap) => {
      const data = docSnap.data() as ProgramVersionRecord;
      if (data.isLatest) {
        batch.update(docSnap.ref, {
          isLatest: false,
          updatedAt: serverTimestamp(),
        });
      }
    });

    batch.update(doc(db, 'programs', input.program.id), {
      latestVersion: cleanVer,
      latestChannel: input.channel,
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(doc(db, versionsPath, versionId), {
    id: versionId,
    programId: input.program.id,
    version: cleanVer,
    channel: input.channel,
    fileName: input.fileName.trim().slice(0, SCHEMA_LIMITS.FILENAME_MAX),
    fileSizeBytes: Math.max(0, Math.round(input.fileSizeBytes)),
    downloadUrl: input.downloadUrl.trim().slice(0, SCHEMA_LIMITS.URL_MAX),
    sha256: input.sha256.trim().toLowerCase(),
    signature: input.signature.trim().toLowerCase(),
    changelog: input.changelog.trim().slice(0, SCHEMA_LIMITS.CHANGELOG_MAX),
    minOs: input.minOs.trim().slice(0, SCHEMA_LIMITS.MIN_OS_MAX),
    mandatory: Boolean(input.mandatory),
    isLatest: Boolean(input.setAsLatest),
    revoked: false,
    downloads: 0,
    authorId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return versionId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${versionsPath}/${versionId}`);
  }
}

export async function promoteVersionAsLatest(
  program: ProgramRecord,
  targetVersion: ProgramVersionRecord,
  allVersions: ProgramVersionRecord[]
): Promise<void> {
  const batch = writeBatch(db);
  const versionsPath = `programs/${program.id}/versions`;

  for (const v of allVersions) {
    if (v.id !== targetVersion.id && v.isLatest) {
      batch.update(doc(db, versionsPath, v.id), {
        isLatest: false,
        updatedAt: serverTimestamp(),
      });
    }
  }

  batch.update(doc(db, versionsPath, targetVersion.id), {
    isLatest: true,
    revoked: false,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'programs', program.id), {
    latestVersion: targetVersion.version,
    latestChannel: targetVersion.channel,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `programs/${program.id}`);
  }
}

export async function setVersionRevoked(
  programId: string,
  versionId: string,
  revoked: boolean
): Promise<void> {
  const path = `programs/${programId}/versions/${versionId}`;
  try {
    await updateDoc(doc(db, 'programs', programId, 'versions', versionId), {
      revoked,
      ...(revoked ? { isLatest: false } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateProgramSettings(
  programId: string,
  patch: Partial<
    Pick<
      ProgramRecord,
      | 'name'
      | 'summary'
      | 'description'
      | 'category'
      | 'platform'
      | 'programGroup'
      | 'sortOrder'
      | 'iconUrl'
      | 'imageUrl'
      | 'autoUpdateEnabled'
      | 'status'
    >
  >
): Promise<void> {
  const path = `programs/${programId}`;
  const cleanPatch: Record<string, unknown> = { ...patch };
  if (patch.programGroup !== undefined) {
    cleanPatch.programGroup = normalizeProgramGroup(patch.programGroup);
  }
  if (patch.sortOrder !== undefined) {
    const cleanOrder = normalizeSortOrder(patch.sortOrder);
    if (cleanOrder !== undefined) {
      cleanPatch.sortOrder = cleanOrder;
    } else {
      delete cleanPatch.sortOrder;
    }
  }
  try {
    await updateDoc(doc(db, 'programs', programId), {
      ...cleanPatch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function batchUpdateProgramOrder(
  updates: Array<{ id: string; sortOrder: number; programGroup?: string }>
): Promise<void> {
  if (updates.length === 0) return;
  const batch = writeBatch(db);
  for (const item of updates) {
    const cleanOrder = normalizeSortOrder(item.sortOrder) ?? 0;
    const payload: Record<string, unknown> = {
      sortOrder: cleanOrder,
      updatedAt: serverTimestamp(),
    };
    if (item.programGroup !== undefined) {
      payload.programGroup = normalizeProgramGroup(item.programGroup);
    }
    batch.update(doc(db, 'programs', item.id), payload);
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'programs');
  }
}

export async function deleteProgramAndSubcollections(
  programId: string,
  slug?: string
): Promise<void> {
  const path = `programs/${programId}`;
  try {
    const versionsSnap = await getDocs(
      query(collection(db, 'programs', programId, 'versions'), where('programId', '==', programId))
    );
    const commentsSnap = await getDocs(
      query(collection(db, 'programs', programId, 'comments'), where('programId', '==', programId))
    );
    const batch = writeBatch(db);
    versionsSnap.forEach((d) => batch.delete(d.ref));
    commentsSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'programs', programId));
    await batch.commit();

    if (slug && auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        await fetch(`/api/programs-files/${encodeURIComponent(slug)}`, {
          method: 'DELETE',
          headers: { 'X-Firebase-Auth': token },
        });
      } catch {
        // Non-blocking binary cleanup
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteProgramVersion(
  program: ProgramRecord,
  targetVersion: ProgramVersionRecord,
  allVersions: ProgramVersionRecord[]
): Promise<void> {
  const path = `programs/${program.id}/versions/${targetVersion.id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'programs', program.id, 'versions', targetVersion.id));

    if (targetVersion.isLatest) {
      const remaining = allVersions
        .filter((v) => v.id !== targetVersion.id && !v.revoked)
        .sort((a, b) => compareSemverDesc(a.version, b.version));
      const fallback = remaining[0];
      if (fallback) {
        batch.update(doc(db, 'programs', program.id, 'versions', fallback.id), {
          isLatest: true,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'programs', program.id), {
          latestVersion: fallback.version,
          latestChannel: fallback.channel,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function recordProgramDownload(
  program: ProgramRecord,
  version: ProgramVersionRecord
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  const batch = writeBatch(db);
  batch.update(doc(db, 'programs', program.id), {
    downloadCount: program.downloadCount + 1,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'programs', program.id, 'versions', version.id), {
    downloads: version.downloads + 1,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `programs/${program.id}`);
  }
}

export async function createComment(input: {
  program: ProgramRecord;
  versionTag: string;
  category: CommentCategory;
  rating: number;
  body: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Inicia sesión con Google para publicar un comentario.');

  const commentId = makeSafeId('cmt');
  const batch = writeBatch(db);
  const commentRef = doc(db, 'programs', input.program.id, 'comments', commentId);
  const programRef = doc(db, 'programs', input.program.id);

  const authorName = (user.displayName || user.email?.split('@')[0] || 'Usuario').slice(
    0,
    SCHEMA_LIMITS.OWNER_NAME_MAX
  );

  batch.set(commentRef, {
    id: commentId,
    programId: input.program.id,
    authorId: user.uid,
    authorName,
    versionTag: input.versionTag.trim().slice(0, SCHEMA_LIMITS.VERSION_MAX),
    category: input.category,
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    body: input.body.trim().slice(0, SCHEMA_LIMITS.COMMENT_BODY_MAX),
    pinned: false,
    adminReply: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(programRef, {
    commentCount: input.program.commentCount + 1,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `programs/${input.program.id}/comments/${commentId}`);
  }
}

export async function moderateComment(
  programId: string,
  commentId: string,
  patch: { pinned?: boolean; adminReply?: string }
): Promise<void> {
  const path = `programs/${programId}/comments/${commentId}`;
  try {
    await updateDoc(doc(db, 'programs', programId, 'comments', commentId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteComment(programId: string, commentId: string): Promise<void> {
  const path = `programs/${programId}/comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'programs', programId, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function checkAutoUpdate(
  slug: string,
  currentVersion: string
): Promise<AutoUpdateCheckResponse> {
  const res = await fetch(
    `/api/updates/${encodeURIComponent(slug)}/check?currentVersion=${encodeURIComponent(currentVersion)}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Error consultando el servidor de actualizaciones.');
  }
  return data as AutoUpdateCheckResponse;
}

export async function verifyUpdateSignature(payload: {
  slug: string;
  version: string;
  sha256: string;
  fileSizeBytes: number;
  signature: string;
}): Promise<{ valid: boolean; algorithm: string; expectedPrefix?: string }> {
  const res = await fetch('/api/updates/verify-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { valid: boolean; algorithm: string; expectedPrefix?: string };
}

export function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    throw new Error('Por seguridad, ingresa una dirección web válida (https://...).');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.slice(0, SCHEMA_LIMITS.URL_MAX);
  }
  return `https://${trimmed}`.slice(0, SCHEMA_LIMITS.URL_MAX);
}

export function subscribeSiteSettings(
  onData: (settings: SiteSettingsRecord) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'siteSettings/main';
  return onSnapshot(
    doc(db, 'siteSettings', 'main'),
    (snap) => {
      if (!snap.exists()) {
        onData({
          id: 'main',
          featuredLinkLabel: DEFAULT_FEATURED_LINK.label,
          featuredLinkUrl: DEFAULT_FEATURED_LINK.url,
          featuredLinkImageUrl: DEFAULT_FEATURED_LINK.imageUrl,
          updatedBy: '',
        });
        return;
      }
      const data = snap.data() as SiteSettingsRecord;
      onData({
        ...data,
        featuredLinkImageUrl: data.featuredLinkImageUrl || '',
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveFeaturedLinkSettings(input: {
  label: string;
  url: string;
  imageUrl?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión de administrador requerida.');

  const cleanLabel = input.label.trim().slice(0, SCHEMA_LIMITS.SITE_LINK_LABEL_MAX);
  const cleanUrl = normalizeExternalUrl(input.url);
  const cleanImageUrl = (input.imageUrl ?? '').trim().slice(0, SCHEMA_LIMITS.MEDIA_URL_MAX);

  if (cleanLabel.length < 2) {
    throw new Error('El texto del botón debe tener al menos 2 caracteres.');
  }
  if (cleanUrl.length < 8) {
    throw new Error('Ingresa una dirección web válida (ej. pizarraanimalspot.ai.studio).');
  }

  const ref = doc(db, 'siteSettings', 'main');
  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        id: 'main',
        featuredLinkLabel: cleanLabel,
        featuredLinkUrl: cleanUrl,
        featuredLinkImageUrl: cleanImageUrl,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        featuredLinkLabel: cleanLabel,
        featuredLinkUrl: cleanUrl,
        featuredLinkImageUrl: cleanImageUrl,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'siteSettings/main');
  }
}

export function subscribePromotions(
  includePaused: boolean,
  onData: (promotions: PromotionRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'promotions';
  let activeItems: PromotionRecord[] = [];
  let pausedItems: PromotionRecord[] = [];
  let settledActiveSnapshot = false;
  let cancelled = false;

  const emitMerged = () => {
    const byId = new Map<string, PromotionRecord>();
    for (const item of [...activeItems, ...pausedItems]) {
      byId.set(item.id, {
        ...item,
        position: item.position ?? 'bajo_logo',
        displayStyle: item.displayStyle ?? 'fija',
      });
    }
    const merged = Array.from(byId.values());
    merged.sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
      const tb = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
    onData(merged);
  };

  const activeFallbackTimer = setTimeout(() => {
    if (settledActiveSnapshot || cancelled) return;
    void runFirestoreRestQuery<PromotionRecord>({
      from: [{ collectionId: 'promotions' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op: 'EQUAL',
          value: { stringValue: 'Activo' },
        },
      },
    })
      .then((items) => {
        if (!settledActiveSnapshot && !cancelled) {
          activeItems = items;
          emitMerged();
        }
      })
      .catch(() => {
        // Snapshot listener remains active
      });
  }, 3500);

  const activeQuery = query(collection(db, path), where('status', '==', 'Activo'));
  const unsubActive = onSnapshot(
    activeQuery,
    (snapshot) => {
      settledActiveSnapshot = true;
      clearTimeout(activeFallbackTimer);
      activeItems = snapshot.docs.map((d) => d.data() as PromotionRecord);
      emitMerged();
    },
    (error) => {
      clearTimeout(activeFallbackTimer);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  if (!includePaused) {
    return () => {
      cancelled = true;
      clearTimeout(activeFallbackTimer);
      unsubActive();
    };
  }

  const pausedQuery = query(collection(db, path), where('status', '==', 'Pausado'));
  const unsubPaused = onSnapshot(
    pausedQuery,
    (snapshot) => {
      pausedItems = snapshot.docs.map((d) => d.data() as PromotionRecord);
      emitMerged();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );

  return () => {
    cancelled = true;
    clearTimeout(activeFallbackTimer);
    unsubActive();
    unsubPaused();
  };
}

export async function createPromotion(input: {
  title: string;
  subtitle: string;
  badgeText: string;
  imageUrl: string;
  linkUrl: string;
  placement: PromotionPlacement;
  position?: PromotionPosition;
  displayStyle?: PromotionDisplayStyle;
  status: PromotionStatus;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión de administrador requerida.');

  const cleanTitle = input.title.trim().slice(0, SCHEMA_LIMITS.PROMO_TITLE_MAX);
  if (cleanTitle.length < 2) {
    throw new Error('Escribe un título para la publicidad (mínimo 2 caracteres).');
  }

  const cleanLink = input.linkUrl.trim() ? normalizeExternalUrl(input.linkUrl) : '';
  const promoId = makeSafeId('ad');

  try {
    await setDoc(doc(db, 'promotions', promoId), {
      id: promoId,
      title: cleanTitle,
      subtitle: input.subtitle.trim().slice(0, SCHEMA_LIMITS.PROMO_SUBTITLE_MAX),
      badgeText: input.badgeText.trim().slice(0, SCHEMA_LIMITS.PROMO_BADGE_MAX),
      imageUrl: input.imageUrl.trim().slice(0, SCHEMA_LIMITS.MEDIA_URL_MAX),
      linkUrl: cleanLink,
      placement: input.placement,
      position: input.position ?? 'bajo_logo',
      displayStyle: input.displayStyle ?? 'fija',
      status: input.status,
      ownerId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return promoId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `promotions/${promoId}`);
  }
}

export async function updatePromotion(
  promoId: string,
  patch: Partial<{
    title: string;
    subtitle: string;
    badgeText: string;
    imageUrl: string;
    linkUrl: string;
    placement: PromotionPlacement;
    position: PromotionPosition;
    displayStyle: PromotionDisplayStyle;
    status: PromotionStatus;
  }>
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (patch.title !== undefined) {
    const t = patch.title.trim().slice(0, SCHEMA_LIMITS.PROMO_TITLE_MAX);
    if (t.length < 2) throw new Error('El título debe tener al menos 2 caracteres.');
    payload.title = t;
  }
  if (patch.subtitle !== undefined) {
    payload.subtitle = patch.subtitle.trim().slice(0, SCHEMA_LIMITS.PROMO_SUBTITLE_MAX);
  }
  if (patch.badgeText !== undefined) {
    payload.badgeText = patch.badgeText.trim().slice(0, SCHEMA_LIMITS.PROMO_BADGE_MAX);
  }
  if (patch.imageUrl !== undefined) {
    payload.imageUrl = patch.imageUrl.trim().slice(0, SCHEMA_LIMITS.MEDIA_URL_MAX);
  }
  if (patch.linkUrl !== undefined) {
    payload.linkUrl = patch.linkUrl.trim() ? normalizeExternalUrl(patch.linkUrl) : '';
  }
  if (patch.placement !== undefined) {
    payload.placement = patch.placement;
  }
  if (patch.position !== undefined) {
    payload.position = patch.position;
  }
  if (patch.displayStyle !== undefined) {
    payload.displayStyle = patch.displayStyle;
  }
  if (patch.status !== undefined) {
    payload.status = patch.status;
  }

  try {
    await updateDoc(doc(db, 'promotions', promoId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `promotions/${promoId}`);
  }
}

export async function deletePromotion(promoId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'promotions', promoId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `promotions/${promoId}`);
  }
}
