// Sessões de login guardadas no servidor (OWASP A01/A07).
// O navegador recebe só um identificador aleatório e imprevisível dentro de um cookie HttpOnly;
// quem manda de verdade é o servidor, que pode expirar ou encerrar a sessão a qualquer momento.

const crypto = require('node:crypto');
const config = require('../config');

const sessoes = new Map(); // sha256(token) -> { usuarioId, nome, perfil, expiraEm }

// Guardamos o hash do token, não o token: um vazamento de memória não entrega sessões válidas.
const chaveDe = (token) => crypto.createHash('sha256').update(token).digest('hex');

function criarSessao(usuario) {
  const token = crypto.randomBytes(32).toString('base64url'); // 256 bits de entropia
  sessoes.set(chaveDe(token), {
    usuarioId: usuario.id,
    nome: usuario.nome,
    perfil: usuario.perfil,
    expiraEm: Date.now() + config.sessao.duracaoMs,
  });
  return token;
}

function buscarSessao(token) {
  if (!token) return null;
  const chave = chaveDe(token);
  const sessao = sessoes.get(chave);
  if (!sessao) return null;
  if (sessao.expiraEm < Date.now()) {
    sessoes.delete(chave);
    return null;
  }
  return sessao;
}

function encerrarSessao(token) {
  if (token) sessoes.delete(chaveDe(token));
}

// Faxina periódica das sessões vencidas. `unref` evita que o timer impeça o processo de encerrar.
setInterval(() => {
  const agora = Date.now();
  for (const [chave, s] of sessoes) if (s.expiraEm < agora) sessoes.delete(chave);
}, 10 * 60 * 1000).unref();

module.exports = { criarSessao, buscarSessao, encerrarSessao };
