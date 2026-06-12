import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, Request, Response } from 'express';
import { mysqlPool } from '../config/mysql.js';
import { 
  initGLPISession, 
  buscarIdUsuarioGLPI, 
  buscarEquipamentosUsuario, 
  killGLPISession 
} from '../../services/glpiService.ts';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRootDir = path.resolve(__dirname, '../../uploads');

type SessionUser = {
  id: number | string;
  nome_completo: string;
  login: string;
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

const csrfBySessionToken = new Map<string, string>();
const sessionStore = new Map<string, { user: SessionUser; expiresAt: number }>();
let featureTablesReady = false;

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

function sanitizeUserFromRow(row: MysqlRow): SessionUser {
  return {
    id: row.codusu ?? row.id ?? row.codigo ?? row.login,
    nome_completo: String(row.nome ?? row.nome_completo ?? row.login ?? 'Usuario'),
    login: String(row.login ?? ''),
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

async function isAdminUser(login: string) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT grupo, nivel, setor
       FROM usuario
       WHERE login = ?
       LIMIT 1`,
      [login]
    );

    const users = rows as MysqlRow[];
    if (!users.length) return false;
    const row = users[0];

    const grupo = String(row.grupo || '').toUpperCase();
    const setor = String(row.setor || '').toUpperCase();
    const nivel = Number(row.nivel || 0);

    if (grupo.includes('ADMIN') || grupo.includes('RH')) return true;
    if (setor.includes('RH')) return true;
    if (nivel > 0 && nivel <= 2) return true;

    return false;
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

async function ensureFeatureTables() {
  if (featureTablesReady) return;

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
  } catch {
    // If CREATE TABLE permission does not exist, endpoints still work with fallbacks.
  }

  try {
    await mysqlPool.query(`ALTER TABLE intranet_projetos ADD COLUMN resumo VARCHAR(255) NULL`);
  } catch {}
  try {
    await mysqlPool.query(`ALTER TABLE intranet_projetos ADD COLUMN link_url TEXT NULL`);
  } catch {}
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_projetos ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'cliente'`
    );
  } catch {}
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_projetos ADD COLUMN pos_x DECIMAL(6,2) NOT NULL DEFAULT 50.00`
    );
  } catch {}
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_projetos ADD COLUMN pos_y DECIMAL(6,2) NOT NULL DEFAULT 50.00`
    );
  } catch {
    // ignore if column already exists
  } finally {
    featureTablesReady = true;
  }
}

async function fetchNoticiasFromMysql(limit = 50) {
  await ensureFeatureTables();

  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, titulo, conteudo, autor_nome, imagem_destaque_url, data_publicacao
       FROM intranet_noticias
       WHERE ativo = 1
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
    return res.json(freshUser);
  } catch {
    return res.json(session.user);
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

router.get('/calendar/events', (req: Request, res: Response) => {
  res.json([]);
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
    `SELECT id, titulo, conteudo, autor_nome, imagem_destaque_url, data_publicacao, ativo
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
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;

  const [result] = await mysqlPool.query(
    `INSERT INTO intranet_noticias (titulo, conteudo, autor_nome, imagem_destaque_url, ativo)
     VALUES (?, ?, ?, ?, ?)`,
    [titulo, conteudo, autorNome, imagemDestaqueUrl, ativo]
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
  const ativo = toBoolean(req.body?.ativo, true) ? 1 : 0;

  const [result] = await mysqlPool.query(
    `UPDATE intranet_noticias
     SET titulo = ?, conteudo = ?, autor_nome = ?, imagem_destaque_url = ?, ativo = ?
     WHERE id = ?`,
    [titulo, conteudo, autorNome, imagemDestaqueUrl, ativo, id]
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

  let mysqlUserId = Number(session.user.id);
  let glpiUserIdFromMysql: number | null = null;
  if (!Number.isFinite(mysqlUserId) || mysqlUserId <= 0) {
    try {
      const [rows] = await mysqlPool.query(
        `SELECT codusu, id, codigo
         FROM usuario
         WHERE login = ?
         LIMIT 1`,
        [session.user.login]
      );

      const userRows = rows as MysqlRow[];
      if (userRows.length > 0) {
        mysqlUserId = Number(userRows[0].codusu ?? userRows[0].id ?? userRows[0].codigo ?? 0);
      }
    } catch {
      // handled below
    }
  }

  // Optional shortcut: if your usuario table has glpi_user_id, we can skip search/User in GLPI.
  try {
    const [rows] = await mysqlPool.query(
      `SELECT codusu, id, codigo, glpi_user_id
       FROM usuario
       WHERE login = ?
       LIMIT 1`,
      [session.user.login]
    );
    const users = rows as MysqlRow[];
    if (users.length > 0) {
      const row = users[0];
      const mappedMysqlId = Number(row.codusu ?? row.id ?? row.codigo ?? 0);
      if ((!Number.isFinite(mysqlUserId) || mysqlUserId <= 0) && mappedMysqlId > 0) {
        mysqlUserId = mappedMysqlId;
      }
      const mappedGlpiId = Number(row.glpi_user_id ?? 0);
      if (Number.isFinite(mappedGlpiId) && mappedGlpiId > 0) {
        glpiUserIdFromMysql = mappedGlpiId;
      }
    }
  } catch {
    // Table may not have glpi_user_id column yet; continue with admin-number lookup.
  }

  if (!Number.isFinite(mysqlUserId) || mysqlUserId <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Nao foi possivel identificar o ID numerico do usuario para consultar o GLPI.'
    });
  }

  let sessionToken: string | null = null;

  try {
    console.log(`\nGLPI: buscando equipamentos para MySQL user id ${mysqlUserId}`);

    // 2. Inicia a sessão no GLPI
    sessionToken = await initGLPISession();
    
    if (!sessionToken) {
      return res.status(500).json({
        success: false,
        error: 'Falha ao conectar no inventario da empresa.'
      });
    }

    // 3. Resolve GLPI user id:
    //    a) Use glpi_user_id mapped in MySQL if available (bypasses search/User permission)
    //    b) Fallback to admin-number lookup in GLPI
    const glpiUserId =
      glpiUserIdFromMysql && glpiUserIdFromMysql > 0
        ? glpiUserIdFromMysql
        : await buscarIdUsuarioGLPI(sessionToken, Number(mysqlUserId), {
            login: session.user.login,
            email: session.user.email || null
          });
    
    if (!glpiUserId) {
      // Retorna sucesso com array vazio, pois a API funcionou, o usuário só não tem nada lá
      return res.json({
        success: true,
        equipamentos: [],
        mensagem: 'Nenhum usuario vinculado a este ID no inventario do GLPI.'
      });
    }

    // 4. Busca os equipamentos usando o ID interno do GLPI
    const equipamentos = await buscarEquipamentosUsuario(sessionToken, glpiUserId);

    // 5. Devolve tudo limpo para o React renderizar
    return res.json({
      success: true,
      equipamentos 
    });

  } catch (error: any) {
    console.error('Erro na rota /meus-equipamentos:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao consultar equipamentos.'
    });
  } finally {
    // 6. GARANTIA: Sempre fecha a porta do GLPI, dando sucesso ou erro!
    if (sessionToken) {
      await killGLPISession(sessionToken);
    }
  }
});

export default router;
