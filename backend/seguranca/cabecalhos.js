// Cabeçalhos HTTP de segurança (OWASP A05). Cada um fecha uma porta de ataque no navegador.

const config = require('../config');

// Política de conteúdo: só carrega scripts/estilos do próprio site (a única exceção são as
// fontes do Google). Mesmo que alguém consiga injetar um <script>, o navegador se recusa a executá-lo.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'", // impede que o site seja embutido em outro (clickjacking)
].join('; ');

/** A conexão do usuário é HTTPS? (direta, ou via proxy confiável que repassa o protocolo) */
function conexaoSegura(req) {
  if (req.socket.encrypted) return true;
  return config.confiarProxy && req.headers['x-forwarded-proto'] === 'https';
}

function aplicarCabecalhosDeSeguranca(req, res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');       // o navegador não "adivinha" tipos de arquivo
  res.setHeader('X-Frame-Options', 'DENY');                 // reforço do frame-ancestors em navegadores antigos
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (conexaoSegura(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

module.exports = { aplicarCabecalhosDeSeguranca, conexaoSegura };
