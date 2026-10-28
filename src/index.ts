import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase } from './database/db.js';
import { getFrequencyAnalysis } from './services/statistics.service.js';

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

// Inicializa o banco uma vez; a sincronização é executada separadamente.
const db = openDatabase();
process.on('exit', () => db.close());

const server = createServer(async (req, res) => {
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'URL inválida.' }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Método não permitido.' }));
    return;
  }
  const pathname = url.pathname;
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
    return;
  }
  if (pathname === '/api/statistics') {
    const limits = url.searchParams.getAll('limit');
    if (limits.length !== 1 || !/^[0-9]+$/.test(limits[0]) || Number(limits[0]) < 1 || Number(limits[0]) > 200) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Informe limit como um número inteiro entre 1 e 200.' }));
      return;
    }
    try {
      const analysis = getFrequencyAnalysis(db, Number(limits[0]));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(analysis));
    } catch (error) {
      console.error('Erro ao consultar frequência:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Não foi possível consultar as frequências.' }));
    }
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
