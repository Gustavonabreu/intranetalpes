import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, Request, Response } from 'express';
import { mysqlPool } from '../config/mysql.js';
import { fetchEquipamentosByGlpiUserId } from '../../services/glpiDbService.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRootDir = path.resolve(__dirname, '../../uploads');
const runtimeDir = path.resolve(__dirname, '../../.runtime');
const authStateFile = path.join(runtimeDir, 'auth-state.json');

type SessionUser = {
  id: number | string;
  nome_completo: string;
  login: string;
  role: 'admin' | 'user';
  sede?: string | null;
  email?: string | null;
  imagem_url?: string | null;
  grupo?: string | null;
  nivel?: number | null;
};

type MysqlRow = Record<string, any>;

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'alpes_session';
const CSRF_COOKIE_NAME = 'csrftoken';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const USER_PHOTO_BASE_URL = process.env.USER_PHOTO_BASE_URL || '';
const USER_PHOTO_DEFAULT_EXT = (process.env.USER_PHOTO_DEFAULT_EXT || 'jpg')
  .trim()
  .replace(/^\./, '');
const USER_PHOTO_PROXY_ENABLED = String(process.env.USER_PHOTO_PROXY_ENABLED || 'false')
  .trim()
  .toLowerCase() === 'true';
const USER_PHOTO_PROXY_REQUIRE_AUTH = String(
  process.env.USER_PHOTO_PROXY_REQUIRE_AUTH || 'true'
)
  .trim()
  .toLowerCase() === 'true';
const USER_PHOTO_SOURCE_BASE_URL = (process.env.USER_PHOTO_SOURCE_BASE_URL || USER_PHOTO_BASE_URL)
  .trim();
const USER_PHOTO_PROXY_PUBLIC_BASE_URL = (process.env.USER_PHOTO_PROXY_PUBLIC_BASE_URL || '').trim();
const USER_PHOTO_EXTENSIONS = (process.env.USER_PHOTO_EXTENSIONS || 'jpg,jpeg,png')
  .split(',')
  .map((ext) => ext.trim().replace(/^\./, '').toLowerCase())
  .filter(Boolean);
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || '').trim();
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const GOOGLE_PROVIDER = 'google_calendar';
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'http://localhost:5173').trim();

const csrfBySessionToken = new Map<string, string>();
const sessionStore = new Map<string, { user: SessionUser; expiresAt: number }>();
const googleOAuthState = new Map<string, { sessionToken: string; userId: number; createdAt: number }>();
let featureTablesReady = false;

function persistAuthState() {
  try {
    if (!existsSync(runtimeDir)) {
      mkdirSync(runtimeDir, { recursive: true });
    }

    const payload = {
      updatedAt: new Date().toISOString(),
      csrfBySessionToken: Array.from(csrfBySessionToken.entries()),
      sessionStore: Array.from(sessionStore.entries()),
      googleOAuthState: Array.from(googleOAuthState.entries())
    };

    writeFileSync(authStateFile, JSON.stringify(payload), 'utf8');
  } catch {
    // noop
  }
}

function hydrateAuthState() {
  try {
    if (!existsSync(authStateFile)) return;
    const raw = readFileSync(authStateFile, 'utf8');
    if (!raw) return;

    const payload = JSON.parse(raw) as {
      csrfBySessionToken?: [string, string][];
      sessionStore?: [string, { user: SessionUser; expiresAt: number }][];
      googleOAuthState?: [
        string,
        { sessionToken: string; userId: number; createdAt: number }
      ][];
    };

    const nowTs = now();
    for (const [token, value] of payload.sessionStore || []) {
      if (!token || !value || value.expiresAt <= nowTs) continue;
      sessionStore.set(token, value);
    }
    for (const [token, value] of payload.csrfBySessionToken || []) {
      if (!token || typeof value !== 'string') continue;
      if (!sessionStore.has(token)) continue;
      csrfBySessionToken.set(token, value);
    }
    for (const [state, value] of payload.googleOAuthState || []) {
      if (!state || !value) continue;
      if (!sessionStore.has(value.sessionToken)) continue;
      googleOAuthState.set(state, value);
    }
  } catch {
    // noop
  }
}

hydrateAuthState();

function now() {
  return Date.now();
}

function createToken(size = 32) {
  return randomBytes(size).toString('hex');
}

function parseCookies(req: Request) {
  const raw = req.headers.cookie || '';
  const parsed = new Map<string, string>();

  raw.split(';').forEach((chunk) => {
    const part = chunk.trim();
    if (!part) return;
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) return;
    const key = part.slice(0, separatorIndex).trim();
    const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
    if (key) parsed.set(key, value);
  });

  return parsed;
}

function getCookie(req: Request, name: string) {
  return parseCookies(req).get(name);
}

