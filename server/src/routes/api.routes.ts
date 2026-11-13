import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import { mysqlPool } from '../config/mysql.js';
import { RUNTIME_DIR, UPLOADS_DIR } from '../config/paths.js';
import { fetchEquipamentosByGlpiUserId, findGlpiUserIdByEmail } from '../../services/glpiDbService.js';

const router = Router();
const uploadsRootDir = UPLOADS_DIR;
const runtimeDir = RUNTIME_DIR;
const authStateFile = path.join(runtimeDir, 'auth-state.json');

type SessionUser = {
  // id = funcionario_id do APEX (vw_intranet_colaboradores). Sessao sem funcionario_id e antiga: refaz o login.
  id: number | string;
  funcionario_id?: number;
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
// Vai junto do 403 de sessao invalida para o front diferenciar de "sem permissao" e avisar o usuario.
const SESSAO_EXPIRADA_CODE = 'SESSAO_EXPIRADA';
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
// Banco do Apex: pessoas, funcionarios, cargos, departamentos e usuarios_sistema (login).
// O mesmo banco que o Apex edita; o banco de testes antigo nao e mais lido.
const APEX_DATABASE = (process.env.APEX_DATABASE || 'alpes').trim();
// Fotos de funcionarios do sistema novo (Apex): {FUNCIONARIO_FOTO_SOURCE_URL}/{funcionarios.foto}.
// A API do Apex exige autenticacao, entao a intranet busca no servidor e repassa (/api/funcionario-foto).
// FUNCIONARIO_FOTO_AUTH_HEADER (opcional) e enviado nessa busca, ex.: "Authorization: Bearer <token>".
const FUNCIONARIO_FOTO_SOURCE_URL = (
  process.env.FUNCIONARIO_FOTO_SOURCE_URL || 'https://apex.alpesmidia.digital/api/rh/fotos'
)
  .trim()
  .replace(/\/+$/, '');
const FUNCIONARIO_FOTO_AUTH_HEADER = (process.env.FUNCIONARIO_FOTO_AUTH_HEADER || '').trim();
// Nome gerado pelo Apex (hash + extensao); qualquer outra coisa e recusada (evita path traversal).
const FUNCIONARIO_FOTO_ARQUIVO_PATTERN = /^[a-z0-9_-]{8,128}\.(jpe?g|png|webp)$/i;
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || '').trim();
// calendar.readonly cobre leitura de eventos em TODAS as agendas + listagem de agendas
// (calendar.events.readonly nao permite CalendarList.List -> 403 insufficient scopes).
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GOOGLE_PROVIDER = 'google_calendar';
// Front mostra "Conectar com Google" com a mensagem de conexao expirada.
const GOOGLE_RECONECTAR_CODE = 'GOOGLE_RECONECTAR';
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

  return { sessionToken, user: session.user, expiresAt: session.expiresAt };
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

function apexTable(table: string) {
  return `${mysqlPool.escapeId(APEX_DATABASE)}.${mysqlPool.escapeId(table)}`;
}

// Lista da intranet (Nossa Equipe, aniversariantes, campanhas, sorteio): contrato vw_intranet_colaboradores.
// A view so traz funcionario ativo e dados liberados para a intranet (LGPD): e-mail e telefone sao os corporativos.
async function fetchFuncionariosIntranet() {
  const [rows] = await mysqlPool.query(
    `SELECT funcionario_id, nome, foto, cargo, departamento, unidade,
            email_corporativo AS email, telefone_interno AS telefone,
            CONCAT(LPAD(aniversario_dia, 2, '0'), '/', LPAD(aniversario_mes, 2, '0')) AS aniversario
       FROM ${apexTable('vw_intranet_colaboradores')}
      WHERE is_intranet = 1
      ORDER BY nome`
  );
  return rows as MysqlRow[];
}

// Ordem padrao da pagina Nossa Equipe (era fixa no SQL); editavel no admin.
const DEFAULT_SETOR_ORDEM = [
  'CEO',
  'COO',
  'NOVOS NEGÓCIOS',
  'OPERAÇÕES',
  'MIDIA',
  'CRIAÇÃO',
  'MARKETING DIGITAL',
  'REDAÇÃO',
  'OPEC',
  'GENTE E GESTÃO',
  'FACILITIES',
  'FINANCEIRO',
  'FISCAL',
  'JURÍDICO',
  'COMERCIAL',
  'ATENDIMENTO',
  'CONTROLADORIA',
  'ADMINISTRATIVO',
  'TECNOLOGIA',
  'SECRETÁRIA',
  'ANTENA 1',
  'LOCUÇÃO'
];

