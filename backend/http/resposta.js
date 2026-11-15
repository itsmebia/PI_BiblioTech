// Utilidades de HTTP: ler o corpo da requisição, responder JSON e manipular cookies.

const config = require('../config');
const { ErroHttp } = require('../erros');
const { conexaoSegura } = require('../seguranca/cabecalhos');

function enviarJson(res, status, corpo, cabecalhos = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...cabecalhos });
  res.end(JSON.stringify(corpo));
}

/**
 * Lê e valida o corpo JSON (OWASP A03/A04):
 *  - exige Content-Type application/json (um formulário de outro site não consegue enviar isso sem permissão);
 *  - limita o tamanho, para ninguém esgotar a memória do servidor;
 *  - devolve sempre um objeto (corpo vazio vira {}).
 */
function lerCorpoJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return Promise.reject(new ErroHttp(415, 'Envie os dados como application/json.'));
  }
  const limite = config.limiteCorpoBytes;
  if (Number(req.headers['content-length']) > limite) {
    return Promise.reject(new ErroHttp(413, 'Requisição grande demais.', { Connection: 'close' }));
  }

  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on('data', (parte) => {
      total += parte.length;
      if (total <= limite) partes.push(parte); // acima do limite, só descartamos
    });
    req.on('end', () => {
      if (total > limite) return reject(new ErroHttp(413, 'Requisição grande demais.', { Connection: 'close' }));
      const bruto = Buffer.concat(partes).toString('utf8');
      if (bruto === '') return resolve({});
      try {
        const dados = JSON.parse(bruto);
        if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('não é objeto');
        resolve(dados);
      } catch {
        reject(new ErroHttp(400, 'JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

/** Lê um cookie pelo nome. */
function lerCookie(req, nome) {
  for (const par of String(req.headers.cookie || '').split(';')) {
    const [chave, ...resto] = par.trim().split('=');
    if (chave === nome) return resto.join('=');
  }
  return null;
}

/**
 * Cookie de sessão com as 3 proteções essenciais (OWASP A01/A02/A07):
 *  - HttpOnly: JavaScript da página não consegue ler (um XSS não rouba a sessão);
 *  - SameSite=Strict: o navegador não envia o cookie em requisições vindas de outros sites (anti-CSRF);
 *  - Secure: só trafega por HTTPS (ligado automaticamente quando a conexão é segura).
 */
function cookieDeSessao(req, token, duracaoMs) {
  const partes = [
    `${config.sessao.nomeCookie}=${token}`,
    'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(duracaoMs / 1000)}`,
  ];
  if (conexaoSegura(req)) partes.push('Secure');
  return partes.join('; ');
}

/** IP do cliente, usado só para o limitador de login. Só confia em X-Forwarded-For se configurado. */
function ipDoCliente(req) {
  if (config.confiarProxy && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'desconhecido';
}

module.exports = { enviarJson, lerCorpoJson, lerCookie, cookieDeSessao, ipDoCliente };
