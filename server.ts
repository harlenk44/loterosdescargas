import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(firebaseConfigPath, 'utf-8')
);

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_ROOT = path.join(__dirname, 'uploads');
const TEMP_UPLOADS_DIR = path.join(UPLOADS_ROOT, '_tmp');
const MEDIA_UPLOADS_DIR = path.join(UPLOADS_ROOT, '_media');
const STARTER_DIR = path.join(UPLOADS_ROOT, 'starter');

fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
fs.mkdirSync(MEDIA_UPLOADS_DIR, { recursive: true });
fs.mkdirSync(STARTER_DIR, { recursive: true });

const SIGNING_SECRET =
  process.env.UPDATE_SIGNING_SECRET ||
  crypto
    .createHash('sha256')
    .update(`loterosdescargas:${firebaseConfig.projectId}:${firebaseConfig.appId}`)
    .digest('hex');

function sanitizeSegment(input: string, fallback: string): string {
  const cleaned = input
    .trim()
    .replace(/[^a-zA-Z0-9._\-]/g, '-')
    .replace(/\.{2,}/g, '.')
    .slice(0, 120);
  return cleaned || fallback;
}

function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function signReleasePayload(
  slug: string,
  version: string,
  sha256: string,
  fileSizeBytes: number
): string {
  const canonical = `${slug}|${version}|${sha256.toLowerCase()}|${fileSizeBytes}`;
  return crypto.createHmac('sha256', SIGNING_SECRET).update(canonical).digest('hex');
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const [core] = v.split('-');
    return core.split('.').map((n) => parseInt(n, 10) || 0);
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface StarterSeedDef {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  platform: string;
  version: string;
  channel: string;
  minOs: string;
  fileName: string;
  changelog: string;
  scriptContent: string;
}

const STARTER_DEFINITIONS: StarterSeedDef[] = [
  {
    id: 'starter_loteropro_pos',
    slug: 'loteropro-pos-terminal',
    name: 'LoteroPro POS Terminal',
    summary: 'Terminal rápida de venta de triples, palés y quinielas con teclado numérico.',
    description:
      'Programa de venta moderno para bancas y agencias de lotería. Permite jugadas combinadas en segundos, bloqueo de números por tope, anulación auditada e impresión instantánea de tickets.',
    category: 'Programas de Venta',
    platform: 'Windows',
    version: '4.1.0',
    channel: 'Estable',
    minOs: 'Windows 10 / 11 (64-bit)',
    fileName: 'LoteroProPOS_v4.1.0_Setup.ps1',
    changelog:
      'Motor de venta rápida renovado, soporte multi-sorteo y verificación SHA-256.',
    scriptContent:
      '# LOTEROSDESCARGAS - LoteroPro POS Terminal v4.1.0\nWrite-Host "Instalador LoteroPro POS listo."\n',
  },
  {
    id: 'starter_bancamovil_android',
    slug: 'bancamovil-android-apk',
    name: 'BancaMóvil Android',
    summary: 'App móvil para vendedores en ruta con impresora Bluetooth 58mm y envío en vivo.',
    description:
      'Programa de venta móvil para teléfonos y terminales Android POS con impresora integrada. Trabaja con datos móviles o Wi-Fi y sincroniza ventas al instante con tu servidor central.',
    category: 'Programas de Venta',
    platform: 'Android',
    version: '2.6.3',
    channel: 'Estable',
    minOs: 'Android 8.0 o superior',
    fileName: 'BancaMovil_v2.6.3_Android.json',
    changelog:
      'Reconexión automática con impresoras Bluetooth portátiles de 58mm y lector de código QR.',
    scriptContent: JSON.stringify(
      {
        app: 'BancaMóvil Android',
        package: 'com.loterosdescargas.bancamovil',
        version: '2.6.3',
        minSdk: 26,
      },
      null,
      2
    ),
  },
  {
    id: 'starter_driver_termico',
    slug: 'driver-termico-escpos-pro',
    name: 'Driver Térmico ESC/POS Pro',
    summary: 'Controlador universal USB y red para impresoras térmicas de 58mm y 80mm.',
    description:
      'Puente de impresión compatible con Epson, Star, Xprinter y modelos genéricos USB/Serial. Incluye calibración de márgenes, corte automático y plantillas de recibo con QR.',
    category: 'Programas de Venta',
    platform: 'Impresión',
    version: '3.0.2',
    channel: 'Estable',
    minOs: 'Windows 7 / 10 / 11',
    fileName: 'DriverTermicoESCPOS_v3.0.2.cmd',
    changelog:
      'Soporte nativo para puertos COM virtuales CH340/PL2303 y mayor velocidad de spooling.',
    scriptContent:
      '@echo off\r\necho LOTEROSDESCARGAS - Driver Termico ESC/POS Pro v3.0.2\r\n',
  },
  {
    id: 'starter_printbt_android',
    slug: 'impresion-bluetooth-android',
    name: 'PrintBT Lotería Android',
    summary: 'Servicio de impresión térmica Bluetooth 58mm para celulares y Handheld POS.',
    description:
      'Conector rápido para impresoras portátiles térmicas en Android. Configura encabezados de agencia, códigos QR y tamaño de papel en segundos.',
    category: 'Programas de Venta',
    platform: 'Impresión',
    version: '1.8.0',
    channel: 'Estable',
    minOs: 'Android 8.0 o superior',
    fileName: 'PrintBTLoteria_v1.8.0.json',
    changelog:
      'Compatibilidad ampliada con impresoras térmicas portátiles de 58mm.',
    scriptContent: JSON.stringify(
      {
        app: 'PrintBT Lotería Android',
        version: '1.8.0',
        paperWidthMm: 58,
      },
      null,
      2
    ),
  },
  {
    id: 'starter_soporte_remoto',
    slug: 'soporte-remoto-loteria',
    name: 'Soporte y Respaldo Banca',
    summary: 'Asistencia remota segura y copia de seguridad automática para cajas de lotería.',
    description:
      'Herramienta de utilidades para técnicos de bancas: respalda bases de datos locales y habilita acceso remoto seguro para soporte técnico inmediato en Windows.',
    category: 'Programas de Venta',
    platform: 'Utilidades',
    version: '1.9.0',
    channel: 'Estable',
    minOs: 'Windows 10 / 11',
    fileName: 'SoporteRespaldoBanca_v1.9.0.ps1',
    changelog:
      'Compresión ZIP automática de respaldos diarios y verificación de integridad tras copia.',
    scriptContent:
      '# LOTEROSDESCARGAS - Soporte y Respaldo Banca v1.9.0\nWrite-Host "Utilidad de respaldo lista."\n',
  },
  {
    id: 'starter_taquilla_express',
    slug: 'taquilla-express-windows',
    name: 'Taquilla Express Windows',
    summary: 'Programa de venta ágil para agencias y taquillas de lotería con atajos rápidos.',
    description:
      'Software ligero para Windows enfocado en velocidad de digitación, impresión directa sin vista previa y manejo simultáneo de múltiples sorteos.',
    category: 'Programas de Venta',
    platform: 'Windows',
    version: '2.4.0',
    channel: 'Estable',
    minOs: 'Windows 10 / 11',
    fileName: 'TaquillaExpress_v2.4.0.ps1',
    changelog:
      'Atajos de teclado personalizables e impresión directa ESC/POS.',
    scriptContent:
      '# LOTEROSDESCARGAS - Taquilla Express Windows v2.4.0\nWrite-Host "Taquilla Express listo."\n',
  },
];

interface BuiltStarterItem {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  platform: string;
  version: string;
  channel: string;
  minOs: string;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  signature: string;
  downloadUrl: string;
  changelog: string;
  releasedAt: string;
}

const STARTER_CATALOG_CACHE: BuiltStarterItem[] = [];

async function ensureStarterFiles() {
  if (STARTER_CATALOG_CACHE.length > 0) return STARTER_CATALOG_CACHE;
  const releasedAt = new Date().toISOString();

  for (const def of STARTER_DEFINITIONS) {
    const dir = path.join(STARTER_DIR, def.slug, def.version);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, def.fileName);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, def.scriptContent, 'utf-8');
    }
    const stat = fs.statSync(filePath);
    const sha256 = await computeFileSha256(filePath);
    const signature = signReleasePayload(def.slug, def.version, sha256, stat.size);
    const downloadUrl = `/api/files/${encodeURIComponent(`starter-${def.slug}`)}/${encodeURIComponent(def.version)}/${encodeURIComponent(def.fileName)}`;

    STARTER_CATALOG_CACHE.push({
      id: def.id,
      slug: def.slug,
      name: def.name,
      summary: def.summary,
      description: def.description,
      category: def.category,
      platform: def.platform,
      version: def.version,
      channel: def.channel,
      minOs: def.minOs,
      fileName: def.fileName,
      fileSizeBytes: stat.size,
      sha256,
      signature,
      downloadUrl,
      changelog: def.changelog,
      releasedAt,
    });
  }
  return STARTER_CATALOG_CACHE;
}