// Compara setores ignorando acento/caixa (ex.: JURÍDICO x JURIDICO).
function setorKey(setor: unknown) {
  return String(setor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

async function fetchSetorOrdem() {
  await ensureFeatureTables();
  const ordem = new Map<string, number>();
  try {
    const [rows] = await mysqlPool.query('SELECT setor, ordem FROM intranet_setor_ordem');
    for (const row of rows as MysqlRow[]) ordem.set(setorKey(row.setor), Number(row.ordem));
  } catch (error) {
    console.error('Falha ao carregar ordem dos setores:', error);
  }
  return ordem;
}

function compareBySetorOrdem(ordem: Map<string, number>, a: unknown, b: unknown) {
  const keyA = setorKey(a);
  const keyB = setorKey(b);
  const posA = ordem.get(keyA) ?? Number.MAX_SAFE_INTEGER;
  const posB = ordem.get(keyB) ?? Number.MAX_SAFE_INTEGER;
  if (posA !== posB) return posA - posB;
  if (posA !== Number.MAX_SAFE_INTEGER || keyA === keyB) return 0;
  // Setores sem posicao: agrupados em ordem alfabetica, sem setor por ultimo.
  if (!keyA || !keyB) return keyA ? -1 : 1;
  return keyA.localeCompare(keyB, 'pt-BR');
}

// Caminho do proxy da foto (relativo, para gravar no banco). null se o arquivo nao for valido.
function funcionarioFotoPath(foto: unknown) {
  const arquivo = String(foto || '').trim();
  if (!FUNCIONARIO_FOTO_SOURCE_URL || !FUNCIONARIO_FOTO_ARQUIVO_PATTERN.test(arquivo)) return null;
  return `/api/funcionario-foto/${encodeURIComponent(arquivo)}`;
}

// Foto vem so do sistema novo (funcionarios.foto). Sem foto la, o front mostra as iniciais.
function funcionarioImageUrl(row: MysqlRow) {
  const fotoPath = funcionarioFotoPath(row.foto);
  return fotoPath ? backendPublicUrl(fotoPath) : null;
}

function funcionarioFotoHeaders() {
  const separator = FUNCIONARIO_FOTO_AUTH_HEADER.indexOf(':');
  if (separator <= 0) return undefined;
  return {
    [FUNCIONARIO_FOTO_AUTH_HEADER.slice(0, separator).trim()]: FUNCIONARIO_FOTO_AUTH_HEADER.slice(
      separator + 1
    ).trim()
  };
}

// URL de arquivo servido pelo backend (/uploads, /api); no dev o front roda em outra porta.
function backendPublicUrl(pathOrUrl: string) {
  if (!pathOrUrl.startsWith('/') || !USER_PHOTO_PROXY_PUBLIC_BASE_URL) return pathOrUrl;
  return `${USER_PHOTO_PROXY_PUBLIC_BASE_URL.replace(/\/+$/, '')}${pathOrUrl}`;
}

const FOTO_CAMPANHA_TEMAS = ['criancas', 'natal', 'pascoa', 'halloween', 'outro'];
const DATA_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Data de hoje no fuso da empresa (o servidor/MySQL podem estar em UTC).
function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

type FotoCampanhaAtiva = {
  imagem_url: string;
  campanha: { id: number; nome: string; tema: string; revelar: boolean };
};

// Foto de campanha vigente por funcionario. Com campanhas sobrepostas vale a que comecou por ultimo.
const TEMA_FESTIVO_MODOS = ['auto', 'nenhum', 'halloween', 'natal'] as const;
type TemaFestivoModo = (typeof TEMA_FESTIVO_MODOS)[number];

function normalizarTemaFestivo(valor: unknown): TemaFestivoModo {
  const modo = String(valor || '').trim().toLowerCase();
  return (TEMA_FESTIVO_MODOS as readonly string[]).includes(modo) ? (modo as TemaFestivoModo) : 'auto';
}

// "auto": Halloween em outubro; Natal de 1/dez a 6/jan (Dia de Reis). Data de Sao Paulo.
function resolverTemaFestivo(modo: TemaFestivoModo): 'halloween' | 'natal' | null {
  if (modo === 'nenhum') return null;
  if (modo !== 'auto') return modo;
  const [, mes, dia] = hojeSaoPaulo().split('-').map(Number);
  if (mes === 10) return 'halloween';
  if (mes === 12 || (mes === 1 && dia <= 6)) return 'natal';
  return null;
}

async function fetchFotosCampanhaAtivas() {
  await ensureFeatureTables();
  const fotos = new Map<number, FotoCampanhaAtiva>();
  try {
    const [rows] = await mysqlPool.query(
      `SELECT f.funcionario_id, f.imagem_url, c.id, c.nome, c.tema, c.revelar
         FROM intranet_foto_campanha_fotos f
         JOIN intranet_foto_campanhas c ON c.id = f.campanha_id
        WHERE c.ativo = 1 AND ? BETWEEN c.data_inicio AND c.data_fim
        ORDER BY c.data_inicio DESC, c.id DESC`,
      [hojeSaoPaulo()]
    );
    for (const row of rows as MysqlRow[]) {
      const funcionarioId = Number(row.funcionario_id);
      if (fotos.has(funcionarioId)) continue;
      fotos.set(funcionarioId, {
        imagem_url: backendPublicUrl(String(row.imagem_url)),
        campanha: {
          id: Number(row.id),
          nome: String(row.nome),
          tema: String(row.tema),
          revelar: toBoolean(row.revelar, true)
        }
      });
    }
  } catch (error) {
    console.error('Falha ao carregar campanhas de foto:', error);
  }
  return fotos;
}

function parseFotoCampanhaBody(body: any) {
  const nome = String(body?.nome || '').trim().slice(0, 120);
  const tema = FOTO_CAMPANHA_TEMAS.includes(String(body?.tema)) ? String(body.tema) : 'outro';
  const dataInicio = String(body?.data_inicio || '').trim();
  const dataFim = String(body?.data_fim || '').trim();

  if (!nome) return { error: 'Informe o nome da campanha.' };
  if (!DATA_ISO_PATTERN.test(dataInicio) || !DATA_ISO_PATTERN.test(dataFim)) {
    return { error: 'Informe as datas de inicio e fim.' };
  }
  if (dataFim < dataInicio) return { error: 'A data de fim deve ser igual ou posterior ao inicio.' };

  return {
    values: {
      nome,
      tema,
      data_inicio: dataInicio,
      data_fim: dataFim,
      revelar: toBoolean(body?.revelar, true) ? 1 : 0,
      ativo: toBoolean(body?.ativo, true) ? 1 : 0
    }
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
    const error: Error & { googleError?: string } = new Error(`Falha ao renovar token Google: ${payload}`);
    try {
      error.googleError = String(JSON.parse(payload)?.error || '');
    } catch {
      // resposta sem JSON
    }
    throw error;
  }

  return (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
}

async function resolveMysqlUserIdFromSession(session: { user: SessionUser }) {
  return funcionarioIdDaSessao(session.user);
}

async function getGoogleIntegrationByUserId(userId: number) {
  await ensureFeatureTables();
  const [rows] = await mysqlPool.query(
    `SELECT usuario_id, provider, access_token, refresh_token, access_token_expires_at, scope
     FROM intranet_integracoes
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
    `INSERT INTO intranet_integracoes
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

// Admin e decidido no APEX (permissao "intranet > admin > acessar" -> is_admin_intranet na view).
// A intranet nao tem cadastro proprio de admins. Relido a cada acesso admin (cache curto).
async function isAdminUser(user: SessionUser) {
  const funcionarioId = funcionarioIdDaSessao(user);
  if (!funcionarioId) return false;
  try {
    const colaborador = await buscarColaborador('funcionario', funcionarioId);
    return Number(colaborador?.is_admin_intranet) === 1;
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
    res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
    return null;
  }

  if (options?.requireCsrf && !isCsrfValid(req, session.sessionToken)) {
    res.status(403).json({ error: 'CSRF token invalido.' });
    return null;
  }

  const allowed = await isAdminUser(session.user);
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

const YOUTUBE_URL_PATTERN =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{6,}/i;

function isValidYoutubeUrl(value: string) {
  return YOUTUBE_URL_PATTERN.test(value.trim());
}

function isValidVideoFileUrl(value: string) {
  return /^https?:\/\/[^\s]+\.(mp4|webm)(\?[^\s]*)?$/i.test(value.trim());
}

// funcionario_id do APEX guardado na sessao. null em sessao antiga (anterior a view).
function funcionarioIdDaSessao(user: SessionUser) {
  const funcionarioId = Number(user.funcionario_id);
  return Number.isInteger(funcionarioId) && funcionarioId > 0 ? funcionarioId : null;
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

    // Conexoes do Google Agenda por funcionario_id do APEX (usuario_id = funcionario_id).
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_integracoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        provider VARCHAR(50) NOT NULL,
        access_token TEXT NULL,
        refresh_token TEXT NULL,
        access_token_expires_at DATETIME NULL,
        scope VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_usuario_provider (usuario_id, provider)
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_setor_ordem (
        setor VARCHAR(120) NOT NULL PRIMARY KEY,
        ordem INT NOT NULL,
        updated_by VARCHAR(255) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Campanhas de foto (ex.: Dia das Criancas): troca temporaria da foto, sem mexer na oficial do Apex.
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_foto_campanhas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(120) NOT NULL,
        tema VARCHAR(20) NOT NULL DEFAULT 'outro',
        data_inicio DATE NOT NULL,
        data_fim DATE NOT NULL,
        revelar TINYINT(1) NOT NULL DEFAULT 1,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        updated_by VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // funcionario_id e o id de funcionarios em APEX_DATABASE (outro banco: sem FK).
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_foto_campanha_fotos (
        campanha_id INT NOT NULL,
        funcionario_id INT NOT NULL,
        imagem_url TEXT NOT NULL,
        updated_by VARCHAR(255) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (campanha_id, funcionario_id),
        CONSTRAINT fk_foto_campanha_fotos_campanha
          FOREIGN KEY (campanha_id) REFERENCES intranet_foto_campanhas(id)
          ON DELETE CASCADE
      )
    `);

    // Galeria de fotos: albuns (eventos) com as fotos enviadas pelo admin.
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_galeria_albuns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(120) NOT NULL,
        descricao TEXT NULL,
        data_evento DATE NULL,
        capa_foto_id INT NULL,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        updated_by VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_galeria_fotos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        album_id INT NOT NULL,
        imagem_url TEXT NOT NULL,
        legenda VARCHAR(255) NULL,
        largura INT NULL,
        altura INT NULL,
        ordem INT NOT NULL DEFAULT 0,
        created_by VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_galeria_fotos_album (album_id, ordem),
        CONSTRAINT fk_galeria_fotos_album
          FOREIGN KEY (album_id) REFERENCES intranet_galeria_albuns(id)
          ON DELETE CASCADE
      )
    `);

    // Notificacoes que so aparecem no sino (nao viram noticia). Ex.: resultado de sorteio.
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_notificacoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(30) NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        mensagem TEXT NULL,
        imagem_url VARCHAR(255) NULL,
        criado_por VARCHAR(255) NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Historico do sorteador. participantes = JSON [{id, nome, setor}] do momento do sorteio.
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS intranet_sorteios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        premio VARCHAR(255) NOT NULL,
        vencedor_funcionario_id INT NOT NULL,
        vencedor_nome VARCHAR(255) NOT NULL,
        vencedor_setor VARCHAR(120) NULL,
        vencedor_foto VARCHAR(160) NULL,
        participantes_total INT NOT NULL,
        participantes MEDIUMTEXT NOT NULL,
        noticia_id INT NULL,
        realizado_por VARCHAR(255) NULL,
        realizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [ordemRows] = await mysqlPool.query('SELECT COUNT(*) AS total FROM intranet_setor_ordem');
    if (Number((ordemRows as MysqlRow[])[0]?.total || 0) === 0) {
      await mysqlPool.query('INSERT INTO intranet_setor_ordem (setor, ordem) VALUES ?', [
        DEFAULT_SETOR_ORDEM.map((setor, index) => [setor, index + 1])
      ]);
    }

  } catch (error) {
    migrationFailed = true;
    console.error('Falha ao criar tabelas da intranet:', error);
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
  }
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_config ADD COLUMN fala_alpes_video_url TEXT NULL`
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna fala_alpes_video_url em intranet_config:', error);
    }
  }
  try {
    await mysqlPool.query(`ALTER TABLE intranet_config ADD COLUMN sobre_video_url TEXT NULL`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna sobre_video_url em intranet_config:', error);
    }
  }
  // Tema festivo da intranet: auto (pela data), nenhum, halloween ou natal.
  try {
    await mysqlPool.query(
      `ALTER TABLE intranet_config ADD COLUMN tema_festivo VARCHAR(20) NOT NULL DEFAULT 'auto'`
    );
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna tema_festivo em intranet_config:', error);
    }
  }
  // Sorteios novos avisam pelo sino (intranet_notificacoes); noticia_id fica so para os antigos.
  try {
    await mysqlPool.query(`ALTER TABLE intranet_sorteios ADD COLUMN notificacao_id INT NULL`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') {
      migrationFailed = true;
      console.error('Falha ao adicionar coluna notificacao_id em intranet_sorteios:', error);
    }
  } finally {
    featureTablesReady = !migrationFailed;
  }
}

async function fetchNoticiasFromMysql(limit = 50) {
  await ensureFeatureTables();

  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, titulo, conteudo, autor_nome, imagem_destaque_url, DATE_FORMAT(data_inicio, '%Y-%m-%d %H:%i') AS data_inicio,
              DATE_FORMAT(data_fim, '%Y-%m-%d %H:%i') AS data_fim, data_publicacao
       FROM intranet_noticias
       WHERE ativo = 1
         AND (data_inicio IS NULL OR data_inicio <= NOW())
         AND (data_fim IS NULL OR data_fim >= NOW())
       ORDER BY data_publicacao DESC
       LIMIT ?`,
      [limit]
    );

    const noticias = rows as MysqlRow[];
    return noticias;
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
      return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
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

router.get('/funcionario-foto/:arquivo', async (req: Request, res: Response) => {
  if (USER_PHOTO_PROXY_REQUIRE_AUTH && !getSessionUser(req)) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
  }

  const arquivo = String(req.params.arquivo || '');
  if (!FUNCIONARIO_FOTO_ARQUIVO_PATTERN.test(arquivo)) {
    return res.status(400).json({ error: 'Arquivo de foto invalido.' });
  }

  try {
    const response = await fetch(`${FUNCIONARIO_FOTO_SOURCE_URL}/${arquivo}`, {
      headers: funcionarioFotoHeaders(),
      signal: AbortSignal.timeout(10000)
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.startsWith('image/')) {
      if (response.status === 401 || response.status === 403) {
        console.warn(
          `Foto de funcionario: o Apex recusou o acesso (${response.status}). Configure FUNCIONARIO_FOTO_AUTH_HEADER.`
        );
      }
      return res.status(404).json({ error: 'Foto nao encontrada.' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(Buffer.from(await response.arrayBuffer()));
  } catch {
    return res.status(502).json({ error: 'Falha ao buscar a foto.' });
  }
});

// --- Colaboradores do APEX: contrato vw_intranet_colaboradores ---
// So funcionario ATIVO esta na view (desligado some sozinho). Cache curto: desligamento e mudanca
// de admin valem em poucos minutos sem consultar o banco a cada requisicao.
const COLABORADOR_CACHE_MS = 2 * 60 * 1000;
const colaboradorCache = new Map<string, { row: MysqlRow | null; em: number }>();

async function buscarColaborador(por: 'email' | 'pessoa' | 'funcionario', valor: string | number) {
  const chave = `${por}:${String(valor).trim().toLowerCase()}`;
  const guardado = colaboradorCache.get(chave);
  if (guardado && now() - guardado.em < COLABORADOR_CACHE_MS) return guardado.row;

  const filtro =
    por === 'email'
      ? 'email_corporativo = LOWER(TRIM(?))'
      : por === 'pessoa'
        ? 'pessoa_id = ?'
        : 'funcionario_id = ?';
  const [rows] = await mysqlPool.query(
    `SELECT * FROM ${apexTable('vw_intranet_colaboradores')} WHERE ${filtro} LIMIT 1`,
    [valor]
  );
  const row = (rows as MysqlRow[])[0] || null;
  if (colaboradorCache.size > 500) colaboradorCache.clear();
  colaboradorCache.set(chave, { row, em: now() });
  return row;
}

// Login com senha: a usuarios_sistema do APEX so confere login, senha e se o acesso esta ativo.
// Quem e a pessoa, se pode entrar e se e admin vem da view, pelo pessoa_id. Aceita o e-mail corporativo no lugar do login.
async function buscarCredencialSistema(login: string) {
  const [rows] = await mysqlPool.query(
    `SELECT pessoa_id, senha_hash, is_ativo FROM ${apexTable('usuarios_sistema')} WHERE login = ? LIMIT 1`,
    [login]
  );
  const porLogin = (rows as MysqlRow[])[0];
  if (porLogin || !login.includes('@')) return porLogin || null;

  const colaborador = await buscarColaborador('email', login);
  if (!colaborador) return null;
  const [porPessoa] = await mysqlPool.query(
    `SELECT pessoa_id, senha_hash, is_ativo FROM ${apexTable('usuarios_sistema')} WHERE pessoa_id = ? LIMIT 1`,
    [colaborador.pessoa_id]
  );
  return (porPessoa as MysqlRow[])[0] || null;
}

async function sessionUserDoColaborador(row: MysqlRow): Promise<SessionUser> {
  const funcionarioId = Number(row.funcionario_id);
  let fotoCampanha: string | null = null;
  try {
    // Com campanha vigente, a foto tematica tambem aparece no topo (igual a Nossa Equipe).
    fotoCampanha = (await fetchFotosCampanhaAtivas()).get(funcionarioId)?.imagem_url || null;
  } catch (error) {
    console.error('Falha ao buscar foto de campanha do usuario:', error);
  }
  return {
    id: funcionarioId,
    funcionario_id: funcionarioId,
    nome_completo: String(row.nome || 'Usuario'),
    login: String(row.email_corporativo || ''),
    role: Number(row.is_admin_intranet) === 1 ? 'admin' : 'user',
    sede: row.unidade ?? null,
    email: row.email_corporativo ?? null,
    imagem_url: fotoCampanha || funcionarioImageUrl(row),
    grupo: row.departamento ?? null,
    nivel: null
  };
}

// Senha do Apex: "scrypt$<salt hex>$<chave hex>" (scrypt N=16384, r=8, p=1).
// Aceita o salt como texto ou como bytes, porque o formato nao diz qual dos dois o Apex usa.
function derivarScrypt(senha: string, salt: string | Buffer, tamanho: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(senha, salt, tamanho, (error, chave) => (error ? reject(error) : resolve(chave)))
  );
}

async function conferirSenhaScrypt(senha: string, hash: unknown) {
  const partes = String(hash || '').split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const [, saltHex, chaveHex] = partes;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(chaveHex)) return false;
  const esperada = Buffer.from(chaveHex, 'hex');
  for (const salt of [saltHex, Buffer.from(saltHex, 'hex')]) {
    const chave = await derivarScrypt(senha, salt, esperada.length);
    if (timingSafeEqual(chave, esperada)) return true;
  }
  return false;
}

// Cria a sessao e grava os cookies. Usado pelo login com senha e pelo login com Google.
// colaborador = linha da vw_intranet_colaboradores.
async function abrirSessao(res: Response, colaborador: MysqlRow) {
  const sessionToken = createToken(32);
  const csrfToken = createToken(24);
  const user = await sessionUserDoColaborador(colaborador);

  sessionStore.set(sessionToken, { user, expiresAt: now() + SESSION_TTL_MS });
  csrfBySessionToken.set(sessionToken, csrfToken);
  persistAuthState();

  setCookie(res, AUTH_COOKIE_NAME, sessionToken, { maxAgeMs: SESSION_TTL_MS });
  setCookie(res, CSRF_COOKIE_NAME, csrfToken, { httpOnly: false, maxAgeMs: SESSION_TTL_MS });
  return user;
}

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
    const credencial = await buscarCredencialSistema(login);
    if (!credencial || !(await conferirSenhaScrypt(senha, credencial.senha_hash))) {
      return res.status(401).json({ error: 'Credenciais invalidas.' });
    }
    if (!toBoolean(credencial.is_ativo)) {
      return res.status(403).json({ error: 'Usuario inativo.' });
    }
    const colaborador = await buscarColaborador('pessoa', Number(credencial.pessoa_id));
    if (!colaborador) {
      return res
        .status(403)
        .json({ error: 'Acesso nao liberado: voce nao esta ativo no cadastro de funcionarios.' });
    }

    const user = await abrirSessao(res, colaborador);
    return res.json({ success: true, user });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao processar login.' });
  }
});

router.get('/auth/user', async (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
  }

  try {
    // Sessao antiga (sem funcionario_id) ou funcionario que saiu da view (desligado): refaz o login.
    const funcionarioId = funcionarioIdDaSessao(session.user);
    const colaborador = funcionarioId ? await buscarColaborador('funcionario', funcionarioId) : null;
    if (!colaborador) {
      sessionStore.delete(session.sessionToken);
      csrfBySessionToken.delete(session.sessionToken);
      persistAuthState();
      return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
    }

    const freshUser = await sessionUserDoColaborador(colaborador);
    const expiresAt = now() + SESSION_TTL_MS;
    sessionStore.set(session.sessionToken, { user: freshUser, expiresAt });
    persistAuthState();
    // sessao_expira_em: o front avisa antes de expirar e oferece renovar (chamando esta rota de novo).
    return res.json({ ...freshUser, sessao_expira_em: expiresAt });
  } catch {
    return res.json({ ...session.user, sessao_expira_em: session.expiresAt });
  }
});

// So consulta a validade, sem renovar (o /auth/user renova): o aviso de expiracao confere aqui
// antes de avisar, porque outra aba pode ter renovado a sessao.
router.get('/auth/sessao', (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    return res
      .status(403)
      .json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
  }
  return res.json({ sessao_expira_em: session.expiresAt });
});

// Admin (decidido no APEX) ve tudo; os demais so as telas publicas. Nao ha liberacao por usuario.
router.get('/minhas-permissoes', (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
  }
  return res.json({ admin: session.user.role === 'admin', permissoes: [] });
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
    const [rows, setorOrdem, fotosCampanha] = await Promise.all([
      fetchFuncionariosIntranet(),
      fetchSetorOrdem(),
      fetchFotosCampanhaAtivas()
    ]);
    // sort estavel: dentro do mesmo setor mantem a ordem por nome do SQL.
    rows.sort((a, b) => compareBySetorOrdem(setorOrdem, a.departamento, b.departamento));

    const data = rows.map((row) => {
      const fotoOficial = funcionarioImageUrl(row);
      const campanha = fotosCampanha.get(Number(row.funcionario_id));
      return {
        id: row.funcionario_id,
        nome_formatado: row.nome,
        setor: row.departamento || '',
        cargo: row.cargo || '',
        email: row.email || '',
        fone: row.telefone || '',
        telefone: row.telefone || '',
        // Com campanha vigente a foto tematica substitui a oficial em todas as telas.
        imagem_url: campanha?.imagem_url || fotoOficial,
        imagem_oficial_url: campanha ? fotoOficial : undefined,
        campanha: campanha?.campanha,
        aniversario: row.aniversario || null
      };
    });

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Falha ao carregar equipe.' });
  }
});

