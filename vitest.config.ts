import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// tests/functions: lógica das Edge Functions (sem banco).
// tests/integration: rodam em Node contra o Supabase local, com as variáveis de .env.local.
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
}));
