import type { IncomingMessage, ServerResponse } from 'node:http';

const PYTHON_INFERENCE_URL = process.env.PYTHON_INFERENCE_URL || '';

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  let reachable = false;
  let modelFilePresent = false;

  if (PYTHON_INFERENCE_URL) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const upstream = await fetch(`${PYTHON_INFERENCE_URL.replace(/\/$/, '')}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (upstream.ok) {
        const data = (await upstream.json()) as { ok?: boolean; model_file?: boolean };
        reachable = Boolean(data.ok);
        modelFilePresent = Boolean(data.model_file);
      }
    } catch {
      reachable = false;
      modelFilePresent = false;
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      ok: true,
      server: 'vercel-serverless-gis-gateway',
      modelArchitecture: 'U-Net (ResNet-18, 256x256 tiled)',
      pythonBridgeReachable: reachable,
      modelFilePresent,
      activeEngine:
        reachable && modelFilePresent ? 'pytorch-flask' : 'tiled-cv-segmentation',
    })
  );
}
