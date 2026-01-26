import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = env.VITE_ALLOWED_HOSTS
    ? env.VITE_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)
    : [];

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@pk-candle/shared': path.resolve(__dirname, '../../packages/shared/src'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: path.resolve(__dirname, './src/test/setup.ts'),
      globals: true,
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
    server: {
      host: true,
      allowedHosts: allowedHosts.length ? allowedHosts : ['localhost'],
      fs: {
        allow: [path.resolve(__dirname, '../../')],
      },
    },
  };
});
