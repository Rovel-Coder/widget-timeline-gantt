import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: '/widget-timeline-gantt/',   // important pour GitHub Pages
});