const verifiedTokenCache = new Map<string, { uid: string; email: string; expiresAt: number }>();

async function verifyFirebaseUser(req: Request): Promise<{ uid: string; email: string } | null> {
  const customHeader = req.headers['x-firebase-auth'];
  const rawAuth =
    typeof customHeader === 'string' && customHeader.trim()
      ? customHeader.trim()
      : typeof req.headers.authorization === 'string'
        ? req.headers.authorization.trim()
        : '';
  if (!rawAuth) return null;
  const idToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : rawAuth;
  if (!idToken) return null;

  const tokenHash = crypto.createHash('sha256').update(idToken).digest('hex');
  const cached = verifiedTokenCache.get(tokenHash);
  if (cached && cached.expiresAt > Date.now()) {
    return { uid: cached.uid, email: cached.email };
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user || !user.localId || !user.email || !user.emailVerified) return null;
    if (verifiedTokenCache.size > 200) {
      verifiedTokenCache.clear();
    }
    verifiedTokenCache.set(tokenHash, {
      uid: user.localId,
      email: user.email,
      expiresAt: Date.now() + 3 * 60 * 1000,
    });
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

async function isAuthorizedAdmin(user: { uid: string; email: string }): Promise<boolean> {
  return user.email === 'm4rl0nh3rn4nd3z@gmail.com';
}

interface FirestoreFieldValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  timestampValue?: string;
}

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreFieldValue>;
}

