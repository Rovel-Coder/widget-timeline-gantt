import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: '/widget-timeline-gantt/',   // déjà vu
  build: {
    outDir: 'docs',                  // au lieu de 'dist'
  },
});
