import type { IncomingMessage, ServerResponse } from 'node:http';

const PYTHON_INFERENCE_URL = process.env.PYTHON_INFERENCE_URL || '';

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (PYTHON_INFERENCE_URL) {
    try {
      const bodyBuffer = await readRawBody(req);
      const contentType = req.headers['content-type'] || '';
      const upstream = await fetch(`${PYTHON_INFERENCE_URL.replace(/\/$/, '')}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: new Uint8Array(bodyBuffer),
      });
      const payload = await upstream.json();
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ source: 'pytorch-flask', ...(payload as object) }));
      return;
    } catch {
      // Fall through cleanly to client-side tiled engine fallback
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      source: 'tiled-cv-engine',
      fallback: true,
      reason: PYTHON_INFERENCE_URL
        ? 'Python PyTorch Flask bridge unreachable; executing 256x256 tiled segmentation engine in browser.'
        : 'Serverless Vercel mode: executing 256x256 tiled segmentation + TensorFlow.js RoofNet-2D CNN in browser.',
    })
  );
}
