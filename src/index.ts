import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const portText = process.env.PORT ?? '3000';
if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
}
const port = Number(portText);
const publicDir = path.resolve(__dirname, '..', 'public');
const assets: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/css/styles.css': { file: 'css/styles.css', type: 'text/css; charset=utf-8' },
  '/js/app.js': { file: 'js/app.js', type: 'text/javascript; charset=utf-8' },
};

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Método não permitido.' }));
    return;
  }
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
    return;
  }
  const asset = Object.hasOwn(assets, pathname) ? assets[pathname] : undefined;
  if (!asset) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Não encontrado.' }));
    return;
  }
  try {
    const content = await readFile(path.join(publicDir, asset.file));
    res.writeHead(200, { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error('Erro ao carregar arquivo público:', error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Erro interno do servidor.' }));
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Servidor disponível na porta ${port}`));