function setCookie(
  res: Response,
  name: string,
  value: string,
  options?: { maxAgeMs?: number; httpOnly?: boolean }
) {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = options?.maxAgeMs ? `; Max-Age=${Math.floor(options.maxAgeMs / 1000)}` : '';
  const httpOnly = options?.httpOnly === false ? '' : '; HttpOnly';
  const secure = isProduction ? '; Secure' : '';
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${httpOnly}${secure}${maxAge}`;
  res.append('Set-Cookie', cookie);
}

function clearCookie(res: Response, name: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = isProduction ? '; Secure' : '';
  res.append('Set-Cookie', `${name}=; Path=/; SameSite=Lax; HttpOnly${secure}; Max-Age=0`);
}

function clearPublicCookie(res: Response, name: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = isProduction ? '; Secure' : '';
  res.append('Set-Cookie', `${name}=; Path=/; SameSite=Lax${secure}; Max-Age=0`);
}

function secureCompare(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function getSessionUser(req: Request) {
  const sessionToken = getCookie(req, AUTH_COOKIE_NAME);
  if (!sessionToken) return null;

  const session = sessionStore.get(sessionToken);
  if (!session) return null;

  if (session.expiresAt < now()) {
    sessionStore.delete(sessionToken);
    csrfBySessionToken.delete(sessionToken);
    persistAuthState();
    return null;
  }

  return { sessionToken, user: session.user };
}

function isCsrfValid(req: Request, sessionToken?: string) {
  const headerToken = String(req.headers['x-csrftoken'] || '');
  const cookieToken = getCookie(req, CSRF_COOKIE_NAME) || '';
  if (!headerToken || !cookieToken) return false;
  if (!secureCompare(headerToken, cookieToken)) return false;
  if (sessionToken) {
    const expected = csrfBySessionToken.get(sessionToken) || '';
    if (!expected) return false;
    return secureCompare(expected, headerToken);
  }
  return true;
}

function userImageUrl(row: MysqlRow) {
  const numericId = Number(row.codusu ?? row.id ?? row.codigo ?? 0);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  if (USER_PHOTO_PROXY_ENABLED && Number.isFinite(numericId) && numericId > 0) {
    const proxyPath = `/api/foto/${numericId}`;
    if (USER_PHOTO_PROXY_PUBLIC_BASE_URL) {
      return `${USER_PHOTO_PROXY_PUBLIC_BASE_URL.replace(/\/+$/, '')}${proxyPath}`;
    }
    return proxyPath;
  }
  if (!USER_PHOTO_BASE_URL) return null;

  const base = USER_PHOTO_BASE_URL.replace(/\/+$/, '');
  return `${base}/${numericId}.${USER_PHOTO_DEFAULT_EXT}`;
}

function normalizePhotoBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

async function fetchPhotoFromSource(userId: number) {
  if (!USER_PHOTO_SOURCE_BASE_URL) return null;
  const base = normalizePhotoBaseUrl(USER_PHOTO_SOURCE_BASE_URL);
  const preferred = USER_PHOTO_DEFAULT_EXT.toLowerCase();
  const extensions = [preferred, ...USER_PHOTO_EXTENSIONS.filter((e) => e !== preferred)];

  for (const ext of extensions) {
    const photoUrl = `${base}/${userId}.${ext}`;
    try {
      const response = await fetch(photoUrl);
      if (!response.ok) continue;
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || `image/${ext}`;
      return { buffer, contentType };
    } catch {
      // Try next extension
    }
  }

  return null;
}

function userBirthDate(row: MysqlRow) {
  return row.data_nascimento ?? row.dtNascimento ?? null;
}

function inferUserRoleFromRow(row: MysqlRow): 'admin' | 'user' {
  const rawRole = String(row.role || row.perfil || row.tipo || '').trim().toLowerCase();
  if (rawRole === 'admin') return 'admin';
  return 'user';
}

function sanitizeUserFromRow(row: MysqlRow): SessionUser {
  return {
    id: row.codusu ?? row.id ?? row.codigo ?? row.login,
    nome_completo: String(row.nome ?? row.nome_completo ?? row.login ?? 'Usuario'),
    login: String(row.login ?? ''),
    role: inferUserRoleFromRow(row),
    sede: row.local ?? row.sede ?? row.filial ?? row.unidade ?? row.cidade ?? null,
    email: row.email ?? null,
    imagem_url: userImageUrl(row),
    grupo: row.grupo ?? null,
    nivel: row.nivel ?? null
  };
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'sim', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'nao', 'não', 'no'].includes(normalized)) return false;
  }
  return fallback;
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeUploadFolder(rawFolder: unknown) {
  const fallback = 'intranet';
  const folder = String(rawFolder || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return folder || fallback;
}

function parseDataUrl(rawValue: unknown) {
  const value = String(rawValue || '');
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const payload = match[2];
  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extByMime[mime];
  if (!ext) return null;
  return { mime, ext, payload };
}

async function saveBase64Image(options: {
  dataUrl: unknown;
  fileName?: unknown;
  folder?: unknown;
}) {
  const parsed = parseDataUrl(options.dataUrl);
  if (!parsed) {
    throw new Error('Arquivo de imagem invalido. Use JPG, PNG, WEBP ou GIF.');
  }

  const buffer = Buffer.from(parsed.payload, 'base64');
  if (!buffer.length) {
    throw new Error('Arquivo vazio.');
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Arquivo maior que 5MB.');
  }

  const folder = normalizeUploadFolder(options.folder);
  const safeBaseName = String(options.fileName || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const finalBaseName = safeBaseName || `img-${Date.now()}`;
  const finalFileName = `${finalBaseName}-${Date.now()}.${parsed.ext}`;

  const targetDir = path.join(uploadsRootDir, folder);
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, finalFileName), buffer);

  return {
    url: `/uploads/${folder}/${finalFileName}`,
    mime: parsed.mime,
    size: buffer.length
  };
}

function toClampedPosition(value: unknown, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function toMysqlDateTimeOrNull(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const normalized = raw.replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeSede(value: unknown): 'todas' | 'curitiba' | 'sao_paulo' | 'rio' {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  if (!raw) return 'todas';
  if (['todos', 'todas', 'geral', 'all'].includes(raw)) return 'todas';
  if (['curitiba', 'ctba', 'pr'].includes(raw)) return 'curitiba';
  if (['sao_paulo', 'sao-paulo', 'sp'].includes(raw)) return 'sao_paulo';
  if (['rio', 'rio_de_janeiro', 'rio-de-janeiro', 'rj'].includes(raw)) return 'rio';
  return 'todas';
}

async function resolveUserSedeByLogin(login: string) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT local, sede, filial, unidade, cidade, grupo
       FROM usuario
       WHERE login = ?
       LIMIT 1`,
      [login]
    );
    const users = rows as MysqlRow[];
    if (!users.length) return 'todas';
    const row = users[0];
    return normalizeSede(
      row.local ?? row.sede ?? row.filial ?? row.unidade ?? row.cidade ?? row.grupo ?? null
    );
  } catch {
    return 'todas';
  }
}

function hasGoogleCalendarConfig() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
}

async function exchangeGoogleCodeForToken(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Falha ao trocar codigo Google: ${payload}`);
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Falha ao renovar token Google: ${payload}`);
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
}

async function resolveMysqlUserIdFromSession(session: { user: SessionUser }) {
  const direct = Number(session.user.id);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return resolveUserIdByLogin(session.user.login);
}

async function getGoogleIntegrationByUserId(userId: number) {
  const [rows] = await mysqlPool.query(
    `SELECT usuario_id, provider, access_token, refresh_token, access_token_expires_at
     FROM usuario_integracoes
     WHERE usuario_id = ? AND provider = ?
     LIMIT 1`,
    [userId, GOOGLE_PROVIDER]
  );
  const data = rows as MysqlRow[];
  return data.length ? data[0] : null;
}

async function saveGoogleIntegrationByUserId(options: {
  userId: number;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}) {
  const expiresAt = new Date(now() + Math.max(60, Number(options.expiresInSeconds || 3600)) * 1000);
  const expiresAtSql = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

  await mysqlPool.query(
    `INSERT INTO usuario_integracoes
      (usuario_id, provider, access_token, refresh_token, access_token_expires_at, scope)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      access_token = VALUES(access_token),
      refresh_token = VALUES(refresh_token),
      access_token_expires_at = VALUES(access_token_expires_at),
      scope = VALUES(scope)`,
    [
      options.userId,
      GOOGLE_PROVIDER,
      options.accessToken,
      options.refreshToken,
      expiresAtSql,
      GOOGLE_CALENDAR_SCOPE
    ]
  );
}

function isMissingUsuarioIntegracoesTable(error: any) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

async function getValidGoogleAccessTokenByUserId(userId: number) {
  const token = await getGoogleIntegrationByUserId(userId);
  if (!token) return null;

  const accessToken = String(token.access_token || '');
  const refreshToken = String(token.refresh_token || '');
  const expiresAt = token.access_token_expires_at ? new Date(token.access_token_expires_at).getTime() : 0;

  if (accessToken && expiresAt > now() + 30_000) {
    return accessToken;
  }

  if (!refreshToken) return null;
  const refreshed = await refreshGoogleAccessToken(refreshToken);
  await saveGoogleIntegrationByUserId({
    userId,
    accessToken: refreshed.access_token,
    refreshToken,
    expiresInSeconds: Number(refreshed.expires_in || 3600)
  });
  return refreshed.access_token;
}

