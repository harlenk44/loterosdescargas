import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
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
  type ReleaseChannel,
  type StarterProgramItem,
  type UploadPackageResult,
} from '../types/repository';
import { compareSemverDesc, makeSafeId, slugifyProgramName } from './format';

export async function checkAdminStatus(
  _uid: string,
  email: string | null,
  emailVerified: boolean
): Promise<boolean> {
  return Boolean(emailVerified && email === BOOTSTRAPPED_ADMIN_EMAIL);
}

export function subscribePrograms(
  onData: (programs: ProgramRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'programs';
  const q = query(collection(db, path), where('status', 'in', ['Activo', 'Archivado']));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => d.data() as ProgramRecord);
      items.sort((a, b) => {
        const ta = a.updatedAt?.toMillis?.() ?? 0;
        const tb = b.updatedAt?.toMillis?.() ?? 0;
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
      items.sort((a, b) => {
        if (a.isLatest !== b.isLatest) return a.isLatest ? -1 : 1;
        return compareSemverDesc(a.version, b.version);
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

export async function uploadMediaImage(file: File, kind: 'icon' | 'cover'): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Debes iniciar sesión como administrador para subir imágenes.');
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

const CHUNK_SIZE_BYTES = 512 * 1024; // 512 KB binary (~682 KB base64 JSON) per request

export async function uploadBinaryPackage(
  file: File,
  slug: string,
  version: string,
  onProgress?: (percent: number) => void
): Promise<UploadPackageResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Debes iniciar sesión como administrador para subir archivos.');
  const token = await user.getIdToken();

  const uploadId = makeSafeId('upl');
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE_BYTES;
    const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
    const slice = file.slice(start, end);
    const base64Data = await blobToBase64(slice);

    const chunkRes = await fetch('/api/upload-chunk-json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-Auth': token,
      },
      body: JSON.stringify({
        uploadId,
        chunkIndex,
        base64Data,
      }),
    });

    await parseJsonResponse<{ received: boolean }>(
      chunkRes,
      `Error subiendo fragmento ${chunkIndex + 1} de ${totalChunks}.`,
      '/api/upload-chunk-json'
    );

    const pct = Math.min(95, Math.round(((chunkIndex + 1) / totalChunks) * 95));
    onProgress?.(pct);
  }

  const finalizeRes = await fetch('/api/upload-finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-Auth': token,
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

  batch.set(programRef, {
    id: programId,
    slug: cleanSlug,
    name: input.name.trim().slice(0, SCHEMA_LIMITS.NAME_MAX),
    summary: input.summary.trim().slice(0, SCHEMA_LIMITS.SUMMARY_MAX),
    description: input.description.trim().slice(0, SCHEMA_LIMITS.DESCRIPTION_MAX),
    category: input.category,
    platform: input.platform,
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
      'name' | 'summary' | 'description' | 'category' | 'platform' | 'iconUrl' | 'imageUrl' | 'autoUpdateEnabled' | 'status'
    >
  >
): Promise<void> {
  const path = `programs/${programId}`;
  try {
    await updateDoc(doc(db, 'programs', programId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
