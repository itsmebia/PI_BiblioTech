// Regras de negócio da circulação: empréstimo e devolução.
// Este módulo não conhece HTTP; só recebe dados já validados e devolve resultados ou lança ErroHttp.

const config = require('../config');
const { db, emTransacao } = require('../db/conexao');
const { ErroHttp } = require('../erros');
const { dia, diasEntre } = require('../datas');
const { registrar } = require('../log');

/** Registra o empréstimo de um exemplar para um usuário, aplicando todas as regras da biblioteca. */
function emprestar(usuarioId, exemplarId) {
  // Tudo (verificações + gravação) ocorre na mesma transação, então as regras valem no momento exato da gravação.
  return emTransacao(() => {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId);
    if (!usuario || usuario.perfil === 'admin') throw new ErroHttp(404, 'Usuário não encontrado.');

    const hoje = dia();
    if (usuario.suspenso_ate && usuario.suspenso_ate >= hoje) {
      throw new ErroHttp(409, `Usuário suspenso até ${usuario.suspenso_ate} por atraso em devolução.`);
    }

    const { limite, dias } = config.politica[usuario.perfil];
    const { emPosse } = db.prepare(
      'SELECT COUNT(*) AS emPosse FROM emprestimos WHERE usuario_id = ? AND data_devolucao IS NULL').get(usuarioId);
    if (emPosse >= limite) {
      throw new ErroHttp(409, `Limite de ${limite} obras simultâneas atingido para o perfil ${usuario.perfil}.`);
    }

    const exemplar = db.prepare(`
      SELECT e.id, e.codigo, e.status, o.titulo, o.autor
      FROM exemplares e JOIN obras o ON o.id = e.obra_id WHERE e.id = ?`).get(exemplarId);
    if (!exemplar) throw new ErroHttp(404, 'Exemplar não encontrado.');
    if (exemplar.status !== 'Disponível') throw new ErroHttp(409, `Exemplar indisponível (${exemplar.status}).`);

    const prevista = dia(dias);
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO emprestimos (usuario_id, exemplar_id, data_emprestimo, data_prevista) VALUES (?, ?, ?, ?)')
      .run(usuarioId, exemplarId, hoje, prevista);
    db.prepare("UPDATE exemplares SET status = 'Emprestado' WHERE id = ?").run(exemplarId);

    registrar('emprestimo.criado', { emprestimo: lastInsertRowid, usuario: usuarioId, exemplar: exemplarId });
    return {
      id: lastInsertRowid,
      usuario: usuario.nome,
      titulo: exemplar.titulo,
      autor: exemplar.autor,
      codigo: exemplar.codigo,
      data_emprestimo: hoje,
      data_prevista: prevista,
    };
  });
}

/** Registra a devolução. Se houve atraso, suspende o usuário (1 dia de suspensão por dia de atraso). */
function devolver(emprestimoId) {
  return emTransacao(() => {
    const emprestimo = db.prepare('SELECT * FROM emprestimos WHERE id = ?').get(emprestimoId);
    if (!emprestimo) throw new ErroHttp(404, 'Empréstimo não encontrado.');
    if (emprestimo.data_devolucao) throw new ErroHttp(409, 'Este empréstimo já foi devolvido.');

    const hoje = dia();
    const diasAtraso = Math.max(0, diasEntre(emprestimo.data_prevista, hoje));

    db.prepare('UPDATE emprestimos SET data_devolucao = ? WHERE id = ?').run(hoje, emprestimoId);
    db.prepare("UPDATE exemplares SET status = 'Disponível' WHERE id = ?").run(emprestimo.exemplar_id);

    let suspensoAte = null;
    if (diasAtraso > 0) {
      suspensoAte = dia(diasAtraso);
      db.prepare('UPDATE usuarios SET suspenso_ate = ? WHERE id = ?').run(suspensoAte, emprestimo.usuario_id);
    }

    registrar('emprestimo.devolvido', { emprestimo: emprestimoId, diasAtraso });
    return { id: emprestimoId, data_devolucao: hoje, dias_atraso: diasAtraso, suspenso_ate: suspensoAte };
  });
}

module.exports = { emprestar, devolver };