function strField(doc: FirestoreDocument, key: string): string {
  return doc.fields?.[key]?.stringValue ?? '';
}

function intField(doc: FirestoreDocument, key: string): number {
  const raw = doc.fields?.[key]?.integerValue;
  return raw ? parseInt(raw, 10) : 0;
}

function boolField(doc: FirestoreDocument, key: string): boolean {
  return Boolean(doc.fields?.[key]?.booleanValue);
}

function tsField(doc: FirestoreDocument, key: string): string {
  return doc.fields?.[key]?.timestampValue ?? new Date().toISOString();
}

async function fetchProgramAndVersionsFromFirestore(slug: string) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;
  const progRes = await fetch(`${baseUrl}/programs?pageSize=100&key=${encodeURIComponent(firebaseConfig.apiKey)}`);
  if (!progRes.ok) {
    throw new Error(`Firestore read failed (${progRes.status})`);
  }
  const progJson = (await progRes.json()) as { documents?: FirestoreDocument[] };
  const programs = progJson.documents ?? [];
  const programDoc = programs.find(
    (d) => strField(d, 'slug') === slug && strField(d, 'status') === 'Activo'
  );
  if (!programDoc) return null;

  const programId = strField(programDoc, 'id') || programDoc.name.split('/').pop() || '';
  const verRes = await fetch(
    `${baseUrl}/programs/${encodeURIComponent(programId)}/versions?pageSize=100&key=${encodeURIComponent(firebaseConfig.apiKey)}`
  );
  const verJson = verRes.ok
    ? ((await verRes.json()) as { documents?: FirestoreDocument[] })
    : { documents: [] };

  const versions = (verJson.documents ?? [])
    .filter((v) => !boolField(v, 'revoked'))
    .map((v) => ({
      id: strField(v, 'id'),
      version: strField(v, 'version'),
      channel: strField(v, 'channel'),
      fileName: strField(v, 'fileName'),
      fileSizeBytes: intField(v, 'fileSizeBytes'),
      downloadUrl: strField(v, 'downloadUrl'),
      sha256: strField(v, 'sha256'),
      signature: strField(v, 'signature'),
      changelog: strField(v, 'changelog'),
      minOs: strField(v, 'minOs'),
      mandatory: boolField(v, 'mandatory'),
      isLatest: boolField(v, 'isLatest'),
      releasedAt: tsField(v, 'createdAt'),
    }))
    .sort((a, b) => {
      if (a.isLatest !== b.isLatest) return a.isLatest ? -1 : 1;
      return compareSemver(b.version, a.version);
    });

  return {
    program: {
      id: programId,
      slug: strField(programDoc, 'slug'),
      name: strField(programDoc, 'name'),
      platform: strField(programDoc, 'platform'),
      autoUpdateEnabled: boolField(programDoc, 'autoUpdateEnabled'),
    },
    latest: versions[0] ?? null,
    versions,
  };
}