router.get('/todos-funcionarios', async (req: Request, res: Response) => {
  try {
    const rows = await fetchFuncionariosIntranet();

    const data = rows.map((row) => ({
      id: row.funcionario_id,
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

// Notificacoes do sino que nao sao noticias (ex.: resultado de sorteio). Ultimos 60 dias.
router.get('/notificacoes', async (req: Request, res: Response) => {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
  }
  await ensureFeatureTables();

  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, tipo, titulo, mensagem, imagem_url,
              DATE_FORMAT(criado_em, '%Y-%m-%dT%H:%i:%s') AS criado_em
         FROM intranet_notificacoes
        WHERE criado_em >= DATE_SUB(NOW(), INTERVAL 60 DAY)
        ORDER BY id DESC
        LIMIT 30`
    );
    return res.json(
      (rows as MysqlRow[]).map((row) => {
        const imagem = String(row.imagem_url || '');
        return {
          id: row.id,
          tipo: row.tipo,
          titulo: row.titulo,
          mensagem: row.mensagem || '',
          imagem_url: imagem.startsWith('/') ? backendPublicUrl(imagem) : imagem || null,
          criado_em: row.criado_em
        };
      })
    );
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar notificacoes.' });
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
      `SELECT id, imagem_inicial_url, fala_alpes_video_url, sobre_video_url, updated_by, updated_at
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

// Publico: a tela de login tambem usa. So diz qual enfeite mostrar.
router.get('/tema-festivo', async (req: Request, res: Response) => {
  await ensureFeatureTables();
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [rows] = await mysqlPool.query(
      'SELECT tema_festivo FROM intranet_config ORDER BY id DESC LIMIT 1'
    );
    const modo = normalizarTemaFestivo((rows as MysqlRow[])[0]?.tema_festivo);
    return res.json({ modo, tema: resolverTemaFestivo(modo) });
  } catch {
    return res.json({ modo: 'auto', tema: resolverTemaFestivo('auto') });
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
    const userSede = normalizeSede(session?.user?.sede);

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
    await mysqlPool.query('SELECT 1 FROM intranet_integracoes LIMIT 1');
  } catch (error: any) {
    if (isMissingUsuarioIntegracoesTable(error)) {
      return res.status(503).json({
        error:
          'Tabela intranet_integracoes nao encontrada. Crie no banco para habilitar o Google Calendar.'
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

// --- Login com conta Google ---
// Usa o mesmo app OAuth e o mesmo redirect URI ja cadastrados para o calendario: o "state"
// diz se o retorno e de um login ou de uma conexao de agenda.
const GOOGLE_LOGIN_SCOPE = 'openid email profile';
const GOOGLE_LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
const googleLoginState = new Map<string, { next: string; createdAt: number }>();

// So caminhos internos ("/noticias"), nunca outro site ("//x.com", "https://...").
function destinoSeguro(valor: unknown) {
  const next = String(valor || '');
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/dashboard';
}

function redirecionarLoginComErro(res: Response, motivo: string, next = '/dashboard') {
  const params = new URLSearchParams({ google_erro: motivo });
  if (next !== '/dashboard') params.set('next', next);
  return res.redirect(`${FRONTEND_BASE_URL}/login?${params.toString()}`);
}

router.get('/auth/google/login', (req: Request, res: Response) => {
  const next = destinoSeguro(req.query.next);
  if (!hasGoogleCalendarConfig()) return redirecionarLoginComErro(res, 'nao_configurado', next);

  const limite = now() - GOOGLE_LOGIN_STATE_TTL_MS;
  for (const [chave, valor] of googleLoginState.entries()) {
    if (valor.createdAt < limite) googleLoginState.delete(chave);
  }

  const state = createToken(16);
  googleLoginState.set(state, { next, createdAt: now() });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_LOGIN_SCOPE,
    prompt: 'select_account',
    state
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

async function handleGoogleLoginCallback(req: Request, res: Response, next: string) {
  const code = String(req.query.code || '');
  // Usuario clicou em "Cancelar" na tela do Google.
  if (!code) return redirecionarLoginComErro(res, req.query.error ? 'cancelado' : 'falha', next);

  try {
    const token = await exchangeGoogleCodeForToken(code);
    const perfilResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!perfilResponse.ok) throw new Error(`userinfo ${perfilResponse.status}`);
    const perfil = (await perfilResponse.json()) as { email?: string; email_verified?: boolean };

    const email = String(perfil.email || '').trim().toLowerCase();
    if (!email || perfil.email_verified === false) return redirecionarLoginComErro(res, 'email_nao_verificado', next);

    const colaborador = await buscarColaborador('email', email);
    if (!colaborador) return redirecionarLoginComErro(res, 'nao_cadastrado', next);

    await abrirSessao(res, colaborador);
    return res.redirect(`${FRONTEND_BASE_URL}${next}`);
  } catch (error) {
    console.error('Falha no login com Google:', error);
    return redirecionarLoginComErro(res, 'falha', next);
  }
}

async function handleGoogleCalendarOAuthCallback(req: Request, res: Response) {
  const loginState = googleLoginState.get(String(req.query.state || ''));
  if (loginState) {
    googleLoginState.delete(String(req.query.state));
    if (now() - loginState.createdAt > GOOGLE_LOGIN_STATE_TTL_MS) {
      return redirecionarLoginComErro(res, 'expirado', loginState.next);
    }
    return handleGoogleLoginCallback(req, res, loginState.next);
  }

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
    return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
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
          'Tabela intranet_integracoes nao encontrada. Crie no banco para habilitar o Google Calendar.'
      });
    }
    // invalid_grant = o Google nao aceita mais o refresh_token (acesso revogado, senha trocada,
    // app em modo "Teste" expira em 7 dias...). Limpa e pede para conectar de novo, em vez de
    // devolver 500 e a tela ficar vazia. Outros erros (invalid_client) sao de configuracao: nao apaga.
    if (error?.googleError === 'invalid_grant') {
      await mysqlPool.query(
        `UPDATE intranet_integracoes
         SET access_token = NULL, refresh_token = NULL, access_token_expires_at = NULL
         WHERE usuario_id = ? AND provider = ?`,
        [userId, GOOGLE_PROVIDER]
      );
      return res.status(403).json({
        error: 'Google Calendar desconectado. Conecte novamente.',
        code: GOOGLE_RECONECTAR_CODE
      });
    }
    return res.status(500).json({ error: error?.message || 'Falha ao validar token do Google Calendar.' });
  }
  if (!accessToken) {
    return res.status(403).json({ error: 'Google Calendar nao conectado.' });
  }

  try {
    // Desde o inicio do mes anterior: o calendario mostra o mes inteiro (nao so de hoje em diante)
    // e da para voltar um mes. O front filtra os "Proximos eventos".
    const inicio = new Date();
    const timeMin = new Date(inicio.getFullYear(), inicio.getMonth() - 1, 1).toISOString();
    const timeMax = new Date(now() + 1000 * 60 * 60 * 24 * 120).toISOString();

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

    const response = await fetchCalendarEvents('primary', 250);

    if (!response.ok) {
      if (response.status === 401) {
        await mysqlPool.query(
          `UPDATE intranet_integracoes
           SET access_token = NULL, access_token_expires_at = NULL
           WHERE usuario_id = ? AND provider = ?`,
          [userId, GOOGLE_PROVIDER]
        );
        return res.status(403).json({
          error: 'Google Calendar desconectado. Conecte novamente.',
          code: GOOGLE_RECONECTAR_CODE
        });
      }
      const text = await response.text();
      return res.status(500).json({ error: `Falha ao buscar eventos no Google: ${text}` });
    }

    const payload = (await response.json()) as { items?: any[] };
    const primaryItems = Array.isArray(payload.items) ? payload.items : [];

    // Junta os eventos da agenda primary com os das demais agendas do usuario
    // (eventos pessoais costumam ficar em agendas secundarias, nao na primary).
    const eventsById = new Map<string, any>();
    const pushItems = (items: any[]) => {
      for (const item of items) {
        const key = String(item?.id || item?.iCalUID || `${item?.summary}-${item?.start?.dateTime || item?.start?.date}`);
        if (!eventsById.has(key)) eventsById.set(key, item);
      }
    };
    pushItems(primaryItems);

    const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (listResponse.ok) {
      const listPayload = (await listResponse.json()) as { items?: Array<{ id?: string; selected?: boolean; primary?: boolean }> };
      const calendarIds = (listPayload.items || [])
        .filter((item) => Boolean(item?.id) && item.selected !== false && !item.primary)
        .map((item) => String(item.id))
        .slice(0, 15);

      for (const calendarId of calendarIds) {
        const calendarResponse = await fetchCalendarEvents(calendarId, 250);
        if (!calendarResponse.ok) continue;
        const calendarPayload = (await calendarResponse.json()) as { items?: any[] };
        pushItems(Array.isArray(calendarPayload.items) ? calendarPayload.items : []);
        if (eventsById.size >= 500) break;
      }
    }

    const allItems = Array.from(eventsById.values()).sort((a, b) => {
      const left = new Date(a?.start?.dateTime || a?.start?.date || 0).getTime();
      const right = new Date(b?.start?.dateTime || b?.start?.date || 0).getTime();
      return left - right;
    });

    return res.json(allItems.slice(0, 100));
  } catch (error: any) {
    if (isMissingUsuarioIntegracoesTable(error)) {
      return res.status(503).json({
        error:
          'Tabela intranet_integracoes nao encontrada. Crie no banco para habilitar o Google Calendar.'
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
    return res.status(403).json({ ok: false, step: 'session', error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
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
        message: 'Nenhum registro em intranet_integracoes para este usuario.'
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

    // Qual conta Google esta conectada (id da agenda primary == e-mail da conta)
    let connectedAccount: string | null = null;
    try {
      const meResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (meResponse.ok) {
        const meJson = (await meResponse.json()) as { id?: string };
        connectedAccount = meJson?.id || null;
      }
    } catch {
      // noop
    }

    const debug: Record<string, any> = {
      ok: true,
      userId,
      provider: GOOGLE_PROVIDER,
      connectedAccount,
      grantedScope: integration.scope || null,
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
          'Tabela intranet_integracoes nao encontrada. Crie no banco para habilitar o Google Calendar.'
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
    return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
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

// -------------------------
// Admin: Intranet CMS
// -------------------------

router.get('/admin/intranet/config', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  const [rows] = await mysqlPool.query(
    `SELECT id, imagem_inicial_url, fala_alpes_video_url, sobre_video_url, tema_festivo, updated_by, updated_at
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

  const [rows] = await mysqlPool.query(
    `SELECT id, imagem_inicial_url, fala_alpes_video_url, sobre_video_url, tema_festivo
     FROM intranet_config
     ORDER BY id DESC
     LIMIT 1`
  );
  const existing = rows as MysqlRow[];
  const current = existing[0];

  const imagemInicialUrl =
    req.body?.imagem_inicial_url !== undefined
      ? String(req.body.imagem_inicial_url || '').trim() || null
      : current?.imagem_inicial_url ?? null;

  let falaAlpesVideoUrl = current?.fala_alpes_video_url ?? null;
  if (req.body?.fala_alpes_video_url !== undefined) {
    const rawVideoUrl = String(req.body.fala_alpes_video_url || '').trim();
    if (rawVideoUrl && !isValidYoutubeUrl(rawVideoUrl)) {
      return res.status(400).json({ error: 'Link do YouTube invalido.' });
    }
    falaAlpesVideoUrl = rawVideoUrl || null;
  }

  // Video de fundo da pagina Sobre a Empresa: YouTube ou arquivo .mp4/.webm.
  let sobreVideoUrl = current?.sobre_video_url ?? null;
  if (req.body?.sobre_video_url !== undefined) {
    const rawSobreUrl = String(req.body.sobre_video_url || '').trim();
    if (rawSobreUrl && !isValidYoutubeUrl(rawSobreUrl) && !isValidVideoFileUrl(rawSobreUrl)) {
      return res
        .status(400)
        .json({ error: 'Use um link do YouTube ou de um arquivo de video .mp4/.webm.' });
    }
    sobreVideoUrl = rawSobreUrl || null;
  }

  let temaFestivo = normalizarTemaFestivo(current?.tema_festivo);
  if (req.body?.tema_festivo !== undefined) {
    const modo = String(req.body.tema_festivo || '').trim().toLowerCase();
    if (!(TEMA_FESTIVO_MODOS as readonly string[]).includes(modo)) {
      return res.status(400).json({ error: 'Tema invalido.' });
    }
    temaFestivo = modo as TemaFestivoModo;
  }

  const videoUrlChanged =
    req.body?.fala_alpes_video_url !== undefined &&
    falaAlpesVideoUrl !== (current?.fala_alpes_video_url ?? null);

  if (!current) {
    await mysqlPool.query(
      `INSERT INTO intranet_config
         (imagem_inicial_url, fala_alpes_video_url, sobre_video_url, tema_festivo, updated_by)
       VALUES (?, ?, ?, ?, ?)`,
      [imagemInicialUrl, falaAlpesVideoUrl, sobreVideoUrl, temaFestivo, session.user.login]
    );
  } else {
    await mysqlPool.query(
      `UPDATE intranet_config
       SET imagem_inicial_url = ?, fala_alpes_video_url = ?, sobre_video_url = ?, tema_festivo = ?,
           updated_by = ?
       WHERE id = ?`,
      [imagemInicialUrl, falaAlpesVideoUrl, sobreVideoUrl, temaFestivo, session.user.login, current.id]
    );
  }

  if (videoUrlChanged && falaAlpesVideoUrl) {
    await mysqlPool.query(
      `INSERT INTO intranet_noticias (titulo, conteudo, autor_nome)
       VALUES (?, ?, ?)`,
      [
        'Novo video no Fala Alpes',
        'O video da pagina Fala Alpes foi atualizado. Confira a novidade!',
        session.user.nome_completo
      ]
    );
  }

  return res.json({ success: true });
});

router.get('/admin/intranet/setores-ordem', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;

  try {
    const [[rows], setorOrdem] = await Promise.all([
      mysqlPool.query(
        `SELECT DISTINCT TRIM(departamento) AS setor
           FROM ${apexTable('vw_intranet_colaboradores')}
          WHERE departamento IS NOT NULL AND TRIM(departamento) <> ''`
      ),
      fetchSetorOrdem()
    ]);

    const setores = (rows as MysqlRow[])
      .map((row) => String(row.setor))
      .sort((a, b) => compareBySetorOrdem(setorOrdem, a, b) || a.localeCompare(b, 'pt-BR'));

    return res.json(
      setores.map((setor) => ({ setor, configurado: setorOrdem.has(setorKey(setor)) }))
    );
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar setores.' });
  }
});

router.put('/admin/intranet/setores-ordem', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const rawSetores: unknown[] = Array.isArray(req.body?.setores) ? req.body.setores : [];
  const vistos = new Set<string>();
  const setores = rawSetores
    .map((setor) => String(setor || '').trim().slice(0, 120))
    .filter((setor) => {
      const key = setorKey(setor);
      if (!key || vistos.has(key)) return false;
      vistos.add(key);
      return true;
    });

  if (!setores.length) {
    return res.status(400).json({ error: 'Informe ao menos um setor.' });
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM intranet_setor_ordem');
    await connection.query('INSERT INTO intranet_setor_ordem (setor, ordem, updated_by) VALUES ?', [
      setores.map((setor, index) => [setor, index + 1, session.user.login])
    ]);
    await connection.commit();
  } catch (error: any) {
    await connection.rollback();
    return res.status(500).json({ error: error?.message || 'Falha ao salvar ordem dos setores.' });
  } finally {
    connection.release();
  }

  return res.json({ success: true });
});

router.get('/admin/intranet/foto-campanhas', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  try {
    const [rows] = await mysqlPool.query(
      `SELECT c.id, c.nome, c.tema, c.revelar, c.ativo,
              DATE_FORMAT(c.data_inicio, '%Y-%m-%d') AS data_inicio,
              DATE_FORMAT(c.data_fim, '%Y-%m-%d') AS data_fim,
              (SELECT COUNT(*) FROM intranet_foto_campanha_fotos f WHERE f.campanha_id = c.id) AS total_fotos
         FROM intranet_foto_campanhas c
        ORDER BY c.data_inicio DESC, c.id DESC`
    );
    return res.json({ hoje: hojeSaoPaulo(), campanhas: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar campanhas.' });
  }
});

router.post('/admin/intranet/foto-campanhas', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const parsed = parseFotoCampanhaBody(req.body);
  if (!parsed.values) return res.status(400).json({ error: parsed.error });

  const { nome, tema, data_inicio, data_fim, revelar, ativo } = parsed.values;
  try {
    const [result] = await mysqlPool.query(
      `INSERT INTO intranet_foto_campanhas (nome, tema, data_inicio, data_fim, revelar, ativo, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nome, tema, data_inicio, data_fim, revelar, ativo, session.user.login]
    );
    return res.json({ success: true, id: (result as any).insertId });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao criar campanha.' });
  }
});

router.put('/admin/intranet/foto-campanhas/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const parsed = parseFotoCampanhaBody(req.body);
  if (!parsed.values) return res.status(400).json({ error: parsed.error });

  const { nome, tema, data_inicio, data_fim, revelar, ativo } = parsed.values;
  try {
    const [result] = await mysqlPool.query(
      `UPDATE intranet_foto_campanhas
          SET nome = ?, tema = ?, data_inicio = ?, data_fim = ?, revelar = ?, ativo = ?, updated_by = ?
        WHERE id = ?`,
      [nome, tema, data_inicio, data_fim, revelar, ativo, session.user.login, Number(req.params.id)]
    );
    if (!(result as any).affectedRows) return res.status(404).json({ error: 'Campanha nao encontrada.' });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao salvar campanha.' });
  }
});

router.delete('/admin/intranet/foto-campanhas/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  try {
    const [result] = await mysqlPool.query('DELETE FROM intranet_foto_campanhas WHERE id = ?', [
      Number(req.params.id)
    ]);
    if (!(result as any).affectedRows) return res.status(404).json({ error: 'Campanha nao encontrada.' });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao excluir campanha.' });
  }
});

// Copia a campanha (com as fotos) para o ano seguinte: fotos de infancia nao mudam.
router.post('/admin/intranet/foto-campanhas/:id/duplicar', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const [rows] = await mysqlPool
    .query('SELECT nome FROM intranet_foto_campanhas WHERE id = ?', [Number(req.params.id)])
    .catch(() => [[]]);
  const original = (rows as MysqlRow[])[0];
  if (!original) return res.status(404).json({ error: 'Campanha nao encontrada.' });

  const nomeOriginal = String(original.nome);
  const novoNome = /\b\d{4}\b/.test(nomeOriginal)
    ? nomeOriginal.replace(/\b(\d{4})\b/, (ano) => String(Number(ano) + 1))
    : `${nomeOriginal} (copia)`.slice(0, 120);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO intranet_foto_campanhas (nome, tema, data_inicio, data_fim, revelar, ativo, updated_by)
       SELECT ?, tema, DATE_ADD(data_inicio, INTERVAL 1 YEAR), DATE_ADD(data_fim, INTERVAL 1 YEAR),
              revelar, ativo, ?
         FROM intranet_foto_campanhas WHERE id = ?`,
      [novoNome, session.user.login, Number(req.params.id)]
    );
    const novoId = (result as any).insertId;
    await connection.query(
      `INSERT INTO intranet_foto_campanha_fotos (campanha_id, funcionario_id, imagem_url, updated_by)
       SELECT ?, funcionario_id, imagem_url, ? FROM intranet_foto_campanha_fotos WHERE campanha_id = ?`,
      [novoId, session.user.login, Number(req.params.id)]
    );
    await connection.commit();
    return res.json({ success: true, id: novoId });
  } catch (error: any) {
    await connection.rollback();
    return res.status(500).json({ error: error?.message || 'Falha ao duplicar campanha.' });
  } finally {
    connection.release();
  }
});

// Todos os colaboradores da intranet, com a foto oficial e a da campanha (se enviada).
router.get('/admin/intranet/foto-campanhas/:id/fotos', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  try {
    const [funcionarios, [fotoRows]] = await Promise.all([
      fetchFuncionariosIntranet(),
      mysqlPool.query(
        'SELECT funcionario_id, imagem_url FROM intranet_foto_campanha_fotos WHERE campanha_id = ?',
        [Number(req.params.id)]
      )
    ]);
    const fotos = new Map(
      (fotoRows as MysqlRow[]).map((row) => [Number(row.funcionario_id), String(row.imagem_url)])
    );

    return res.json(
      funcionarios.map((row) => {
        const fotoCampanha = fotos.get(Number(row.funcionario_id));
        return {
          funcionario_id: row.funcionario_id,
          nome: row.nome,
          setor: row.departamento || '',
          imagem_oficial_url: funcionarioImageUrl(row),
          imagem_campanha_url: fotoCampanha ? backendPublicUrl(fotoCampanha) : null
        };
      })
    );
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar fotos da campanha.' });
  }
});

router.put(
  '/admin/intranet/foto-campanhas/:id/fotos/:funcionarioId',
  async (req: Request, res: Response) => {
    const session = await requireAdmin(req, res, { requireCsrf: true });
    if (!session) return;
    await ensureFeatureTables();

    const campanhaId = Number(req.params.id);
    const funcionarioId = Number(req.params.funcionarioId);
    if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
      return res.status(400).json({ error: 'Colaborador invalido.' });
    }

    try {
      const [campanhas] = await mysqlPool.query('SELECT id FROM intranet_foto_campanhas WHERE id = ?', [
        campanhaId
      ]);
      if (!(campanhas as MysqlRow[]).length) {
        return res.status(404).json({ error: 'Campanha nao encontrada.' });
      }

      // /uploads e publico: nome aleatorio para a foto nao ser descoberta pelo nome do colaborador.
      const uploaded = await saveBase64Image({
        dataUrl: req.body?.data_url,
        fileName: `foto-${randomBytes(12).toString('hex')}`,
        folder: 'campanhas'
      });
      await mysqlPool.query(
        `INSERT INTO intranet_foto_campanha_fotos (campanha_id, funcionario_id, imagem_url, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE imagem_url = VALUES(imagem_url), updated_by = VALUES(updated_by)`,
        [campanhaId, funcionarioId, uploaded.url, session.user.login]
      );
      return res.json({ success: true, imagem_campanha_url: backendPublicUrl(uploaded.url) });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || 'Falha ao enviar foto.' });
    }
  }
);

router.delete(
  '/admin/intranet/foto-campanhas/:id/fotos/:funcionarioId',
  async (req: Request, res: Response) => {
    const session = await requireAdmin(req, res, { requireCsrf: true });
    if (!session) return;
    await ensureFeatureTables();

    try {
      await mysqlPool.query(
        'DELETE FROM intranet_foto_campanha_fotos WHERE campanha_id = ? AND funcionario_id = ?',
        [Number(req.params.id), Number(req.params.funcionarioId)]
      );
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Falha ao remover foto.' });
    }
  }
);

// --- Galeria de fotos ---

type GaleriaAlbumBody = { titulo: string; descricao: string | null; data_evento: string | null; ativo: number };

function parseGaleriaAlbumBody(body: any): { values?: GaleriaAlbumBody; error?: string } {
  const titulo = String(body?.titulo || '').trim().slice(0, 120);
  if (!titulo) return { error: 'Informe o titulo do album.' };
  const descricao = String(body?.descricao || '').trim().slice(0, 2000) || null;
  const data = String(body?.data_evento || '').trim();
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: 'Data do evento invalida.' };
  return { values: { titulo, descricao, data_evento: data || null, ativo: toBoolean(body?.ativo, true) ? 1 : 0 } };
}

// Capa: a escolhida pelo admin ou, sem escolha, a primeira foto do album.
const GALERIA_ALBUM_SELECT = `
  SELECT a.id, a.titulo, a.descricao, a.ativo, a.capa_foto_id,
         DATE_FORMAT(a.data_evento, '%Y-%m-%d') AS data_evento,
         (SELECT COUNT(*) FROM intranet_galeria_fotos f WHERE f.album_id = a.id) AS total_fotos,
         COALESCE(
           (SELECT f.imagem_url FROM intranet_galeria_fotos f WHERE f.id = a.capa_foto_id AND f.album_id = a.id),
           (SELECT f.imagem_url FROM intranet_galeria_fotos f WHERE f.album_id = a.id ORDER BY f.ordem, f.id LIMIT 1)
         ) AS capa_url
    FROM intranet_galeria_albuns a`;

function mapGaleriaAlbum(row: MysqlRow) {
  return {
    id: Number(row.id),
    titulo: String(row.titulo),
    descricao: row.descricao ? String(row.descricao) : null,
    data_evento: row.data_evento ? String(row.data_evento) : null,
    ativo: Number(row.ativo),
    capa_foto_id: row.capa_foto_id ? Number(row.capa_foto_id) : null,
    total_fotos: Number(row.total_fotos || 0),
    capa_url: row.capa_url ? backendPublicUrl(String(row.capa_url)) : null
  };
}

function mapGaleriaFoto(row: MysqlRow) {
  return {
    id: Number(row.id),
    imagem_url: backendPublicUrl(String(row.imagem_url)),
    legenda: row.legenda ? String(row.legenda) : null,
    largura: row.largura ? Number(row.largura) : null,
    altura: row.altura ? Number(row.altura) : null,
    ordem: Number(row.ordem || 0)
  };
}

async function fetchGaleriaFotos(albumId: number) {
  const [rows] = await mysqlPool.query(
    `SELECT id, imagem_url, legenda, largura, altura, ordem
       FROM intranet_galeria_fotos WHERE album_id = ? ORDER BY ordem, id`,
    [albumId]
  );
  return (rows as MysqlRow[]).map(mapGaleriaFoto);
}

// Apaga o arquivo de /uploads/galeria (melhor esforco: o registro ja saiu do banco).
async function apagarArquivoGaleria(url: unknown) {
  const relativo = String(url || '');
  if (!relativo.startsWith('/uploads/galeria/')) return;
  const arquivo = path.resolve(uploadsRootDir, relativo.slice('/uploads/'.length));
  if (!arquivo.startsWith(path.resolve(uploadsRootDir, 'galeria') + path.sep)) return;
  await unlink(arquivo).catch(() => undefined);
}

router.get('/galeria', async (req: Request, res: Response) => {
  if (!getSessionUser(req)) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
  }
  await ensureFeatureTables();
  try {
    const [rows] = await mysqlPool.query(
      `${GALERIA_ALBUM_SELECT}
        WHERE a.ativo = 1
          AND EXISTS (SELECT 1 FROM intranet_galeria_fotos f WHERE f.album_id = a.id)
        ORDER BY a.data_evento IS NULL, a.data_evento DESC, a.id DESC`
    );
    return res.json((rows as MysqlRow[]).map(mapGaleriaAlbum));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar a galeria.' });
  }
});

router.get('/galeria/:id', async (req: Request, res: Response) => {
  if (!getSessionUser(req)) {
    return res.status(403).json({ error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE });
  }
  await ensureFeatureTables();
  const albumId = Number(req.params.id);
  try {
    const [rows] = await mysqlPool.query(`${GALERIA_ALBUM_SELECT} WHERE a.id = ? AND a.ativo = 1`, [albumId]);
    const album = (rows as MysqlRow[])[0];
    if (!album) return res.status(404).json({ error: 'Album nao encontrado.' });
    return res.json({ ...mapGaleriaAlbum(album), fotos: await fetchGaleriaFotos(albumId) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar o album.' });
  }
});

router.get('/admin/galeria', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();
  try {
    const [rows] = await mysqlPool.query(
      `${GALERIA_ALBUM_SELECT} ORDER BY a.data_evento IS NULL, a.data_evento DESC, a.id DESC`
    );
    return res.json((rows as MysqlRow[]).map(mapGaleriaAlbum));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar albuns.' });
  }
});

router.post('/admin/galeria', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const parsed = parseGaleriaAlbumBody(req.body);
  if (!parsed.values) return res.status(400).json({ error: parsed.error });
  const { titulo, descricao, data_evento, ativo } = parsed.values;
  try {
    const [result] = await mysqlPool.query(
      `INSERT INTO intranet_galeria_albuns (titulo, descricao, data_evento, ativo, updated_by)
       VALUES (?, ?, ?, ?, ?)`,
      [titulo, descricao, data_evento, ativo, session.user.login]
    );
    return res.json({ success: true, id: (result as any).insertId });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao criar album.' });
  }
});

router.put('/admin/galeria/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const parsed = parseGaleriaAlbumBody(req.body);
  if (!parsed.values) return res.status(400).json({ error: parsed.error });
  const { titulo, descricao, data_evento, ativo } = parsed.values;
  try {
    const [result] = await mysqlPool.query(
      `UPDATE intranet_galeria_albuns
          SET titulo = ?, descricao = ?, data_evento = ?, ativo = ?, updated_by = ?
        WHERE id = ?`,
      [titulo, descricao, data_evento, ativo, session.user.login, Number(req.params.id)]
    );
    if (!(result as any).affectedRows) return res.status(404).json({ error: 'Album nao encontrado.' });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao salvar album.' });
  }
});

router.delete('/admin/galeria/:id', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const albumId = Number(req.params.id);
  try {
    const [fotos] = await mysqlPool.query('SELECT imagem_url FROM intranet_galeria_fotos WHERE album_id = ?', [
      albumId
    ]);
    const [result] = await mysqlPool.query('DELETE FROM intranet_galeria_albuns WHERE id = ?', [albumId]);
    if (!(result as any).affectedRows) return res.status(404).json({ error: 'Album nao encontrado.' });
    await Promise.all((fotos as MysqlRow[]).map((row) => apagarArquivoGaleria(row.imagem_url)));
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao excluir album.' });
  }
});

router.get('/admin/galeria/:id/fotos', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();
  try {
    return res.json(await fetchGaleriaFotos(Number(req.params.id)));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar fotos.' });
  }
});

// Uma foto por requisicao: o front ja reduz a imagem e envia em sequencia (varias de uma vez).
router.post('/admin/galeria/:id/fotos', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const albumId = Number(req.params.id);
  const largura = Math.round(toNumber(req.body?.largura, 0)) || null;
  const altura = Math.round(toNumber(req.body?.altura, 0)) || null;
  const legenda = String(req.body?.legenda || '').trim().slice(0, 255) || null;
  try {
    const [albuns] = await mysqlPool.query('SELECT id FROM intranet_galeria_albuns WHERE id = ?', [albumId]);
    if (!(albuns as MysqlRow[]).length) return res.status(404).json({ error: 'Album nao encontrado.' });

    const uploaded = await saveBase64Image({
      dataUrl: req.body?.data_url,
      fileName: `galeria-${albumId}-${randomBytes(8).toString('hex')}`,
      folder: 'galeria'
    });
    const [result] = await mysqlPool.query(
      `INSERT INTO intranet_galeria_fotos (album_id, imagem_url, legenda, largura, altura, ordem, created_by)
       SELECT ?, ?, ?, ?, ?, COALESCE(MAX(ordem), 0) + 1, ? FROM intranet_galeria_fotos WHERE album_id = ?`,
      [albumId, uploaded.url, legenda, largura, altura, session.user.login, albumId]
    );
    const [rows] = await mysqlPool.query(
      'SELECT id, imagem_url, legenda, largura, altura, ordem FROM intranet_galeria_fotos WHERE id = ?',
      [(result as any).insertId]
    );
    return res.json({ success: true, foto: mapGaleriaFoto((rows as MysqlRow[])[0]) });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Falha ao enviar foto.' });
  }
});

router.put('/admin/galeria/fotos/:fotoId', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const legenda = String(req.body?.legenda || '').trim().slice(0, 255) || null;
  try {
    const [result] = await mysqlPool.query('UPDATE intranet_galeria_fotos SET legenda = ? WHERE id = ?', [
      legenda,
      Number(req.params.fotoId)
    ]);
    if (!(result as any).affectedRows) return res.status(404).json({ error: 'Foto nao encontrada.' });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao salvar legenda.' });
  }
});

router.delete('/admin/galeria/fotos/:fotoId', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const fotoId = Number(req.params.fotoId);
  try {
    const [rows] = await mysqlPool.query('SELECT imagem_url FROM intranet_galeria_fotos WHERE id = ?', [fotoId]);
    const foto = (rows as MysqlRow[])[0];
    if (!foto) return res.status(404).json({ error: 'Foto nao encontrada.' });
    await mysqlPool.query('DELETE FROM intranet_galeria_fotos WHERE id = ?', [fotoId]);
    await mysqlPool.query('UPDATE intranet_galeria_albuns SET capa_foto_id = NULL WHERE capa_foto_id = ?', [fotoId]);
    await apagarArquivoGaleria(foto.imagem_url);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao remover foto.' });
  }
});

router.put('/admin/galeria/:id/capa', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const albumId = Number(req.params.id);
  const fotoId = Number(req.body?.foto_id);
  try {
    const [result] = await mysqlPool.query(
      `UPDATE intranet_galeria_albuns a
          JOIN intranet_galeria_fotos f ON f.id = ? AND f.album_id = a.id
          SET a.capa_foto_id = f.id, a.updated_by = ?
        WHERE a.id = ?`,
      [fotoId, session.user.login, albumId]
    );
    if (!(result as any).affectedRows) return res.status(404).json({ error: 'Foto nao encontrada no album.' });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao definir capa.' });
  }
});

// Nova ordem das fotos: lista de ids na ordem desejada (ids de outro album sao ignorados).
router.put('/admin/galeria/:id/ordem', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const albumId = Number(req.params.id);
  const ids: number[] = (Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(Number)
    .filter((id: number) => Number.isInteger(id) && id > 0);
  if (!ids.length) return res.status(400).json({ error: 'Ordem invalida.' });

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    for (const [indice, id] of ids.entries()) {
      await connection.query('UPDATE intranet_galeria_fotos SET ordem = ? WHERE id = ? AND album_id = ?', [
        indice + 1,
        id,
        albumId
      ]);
    }
    await connection.commit();
    return res.json({ success: true });
  } catch (error: any) {
    await connection.rollback().catch(() => undefined);
    return res.status(500).json({ error: error?.message || 'Falha ao salvar a ordem.' });
  } finally {
    connection.release();
  }
});

// Sorteador: o servidor escolhe o vencedor (randomInt, criptografico) e grava no mesmo passo,
// assim o historico nao depende do navegador. O front so anima ate o vencedor devolvido.
router.post('/admin/sorteios', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res, { requireCsrf: true });
  if (!session) return;
  await ensureFeatureTables();

  const premio = String(req.body?.premio || '').trim().slice(0, 255);
  const rawIds: unknown[] = Array.isArray(req.body?.participantes) ? req.body.participantes : [];
  const ids = new Set(rawIds.map(Number).filter((id) => Number.isInteger(id) && id > 0));
  const notificar = toBoolean(req.body?.notificar, true);

  if (!premio) return res.status(400).json({ error: 'Informe o premio.' });

  const connection = await mysqlPool.getConnection();
  try {
    // So vale quem esta ativo na intranet agora (ignora ids forjados ou desligados).
    const participantes = (await fetchFuncionariosIntranet()).filter((row) =>
      ids.has(Number(row.funcionario_id))
    );
    if (participantes.length < 2) {
      return res.status(400).json({ error: 'Selecione pelo menos 2 participantes.' });
    }

    const vencedor = participantes[randomInt(participantes.length)];
    const vencedorNome = String(vencedor.nome);
    const vencedorSetor = String(vencedor.departamento || '');
    const fotoPath = funcionarioFotoPath(vencedor.foto);

    await connection.beginTransaction();
    let notificacaoId: number | null = null;
    if (notificar) {
      // So no sino: resultado de sorteio nao entra em Noticias.
      const [notificacao] = await connection.query(
        `INSERT INTO intranet_notificacoes (tipo, titulo, mensagem, imagem_url, criado_por)
         VALUES ('sorteio', ?, ?, ?, ?)`,
        [
          `Resultado do sorteio: ${premio}`.slice(0, 255),
          `Parabéns, ${vencedorNome}! Você foi sorteado(a) e ganhou: ${premio}. ` +
            `O sorteio foi realizado entre ${participantes.length} participantes.`,
          fotoPath,
          session.user.nome_completo
        ]
      );
      notificacaoId = (notificacao as any).insertId || null;
    }

    const [result] = await connection.query(
      `INSERT INTO intranet_sorteios
         (premio, vencedor_funcionario_id, vencedor_nome, vencedor_setor, vencedor_foto,
          participantes_total, participantes, notificacao_id, realizado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        premio,
        Number(vencedor.funcionario_id),
        vencedorNome,
        vencedorSetor || null,
        String(vencedor.foto || '').trim() || null,
        participantes.length,
        JSON.stringify(
          participantes.map((row) => ({
            id: Number(row.funcionario_id),
            nome: String(row.nome),
            setor: String(row.departamento || '')
          }))
        ),
        notificacaoId,
        session.user.nome_completo
      ]
    );
    await connection.commit();

    return res.json({
      success: true,
      sorteio: {
        id: (result as any).insertId,
        premio,
        participantes_total: participantes.length,
        notificado: Boolean(notificacaoId),
        vencedor: {
          id: Number(vencedor.funcionario_id),
          nome: vencedorNome,
          setor: vencedorSetor,
          imagem_url: fotoPath ? backendPublicUrl(fotoPath) : null
        }
      }
    });
  } catch (error: any) {
    await connection.rollback().catch(() => undefined);
    return res.status(500).json({ error: error?.message || 'Falha ao realizar o sorteio.' });
  } finally {
    connection.release();
  }
});

router.get('/admin/sorteios', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, premio, vencedor_funcionario_id, vencedor_nome, vencedor_setor, vencedor_foto,
              participantes_total, participantes, noticia_id, notificacao_id, realizado_por,
              DATE_FORMAT(realizado_em, '%Y-%m-%d %H:%i') AS realizado_em
         FROM intranet_sorteios
        ORDER BY id DESC
        LIMIT 100`
    );
    return res.json(
      (rows as MysqlRow[]).map((row) => {
        let participantes: { id: number; nome: string; setor: string }[] = [];
        try {
          participantes = JSON.parse(String(row.participantes || '[]'));
        } catch {
          participantes = [];
        }
        const fotoPath = funcionarioFotoPath(row.vencedor_foto);
        return {
          id: row.id,
          premio: row.premio,
          realizado_em: row.realizado_em,
          realizado_por: row.realizado_por,
          notificado: Boolean(row.notificacao_id || row.noticia_id),
          participantes_total: row.participantes_total,
          participantes,
          vencedor: {
            id: row.vencedor_funcionario_id,
            nome: row.vencedor_nome,
            setor: row.vencedor_setor || '',
            imagem_url: fotoPath ? backendPublicUrl(fotoPath) : null
          }
        };
      })
    );
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Falha ao carregar historico.' });
  }
});

router.get('/admin/intranet/noticias', async (req: Request, res: Response) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  await ensureFeatureTables();

  const [rows] = await mysqlPool.query(
    `SELECT id, titulo, conteudo, autor_nome, imagem_destaque_url, DATE_FORMAT(data_inicio, '%Y-%m-%d %H:%i') AS data_inicio,
            DATE_FORMAT(data_fim, '%Y-%m-%d %H:%i') AS data_fim, data_publicacao, ativo
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

  // Data como texto local: evita o Date do mysql2 virar ISO UTC e deslocar o horario no admin.
  const [rows] = await mysqlPool.query(
    `SELECT id, titulo, descricao,
            DATE_FORMAT(data_evento, '%Y-%m-%d %H:%i:%s') AS data_evento,
            sede_alvo, ativo
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
      error: 'Sessao invalida ou expirada.', code: SESSAO_EXPIRADA_CODE
    });
  }

  try {
    // Vinculo com o GLPI pelo e-mail corporativo (sem cadastro legado).
    const glpiUserId = session.user.email ? await findGlpiUserIdByEmail(session.user.email) : null;

    if (!glpiUserId) {
      return res.json({
        success: true,
        equipamentos: [],
        mensagem: 'Seu e-mail corporativo nao esta cadastrado no GLPI. Fale com a TI para vincular seus equipamentos.'
      });
    }

    console.log(`GLPI DB: buscando equipamentos para glpi_user_id ${glpiUserId}`);
    const equipamentos = await fetchEquipamentosByGlpiUserId(glpiUserId);

    return res.json({
      success: true,
      equipamentos
    });
  } catch (error: any) {
    console.error('Erro na rota /meus-equipamentos:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno ao consultar equipamentos.'
    });
  }
});

export default router;
