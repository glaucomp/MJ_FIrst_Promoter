import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
  version?: string;
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const apiPort = env.PORT || '5555';

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(rootPkg.version ?? '0.0.0'),
    },
    assetsInclude: ['**/*.lottie'],
    server: {
      host: true,
      allowedHosts: ['mjpromoter.com', 'www.mjpromoter.com'],
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