const upload = multer({
  dest: TEMP_UPLOADS_DIR,
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
});

const chunkUpload = multer({
  dest: TEMP_UPLOADS_DIR,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const mediaUpload = multer({
  dest: TEMP_UPLOADS_DIR,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

async function startServer() {
  await ensureStarterFiles();

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'LOTEROSDESCARGAS' });
  });

  app.get('/api/starter-catalog', async (_req: Request, res: Response) => {
    const items = await ensureStarterFiles();
    res.json({ items });
  });

  // Upload program image via JSON base64 (avoids proxy multipart/Authorization interception)
  app.post('/api/upload-media-json', async (req: Request, res: Response) => {
    try {
      const user = await verifyFirebaseUser(req);
      if (!user || !(await isAuthorizedAdmin(user))) {
        res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
        return;
      }

      const { kind: rawKind, fileName: rawName, base64Data } = req.body as {
        kind?: string;
        fileName?: string;
        base64Data?: string;
      };

      if (!rawName || !base64Data) {
        res.status(400).json({ error: 'Falta el contenido de la imagen.' });
        return;
      }

      const ext = path.extname(rawName).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.avif', '.svg', '.ico', '.gif'].includes(ext)) {
        res.status(400).json({ error: 'Formato de imagen no soportado. Usa PNG, JPG, WEBP, GIF o SVG.' });
        return;
      }

      const kind = sanitizeSegment(String(rawKind || 'media'), 'media');
      const uniqueName = `${kind}_${Date.now()}_${sanitizeSegment(rawName, `img${ext}`)}`;
      const targetPath = path.join(MEDIA_UPLOADS_DIR, uniqueName);
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
        res.status(400).json({ error: 'Tamaño de imagen inválido (máx. 10 MB).' });
        return;
      }
      fs.writeFileSync(targetPath, buffer);

      res.json({
        mediaUrl: `/api/media/${encodeURIComponent(uniqueName)}`,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error subiendo la imagen.',
      });
    }
  });

  // Upload program icon or cover screenshot image
  app.post('/api/upload-media', mediaUpload.single('file'), async (req: Request, res: Response) => {
    const tempPath = req.file?.path;
    try {
      const user = await verifyFirebaseUser(req);
      if (!user || !(await isAuthorizedAdmin(user))) {
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No se adjuntó ninguna imagen.' });
        return;
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.avif', '.svg', '.ico', '.gif'].includes(ext)) {
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(400).json({ error: 'Formato de imagen no soportado. Usa PNG, JPG, WEBP, GIF o SVG.' });
        return;
      }

      const kind = sanitizeSegment(String(req.body.kind || 'media'), 'media');
      const uniqueName = `${kind}_${Date.now()}_${sanitizeSegment(req.file.originalname, `img${ext}`)}`;
      const targetPath = path.join(MEDIA_UPLOADS_DIR, uniqueName);
      fs.renameSync(req.file.path, targetPath);

      res.json({
        mediaUrl: `/api/media/${encodeURIComponent(uniqueName)}`,
      });
    } catch (err) {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error subiendo la imagen.',
      });
    }
  });

  app.get('/api/media/:fileName', (req: Request, res: Response) => {
    const safeName = sanitizeSegment(String(req.params.fileName || ''), '');
    if (!safeName) {
      res.status(404).end();
      return;
    }
    const targetPath = path.join(MEDIA_UPLOADS_DIR, safeName);
    if (!targetPath.startsWith(MEDIA_UPLOADS_DIR) || !fs.existsSync(targetPath)) {
      res.status(404).end();
      return;
    }
    res.sendFile(targetPath);
  });

  // Upload real program installer / archive and compute SHA-256 + HMAC-SHA256 signature
  app.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
    const tempPath = req.file?.path;
    try {
      const user = await verifyFirebaseUser(req);
      if (!user || !(await isAuthorizedAdmin(user))) {
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No se adjuntó ningún archivo de programa.' });
        return;
      }

      const rawSlug = String(req.body.slug || 'programa');
      const rawVersion = String(req.body.version || '1.0.0');
      const safeSlug = sanitizeSegment(rawSlug.toLowerCase(), 'programa');
      const safeVersion = sanitizeSegment(rawVersion, '1.0.0');
      const safeFileName = sanitizeSegment(req.file.originalname, 'paquete.bin');

      const targetDir = path.join(UPLOADS_ROOT, safeSlug, safeVersion);
      fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, safeFileName);
      fs.renameSync(req.file.path, targetPath);

      const sha256 = await computeFileSha256(targetPath);
      const fileSizeBytes = req.file.size;
      const signature = signReleasePayload(safeSlug, safeVersion, sha256, fileSizeBytes);
      const downloadUrl = `/api/files/${encodeURIComponent(safeSlug)}/${encodeURIComponent(safeVersion)}/${encodeURIComponent(safeFileName)}`;

      res.json({
        fileName: safeFileName,
        fileSizeBytes,
        sha256,
        signature,
        downloadUrl,
      });
    } catch (err) {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error procesando la carga del archivo.',
      });
    }
  });

  // Chunked upload via raw binary octet-stream (fast, no +33% base64 bloat or JSON WAF false positives)
  app.post(
    '/api/upload-chunk-bin',
    express.raw({ type: 'application/octet-stream', limit: '2mb' }),
    async (req: Request, res: Response) => {
      try {
        const user = await verifyFirebaseUser(req);
        if (!user || !(await isAuthorizedAdmin(user))) {
          res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
          return;
        }

        const uploadId = sanitizeSegment(String(req.query.uploadId || ''), '');
        const chunkIndex = Number(req.query.chunkIndex);
        if (
          !uploadId ||
          !Number.isInteger(chunkIndex) ||
          chunkIndex < 0 ||
          !Buffer.isBuffer(req.body) ||
          req.body.length === 0
        ) {
          res.status(400).json({ error: 'Parámetros o datos binarios del fragmento inválidos.' });
          return;
        }

        const chunkDir = path.join(TEMP_UPLOADS_DIR, 'chunks', uploadId);
        fs.mkdirSync(chunkDir, { recursive: true });
        const chunkPath = path.join(chunkDir, String(chunkIndex));
        fs.writeFileSync(chunkPath, req.body);

        res.json({ received: true, chunkIndex });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Error recibiendo fragmento del archivo.',
        });
      }
    }
  );

  // Chunked upload via JSON base64 (avoids proxy multipart & Authorization issues)
  app.post('/api/upload-chunk-json', async (req: Request, res: Response) => {
    try {
      const user = await verifyFirebaseUser(req);
      if (!user || !(await isAuthorizedAdmin(user))) {
        res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
        return;
      }

      const { uploadId: rawUploadId, chunkIndex: rawIdx, base64Data } = req.body as {
        uploadId?: string;
        chunkIndex?: number;
        base64Data?: string;
      };

      const uploadId = sanitizeSegment(String(rawUploadId || ''), '');
      const chunkIndex = Number(rawIdx);
      if (!uploadId || !Number.isInteger(chunkIndex) || chunkIndex < 0 || !base64Data) {
        res.status(400).json({ error: 'Parámetros de fragmento inválidos.' });
        return;
      }

      const chunkDir = path.join(TEMP_UPLOADS_DIR, 'chunks', uploadId);
      fs.mkdirSync(chunkDir, { recursive: true });
      const chunkPath = path.join(chunkDir, String(chunkIndex));
      fs.writeFileSync(chunkPath, Buffer.from(base64Data, 'base64'));

      res.json({ received: true, chunkIndex });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error recibiendo fragmento del archivo.',
      });
    }
  });

  // Chunked upload endpoints (prevents proxy 413 payload limits on large installers)
  app.post('/api/upload-chunk', chunkUpload.single('chunk'), async (req: Request, res: Response) => {
    const tempPath = req.file?.path;
    try {
      const user = await verifyFirebaseUser(req);
      if (!user || !(await isAuthorizedAdmin(user))) {
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Falta el fragmento del archivo.' });
        return;
      }

      const uploadId = sanitizeSegment(String(req.body.uploadId || ''), '');
      const chunkIndex = Number(req.body.chunkIndex);
      if (!uploadId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(400).json({ error: 'Parámetros de fragmento inválidos.' });
        return;
      }

      const chunkDir = path.join(TEMP_UPLOADS_DIR, 'chunks', uploadId);
      fs.mkdirSync(chunkDir, { recursive: true });
      const chunkPath = path.join(chunkDir, String(chunkIndex));
      fs.renameSync(req.file.path, chunkPath);

      res.json({ received: true, chunkIndex });
    } catch (err) {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error recibiendo fragmento del archivo.',
      });
    }
  });

  app.post('/api/upload-finalize', async (req: Request, res: Response) => {
    let chunkDir = '';
    try {
      const user = await verifyFirebaseUser(req);
      if (!user || !(await isAuthorizedAdmin(user))) {
        res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
        return;
      }

      const body = req.body as {
        uploadId?: string;
        totalChunks?: number;
        slug?: string;
        version?: string;
        fileName?: string;
      };

      const uploadId = sanitizeSegment(String(body.uploadId || ''), '');
      const totalChunks = Number(body.totalChunks);
      const safeSlug = sanitizeSegment(String(body.slug || 'programa').toLowerCase(), 'programa');
      const safeVersion = sanitizeSegment(String(body.version || '1.0.0'), '1.0.0');
      const safeFileName = sanitizeSegment(String(body.fileName || 'paquete.bin'), 'paquete.bin');

      if (!uploadId || !Number.isInteger(totalChunks) || totalChunks <= 0) {
        res.status(400).json({ error: 'Parámetros de finalización inválidos.' });
        return;
      }

      chunkDir = path.join(TEMP_UPLOADS_DIR, 'chunks', uploadId);
      if (!fs.existsSync(chunkDir)) {
        res.status(400).json({ error: 'No se encontraron los fragmentos del archivo subido.' });
        return;
      }

      const targetDir = path.join(UPLOADS_ROOT, safeSlug, safeVersion);
      fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, safeFileName);

      const writeStream = fs.createWriteStream(targetPath);
      for (let i = 0; i < totalChunks; i++) {
        const partPath = path.join(chunkDir, String(i));
        if (!fs.existsSync(partPath)) {
          writeStream.close();
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          res.status(400).json({ error: `Falta el fragmento ${i + 1} de ${totalChunks}.` });
          return;
        }
        const buf = fs.readFileSync(partPath);
        writeStream.write(buf);
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });

      fs.rmSync(chunkDir, { recursive: true, force: true });

      const stat = fs.statSync(targetPath);
      const sha256 = await computeFileSha256(targetPath);
      const signature = signReleasePayload(safeSlug, safeVersion, sha256, stat.size);
      const downloadUrl = `/api/files/${encodeURIComponent(safeSlug)}/${encodeURIComponent(safeVersion)}/${encodeURIComponent(safeFileName)}`;

      res.json({
        fileName: safeFileName,
        fileSizeBytes: stat.size,
        sha256,
        signature,
        downloadUrl,
      });
    } catch (err) {
      if (chunkDir && fs.existsSync(chunkDir)) {
        fs.rmSync(chunkDir, { recursive: true, force: true });
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error ensamblando el archivo.',
      });
    }
  });

  app.post('/api/sign-external', async (req: Request, res: Response) => {
    const user = await verifyFirebaseUser(req);
    if (!user || !(await isAuthorizedAdmin(user))) {
      res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
      return;
    }

    const { slug, version, sha256, fileSizeBytes } = req.body as {
      slug?: string;
      version?: string;
      sha256?: string;
      fileSizeBytes?: number;
    };

    if (!slug || !version || !sha256 || !/^[a-fA-F0-9]{64}$/.test(sha256)) {
      res.status(400).json({ error: 'Parámetros inválidos o hash SHA-256 mal formado (64 hex).' });
      return;
    }

    const size = Math.max(0, Number(fileSizeBytes) || 0);
    const signature = signReleasePayload(slug, version, sha256, size);
    res.json({ signature });
  });

  app.delete('/api/programs-files/:slug', async (req: Request, res: Response) => {
    const user = await verifyFirebaseUser(req);
    if (!user || !(await isAuthorizedAdmin(user))) {
      res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador verificada.' });
      return;
    }

    const safeSlug = sanitizeSegment(String(req.params.slug || '').toLowerCase(), '');
    if (!safeSlug || safeSlug === 'starter' || safeSlug === '_media' || safeSlug === '_tmp') {
      res.status(400).json({ error: 'Identificador inválido.' });
      return;
    }

    const targetDir = path.join(UPLOADS_ROOT, safeSlug);
    if (targetDir.startsWith(UPLOADS_ROOT) && fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    res.json({ deleted: true });
  });

  app.get('/api/files/:slug/:version/:fileName', async (req: Request, res: Response) => {
    const rawSlug = sanitizeSegment(String(req.params.slug || ''), '');
    const safeVersion = sanitizeSegment(String(req.params.version || ''), '');
    const safeFileName = sanitizeSegment(String(req.params.fileName || ''), '');

    if (!rawSlug || !safeVersion || !safeFileName) {
      res.status(400).json({ error: 'Ruta de archivo inválida.' });
      return;
    }

    let filePath = path.join(UPLOADS_ROOT, rawSlug, safeVersion, safeFileName);
    let sigSlug = rawSlug;
    if (rawSlug.startsWith('starter-')) {
      const actualSlug = rawSlug.slice('starter-'.length);
      filePath = path.join(STARTER_DIR, actualSlug, safeVersion, safeFileName);
      sigSlug = actualSlug;
    }

    if (!filePath.startsWith(UPLOADS_ROOT) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Archivo no encontrado en el repositorio.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const sha256 = await computeFileSha256(filePath);
    const signature = signReleasePayload(sigSlug, safeVersion, sha256, stat.size);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Checksum-SHA256', sha256);
    res.setHeader('X-Update-Signature', signature);
    res.sendFile(filePath);
  });

  app.get('/api/updates/:slug/manifest.json', async (req: Request, res: Response) => {
    try {
      const slug = sanitizeSegment(String(req.params.slug || '').toLowerCase(), '');
      const data = await fetchProgramAndVersionsFromFirestore(slug);
      const origin = `${req.protocol}://${req.get('host')}`;

      if (!data || !data.latest) {
        const starter = (await ensureStarterFiles()).find((s) => s.slug === slug);
        if (!starter) {
          res.status(404).json({ error: 'Programa o versión activa no encontrada.' });
          return;
        }
        res.json({
          schema: 'loterosdescargas.update.v1',
          program: starter.slug,
          name: starter.name,
          platform: starter.platform,
          version: starter.version,
          channel: starter.channel,
          fileName: starter.fileName,
          fileSizeBytes: starter.fileSizeBytes,
          downloadUrl: `${origin}${starter.downloadUrl}`,
          sha256: starter.sha256,
          signature: starter.signature,
          signatureValid: true,
          mandatory: false,
          minOs: starter.minOs,
          changelog: starter.changelog,
          releasedAt: starter.releasedAt,
        });
        return;
      }

      if (!data.program.autoUpdateEnabled) {
        res.status(403).json({ error: 'Las actualizaciones automáticas están deshabilitadas para este programa.' });
        return;
      }

      const downloadUrl = data.latest.downloadUrl.startsWith('http')
        ? data.latest.downloadUrl
        : `${origin}${data.latest.downloadUrl}`;

      const expectedSig = signReleasePayload(
        data.program.slug,
        data.latest.version,
        data.latest.sha256,
        data.latest.fileSizeBytes
      );

      res.json({
        schema: 'loterosdescargas.update.v1',
        program: data.program.slug,
        name: data.program.name,
        platform: data.program.platform,
        version: data.latest.version,
        channel: data.latest.channel,
        fileName: data.latest.fileName,
        fileSizeBytes: data.latest.fileSizeBytes,
        downloadUrl,
        sha256: data.latest.sha256,
        signature: data.latest.signature,
        signatureValid: data.latest.signature.toLowerCase() === expectedSig.toLowerCase(),
        mandatory: data.latest.mandatory,
        minOs: data.latest.minOs,
        changelog: data.latest.changelog,
        releasedAt: data.latest.releasedAt,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error generando manifiesto de actualización.',
      });
    }
  });

  app.get('/api/updates/:slug/check', async (req: Request, res: Response) => {
    try {
      const slug = sanitizeSegment(String(req.params.slug || '').toLowerCase(), '');
      const currentVersion = String(req.query.currentVersion || '0.0.0').trim();
      const data = await fetchProgramAndVersionsFromFirestore(slug);
      const origin = `${req.protocol}://${req.get('host')}`;

      if (!data || !data.latest) {
        const starter = (await ensureStarterFiles()).find((s) => s.slug === slug);
        if (!starter) {
          res.status(404).json({ error: 'Programa o versión activa no encontrada.' });
          return;
        }
        const cmp = compareSemver(starter.version, currentVersion);
        const updateAvailable = cmp > 0;
        res.json({
          program: starter.slug,
          currentVersion,
          latestVersion: starter.version,
          updateAvailable,
          mandatory: false,
          signatureVerified: true,
          manifest: updateAvailable
            ? {
                version: starter.version,
                channel: starter.channel,
                fileName: starter.fileName,
                fileSizeBytes: starter.fileSizeBytes,
                downloadUrl: `${origin}${starter.downloadUrl}`,
                sha256: starter.sha256,
                signature: starter.signature,
                minOs: starter.minOs,
                changelog: starter.changelog,
                releasedAt: starter.releasedAt,
              }
            : null,
        });
        return;
      }

      if (!data.program.autoUpdateEnabled) {
        res.status(403).json({ error: 'Las actualizaciones automáticas están deshabilitadas para este programa.' });
        return;
      }

      const cmp = compareSemver(data.latest.version, currentVersion);
      const updateAvailable = cmp > 0;
      const downloadUrl = data.latest.downloadUrl.startsWith('http')
        ? data.latest.downloadUrl
        : `${origin}${data.latest.downloadUrl}`;

      const expectedSig = signReleasePayload(
        data.program.slug,
        data.latest.version,
        data.latest.sha256,
        data.latest.fileSizeBytes
      );

      res.json({
        program: data.program.slug,
        currentVersion,
        latestVersion: data.latest.version,
        updateAvailable,
        mandatory: updateAvailable ? data.latest.mandatory : false,
        signatureVerified: data.latest.signature.toLowerCase() === expectedSig.toLowerCase(),
        manifest: updateAvailable
          ? {
              version: data.latest.version,
              channel: data.latest.channel,
              fileName: data.latest.fileName,
              fileSizeBytes: data.latest.fileSizeBytes,
              downloadUrl,
              sha256: data.latest.sha256,
              signature: data.latest.signature,
              minOs: data.latest.minOs,
              changelog: data.latest.changelog,
              releasedAt: data.latest.releasedAt,
            }
          : null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Error verificando actualización.',
      });
    }
  });

  app.post('/api/updates/verify-signature', (req: Request, res: Response) => {
    const { slug, version, sha256, fileSizeBytes, signature } = req.body as {
      slug?: string;
      version?: string;
      sha256?: string;
      fileSizeBytes?: number;
      signature?: string;
    };

    if (!slug || !version || !sha256 || !signature) {
      res.status(400).json({ valid: false, reason: 'Faltan campos requeridos para verificación.' });
      return;
    }

    const expected = signReleasePayload(slug, version, sha256, Number(fileSizeBytes) || 0);
    const valid = expected.toLowerCase() === signature.toLowerCase();
    res.json({
      valid,
      algorithm: 'HMAC-SHA256',
      expectedPrefix: expected.slice(0, 12),
    });
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint de API no encontrado.' });
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Error interno en la solicitud.';
    const status = message.toLowerCase().includes('too large') ? 413 : 400;
    res.status(status).json({ error: message });
  });

  const distDir = path.join(__dirname, 'dist');
  const distIndex = path.join(distDir, 'index.html');

  if (process.env.NODE_ENV !== 'production' || !fs.existsSync(distIndex)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    void Promise.allSettled([
      vite.warmupRequest('/src/main.tsx'),
      vite.warmupRequest('/src/App.tsx'),
      vite.warmupRequest('/src/index.css'),
    ]);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(distIndex);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LOTEROSDESCARGAS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
