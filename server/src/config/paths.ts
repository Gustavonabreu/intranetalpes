import path from 'node:path';

// Pastas de dados do backend, relativas a raiz do projeto do servidor (onde roda o npm).
// Nao usar __dirname: compilado ele vira dist/src/..., fora dos volumes do Docker
// (/app/uploads e /app/.runtime), e tudo que era gravado sumia a cada deploy.
const serverRoot = process.cwd();

export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(serverRoot, 'uploads'));
export const RUNTIME_DIR = path.resolve(process.env.RUNTIME_DIR || path.join(serverRoot, '.runtime'));
