// Armazenamento seguro de senhas (OWASP A02).
// Usamos scrypt (função de derivação lenta, resistente a força bruta) com um "sal" aleatório
// por senha. O que vai para o banco é "sal:hash" — a senha original nunca é guardada.

const crypto = require('node:crypto');

const TAMANHO_HASH = 32;

function gerarHash(senha, sal = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(senha, sal, TAMANHO_HASH).toString('hex');
  return `${sal}:${hash}`;
}

/** Compara em tempo constante, para não revelar por tempo de resposta quantos caracteres acertou. */
function conferirSenha(senha, armazenado) {
  const [sal, hash] = String(armazenado || '').split(':');
  if (!sal || !hash) return false;
  const calculado = crypto.scryptSync(senha, sal, TAMANHO_HASH);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === calculado.length && crypto.timingSafeEqual(calculado, esperado);
}

// Hash descartável usado quando a matrícula não existe: o login gasta o mesmo tempo de CPU
// e o atacante não consegue descobrir quais usuários existem (enumeração de usuários).
const HASH_FALSO = gerarHash('senha-que-ninguem-usa');

module.exports = { gerarHash, conferirSenha, HASH_FALSO };
