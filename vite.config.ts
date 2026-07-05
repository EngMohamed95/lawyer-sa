import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: true,
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Firebase - split each service into its own cached chunk
            if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) {
              return 'firebase-firestore';
            }
            if (id.includes('firebase/auth') || id.includes('@firebase/auth')) {
              return 'firebase-auth';
            }
            if (id.includes('firebase/storage') || id.includes('@firebase/storage')) {
              return 'firebase-storage';
            }
            if (id.includes('firebase/app') || id.includes('@firebase/app')) {
              return 'firebase-app';
            }
            // React core
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'react-vendor';
            }
            // Router
            if (id.includes('react-router') || id.includes('@remix-run')) {
              return 'router';
            }
            // Motion animations
            if (id.includes('motion') || id.includes('framer-motion')) {
              return 'motion';
            }
            // UI icons
            if (id.includes('lucide-react')) {
              return 'icons';
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router',
        'firebase/app',
        'firebase/firestore',
        'firebase/auth',
        'firebase/storage',
      ],
    },
  };
});
