import { defineConfig } from 'vite';

// base: './' — чтобы сборка работала на GitHub Pages по пути /<имя-репы>/,
// а не только в корне домена. Все ссылки на ассеты становятся относительными.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
