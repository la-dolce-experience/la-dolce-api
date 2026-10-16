import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Testes de integração: rodam em Node contra o Supabase local, com as variáveis de .env.local.
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
}));
