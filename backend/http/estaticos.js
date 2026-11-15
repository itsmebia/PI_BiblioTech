// Entrega dos arquivos do frontend (HTML, CSS, JS), protegida contra "path traversal" (OWASP A01/A05).

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const RAIZ = path.resolve(config.pastaFrontend);

/** Responde com o arquivo pedido; devolve false se não for possível (o chamador responde 404). */
function servirArquivo(caminhoUrl, res) {
  let relativo;
  try {
    relativo = decodeURIComponent(caminhoUrl === '/' ? '/index.html' : caminhoUrl);
  } catch {
    return false; // URL com %-codificação quebrada
  }
  if (relativo.includes('\0')) return false;

  // Resolve o caminho final e confirma que ele continua DENTRO da pasta do frontend.
  // Assim "/../../etc/passwd" nunca escapa dela.
  const arquivo = path.resolve(RAIZ, `.${relativo}`);
  if (!arquivo.startsWith(RAIZ + path.sep)) return false;

  const tipo = TIPOS[path.extname(arquivo)];
  if (!tipo || !fs.existsSync(arquivo) || !fs.statSync(arquivo).isFile()) return false;

  res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache' });
  fs.createReadStream(arquivo).pipe(res);
  return true;
}

module.exports = { servirArquivo };