async function isAdminUser(login: string) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT role
       FROM usuario
       WHERE login = ?
       LIMIT 1`,
      [login]
    );

    const users = rows as MysqlRow[];
    if (!users.length) return false;
    const row = users[0];

    const role = String(row.role || '').trim().toLowerCase();
    return role === 'admin';
  } catch {
    return false;
  }
}

async function requireAdmin(
  req: Request,
  res: Response,
  options?: { requireCsrf?: boolean }
) {
  const session = getSessionUser(req);
  if (!session) {
    res.status(403).json({ error: 'Sessao invalida ou expirada.' });
    return null;
  }

  if (options?.requireCsrf && !isCsrfValid(req, session.sessionToken)) {
    res.status(403).json({ error: 'CSRF token invalido.' });
    return null;
  }

  const allowed = await isAdminUser(session.user.login);
  if (!allowed) {
    res.status(403).json({ error: 'Acesso restrito a RH/administrador.' });
    return null;
  }

  return session;
}

function normalizeRoutePath(rawPath: unknown) {
  const value = String(rawPath || '').trim();
  if (!value) return '/';
  const clean = value.split('?')[0].trim();
  if (!clean.startsWith('/')) return `/${clean}`;
  return clean;
}

async function resolveUserIdByLogin(login: string) {
  const [rows] = await mysqlPool.query(
    `SELECT codusu, id, codigo
     FROM usuario
     WHERE login = ?
     LIMIT 1`,
    [login]
  );
  const users = rows as MysqlRow[];
  if (!users.length) return null;
  const userId = Number(users[0].codusu ?? users[0].id ?? users[0].codigo ?? 0);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  return userId;
}

async function ensureFeatureTables() {
  if (featureTablesReady) return;
  let migrationFailed = false;

  try {
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        imagem_inicial_url TEXT NULL,
        updated_by VARCHAR(255) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_noticias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        conteudo TEXT NOT NULL,
        autor_nome VARCHAR(255) NULL,
        imagem_destaque_url TEXT NULL,
        data_inicio DATETIME NULL,
        data_fim DATETIME NULL,
        data_publicacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ativo TINYINT(1) NOT NULL DEFAULT 1
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_projetos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descricao TEXT NULL,
        descricao_detalhada TEXT NULL,
        resumo VARCHAR(255) NULL,
        imagem_url TEXT NULL,
        link_url TEXT NULL,
        tipo VARCHAR(20) NOT NULL DEFAULT 'cliente',
        pos_x DECIMAL(6,2) NOT NULL DEFAULT 50.00,
        pos_y DECIMAL(6,2) NOT NULL DEFAULT 50.00,
        progresso INT NOT NULL DEFAULT 0,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        ordem INT NOT NULL DEFAULT 0,
        updated_by VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_enquetes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pergunta VARCHAR(255) NOT NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_enquete_opcoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        enquete_id INT NOT NULL,
        texto_opcao VARCHAR(255) NOT NULL,
        votos INT NOT NULL DEFAULT 0,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_enquete_opcoes_enquete
          FOREIGN KEY (enquete_id) REFERENCES intranet_enquetes(id)
          ON DELETE CASCADE
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_eventos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descricao TEXT NULL,
        data_evento DATETIME NOT NULL,
        sede_alvo VARCHAR(40) NOT NULL DEFAULT 'todas',
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS permissoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        rota VARCHAR(120) NOT NULL,
        pode_acessar TINYINT(1) NOT NULL DEFAULT 1,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_perm (usuario_id, rota)
      )
    `);

  } catch (error) {
    migrationFailed = true;
    console.error('Falha ao criar tabelas da intranet:', error);
  }

  try {
    await mysqlPool.query(
      `ALTER TABLE usuario ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'`
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna role em usuario:', error);
    }
  }

  try {
    await mysqlPool.query(`ALTER TABLE intranet_noticias ADD COLUMN data_inicio DATETIME NULL`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna data_inicio em intranet_noticias:', error);
    }
  }
  try {
    await mysqlPool.query(`ALTER TABLE intranet_noticias ADD COLUMN data_fim DATETIME NULL`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna data_fim em intranet_noticias:', error);
    }
  }
  try {
    await mysqlPool.query(`ALTER TABLE intranet_projetos ADD COLUMN resumo VARCHAR(255) NULL`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna resumo em intranet_projetos:', error);
    }
  }
  try {
    await mysqlPool.query(`ALTER TABLE intranet_projetos ADD COLUMN link_url TEXT NULL`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna link_url em intranet_projetos:', error);
    }
  }
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_projetos ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'cliente'`
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna tipo em intranet_projetos:', error);
    }
  }
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_projetos ADD COLUMN pos_x DECIMAL(6,2) NOT NULL DEFAULT 50.00`
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna pos_x em intranet_projetos:', error);
    }
  }
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_projetos ADD COLUMN pos_y DECIMAL(6,2) NOT NULL DEFAULT 50.00`
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna pos_y em intranet_projetos:', error);
    }
  }
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_eventos ADD COLUMN sede_alvo VARCHAR(40) NOT NULL DEFAULT 'todas'`
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna sede_alvo em intranet_eventos:', error);
    }
  } finally {
    featureTablesReady = !migrationFailed;
  }
}

async function fetchNoticiasFromMysql(limit = 50) {
  await ensureFeatureTables();

  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, titulo, conteudo, autor_nome, imagem_destaque_url, data_inicio, data_fim, data_publicacao
       FROM intranet_noticias
       WHERE ativo = 1
         AND (data_inicio IS NULL OR data_inicio <= NOW())
         AND (data_fim IS NULL OR data_fim >= NOW())
       ORDER BY data_publicacao DESC
       LIMIT ?`,
      [limit]
    );

    const noticias = rows as MysqlRow[];
    if (noticias.length > 0) return noticias;
  } catch {
    // fallback below
  }

  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, titulo, conteudo, atualizado_em AS data_publicacao
       FROM html_textos
       ORDER BY atualizado_em DESC
       LIMIT ?`,
      [limit]
    );

    return (rows as MysqlRow[]).map((row) => ({
      id: row.id,
      titulo: row.titulo,
      conteudo: row.conteudo,
      autor_nome: 'Sistema',
      imagem_destaque_url: null,
      data_publicacao: row.data_publicacao
    }));
  } catch {
    return [];
  }
}

// Public endpoint to prime csrf cookie on frontend
router.get('/get-csrf-token', (req: Request, res: Response) => {
  const session = getSessionUser(req);
  const token = session ? csrfBySessionToken.get(session.sessionToken) || createToken(24) : createToken(24);

  if (session) {
    csrfBySessionToken.set(session.sessionToken, token);
    persistAuthState();
  }

  setCookie(res, CSRF_COOKIE_NAME, token, { httpOnly: false, maxAgeMs: SESSION_TTL_MS });
  res.json({ success: true });
});

router.get('/foto/:id', async (req: Request, res: Response) => {
  if (USER_PHOTO_PROXY_REQUIRE_AUTH) {
    const session = getSessionUser(req);
    if (!session) {
      return res.status(403).json({ error: 'Sessao invalida ou expirada.' });
    }
  }

  const userId = Number(req.params.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'ID de colaborador invalido.' });
  }

  const result = await fetchPhotoFromSource(userId);
  if (!result) {
    return res.status(404).json({ error: 'Foto nao encontrada.' });
  }

  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.send(result.buffer);
});

router.post('/auth/login', async (req: Request, res: Response) => {
  if (!isCsrfValid(req)) {
    return res.status(403).json({ error: 'CSRF token invalido.' });
  }

  const login = String(req.body?.email || req.body?.login || '').trim();
  const senha = String(req.body?.password || req.body?.senha || '');

  if (!login || !senha) {
    return res.status(400).json({ error: 'Login e senha sao obrigatorios.' });
  }

  try {
    const [rows] = await mysqlPool.query('SELECT * FROM usuario WHERE login = ? LIMIT 1', [login]);
    const users = rows as MysqlRow[];

    if (!users.length) {
      return res.status(401).json({ error: 'Credenciais invalidas.' });
    }

    const userRow = users[0];
    if (String(userRow.sts || '').toUpperCase() !== 'ATIVO') {
      return res.status(403).json({ error: 'Usuario inativo.' });
    }

    const senhaBanco = String(userRow.senha || '');
    if (!senhaBanco || !secureCompare(senhaBanco, senha)) {
      return res.status(401).json({ error: 'Credenciais invalidas.' });
    }

    const sessionToken = createToken(32);
    const csrfToken = createToken(24);
    const user = sanitizeUserFromRow(userRow);

    sessionStore.set(sessionToken, { user, expiresAt: now() + SESSION_TTL_MS });
    csrfBySessionToken.set(sessionToken, csrfToken);
    persistAuthState();

    setCookie(res, AUTH_COOKIE_NAME, sessionToken, { maxAgeMs: SESSION_TTL_MS });
    setCookie(res, CSRF_COOKIE_NAME, csrfToken, { httpOnly: false, maxAgeMs: SESSION_TTL_MS });

    return res.json({ success: true, user });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao processar login.' });
  }
});

