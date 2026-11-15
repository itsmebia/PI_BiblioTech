// Consultas de leitura (painel, usuários, acervo).
// Todas usam parâmetros (?) — o valor digitado nunca vira parte do texto SQL (OWASP A03).
// Só devolvemos as colunas necessárias: senha_hash, por exemplo, jamais sai do servidor (A02/A04).

const config = require('../config');
const { db } = require('../db/conexao');
const { dia, diasEntre } = require('../datas');
const { termoDeBusca } = require('../seguranca/validacao');

const contar = (sql, ...params) => db.prepare(sql).get(...params).total;

function painel() {
  const hoje = dia();
  return {
    obras: contar('SELECT COUNT(*) AS total FROM obras'),
    exemplares_disponiveis: contar("SELECT COUNT(*) AS total FROM exemplares WHERE status = 'Disponível'"),
    emprestados: contar('SELECT COUNT(*) AS total FROM emprestimos WHERE data_devolucao IS NULL'),
    em_atraso: contar(
      'SELECT COUNT(*) AS total FROM emprestimos WHERE data_devolucao IS NULL AND data_prevista < ?', hoje),
  };
}

function usuariosEmAtraso() {
  const hoje = dia();
  return db.prepare(`
    SELECT em.id, u.nome, u.matricula, u.turma, o.titulo, em.data_prevista
    FROM emprestimos em
    JOIN usuarios u   ON u.id = em.usuario_id
    JOIN exemplares x ON x.id = em.exemplar_id
    JOIN obras o      ON o.id = x.obra_id
    WHERE em.data_devolucao IS NULL AND em.data_prevista < ?
    ORDER BY em.data_prevista`).all(hoje)
    .map((e) => ({ ...e, dias_atraso: diasEntre(e.data_prevista, hoje) }));
}

const COLUNAS_USUARIO = 'id, nome, matricula, perfil, turma, suspenso_ate';

/** Completa cada leitor com status, limite e empréstimos ativos; `historico` = empréstimos já feitos (define se pode ser excluído). */
function montarUsuarios(linhas) {
  const hoje = dia();
  const emprestimosAtivos = db.prepare(`
    SELECT em.id, o.titulo, o.autor, x.codigo, em.data_emprestimo, em.data_prevista
    FROM emprestimos em
    JOIN exemplares x ON x.id = em.exemplar_id
    JOIN obras o      ON o.id = x.obra_id
    WHERE em.usuario_id = ? AND em.data_devolucao IS NULL
    ORDER BY em.data_prevista`);
  const totalDeEmprestimos = db.prepare('SELECT COUNT(*) AS total FROM emprestimos WHERE usuario_id = ?');

  return linhas.map((u) => {
    const suspenso = Boolean(u.suspenso_ate && u.suspenso_ate >= hoje);
    return {
      id: u.id,
      nome: u.nome,
      matricula: u.matricula,
      perfil: u.perfil,
      turma: u.turma,
      status: suspenso ? 'suspenso' : 'ativo',
      suspenso_ate: suspenso ? u.suspenso_ate : null,
      limite: config.politica[u.perfil].limite,
      historico: totalDeEmprestimos.get(u.id).total,
      emprestimos_ativos: emprestimosAtivos.all(u.id)
        .map((e) => ({ ...e, dias_atraso: Math.max(0, diasEntre(e.data_prevista, hoje)) })),
    };
  });
}

/** Busca alunos/professores por nome ou matrícula. A conta de administração nunca aparece aqui. */
function buscarUsuarios(busca) {
  const termo = termoDeBusca(busca);
  const linhas = db.prepare(`
    SELECT ${COLUNAS_USUARIO} FROM usuarios
    WHERE perfil != 'admin' AND (nome LIKE ? ESCAPE '\\' OR matricula LIKE ? ESCAPE '\\')
    ORDER BY nome LIMIT ?`).all(termo, termo, config.maxResultadosBusca);
  return montarUsuarios(linhas);
}

function usuarioPorId(id) {
  const linha = db.prepare(`SELECT ${COLUNAS_USUARIO} FROM usuarios WHERE id = ? AND perfil != 'admin'`).get(id);
  return linha ? montarUsuarios([linha])[0] : null;
}

/** Anexa a cada obra a lista de exemplares (com o nº de empréstimos já feitos, que define se pode ser removido). */
function comExemplares(obras) {
  const exemplaresDaObra = db.prepare(`
    SELECT e.id, e.codigo, e.status,
           (SELECT COUNT(*) FROM emprestimos WHERE exemplar_id = e.id) AS historico
    FROM exemplares e WHERE e.obra_id = ? ORDER BY e.codigo`);
  return obras.map((o) => {
    const exemplares = exemplaresDaObra.all(o.id);
    return { ...o, exemplares, disponiveis: exemplares.filter((e) => e.status === 'Disponível').length };
  });
}

const COLUNAS_OBRA = 'id, titulo, autor, isbn, genero, localizacao';

/** Busca obras por título, autor, ISBN ou gênero; `genero` (opcional) restringe a um gênero exato. */
function buscarObras(busca, genero) {
  const termo = termoDeBusca(busca);
  const obras = db.prepare(`
    SELECT ${COLUNAS_OBRA} FROM obras
    WHERE (titulo LIKE ? ESCAPE '\\' OR autor LIKE ? ESCAPE '\\' OR genero LIKE ? ESCAPE '\\' OR isbn LIKE ? ESCAPE '\\')
      AND (? = '' OR genero = ?)
    ORDER BY titulo LIMIT ?`).all(termo, termo, termo, termo, genero || '', genero || '', config.maxResultadosBusca);
  return comExemplares(obras);
}

function obraPorId(id) {
  const obra = db.prepare(`SELECT ${COLUNAS_OBRA} FROM obras WHERE id = ?`).get(id);
  return obra ? comExemplares([obra])[0] : null;
}

/** Gêneros já cadastrados (alimentam o filtro e as sugestões do formulário). */
function listarGeneros() {
  return db.prepare("SELECT DISTINCT genero FROM obras WHERE genero IS NOT NULL AND genero != '' ORDER BY genero")
    .all().map((r) => r.genero);
}

module.exports = { painel, usuariosEmAtraso, buscarUsuarios, usuarioPorId, buscarObras, obraPorId, listarGeneros };
