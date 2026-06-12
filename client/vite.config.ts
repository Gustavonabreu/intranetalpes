import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Garante que o Docker consiga expor a porta corretamente
    port: 5173,
    watch: {
      usePolling: true, // Força o Vite a caçar alterações de arquivos dentro do container Linux
    },
  },
});