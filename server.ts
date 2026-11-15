import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PYTHON_INFERENCE_URL = process.env.PYTHON_INFERENCE_URL || 'http://127.0.0.1:5000';

async function checkPythonBridge(): Promise<{ reachable: boolean; modelFile: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 900);
    const res = await fetch(`${PYTHON_INFERENCE_URL}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, modelFile: false };
    const data = (await res.json()) as { ok?: boolean; model_file?: boolean };
    return {
      reachable: Boolean(data.ok),
      modelFile: Boolean(data.model_file),
    };
  } catch {
    return { reachable: false, modelFile: false };
  }
}

async function startServer() {
  const app = express();

  app.get('/api/health', async (_req, res) => {
    const bridge = await checkPythonBridge();
    res.json({
      ok: true,
      server: 'express-gis-gateway',
      modelArchitecture: 'U-Net (ResNet-18, 256x256 tiled)',
      pythonBridgeReachable: bridge.reachable,
      modelFilePresent: bridge.modelFile,
      activeEngine:
        bridge.reachable && bridge.modelFile
          ? 'pytorch-flask'
          : 'tiled-cv-segmentation',
    });
  });

  // Accepts multipart/form-data image upload matching app_3c61c556.py /api/analyze
  app.post(
    '/api/analyze',
    express.raw({ type: '*/*', limit: '45mb' }),
    async (req, res) => {
      const contentType = req.headers['content-type'] || '';
      const bridge = await checkPythonBridge();

      if (bridge.reachable && bridge.modelFile) {
        try {
          const upstream = await fetch(`${PYTHON_INFERENCE_URL}/api/analyze`, {
            method: 'POST',
            headers: {
              'content-type': contentType,
            },
            body: new Uint8Array(req.body as Buffer),
          });
          const payload = await upstream.json();
          res.status(upstream.status).json({
            source: 'pytorch-flask',
            ...payload,
          });
          return;
        } catch (err) {
          console.warn('Python Flask bridge failed, falling back to browser tiled CV:', err);
        }
      }

      // Return structured fallback directive so the client-side 256x256 tiled segmentation
      // engine executes directly on the uploaded image pixels without failing the workflow.
      res.status(200).json({
        source: 'tiled-cv-engine',
        fallback: true,
        reason: bridge.reachable
          ? 'final_drone_model.pth checkpoint not found on Flask server; using 256x256 tiled segmentation engine.'
          : 'Local PyTorch Flask server not running; executing 256x256 tiled U-Net-equivalent segmentation engine.',
      });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SVAMITVA AI GIS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
