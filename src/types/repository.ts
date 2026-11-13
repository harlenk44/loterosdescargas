import type { Timestamp } from 'firebase/firestore';

export const PROGRAM_CATEGORIES = [
  'Programas de Venta',
  'Impresión Térmica',
  'Utilidades y Drivers',
] as const;

export const PROGRAM_PLATFORMS = [
  'Windows',
  'Android',
] as const;

export const RELEASE_CHANNELS = ['Estable', 'Beta', 'Parche Crítico'] as const;

export const COMMENT_CATEGORIES = [
  'Opinión',
  'Soporte',
  'Reporte de Error',
  'Sugerencia',
] as const;

export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number];
export type ProgramPlatform = (typeof PROGRAM_PLATFORMS)[number];
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];
export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];
export type ProgramStatus = 'Activo' | 'Archivado';

// Synchronized verbatim with firebase-blueprint.json
export const SCHEMA_LIMITS = {
  ID_MAX: 128,
  SLUG_MIN: 2,
  SLUG_MAX: 80,
  NAME_MIN: 2,
  NAME_MAX: 100,
  SUMMARY_MIN: 5,
  SUMMARY_MAX: 240,
  DESCRIPTION_MIN: 10,
  DESCRIPTION_MAX: 4000,
  MEDIA_URL_MAX: 500,
  VERSION_MAX: 32,
  FILENAME_MAX: 180,
  URL_MAX: 500,
  CHANGELOG_MIN: 3,
  CHANGELOG_MAX: 3000,
  MIN_OS_MAX: 80,
  OWNER_NAME_MAX: 80,
  COMMENT_BODY_MIN: 3,
  COMMENT_BODY_MAX: 1200,
  ADMIN_REPLY_MAX: 1000,
} as const;

export const SCHEMA_PATTERNS = {
  ID: /^[a-zA-Z0-9_\-]+$/,
  SLUG: /^[a-z0-9\-]+$/,
  SEMVER: /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$/,
  SHA256: /^[a-fA-F0-9]{64}$/,
  SIGNATURE: /^[a-fA-F0-9]{64,128}$/,
} as const;

export const BOOTSTRAPPED_ADMIN_EMAIL = 'm4rl0nh3rn4nd3z@gmail.com';

export interface ProgramRecord {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: ProgramCategory;
  platform: ProgramPlatform;
  iconUrl: string;
  imageUrl: string;
  latestVersion: string;
  latestChannel: ReleaseChannel;
  downloadCount: number;
  commentCount: number;
  autoUpdateEnabled: boolean;
  status: ProgramStatus;
  ownerId: string;
  ownerName: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ProgramVersionRecord {
  id: string;
  programId: string;
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
  isLatest: boolean;
  revoked: boolean;
  downloads: number;
  authorId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ProgramCommentRecord {
  id: string;
  programId: string;
  authorId: string;
  authorName: string;
  versionTag: string;
  category: CommentCategory;
  rating: number;
  body: string;
  pinned: boolean;
  adminReply: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface UploadPackageResult {
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  signature: string;
  downloadUrl: string;
}

export interface StarterProgramItem {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: ProgramCategory;
  platform: ProgramPlatform;
  version: string;
  channel: ReleaseChannel;
  minOs: string;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  signature: string;
  downloadUrl: string;
  changelog: string;
  releasedAt: string;
}

export interface AutoUpdateCheckResponse {
  program: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  mandatory: boolean;
  signatureVerified: boolean;
  manifest: {
    version: string;
    channel: string;
    fileName: string;
    fileSizeBytes: number;
    downloadUrl: string;
    sha256: string;
    signature: string;
    minOs: string;
    changelog: string;
    releasedAt: string;
  } | null;
}