router.get('/auth/user', async (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.' });
  }

  try {
    const [rows] = await mysqlPool.query('SELECT * FROM usuario WHERE login = ? LIMIT 1', [
      session.user.login
    ]);
    const users = rows as MysqlRow[];

    if (!users.length) {
      return res.status(403).json({ error: 'Sessao invalida ou expirada.' });
    }

    const freshUser = sanitizeUserFromRow(users[0]);
    sessionStore.set(session.sessionToken, { user: freshUser, expiresAt: now() + SESSION_TTL_MS });
    persistAuthState();
    return res.json(freshUser);
  } catch {
    return res.json(session.user);
  }
});

router.get('/minhas-permissoes', async (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.' });
  }

  if (session.user.role === 'admin') {
    return res.json({ admin: true, permissoes: [] });
  }

  try {
    await ensureFeatureTables();
    const userId = await resolveUserIdByLogin(session.user.login);
    if (!userId) {
      return res.json({ admin: false, permissoes: [] });
    }

    const [rows] = await mysqlPool.query(
      `SELECT rota
       FROM permissoes
       WHERE usuario_id = ? AND pode_acessar = 1`,
      [userId]
    );

    return res.json({
      admin: false,
      permissoes: (rows as MysqlRow[]).map((row) => String(row.rota || '')).filter(Boolean)
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar permissoes.' });
  }
});

router.post('/auth/logout', (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    clearCookie(res, AUTH_COOKIE_NAME);
    clearPublicCookie(res, CSRF_COOKIE_NAME);
    return res.json({ success: true });
  }

  if (!isCsrfValid(req, session.sessionToken)) {
    return res.status(403).json({ error: 'CSRF token invalido.' });
  }

  sessionStore.delete(session.sessionToken);
  csrfBySessionToken.delete(session.sessionToken);
  for (const [stateKey, value] of googleOAuthState.entries()) {
    if (value.sessionToken === session.sessionToken) {
      googleOAuthState.delete(stateKey);
    }
  }
  persistAuthState();
  clearCookie(res, AUTH_COOKIE_NAME);
  clearPublicCookie(res, CSRF_COOKIE_NAME);
  return res.json({ success: true });
});

// Team / photos / birthdays
router.get('/equipe', async (req: Request, res: Response) => {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT codusu, nome, grupo, cargo, email, celular, fone, foto, data_nascimento, dtNascimento
       FROM usuario
       WHERE sts = 'ATIVO'
       ORDER BY nome ASC`
    );

    const data = (rows as MysqlRow[]).map((row) => ({
      id: row.codusu,
      nome_formatado: row.nome,
      grupo: row.grupo || '',
      cargo: row.cargo || '',
      email: row.email || '',
      telefone: row.celular || row.fone || '',
      imagem_url: userImageUrl(row),
      aniversario: userBirthDate(row)
    }));

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Falha ao carregar equipe.' });
  }
});

router.get('/todos-funcionarios', async (req: Request, res: Response) => {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT codusu, nome
       FROM usuario
       WHERE sts = 'ATIVO'
       ORDER BY nome ASC`
    );

    const data = (rows as MysqlRow[]).map((row) => ({
      id: row.codusu,
      nome_formatado: row.nome
    }));

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Falha ao carregar funcionarios.' });
  }
});

// News / posts
router.get('/noticias', async (req: Request, res: Response) => {
  try {
    const noticias = await fetchNoticiasFromMysql(100);
    res.json(noticias);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Falha ao carregar noticias.' });
  }
});

router.get('/noticias-recentes', async (req: Request, res: Response) => {
  try {
    const noticias = await fetchNoticiasFromMysql(5);
    res.json(noticias.map((n) => ({ id: n.id, titulo: n.titulo, data_publicacao: n.data_publicacao })));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Falha ao carregar posts recentes.' });
  }
});

// Poll
router.get('/enquete-ativa', async (req: Request, res: Response) => {
  await ensureFeatureTables();

  try {
    const [enqueteRows] = await mysqlPool.query(
      `SELECT id, pergunta
       FROM intranet_enquetes
       WHERE ativo = 1
       ORDER BY criado_em DESC
       LIMIT 1`
    );

    const enquetes = enqueteRows as MysqlRow[];
    if (!enquetes.length) {
      return res.json({});
    }

    const enquete = enquetes[0];
    const [optionRows] = await mysqlPool.query(
      `SELECT id, texto_opcao, votos
       FROM intranet_enquete_opcoes
       WHERE enquete_id = ?
       ORDER BY id ASC`,
      [enquete.id]
    );

    return res.json({
      id: enquete.id,
      pergunta: enquete.pergunta,
      opcoes: optionRows
    });
  } catch {
    return res.json({});
  }
});

