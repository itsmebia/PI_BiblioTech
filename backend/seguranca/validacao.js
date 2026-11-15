// Validação de tudo que chega de fora (OWASP A03). Regra de ouro: nunca confiar na entrada.
// Aqui validamos formato e tamanho; as consultas ao banco ainda usam parâmetros (nunca concatenação).

const { ErroHttp } = require('../erros');

/** Exige um inteiro positivo (ex.: id). Aceita número ou texto numérico. */
function inteiroPositivo(valor, campo) {
  const n = typeof valor === 'string' && /^\d{1,15}$/.test(valor) ? Number(valor) : valor;
  if (!Number.isSafeInteger(n) || n <= 0) throw new ErroHttp(400, `Campo inválido: ${campo}.`);
  return n;
}

/** Exige um texto não vazio, com tamanho máximo. */
function texto(valor, campo, max = 100) {
  if (typeof valor !== 'string' || valor.trim() === '' || valor.length > max) {
    throw new ErroHttp(400, `Campo inválido: ${campo}.`);
  }
  return valor.trim();
}

/** Texto opcional: vazio/ausente vira null; se vier, segue as mesmas regras de `texto`. */
function textoOpcional(valor, campo, max = 100) {
  return valor == null || valor === '' ? null : texto(valor, campo, max);
}

/** Inteiro dentro de um intervalo (ex.: quantidade de exemplares). Ausente = `padrao`. */
function inteiroEntre(valor, campo, min, max, padrao) {
  if (valor == null && padrao !== undefined) return padrao;
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new ErroHttp(400, `Campo inválido: ${campo} (use de ${min} a ${max}).`);
  }
  return valor;
}

/** ISBN opcional: aceita hífens/espaços e confere se são 10 ou 13 dígitos. Devolve só os caracteres. */
function isbn(valor) {
  if (valor == null || valor === '') return null;
  const limpo = typeof valor === 'string' ? valor.replace(/[-\s]/g, '').toUpperCase() : '';
  if (!/^(\d{9}[\dX]|\d{13})$/.test(limpo)) throw new ErroHttp(400, 'Campo inválido: isbn (use 10 ou 13 dígitos).');
  return limpo;
}

/**
 * Prepara o termo de busca para uso com LIKE. Os curingas % e _ digitados pelo usuário viram
 * texto comum (senão "%" listaria o banco inteiro). Use sempre com `ESCAPE '\'` no SQL.
 */
function termoDeBusca(valor) {
  const limpo = String(valor ?? '').trim().slice(0, 60);
  return `%${limpo.replace(/[\\%_]/g, '\\$&')}%`;
}

module.exports = { inteiroPositivo, texto, textoOpcional, inteiroEntre, isbn, termoDeBusca };
