import express from 'express';
import path from 'path';
import { apiRouter } from './apiRouter';

const app = express();
const PORT = parseInt(process.env.PORT || '5173', 10);
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount API router
app.use('/api', apiRouter);

// Serve static assets from dist in production
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));

// Handle SPA and /c/:slug routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`MemoryFlow production server running on http://${HOST}:${PORT}`);
});