router.post('/opcoes/:id/votar', async (req: Request, res: Response) => {
  await ensureFeatureTables();
  const optionId = Number(req.params.id);
  if (!Number.isFinite(optionId)) {
    return res.status(400).json({ error: 'Opcao invalida.' });
  }

  try {
    const [result] = await mysqlPool.query(
      `UPDATE intranet_enquete_opcoes
       SET votos = votos + 1
       WHERE id = ?`,
      [optionId]
    );

    const affected = (result as { affectedRows?: number }).affectedRows || 0;
    if (!affected) {
      return res.status(404).json({ error: 'Opcao nao encontrada.' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao registrar voto.' });
  }
});

// Notifications (minimal compatibility endpoints)
router.get('/notificacoes', async (req: Request, res: Response) => {
  try {
    const noticias = await fetchNoticiasFromMysql(10);
    const notificacoes = noticias.map((noticia) => ({
      id: noticia.id,
      mensagem: noticia.titulo,
      link: '/noticias'
    }));
    res.json({ notificacoes });
  } catch {
    res.json({ notificacoes: [] });
  }
});

router.post('/notificacoes/:id/ler', (req: Request, res: Response) => {
  res.json({ success: true });
});

  // Compatibility endpoints used by current frontend pages.
router.get('/intranet-config', async (req: Request, res: Response) => {
  await ensureFeatureTables();

  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, imagem_inicial_url, updated_by, updated_at
       FROM intranet_config
       ORDER BY id DESC
       LIMIT 1`
    );
    const configs = rows as MysqlRow[];
    if (!configs.length) return res.json({});
    return res.json(configs[0]);
  } catch {
    return res.json({});
  }
});

router.get('/avisos-ativos', async (req: Request, res: Response) => {
  try {
    const noticias = await fetchNoticiasFromMysql(5);
    const avisos = noticias.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      imagem_url:
        n.imagem_destaque_url ||
        'https://dummyimage.com/1200x400/0f172a/ffffff&text=Aviso+Intranet',
      link: '/noticias'
    }));
    res.json(avisos);
  } catch {
    res.json([]);
  }
});

router.get('/projetos', (req: Request, res: Response) => {
  (async () => {
    await ensureFeatureTables();
    try {
      const [rows] = await mysqlPool.query(
        `SELECT id, titulo, resumo, descricao, descricao_detalhada, imagem_url, link_url, tipo, pos_x, pos_y, progresso, ativo, ordem
         FROM intranet_projetos
         WHERE ativo = 1
         ORDER BY ordem ASC, id DESC`
      );
      return res.json(rows);
    } catch {
      return res.json([]);
    }
  })();
});

router.get('/eventos-empresa', async (req: Request, res: Response) => {
  await ensureFeatureTables();

  try {
    const session = getSessionUser(req);
    const userSede = session?.user?.sede
      ? normalizeSede(session.user.sede)
      : session?.user?.login
        ? await resolveUserSedeByLogin(session.user.login)
        : 'todas';

    const [rows] = await mysqlPool.query(
      `SELECT id, titulo, descricao, data_evento, sede_alvo, ativo
       FROM intranet_eventos
       WHERE ativo = 1
         AND (sede_alvo IS NULL OR sede_alvo = '' OR sede_alvo = 'todas' OR sede_alvo = ?)
         AND data_evento >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
       ORDER BY data_evento ASC, id ASC
       LIMIT 100`
      ,
      [userSede]
    );
    return res.json(rows);
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.json([]);
    }
    return res.status(500).json({ error: error?.message || 'Falha ao carregar eventos da empresa.' });
  }
});

async function startGoogleCalendarOAuth(req: Request, res: Response) {
  await ensureFeatureTables();
  try {
    await mysqlPool.query('SELECT 1 FROM usuario_integracoes LIMIT 1');
  } catch (error: any) {
    if (isMissingUsuarioIntegracoesTable(error)) {
      return res.status(503).json({
        error:
          'Tabela usuario_integracoes nao encontrada. Crie no banco para habilitar o Google Calendar.'
      });
    }
    throw error;
  }
  const session = getSessionUser(req);
  if (!session) {
    const next = encodeURIComponent('/dashboard');
    return res.redirect(`${FRONTEND_BASE_URL}/login?next=${next}`);
  }

  if (!hasGoogleCalendarConfig()) {
    return res
      .status(500)
      .json({ error: 'Google Calendar nao configurado. Defina GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI.' });
  }

  const userId = await resolveMysqlUserIdFromSession(session);
  if (!userId) {
    return res.status(400).json({ error: 'Usuario invalido para integrar com Google Calendar.' });
  }

  const state = createToken(16);
  googleOAuthState.set(state, { sessionToken: session.sessionToken, userId, createdAt: now() });
  persistAuthState();

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

router.get('/calendar/connect', startGoogleCalendarOAuth);
router.get('/auth/google', startGoogleCalendarOAuth);

async function handleGoogleCalendarOAuthCallback(req: Request, res: Response) {
  await ensureFeatureTables();
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const stateData = googleOAuthState.get(state);
  googleOAuthState.delete(state);
  persistAuthState();

  if (!code || !stateData?.userId) {
    return res.redirect(`${FRONTEND_BASE_URL}/dashboard?calendar=error`);
  }

  try {
    const token = await exchangeGoogleCodeForToken(code);
    const existing = await getGoogleIntegrationByUserId(stateData.userId);
    const refreshToken = String(token.refresh_token || existing?.refresh_token || '');
    if (!refreshToken) {
      return res.redirect(`${FRONTEND_BASE_URL}/dashboard?calendar=error`);
    }

    await saveGoogleIntegrationByUserId({
      userId: stateData.userId,
      accessToken: token.access_token,
      refreshToken,
      expiresInSeconds: Number(token.expires_in || 3600)
    });

    return res.redirect(`${FRONTEND_BASE_URL}/dashboard?calendar=connected`);
  } catch (error: any) {
    if (isMissingUsuarioIntegracoesTable(error)) {
      return res.redirect(`${FRONTEND_BASE_URL}/dashboard?calendar=setup_required`);
    }
    return res.redirect(`${FRONTEND_BASE_URL}/dashboard?calendar=error`);
  }
}

router.get('/calendar/oauth2/callback', handleGoogleCalendarOAuthCallback);
router.get('/auth/google/callback', handleGoogleCalendarOAuthCallback);

async function getGoogleCalendarEvents(req: Request, res: Response) {
  await ensureFeatureTables();
  res.setHeader('Cache-Control', 'no-store');
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.' });
  }

  if (!hasGoogleCalendarConfig()) {
    return res.status(503).json({ error: 'Google Calendar nao configurado.' });
  }

  const userId = await resolveMysqlUserIdFromSession(session);
  if (!userId) {
    return res.status(400).json({ error: 'Usuario invalido para consultar calendario.' });
  }

  let accessToken: string | null = null;
  try {
    accessToken = await getValidGoogleAccessTokenByUserId(userId);
  } catch (error: any) {
    if (isMissingUsuarioIntegracoesTable(error)) {
      return res.status(503).json({
        error:
          'Tabela usuario_integracoes nao encontrada. Crie no banco para habilitar o Google Calendar.'
      });
    }
    return res.status(500).json({ error: error?.message || 'Falha ao validar token do Google Calendar.' });
  }
  if (!accessToken) {
    return res.status(403).json({ error: 'Google Calendar nao conectado.' });
  }

  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const timeMin = startOfToday.toISOString();
    const timeMax = new Date(now() + 1000 * 60 * 60 * 24 * 90).toISOString();

    const fetchCalendarEvents = async (calendarId: string, maxResults = 100) => {
      const params = new URLSearchParams({
        maxResults: String(maxResults),
        orderBy: 'startTime',
        singleEvents: 'true',
        timeMin,
        timeMax
      });
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      return response;
    };

    const response = await fetchCalendarEvents('primary', 100);

    if (!response.ok) {
      if (response.status === 401) {
        await mysqlPool.query(
          `UPDATE usuario_integracoes
           SET access_token = NULL, access_token_expires_at = NULL
           WHERE usuario_id = ? AND provider = ?`,
          [userId, GOOGLE_PROVIDER]
        );
        return res.status(403).json({ error: 'Google Calendar desconectado. Conecte novamente.' });
      }
      const text = await response.text();
      return res.status(500).json({ error: `Falha ao buscar eventos no Google: ${text}` });
    }

    const payload = (await response.json()) as { items?: any[] };
    const primaryItems = Array.isArray(payload.items) ? payload.items : [];
    if (primaryItems.length > 0) {
      return res.json(primaryItems);
    }

    const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!listResponse.ok) {
      return res.json([]);
    }

    const listPayload = (await listResponse.json()) as { items?: Array<{ id?: string; selected?: boolean }> };
    const calendarIds = (listPayload.items || [])
      .filter((item) => Boolean(item?.id) && item.selected !== false)
      .map((item) => String(item.id))
      .slice(0, 5);

    const allItems: any[] = [];
    for (const calendarId of calendarIds) {
      const calendarResponse = await fetchCalendarEvents(calendarId, 50);
      if (!calendarResponse.ok) continue;
      const calendarPayload = (await calendarResponse.json()) as { items?: any[] };
      allItems.push(...(calendarPayload.items || []));
      if (allItems.length >= 300) break;
    }

    allItems.sort((a, b) => {
      const left = new Date(a?.start?.dateTime || a?.start?.date || 0).getTime();
      const right = new Date(b?.start?.dateTime || b?.start?.date || 0).getTime();
      return left - right;
    });

    return res.json(allItems.slice(0, 100));
  } catch (error: any) {
    if (isMissingUsuarioIntegracoesTable(error)) {
      return res.status(503).json({
        error:
          'Tabela usuario_integracoes nao encontrada. Crie no banco para habilitar o Google Calendar.'
      });
    }
    return res.status(500).json({ error: error?.message || 'Falha ao carregar eventos.' });
  }
}

router.get('/calendar/events', getGoogleCalendarEvents);
router.get('/calendario/meus-eventos', getGoogleCalendarEvents);

router.get('/calendar/debug', async (req: Request, res: Response) => {
  await ensureFeatureTables();
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({ ok: false, step: 'session', error: 'Sessao invalida ou expirada.' });
  }

  if (!hasGoogleCalendarConfig()) {
    return res.status(503).json({ ok: false, step: 'config', error: 'Google Calendar nao configurado.' });
  }

  try {
    const userId = await resolveMysqlUserIdFromSession(session);
    if (!userId) {
      return res.status(400).json({ ok: false, step: 'user', error: 'Usuario invalido para consultar calendario.' });
    }

    const integration = await getGoogleIntegrationByUserId(userId);
    if (!integration) {
      return res.json({
        ok: false,
        step: 'integration',
        userId,
        hasIntegrationRow: false,
        message: 'Nenhum registro em usuario_integracoes para este usuario.'
      });
    }

    let accessToken: string | null = null;
    try {
      accessToken = await getValidGoogleAccessTokenByUserId(userId);
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        step: 'token_refresh',
        userId,
        error: error?.message || 'Falha ao renovar token.'
      });
    }

    if (!accessToken) {
      return res.json({
        ok: false,
        step: 'token_missing',
        userId,
        hasAccessToken: Boolean(integration.access_token),
        hasRefreshToken: Boolean(integration.refresh_token),
        accessTokenExpiresAt: integration.access_token_expires_at || null
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const timeMin = startOfToday.toISOString();
    const timeMax = new Date(now() + 1000 * 60 * 60 * 24 * 90).toISOString();

    const fetchCalendarEvents = async (calendarId: string, maxResults = 10) => {
      const params = new URLSearchParams({
        maxResults: String(maxResults),
        orderBy: 'startTime',
        singleEvents: 'true',
        timeMin,
        timeMax
      });
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      const bodyText = await response.text();
      let bodyJson: any = null;
      try {
        bodyJson = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        bodyJson = null;
      }
      return { response, bodyText, bodyJson };
    };

    const primary = await fetchCalendarEvents('primary', 10);
    const primaryItems = Array.isArray(primary.bodyJson?.items) ? primary.bodyJson.items : [];

    const debug: Record<string, any> = {
      ok: true,
      userId,
      provider: GOOGLE_PROVIDER,
      hasAccessTokenInDb: Boolean(integration.access_token),
      hasRefreshTokenInDb: Boolean(integration.refresh_token),
      accessTokenExpiresAt: integration.access_token_expires_at || null,
      queryWindow: { timeMin, timeMax },
      primary: {
        status: primary.response.status,
        ok: primary.response.ok,
        itemsCount: primaryItems.length,
        firstItems: primaryItems.slice(0, 3).map((item: any) => ({
          id: item?.id || null,
          summary: item?.summary || null,
          start: item?.start || null
        })),
        error: primary.response.ok ? null : primary.bodyText
      }
    };

    const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listText = await listResponse.text();
    let listJson: any = null;
    try {
      listJson = listText ? JSON.parse(listText) : null;
    } catch {
      listJson = null;
    }
    const calendars = Array.isArray(listJson?.items) ? listJson.items : [];

    debug.calendarList = {
      status: listResponse.status,
      ok: listResponse.ok,
      totalCalendars: calendars.length,
      selectedCalendars: calendars.filter((item: any) => item?.selected !== false).length,
      sample: calendars.slice(0, 5).map((item: any) => ({
        id: item?.id || null,
        summary: item?.summary || null,
        selected: item?.selected !== false,
        primary: Boolean(item?.primary)
      })),
      error: listResponse.ok ? null : listText
    };

    return res.json(debug);
  } catch (error: any) {
    if (isMissingUsuarioIntegracoesTable(error)) {
      return res.status(503).json({
        ok: false,
        step: 'table',
        error:
          'Tabela usuario_integracoes nao encontrada. Crie no banco para habilitar o Google Calendar.'
      });
    }
    return res.status(500).json({
      ok: false,
      step: 'unexpected',
      error: error?.message || 'Falha no debug do calendario.'
    });
  }
});

router.get('/equipamentos', async (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.' });
  }

  try {
    const [rows] = await mysqlPool.query(
      `SELECT nome, patrimonio, tipo
       FROM equipamentos
       WHERE usuario_login = ?
       ORDER BY tipo ASC, nome ASC`,
      [session.user.login]
    );

    const grouped: Record<string, Array<{ nome: string; patrimonio: string }>> = {};
    for (const row of rows as MysqlRow[]) {
      const tipo = String(row.tipo || 'OUTRO');
      if (!grouped[tipo]) grouped[tipo] = [];
      grouped[tipo].push({
        nome: String(row.nome || ''),
        patrimonio: String(row.patrimonio || '')
      });
    }

    return res.json(grouped);
  } catch {
    // Keep compatibility if schema differs.
    return res.json({});
  }
});

// Legacy debug route kept for quick checks.
router.get('/funcionarios-legado', async (req: Request, res: Response) => {
  try {
    const [rows] = await mysqlPool.query('SELECT * FROM usuario WHERE sts = ? ORDER BY nome ASC', [
      'ATIVO'
    ]);
    res.json({ success: true, origem: 'MySQL', dados: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------
// Admin: Intranet CMS
// -------------------------

router.get('/admin/permissoes/:usuario_id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;

  await ensureFeatureTables();
  const usuarioId = toNumber(req.params.usuario_id, 0);
  if (!usuarioId) return res.status(400).json({ error: 'usuario_id invalido.' });

  const [rows] = await mysqlPool.query(
    `SELECT rota, pode_acessar
     FROM permissoes
     WHERE usuario_id = ?
     ORDER BY rota ASC`,
    [usuarioId]
  );

  return res.json(rows);
});

router.post('/admin/permissoes', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;

  await ensureFeatureTables();
  const usuarioId = toNumber(req.body?.usuario_id, 0);
  const rota = normalizeRoutePath(req.body?.rota);
  if (!usuarioId) return res.status(400).json({ error: 'usuario_id invalido.' });
  if (!rota || rota === '/') return res.status(400).json({ error: 'rota invalida.' });

  await mysqlPool.query(
    `INSERT INTO permissoes (usuario_id, rota, pode_acessar)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE pode_acessar = 1`,
    [usuarioId, rota]
  );

  return res.json({ ok: true, acao: 'liberado', usuario_id: usuarioId, rota });
});

router.delete('/admin/permissoes', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;

  await ensureFeatureTables();
  const usuarioId = toNumber(req.body?.usuario_id, 0);
  const rota = normalizeRoutePath(req.body?.rota);
  if (!usuarioId) return res.status(400).json({ error: 'usuario_id invalido.' });
  if (!rota || rota === '/') return res.status(400).json({ error: 'rota invalida.' });

  await mysqlPool.query(
    `INSERT INTO permissoes (usuario_id, rota, pode_acessar)
     VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE pode_acessar = 0`,
    [usuarioId, rota]
  );

  return res.json({ ok: true, acao: 'revogado', usuario_id: usuarioId, rota });
});

router.post('/admin/permissoes/lote', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;

  await ensureFeatureTables();
  const rota = normalizeRoutePath(req.body?.rota);
  const usuarioIds = Array.isArray(req.body?.usuario_ids)
    ? req.body.usuario_ids.map((item: unknown) => toNumber(item, 0)).filter((id: number) => id > 0)
    : [];

  if (!rota || rota === '/') return res.status(400).json({ error: 'rota invalida.' });
  if (!usuarioIds.length) return res.status(400).json({ error: 'usuario_ids invalido.' });

  for (const usuarioId of usuarioIds) {
    await mysqlPool.query(
      `INSERT INTO permissoes (usuario_id, rota, pode_acessar)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE pode_acessar = 1`,
      [usuarioId, rota]
    );
  }

  return res.json({ ok: true, total: usuarioIds.length, rota });
});

router.get('/admin/intranet/config', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  const [rows] = await mysqlPool.query(
    `SELECT id, imagem_inicial_url, updated_by, updated_at
     FROM intranet_config
     ORDER BY id DESC
     LIMIT 1`
  );
  const data = rows as MysqlRow[];
  return res.json(data[0] || {});
});

router.put('/admin/intranet/config', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const imagemInicialUrl = String(req.body?.imagem_inicial_url || '').trim() || null;
  const [rows] = await mysqlPool.query('SELECT id FROM intranet_config ORDER BY id DESC LIMIT 1');
  const existing = rows as MysqlRow[];

  if (!existing.length) {
    await mysqlPool.query(
      `INSERT INTO intranet_config (imagem_inicial_url, updated_by)
       VALUES (?, ?)`,
      [imagemInicialUrl, session.user.login]
    );
  } else {
    await mysqlPool.query(
      `UPDATE intranet_config
       SET imagem_inicial_url = ?, updated_by = ?
       WHERE id = ?`,
      [imagemInicialUrl, session.user.login, existing[0].id]
    );
  }

  return res.json({ success: true });
});

router.get('/admin/intranet/noticias', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  const [rows] = await mysqlPool.query(
    `SELECT id, titulo, conteudo, autor_nome, imagem_destaque_url, data_inicio, data_fim, data_publicacao, ativo
     FROM intranet_noticias
     ORDER BY data_publicacao DESC, id DESC`
  );
  return res.json(rows);
});

router.post('/admin/intranet/noticias', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const titulo = String(req.body?.titulo || '').trim();
  const conteudo = String(req.body?.conteudo || '').trim();
  if (!titulo || !conteudo) {
    return res.status(400).json({ error: 'Titulo e conteudo sao obrigatorios.' });
  }

  const autorNome = String(req.body?.autor_nome || session.user.nome_completo || 'Admin').trim();
  const imagemDestaqueUrl = String(req.body?.imagem_destaque_url || '').trim() || null;
  const dataInicio = toMysqlDateTimeOrNull(req.body?.data_inicio);
  const dataFim = toMysqlDateTimeOrNull(req.body?.data_fim);
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;

  const [result] = await mysqlPool.query(
    `INSERT INTO intranet_noticias (titulo, conteudo, autor_nome, imagem_destaque_url, data_inicio, data_fim, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [titulo, conteudo, autorNome, imagemDestaqueUrl, dataInicio, dataFim, ativo]
  );

  return res.json({ success: true, id: (result as { insertId?: number }).insertId || null });
});

router.put('/admin/intranet/noticias/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const titulo = String(req.body?.titulo || '').trim();
  const conteudo = String(req.body?.conteudo || '').trim();
  if (!titulo || !conteudo) {
    return res.status(400).json({ error: 'Titulo e conteudo sao obrigatorios.' });
  }

  const autorNome = String(req.body?.autor_nome || session.user.nome_completo || 'Admin').trim();
  const imagemDestaqueUrl = String(req.body?.imagem_destaque_url || '').trim() || null;
  const dataInicio = toMysqlDateTimeOrNull(req.body?.data_inicio);
  const dataFim = toMysqlDateTimeOrNull(req.body?.data_fim);
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;

  const [result] = await mysqlPool.query(
    `UPDATE intranet_noticias
     SET titulo = ?, conteudo = ?, autor_nome = ?, imagem_destaque_url = ?, data_inicio = ?, data_fim = ?, ativo = ?
     WHERE id = ?`,
    [titulo, conteudo, autorNome, imagemDestaqueUrl, dataInicio, dataFim, ativo, id]
  );

  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Noticia nao encontrada.' });

  return res.json({ success: true });
});

router.delete('/admin/intranet/noticias/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const [result] = await mysqlPool.query('DELETE FROM intranet_noticias WHERE id = ?', [id]);
  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Noticia nao encontrada.' });

  return res.json({ success: true });
});

router.get('/admin/intranet/eventos', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  const [rows] = await mysqlPool.query(
    `SELECT id, titulo, descricao, data_evento, sede_alvo, ativo
     FROM intranet_eventos
     ORDER BY data_evento ASC, id DESC`
  );
  return res.json(rows);
});

