// Carga inicial de dados FICTÍCIOS para demonstração. Só roda se o banco estiver vazio.
// (Nomes, matrículas e ISBNs adicionados aqui são inventados; os títulos são obras conhecidas.)

const config = require('../config');
const { db, emTransacao } = require('./conexao');
const { gerarHash } = require('../seguranca/senhas');
const { dia } = require('../datas');

// [nome, matrícula, perfil, turma]
const USUARIOS = [
  ['Lucas Mendes', '2026001', 'aluno', '1º Ano EM'],
  ['Ana Beatriz Costa', '2026002', 'aluno', '2º Ano EM'],
  ['Pedro Henrique Lima', '2026003', 'aluno', '9º Ano EF'],
  ['Beatriz Nogueira', '2026004', 'aluno', '3º Ano EM'],
  ['Rafael Souza', '2026005', 'aluno', '8º Ano EF'],
  ['Camila Ferreira', '2026006', 'aluno', '1º Ano EM'],
  ['João Vitor Santos', '2026007', 'aluno', '9º Ano EF'],
  ['Mariana Oliveira', '2026008', 'aluno', '2º Ano EM'],
  ['Gabriel Rocha', '2026009', 'aluno', '6º Ano EF'],
  ['Larissa Martins', '2026010', 'aluno', '3º Ano EM'],
  ['Prof. Carlos Almeida', 'P-0101', 'professor', null],
  ['Profa. Helena Duarte', 'P-0102', 'professor', null],
  ['Prof. Ricardo Menezes', 'P-0103', 'professor', null],
];

// [título, autor, ISBN, gênero, localização, nº de exemplares]. A posição na lista define o código: EX-<posição>-<n>.
const OBRAS = [
  ['Dom Casmurro', 'Machado de Assis', '9788535911664', 'Romance', 'Sala 1 · Estante A · Prateleira 2', 2],
  ['O Cortiço', 'Aluísio Azevedo', '9788508040605', 'Romance', 'Sala 1 · Estante A · Prateleira 3', 1],
  ['Capitães da Areia', 'Jorge Amado', '9788535914061', 'Romance', 'Sala 1 · Estante B · Prateleira 1', 2],
  ['O Pequeno Príncipe', 'Antoine de Saint-Exupéry', '9788522008731', 'Infantojuvenil', 'Sala 1 · Estante C · Prateleira 1', 3],
  ['Vidas Secas', 'Graciliano Ramos', '9788501117465', 'Romance', 'Sala 1 · Estante B · Prateleira 2', 1],
  ['Memórias Póstumas de Brás Cubas', 'Machado de Assis', '9788535910663', 'Romance', 'Sala 1 · Estante A · Prateleira 2', 1],
  ['Introdução à Física', 'Hugh D. Young', '9788588639331', 'Didático', 'Sala 2 · Estante D · Prateleira 1', 2],
  ['A Hora da Estrela', 'Clarice Lispector', '9788532511010', 'Romance', 'Sala 1 · Estante B · Prateleira 3', 2],
  ['Harry Potter e a Pedra Filosofal', 'J. K. Rowling', '9788532530787', 'Fantasia', 'Sala 1 · Estante C · Prateleira 2', 3],
  ['O Hobbit', 'J. R. R. Tolkien', '9788595084742', 'Fantasia', 'Sala 1 · Estante C · Prateleira 3', 2],
  ['1984', 'George Orwell', '9788535914849', 'Ficção Científica', 'Sala 1 · Estante E · Prateleira 1', 2],
  ['Fahrenheit 451', 'Ray Bradbury', '9788525052247', 'Ficção Científica', 'Sala 1 · Estante E · Prateleira 2', 1],
  ['Quarto de Despejo', 'Carolina Maria de Jesus', '9788508128884', 'Biografia', 'Sala 2 · Estante A · Prateleira 1', 2],
  ['O Diário de Anne Frank', 'Anne Frank', '9788501061546', 'Biografia', 'Sala 2 · Estante A · Prateleira 2', 2],
  ['Poemas Escolhidos', 'Cecília Meireles', '9788526016484', 'Poesia', 'Sala 2 · Estante B · Prateleira 1', 2],
  ['Sagarana', 'João Guimarães Rosa', '9788520925478', 'Contos', 'Sala 2 · Estante B · Prateleira 2', 1],
  ['Auto da Compadecida', 'Ariano Suassuna', '9788520923818', 'Teatro', 'Sala 2 · Estante B · Prateleira 3', 2],
  ['Brasil: Uma Biografia', 'Lilia Schwarcz', '9788535926149', 'História', 'Sala 2 · Estante C · Prateleira 1', 1],
  ['Matemática Essencial', 'Gelson Iezzi', '9788557000011', 'Didático', 'Sala 2 · Estante D · Prateleira 2', 3],
  ['Química Geral', 'Martha Reis', '9788557000028', 'Didático', 'Sala 2 · Estante D · Prateleira 3', 2],
  ['O Menino do Pijama Listrado', 'John Boyne', '9788535910186', 'Romance', 'Sala 1 · Estante B · Prateleira 4', 2],
];

