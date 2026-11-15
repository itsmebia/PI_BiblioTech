// Cadastro de leitores (alunos e professores).
// A conta de administração NÃO é gerenciada aqui: ninguém consegue criar nem promover um "admin"
// pela API (evita escalada de privilégio — OWASP A01).

const config = require('../config');
const { db, emTransacao } = require('../db/conexao');
const { ErroHttp } = require('../erros');
const { registrar } = require('../log');
const { texto } = require('../seguranca/validacao');
const { usuarioPorId } = require('./consultas');

const PERFIS_DE_LEITOR = ['aluno', 'professor'];

/** Valida e seleciona SOMENTE os campos permitidos (senha, suspensão e id nunca vêm do cliente). */
function lerDadosDoLeitor(corpo) {
  const perfil = corpo.perfil;
  if (!PERFIS_DE_LEITOR.includes(perfil)) throw new ErroHttp(400, 'Campo inválido: perfil (use aluno ou professor).');

  const matricula = texto(corpo.matricula, 'matricula', 20);
  if (!/^[A-Za-z0-9-]{3,20}$/.test(matricula)) {
    throw new ErroHttp(400, 'Campo inválido: matricula (3 a 20 letras, números ou hífen).');
  }
  // Aluno precisa de turma; para professor o campo não se aplica.
  const turma = perfil === 'aluno' ? texto(corpo.turma, 'turma', 30) : null;
  return { nome: texto(corpo.nome, 'nome', 100), matricula, perfil, turma };
}

function exigirMatriculaLivre(matricula, idDoProprio = 0) {
  const existente = db.prepare('SELECT nome FROM usuarios WHERE matricula = ? AND id != ?').get(matricula, idDoProprio);
  if (existente) throw new ErroHttp(409, 'Esta matrícula já está em uso.');
}

/** Garante que o leitor existe e é um leitor de verdade (nunca a conta de administração). */
function exigirLeitor(id) {
  const leitor = db.prepare("SELECT id, perfil FROM usuarios WHERE id = ? AND perfil != 'admin'").get(id);
  if (!leitor) throw new ErroHttp(404, 'Usuário não encontrado.');
  return leitor;
}

const emprestimosAbertos = (id) =>
  db.prepare('SELECT COUNT(*) AS total FROM emprestimos WHERE usuario_id = ? AND data_devolucao IS NULL').get(id).total;

function criarLeitor(corpo) {
  const d = lerDadosDoLeitor(corpo);
  return emTransacao(() => {
    exigirMatriculaLivre(d.matricula);
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO usuarios (nome, matricula, perfil, turma) VALUES (?, ?, ?, ?)')
      .run(d.nome, d.matricula, d.perfil, d.turma);
    registrar('leitor.criado', { usuario: id, perfil: d.perfil });
    return usuarioPorId(id);
  });
}

function editarLeitor(id, corpo) {
  const d = lerDadosDoLeitor(corpo);
  return emTransacao(() => {
    exigirLeitor(id);
    exigirMatriculaLivre(d.matricula, id);
    // Mudar de perfil muda o limite de obras: não pode ficar abaixo do que a pessoa já tem em mãos.
    const limite = config.politica[d.perfil].limite;
    if (emprestimosAbertos(id) > limite) {
      throw new ErroHttp(409, `Este leitor tem mais de ${limite} obras emprestadas, o limite do perfil ${d.perfil}.`);
    }
    db.prepare('UPDATE usuarios SET nome = ?, matricula = ?, perfil = ?, turma = ? WHERE id = ?')
      .run(d.nome, d.matricula, d.perfil, d.turma, id);
    registrar('leitor.editado', { usuario: id });
    return usuarioPorId(id);
  });
}

function excluirLeitor(id) {
  return emTransacao(() => {
    exigirLeitor(id);
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM emprestimos WHERE usuario_id = ?').get(id);
    if (total > 0) {
      throw new ErroHttp(409, 'Este leitor tem histórico de empréstimos e não pode ser excluído.');
    }
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    registrar('leitor.excluido', { usuario: id });
    return { id };
  });
}

module.exports = { criarLeitor, editarLeitor, excluirLeitor };
