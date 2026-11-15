// Testes das regras de negócio da biblioteca, pela API (ponta a ponta).

const test = require('node:test');
const assert = require('node:assert');
const { iniciarServidor, criarCliente } = require('./apoio');

let servidor, marta;

test.before(async () => {
  const iniciado = await iniciarServidor();
  servidor = iniciado.servidor;
  marta = criarCliente(iniciado.base);
  assert.strictEqual((await marta.entrar()).status, 200);
});
test.after(() => servidor.close());

const buscarUsuario = async (q) => (await marta.chamar('GET', `/api/usuarios?q=${q}`)).dados[0];

test('painel lista os atrasos da carga inicial, do mais antigo ao mais recente', async () => {
  const { dados } = await marta.chamar('GET', '/api/atrasos');
  assert.deepStrictEqual(dados.map((a) => [a.nome, a.dias_atraso]),
    [['Camila Ferreira', 9], ['Lucas Mendes', 5], ['Rafael Souza', 3]]);
});

test('aluno suspenso na carga inicial aparece como suspenso', async () => {
  const mariana = await buscarUsuario('2026008');
  assert.strictEqual(mariana.status, 'suspenso');
  assert.strictEqual(mariana.emprestimos_ativos.length, 0);
});

test('devolução atrasada libera o exemplar, suspende o aluno e bloqueia novo empréstimo', async () => {
  const lucas = await buscarUsuario('2026001');
  const devolucao = await marta.chamar('POST', `/api/emprestimos/${lucas.emprestimos_ativos[0].id}/devolucao`);
  assert.strictEqual(devolucao.status, 200);
  assert.strictEqual(devolucao.dados.dias_atraso, 5);
  assert.ok(devolucao.dados.suspenso_ate);

  assert.strictEqual((await buscarUsuario('2026001')).status, 'suspenso');
  const novo = await marta.chamar('POST', '/api/emprestimos', { usuario_id: lucas.id, exemplar_id: 1 });
  assert.strictEqual(novo.status, 409);
  assert.match(novo.dados.erro, /suspenso/);
});

test('não é possível devolver o mesmo empréstimo duas vezes', async () => {
  const ana = await buscarUsuario('2026002');
  const id = ana.emprestimos_ativos[0].id;
  assert.strictEqual((await marta.chamar('POST', `/api/emprestimos/${id}/devolucao`)).status, 200);
  assert.strictEqual((await marta.chamar('POST', `/api/emprestimos/${id}/devolucao`)).status, 409);
});

test('empréstimo respeita o limite do perfil e a disponibilidade do exemplar', async () => {
  const pedro = await buscarUsuario('2026003');
  const livres = (await marta.chamar('GET', '/api/obras?q=')).dados
    .flatMap((o) => o.exemplares).filter((e) => e.status === 'Disponível');

  const primeiro = await marta.chamar('POST', '/api/emprestimos', { usuario_id: pedro.id, exemplar_id: livres[0].id });
  assert.strictEqual(primeiro.status, 201);
  assert.ok(primeiro.dados.data_prevista);

  const repetido = await marta.chamar('POST', '/api/emprestimos', { usuario_id: pedro.id, exemplar_id: livres[0].id });
  assert.strictEqual(repetido.status, 409); // exemplar já emprestado

  assert.strictEqual((await marta.chamar('POST', '/api/emprestimos', { usuario_id: pedro.id, exemplar_id: livres[1].id })).status, 201);
  const excedeu = await marta.chamar('POST', '/api/emprestimos', { usuario_id: pedro.id, exemplar_id: livres[2].id });
  assert.strictEqual(excedeu.status, 409); // aluno: máximo de 2 obras
  assert.match(excedeu.dados.erro, /Limite/);
});

test('a conta de administração não pode ser tratada como leitor', async () => {
  const r = await marta.chamar('POST', '/api/emprestimos', { usuario_id: 1, exemplar_id: 1 });
  assert.strictEqual(r.status, 404);
});
