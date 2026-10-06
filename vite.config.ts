import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
            if (id.includes('react-dom') || id.includes('scheduler') || id.includes('/react/')) return 'vendor-react-core';
          }
        }
      }
    }
  }
});