router.post('/admin/intranet/eventos', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const titulo = String(req.body?.titulo || '').trim();
  if (!titulo) return res.status(400).json({ error: 'Titulo e obrigatorio.' });

  const dataEvento = toMysqlDateTimeOrNull(req.body?.data_evento);
  if (!dataEvento) return res.status(400).json({ error: 'Data do evento invalida.' });

  const descricao = String(req.body?.descricao || '').trim() || null;
  const sedeAlvo = normalizeSede(req.body?.sede_alvo);
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;

  const [result] = await mysqlPool.query(
    `INSERT INTO intranet_eventos (titulo, descricao, data_evento, sede_alvo, ativo)
     VALUES (?, ?, ?, ?, ?)`,
    [titulo, descricao, dataEvento, sedeAlvo, ativo]
  );

  return res.json({ success: true, id: (result as { insertId?: number }).insertId || null });
});

router.put('/admin/intranet/eventos/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const titulo = String(req.body?.titulo || '').trim();
  if (!titulo) return res.status(400).json({ error: 'Titulo e obrigatorio.' });

  const dataEvento = toMysqlDateTimeOrNull(req.body?.data_evento);
  if (!dataEvento) return res.status(400).json({ error: 'Data do evento invalida.' });

  const descricao = String(req.body?.descricao || '').trim() || null;
  const sedeAlvo = normalizeSede(req.body?.sede_alvo);
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;

  const [result] = await mysqlPool.query(
    `UPDATE intranet_eventos
     SET titulo = ?, descricao = ?, data_evento = ?, sede_alvo = ?, ativo = ?
     WHERE id = ?`,
    [titulo, descricao, dataEvento, sedeAlvo, ativo, id]
  );

  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Evento nao encontrado.' });

  return res.json({ success: true });
});