// [matrícula, exemplar, retirada, prevista, devolução] — datas em dias a partir de hoje (null = ainda emprestado).
const EMPRESTIMOS = [
  // Em aberto e ATRASADOS (aparecem no painel)
  ['2026001', 'EX-001-1', -12, -5, null],
  ['2026005', 'EX-002-1', -10, -3, null],
  ['2026006', 'EX-005-1', -16, -9, null],
  // Em aberto e EM DIA
  ['2026002', 'EX-003-1', -2, 5, null],
  ['2026004', 'EX-009-1', -3, 4, null],
  ['2026004', 'EX-011-1', -1, 6, null],
  ['2026010', 'EX-014-1', -6, 1, null],
  ['P-0102', 'EX-018-1', -5, 10, null],
  ['P-0102', 'EX-017-1', -4, 11, null],
  // Já devolvidos (histórico)
  ['2026008', 'EX-010-1', -20, -13, -8], // devolveu com atraso → está suspensa
  ['2026001', 'EX-004-1', -30, -23, -24],
  ['2026007', 'EX-008-1', -25, -18, -19],
];

// Quem está suspenso por atraso: [matrícula, dias a partir de hoje].
const SUSPENSOS = [['2026008', 3]];
// Exemplares fora de circulação para a demonstração.
const EM_MANUTENCAO = ['EX-007-2'];

function popularSeVazio() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total > 0) return;

  emTransacao(() => {
    const novoUsuario = db.prepare(
      'INSERT INTO usuarios (nome, matricula, perfil, turma, senha_hash) VALUES (?, ?, ?, ?, ?)');
    novoUsuario.run('Marta Silva', 'marta', 'admin', null, gerarHash(config.senhaInicialAdmin()));
    const idPorMatricula = {};
    for (const [nome, matricula, perfil, turma] of USUARIOS) {
      idPorMatricula[matricula] = novoUsuario.run(nome, matricula, perfil, turma, null).lastInsertRowid;
    }

    const novaObra = db.prepare(
      'INSERT INTO obras (titulo, autor, isbn, genero, localizacao) VALUES (?, ?, ?, ?, ?)');
    const novoExemplar = db.prepare('INSERT INTO exemplares (obra_id, codigo) VALUES (?, ?)');
    OBRAS.forEach(([titulo, autor, isbn, genero, local, quantidade], i) => {
      const obraId = novaObra.run(titulo, autor, isbn, genero, local).lastInsertRowid;
      for (let n = 1; n <= quantidade; n++) {
        novoExemplar.run(obraId, `EX-${String(i + 1).padStart(3, '0')}-${n}`);
      }
    });

    const exemplar = db.prepare('SELECT id FROM exemplares WHERE codigo = ?');
    const novoEmprestimo = db.prepare(`INSERT INTO emprestimos
      (usuario_id, exemplar_id, data_emprestimo, data_prevista, data_devolucao) VALUES (?, ?, ?, ?, ?)`);
    const marcarEmprestado = db.prepare("UPDATE exemplares SET status = 'Emprestado' WHERE id = ?");
    for (const [matricula, codigo, retirada, prevista, devolucao] of EMPRESTIMOS) {
      const exemplarId = exemplar.get(codigo).id;
      novoEmprestimo.run(idPorMatricula[matricula], exemplarId, dia(retirada), dia(prevista),
        devolucao === null ? null : dia(devolucao));
      if (devolucao === null) marcarEmprestado.run(exemplarId);
    }

    for (const [matricula, dias] of SUSPENSOS) {
      db.prepare('UPDATE usuarios SET suspenso_ate = ? WHERE id = ?').run(dia(dias), idPorMatricula[matricula]);
    }
    for (const codigo of EM_MANUTENCAO) {
      db.prepare("UPDATE exemplares SET status = 'Em Manutenção' WHERE codigo = ?").run(codigo);
    }
  });
}

module.exports = { popularSeVazio };
