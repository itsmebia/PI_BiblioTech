// Conexão com o SQLite (módulo nativo do Node 22, sem dependências externas).

const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const { aplicarEsquema } = require('./esquema');

const db = new DatabaseSync(config.arquivoBanco);
db.exec('PRAGMA foreign_keys = ON'); // faz o banco recusar vínculos inexistentes
aplicarEsquema(db);

/**
 * Executa `acao` dentro de uma transação: ou tudo é gravado, ou nada é.
 * BEGIN IMMEDIATE já reserva a escrita, evitando que dois atendimentos simultâneos
 * emprestem o mesmo exemplar.
 */
function emTransacao(acao) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = acao();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

module.exports = { db, emTransacao };
