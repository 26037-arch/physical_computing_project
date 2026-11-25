import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import fs from 'node:fs';

// 빌드 산출물(index.html)을 docs/V5H_조립설명서.html 로 옮긴다.
const outFile = path.resolve(__dirname, '../../docs/V5H_조립설명서.html');
export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteSingleFile({ removeViteModuleLoader: true }),
    {
      name: 'emit-to-docs',
      apply: 'build',
      closeBundle() {
        const built = path.resolve(__dirname, 'dist/index.html');
        fs.copyFileSync(built, outFile);
        const mb = (fs.statSync(outFile).size / 1048576).toFixed(2);
        console.log(`\n=> ${outFile} (${mb} MB)`);
      },
    },
  ],
  server: { fs: { allow: [path.resolve(__dirname, '../..')] } },
  build: { target: 'es2020', chunkSizeWarningLimit: 20000, assetsInlineLimit: 100000000 },
});
