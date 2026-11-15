// Limitador de tentativas de login (OWASP A04/A07): trava força bruta e "adivinhação" de senha.
// A chave combina IP + matrícula, assim um atacante não bloqueia a conta de outras pessoas
// e uma pessoa legítima não é bloqueada por causa de terceiros.

const config = require('../config');

const tentativas = new Map(); // chave -> { falhas, liberadoEm }

/** Retorna os segundos de espera restantes se a chave estiver bloqueada, ou 0 se puder tentar. */
function segundosDeBloqueio(chave) {
  const t = tentativas.get(chave);
  if (!t) return 0;
  if (t.liberadoEm <= Date.now()) { tentativas.delete(chave); return 0; }
  return t.falhas >= config.loginLimite.maxFalhas ? Math.ceil((t.liberadoEm - Date.now()) / 1000) : 0;
}

function registrarFalha(chave) {
  const t = tentativas.get(chave) ?? { falhas: 0, liberadoEm: Date.now() + config.loginLimite.janelaMs };
  t.falhas += 1;
  tentativas.set(chave, t);
}

function registrarSucesso(chave) {
  tentativas.delete(chave);
}

setInterval(() => {
  const agora = Date.now();
  for (const [chave, t] of tentativas) if (t.liberadoEm <= agora) tentativas.delete(chave);
}, 5 * 60 * 1000).unref();

module.exports = { segundosDeBloqueio, registrarFalha, registrarSucesso };
