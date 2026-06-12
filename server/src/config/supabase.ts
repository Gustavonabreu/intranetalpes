import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carrega as variáveis do arquivo .env
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Uma validação de segurança para te avisar no terminal se algo sumir do .env
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ ERRO CRÍTICO: SUPABASE_URL ou SUPABASE_KEY não foram encontradas no .env!");
}

// Inicializa o cliente do Supabase de forma global
export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

console.log("✅ Conexão com o cliente Supabase estruturada.");