router.delete('/admin/intranet/eventos/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const [result] = await mysqlPool.query('DELETE FROM intranet_eventos WHERE id = ?', [id]);
  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Evento nao encontrado.' });

  return res.json({ success: true });
});

router.get('/admin/intranet/projetos', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  const [rows] = await mysqlPool.query(
    `SELECT id, titulo, resumo, descricao, descricao_detalhada, imagem_url, link_url, tipo, pos_x, pos_y, progresso, ativo, ordem, created_at, updated_at
     FROM intranet_projetos
     ORDER BY ordem ASC, id DESC`
  );
  return res.json(rows);
});

router.post('/admin/intranet/projetos', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const titulo = String(req.body?.titulo || '').trim();
  if (!titulo) return res.status(400).json({ error: 'Titulo e obrigatorio.' });

  const descricao = String(req.body?.descricao || '').trim() || null;
  const descricaoDetalhada = String(req.body?.descricao_detalhada || '').trim() || null;
  const resumo = String(req.body?.resumo || '').trim() || null;
  const imagemUrl = String(req.body?.imagem_url || '').trim() || null;
  const linkUrl = String(req.body?.link_url || '').trim() || null;
  const tipoRaw = String(req.body?.tipo || 'cliente').trim().toLowerCase();
  const tipo = tipoRaw === 'projeto' ? 'projeto' : 'cliente';
  const posX = toClampedPosition(req.body?.pos_x, 50);
  const posY = toClampedPosition(req.body?.pos_y, 50);
  const progresso = Math.max(0, Math.min(100, toNumber(req.body?.progresso, 0)));
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;
  const ordem = Math.max(0, toNumber(req.body?.ordem, 0));

  const [result] = await mysqlPool.query(
    `INSERT INTO intranet_projetos
      (titulo, resumo, descricao, descricao_detalhada, imagem_url, link_url, tipo, pos_x, pos_y, progresso, ativo, ordem, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      titulo,
      resumo,
      descricao,
      descricaoDetalhada,
      imagemUrl,
      linkUrl,
      tipo,
      posX,
      posY,
      progresso,
      ativo,
      ordem,
      session.user.login
    ]
  );

  return res.json({ success: true, id: (result as { insertId?: number }).insertId || null });
});

router.put('/admin/intranet/projetos/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const titulo = String(req.body?.titulo || '').trim();
  if (!titulo) return res.status(400).json({ error: 'Titulo e obrigatorio.' });

  const descricao = String(req.body?.descricao || '').trim() || null;
  const descricaoDetalhada = String(req.body?.descricao_detalhada || '').trim() || null;
  const resumo = String(req.body?.resumo || '').trim() || null;
  const imagemUrl = String(req.body?.imagem_url || '').trim() || null;
  const linkUrl = String(req.body?.link_url || '').trim() || null;
  const tipoRaw = String(req.body?.tipo || 'cliente').trim().toLowerCase();
  const tipo = tipoRaw === 'projeto' ? 'projeto' : 'cliente';
  const posX = toClampedPosition(req.body?.pos_x, 50);
  const posY = toClampedPosition(req.body?.pos_y, 50);
  const progresso = Math.max(0, Math.min(100, toNumber(req.body?.progresso, 0)));
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;
  const ordem = Math.max(0, toNumber(req.body?.ordem, 0));

  const [result] = await mysqlPool.query(
    `UPDATE intranet_projetos
     SET titulo = ?, resumo = ?, descricao = ?, descricao_detalhada = ?, imagem_url = ?, link_url = ?, tipo = ?, pos_x = ?, pos_y = ?, progresso = ?, ativo = ?, ordem = ?, updated_by = ?
     WHERE id = ?`,
    [
      titulo,
      resumo,
      descricao,
      descricaoDetalhada,
      imagemUrl,
      linkUrl,
      tipo,
      posX,
      posY,
      progresso,
      ativo,
      ordem,
      session.user.login,
      id
    ]
  );

  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Projeto nao encontrado.' });

  return res.json({ success: true });
});

router.delete('/admin/intranet/projetos/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const [result] = await mysqlPool.query('DELETE FROM intranet_projetos WHERE id = ?', [id]);
  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Projeto nao encontrado.' });

  return res.json({ success: true });
});

router.get('/admin/intranet/enquetes', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  const [rows] = await mysqlPool.query(
    `SELECT id, pergunta, ativo, criado_em
     FROM intranet_enquetes
     ORDER BY criado_em DESC, id DESC`
  );
  const enquetes = rows as MysqlRow[];

  const [options] = await mysqlPool.query(
    `SELECT id, enquete_id, texto_opcao, votos
     FROM intranet_enquete_opcoes
     ORDER BY enquete_id DESC, id ASC`
  );
  const optionRows = options as MysqlRow[];

  const optionsByEnquete = new Map<number, MysqlRow[]>();
  for (const opt of optionRows) {
    const key = Number(opt.enquete_id);
    if (!optionsByEnquete.has(key)) optionsByEnquete.set(key, []);
    optionsByEnquete.get(key)!.push(opt);
  }

  return res.json(
    enquetes.map((e) => ({
      ...e,
      opcoes: optionsByEnquete.get(Number(e.id)) || []
    }))
  );
});

router.post('/admin/intranet/enquetes', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const pergunta = String(req.body?.pergunta || '').trim();
  if (!pergunta) return res.status(400).json({ error: 'Pergunta e obrigatoria.' });
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;

  if (ativo) {
    await mysqlPool.query('UPDATE intranet_enquetes SET ativo = 0 WHERE ativo = 1');
  }

  const [result] = await mysqlPool.query(
    `INSERT INTO intranet_enquetes (pergunta, ativo)
     VALUES (?, ?)`,
    [pergunta, ativo]
  );

  return res.json({ success: true, id: (result as { insertId?: number }).insertId || null });
});

router.put('/admin/intranet/enquetes/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const pergunta = String(req.body?.pergunta || '').trim();
  if (!pergunta) return res.status(400).json({ error: 'Pergunta e obrigatoria.' });
  const ativo = toBoolean(req.body?.ativo, false) ? 1 : 0;

  if (ativo) {
    await mysqlPool.query('UPDATE intranet_enquetes SET ativo = 0 WHERE ativo = 1 AND id <> ?', [id]);
  }

  const [result] = await mysqlPool.query(
    `UPDATE intranet_enquetes
     SET pergunta = ?, ativo = ?
     WHERE id = ?`,
    [pergunta, ativo, id]
  );

  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Enquete nao encontrada.' });

  return res.json({ success: true });
});

router.post('/admin/intranet/enquetes/:id/ativar', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  await mysqlPool.query('UPDATE intranet_enquetes SET ativo = 0 WHERE ativo = 1');
  const [result] = await mysqlPool.query('UPDATE intranet_enquetes SET ativo = 1 WHERE id = ?', [id]);
  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Enquete nao encontrada.' });

  return res.json({ success: true });
});

router.delete('/admin/intranet/enquetes/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const id = toNumber(req.params.id, 0);
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const [result] = await mysqlPool.query('DELETE FROM intranet_enquetes WHERE id = ?', [id]);
  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Enquete nao encontrada.' });

  return res.json({ success: true });
});

router.post('/admin/intranet/enquetes/:id/opcoes', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const enqueteId = toNumber(req.params.id, 0);
  if (!enqueteId) return res.status(400).json({ error: 'ID da enquete invalido.' });

  const textoOpcao = String(req.body?.texto_opcao || '').trim();
  if (!textoOpcao) return res.status(400).json({ error: 'Texto da opcao e obrigatorio.' });

  const [result] = await mysqlPool.query(
    `INSERT INTO intranet_enquete_opcoes (enquete_id, texto_opcao, votos)
     VALUES (?, ?, 0)`,
    [enqueteId, textoOpcao]
  );

  return res.json({ success: true, id: (result as { insertId?: number }).insertId || null });
});

router.put('/admin/intranet/enquetes/opcoes/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const optionId = toNumber(req.params.id, 0);
  if (!optionId) return res.status(400).json({ error: 'ID da opcao invalido.' });

  const textoOpcao = String(req.body?.texto_opcao || '').trim();
  if (!textoOpcao) return res.status(400).json({ error: 'Texto da opcao e obrigatorio.' });

  const [result] = await mysqlPool.query(
    `UPDATE intranet_enquete_opcoes
     SET texto_opcao = ?
     WHERE id = ?`,
    [textoOpcao, optionId]
  );

  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Opcao nao encontrada.' });

  return res.json({ success: true });
});

router.delete('/admin/intranet/enquetes/opcoes/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const optionId = toNumber(req.params.id, 0);
  if (!optionId) return res.status(400).json({ error: 'ID da opcao invalido.' });

  const [result] = await mysqlPool.query('DELETE FROM intranet_enquete_opcoes WHERE id = ?', [
    optionId
  ]);
  const affected = (result as { affectedRows?: number }).affectedRows || 0;
  if (!affected) return res.status(404).json({ error: 'Opcao nao encontrada.' });

  return res.json({ success: true });
});

router.post('/admin/intranet/upload-image', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;

  try {
    const uploaded = await saveBase64Image({
      dataUrl: req.body?.data_url,
      fileName: req.body?.file_name,
      folder: req.body?.folder
    });
    return res.json({ success: true, ...uploaded });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Falha ao enviar imagem.' });
  }
});

router.get('/meus-equipamentos', async (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({
      success: false,
      error: 'Sessao invalida ou expirada.'
    });
  }

  try {
    const [rows] = await mysqlPool.query(
      `SELECT glpi_user_id
       FROM usuario
       WHERE login = ?
       LIMIT 1`,
      [session.user.login]
    );

    const users = rows as MysqlRow[];
    const glpiUserId = Number(users[0]?.glpi_user_id ?? 0);

    if (!glpiUserId) {
      return res.json({
        success: true,
        equipamentos: [],
        mensagem:
          'Usuario sem vinculo GLPI. Preencha o campo glpi_user_id na tabela usuario para visualizar equipamentos.'
      });
    }

    console.log(`GLPI DB: buscando equipamentos para glpi_user_id ${glpiUserId}`);
    const equipamentos = await fetchEquipamentosByGlpiUserId(glpiUserId);

    return res.json({
      success: true,
      equipamentos
    });
  } catch (error: any) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({
        success: false,
        error:
          "Coluna 'glpi_user_id' nao encontrada na tabela usuario. Crie a coluna para usar Meus Equipamentos."
      });
    }
    console.error('Erro na rota /meus-equipamentos:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao consultar equipamentos.'
    });
  }
});

export default router;
