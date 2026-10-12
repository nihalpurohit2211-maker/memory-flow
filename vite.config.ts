import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import express from 'express';
import { apiRouter } from './server/apiRouter';

function expressApiPlugin(): Plugin {
  const mountApp = () => {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use('/api', apiRouter);
    return app;
  };

  return {
    name: 'express-api-plugin',
    configureServer(server) {
      server.middlewares.use(mountApp());
    },
    configurePreviewServer(server) {
      server.middlewares.use(mountApp());
    },
  };
}

export default defineConfig({
  plugins: [react(), expressApiPlugin()],
  server: {
    host: process.env.HOST || '127.0.0.1',
    port: parseInt(process.env.PORT || '5173'),
    strictPort: true,
  },
  preview: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '5173'),
    allowedHosts: true,
  },
});
