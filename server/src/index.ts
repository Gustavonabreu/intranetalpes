import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from './routes/api.routes.js';

// Carrega as variáveis de ambiente
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../uploads');

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');

app.use(
  cors({
    origin: (origin, callback) => {
      // Remove barra no final (trailing slash) caso o navegador envie
      const cleanOrigin = origin ? origin.replace(/\/$/, '') : origin;
      

      // Permite requisições sem Origin (curl, Postman, etc) ou que estejam na lista
      if (!cleanOrigin || allowedOrigins.includes(cleanOrigin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin não permitida pelo CORS'));
    },
    credentials: true
  })
);

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// Rotas da API
app.use('/api', apiRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend Node.js rodando no Docker!'
  });
});

// Inicialização do servidor
app.listen(port, async () => {
  console.log(`🚀 Backend rodando em http://localhost:${port}`);
});
