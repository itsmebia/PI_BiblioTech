// Cadastro do acervo: obras (o "título") e exemplares (as cópias físicas de cada título).
// Regra de ouro: o que já tem histórico de empréstimos NUNCA é apagado — preserva o registro
// de quem pegou o quê. Para tirar de circulação, o exemplar vai para "Em Manutenção".

const { db, emTransacao } = require('../db/conexao');
const { ErroHttp } = require('../erros');
const { registrar } = require('../log');
const { texto, textoOpcional, isbn, inteiroEntre } = require('../seguranca/validacao');
const { obraPorId } = require('./consultas');

const MAX_EXEMPLARES_POR_VEZ = 50;
// "Emprestado" não aparece aqui de propósito: esse status só muda por empréstimo/devolução.
const STATUS_MANUAIS = ['Disponível', 'Em Manutenção'];

/**
 * Valida e seleciona SOMENTE os campos permitidos. Campos extras enviados pelo cliente
 * (ex.: "id", "status") são ignorados — evita "mass assignment" (OWASP A01/A04).
 */
function lerDadosDaObra(corpo) {
  return {
    titulo: texto(corpo.titulo, 'titulo', 150),
    autor: texto(corpo.autor, 'autor', 100),
    isbn: isbn(corpo.isbn),
    genero: textoOpcional(corpo.genero, 'genero', 50),
    localizacao: textoOpcional(corpo.localizacao, 'localizacao', 100),
  };
}

function exigirIsbnLivre(codigoIsbn, idDaPropriaObra = 0) {
  if (!codigoIsbn) return;
  const existente = db.prepare('SELECT titulo FROM obras WHERE isbn = ? AND id != ?').get(codigoIsbn, idDaPropriaObra);
  if (existente) throw new ErroHttp(409, `Este ISBN já está cadastrado em "${existente.titulo}".`);
}

function exigirObra(id) {
  if (!db.prepare('SELECT 1 FROM obras WHERE id = ?').get(id)) throw new ErroHttp(404, 'Obra não encontrada.');
}

/** Código legível e único do exemplar: EX-<obra>-<sequência>, ex.: EX-004-3. */
function gerarCodigo(obraId) {
  const usados = db.prepare('SELECT codigo FROM exemplares WHERE obra_id = ?').all(obraId)
    .map((e) => Number(e.codigo.split('-').pop()) || 0);
  const proximo = Math.max(0, ...usados) + 1;
  return `EX-${String(obraId).padStart(3, '0')}-${proximo}`;
}

function criarExemplares(obraId, quantidade) {
  const inserir = db.prepare('INSERT INTO exemplares (obra_id, codigo) VALUES (?, ?)');
  for (let i = 0; i < quantidade; i++) inserir.run(obraId, gerarCodigo(obraId));
}

function criarObra(corpo) {
  const dados = lerDadosDaObra(corpo);
  const quantidade = inteiroEntre(corpo.quantidade, 'quantidade', 0, MAX_EXEMPLARES_POR_VEZ, 1);
  return emTransacao(() => {
    exigirIsbnLivre(dados.isbn);
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO obras (titulo, autor, isbn, genero, localizacao) VALUES (?, ?, ?, ?, ?)')
      .run(dados.titulo, dados.autor, dados.isbn, dados.genero, dados.localizacao);
    criarExemplares(id, quantidade);
    registrar('acervo.obra_criada', { obra: id, exemplares: quantidade });
    return obraPorId(id);
  });
}

function editarObra(id, corpo) {
  const dados = lerDadosDaObra(corpo);
  return emTransacao(() => {
    exigirObra(id);
    exigirIsbnLivre(dados.isbn, id);
    db.prepare('UPDATE obras SET titulo = ?, autor = ?, isbn = ?, genero = ?, localizacao = ? WHERE id = ?')
      .run(dados.titulo, dados.autor, dados.isbn, dados.genero, dados.localizacao, id);
    registrar('acervo.obra_editada', { obra: id });
    return obraPorId(id);
  });
}

function excluirObra(id) {
  return emTransacao(() => {
    exigirObra(id);
    const { total } = db.prepare(`
      SELECT COUNT(*) AS total FROM emprestimos em JOIN exemplares x ON x.id = em.exemplar_id
      WHERE x.obra_id = ?`).get(id);
    if (total > 0) {
      throw new ErroHttp(409, 'Esta obra tem histórico de empréstimos e não pode ser excluída. ' +
        'Coloque os exemplares em manutenção para retirá-la de circulação.');
    }
    db.prepare('DELETE FROM exemplares WHERE obra_id = ?').run(id);
    db.prepare('DELETE FROM obras WHERE id = ?').run(id);
    registrar('acervo.obra_excluida', { obra: id });
    return { id };
  });
}

function adicionarExemplares(obraId, corpo) {
  const quantidade = inteiroEntre(corpo.quantidade, 'quantidade', 1, MAX_EXEMPLARES_POR_VEZ, 1);
  return emTransacao(() => {
    exigirObra(obraId);
    criarExemplares(obraId, quantidade);
    registrar('acervo.exemplares_adicionados', { obra: obraId, quantidade });
    return obraPorId(obraId);
  });
}

function alterarStatusDoExemplar(exemplarId, corpo) {
  if (!STATUS_MANUAIS.includes(corpo.status)) {
    throw new ErroHttp(400, `Status inválido. Use: ${STATUS_MANUAIS.join(' ou ')}.`);
  }
  return emTransacao(() => {
    const exemplar = db.prepare('SELECT obra_id, status FROM exemplares WHERE id = ?').get(exemplarId);
    if (!exemplar) throw new ErroHttp(404, 'Exemplar não encontrado.');
    if (exemplar.status === 'Emprestado') {
      throw new ErroHttp(409, 'Exemplar emprestado: registre a devolução antes de alterar o status.');
    }
    db.prepare('UPDATE exemplares SET status = ? WHERE id = ?').run(corpo.status, exemplarId);
    registrar('acervo.status_alterado', { exemplar: exemplarId, status: corpo.status });
    return obraPorId(exemplar.obra_id);
  });
}

function removerExemplar(exemplarId) {
  return emTransacao(() => {
    const exemplar = db.prepare('SELECT obra_id FROM exemplares WHERE id = ?').get(exemplarId);
    if (!exemplar) throw new ErroHttp(404, 'Exemplar não encontrado.');
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM emprestimos WHERE exemplar_id = ?').get(exemplarId);
    if (total > 0) {
      throw new ErroHttp(409, 'Este exemplar tem histórico de empréstimos e não pode ser removido. Use "Manutenção".');
    }
    db.prepare('DELETE FROM exemplares WHERE id = ?').run(exemplarId);
    registrar('acervo.exemplar_removido', { exemplar: exemplarId });
    return obraPorId(exemplar.obra_id);
  });
}

module.exports = { criarObra, editarObra, excluirObra, adicionarExemplares, alterarStatusDoExemplar, removerExemplar };
