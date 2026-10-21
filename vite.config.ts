import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function pdfjsAssetsPlugin() {
  return {
    name: 'copy-pdfjs-assets',
    closeBundle() {
      const pdfjsDir = path.resolve(__dirname, 'node_modules/pdfjs-dist');
      const outDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(pdfjsDir) || !fs.existsSync(outDir)) return;

      const legacyWorker = path.join(pdfjsDir, 'legacy/build/pdf.worker.min.mjs');
      const stdWorker = path.join(pdfjsDir, 'build/pdf.worker.min.mjs');
      const workerSrc = fs.existsSync(legacyWorker) ? legacyWorker : stdWorker;
      if (fs.existsSync(workerSrc)) {
        fs.copyFileSync(workerSrc, path.join(outDir, 'pdf.worker.min.mjs'));
      }
      const cmapsSrc = path.join(pdfjsDir, 'cmaps');
      if (fs.existsSync(cmapsSrc)) {
        fs.cpSync(cmapsSrc, path.join(outDir, 'cmaps'), { recursive: true });
      }
      const fontsSrc = path.join(pdfjsDir, 'standard_fonts');
      if (fs.existsSync(fontsSrc)) {
        fs.cpSync(fontsSrc, path.join(outDir, 'standard_fonts'), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssetsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 3000,
    host: true,
    hmr: false,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('html-to-image')) return 'vendor-html2image';
            if (id.includes('jspdf')) return 'vendor-jspdf';
            if (id.includes('konva') || id.includes('react-konva') || id.includes('use-image')) return 'vendor-konva';
            if (id.includes('react-big-calendar')) return 'vendor-calendar';
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('recharts')) return 'vendor-recharts';
            if (id.includes('lucide-react')) return 'vendor-lucide';
            if (id.includes('@aws-sdk')) return 'vendor-aws';
            if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
            if (id.includes('html5-qrcode') || id.includes('qrcode.react')) return 'vendor-qrcode';
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('date-fns')) return 'vendor-date-fns';
            if (id.includes('react-zoom-pan-pinch') || id.includes('react-markdown') || id.includes('react-draggable') || id.includes('react-dropzone')) return 'vendor-ui-helpers';
            if (id.includes('dexie')) return 'vendor-dexie';
            if (id.includes('lodash') || id.includes('papaparse') || id.includes('zod') || id.includes('clsx') || id.includes('tailwind-merge')) return 'vendor-utils';
            if (id.includes('react-dom') || id.includes('scheduler') || id.includes('/react/')) return 'vendor-react-core';
          }
        }
      }
    }
  }
});