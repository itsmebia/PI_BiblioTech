// Testes do cadastro de leitores (alunos e professores), pela API.

const test = require('node:test');
const assert = require('node:assert');
const { iniciarServidor, criarCliente } = require('./apoio');

let servidor, base, marta;
test.before(async () => {
  ({ servidor, base } = await iniciarServidor());
  marta = criarCliente(base);
  await marta.entrar();
});
test.after(() => servidor.close());

const ALUNO = { nome: 'Sofia Almeida', matricula: 'A-3001', perfil: 'aluno', turma: '7º Ano EF' };
const buscar = async (q) => (await marta.chamar('GET', `/api/usuarios?q=${encodeURIComponent(q)}`)).dados;

test('cadastra aluno e professor (professor não guarda turma)', async () => {
  const aluno = await marta.chamar('POST', '/api/usuarios', ALUNO);
  assert.strictEqual(aluno.status, 201);
  assert.strictEqual(aluno.dados.status, 'ativo');
  assert.strictEqual(aluno.dados.limite, 2);
  const prof = await marta.chamar('POST', '/api/usuarios', { nome: 'Profa. Lúcia Prado', matricula: 'P-3001', perfil: 'professor', turma: '9º A' });
  assert.strictEqual(prof.status, 201);
  assert.strictEqual(prof.dados.turma, null);
  assert.strictEqual(prof.dados.limite, 5);
});

test('validações: perfil, matrícula, turma do aluno e tamanhos', async () => {
  const ruins = [
    { ...ALUNO, matricula: 'B-1', perfil: 'admin' },       // ninguém vira administrador pela API
    { ...ALUNO, matricula: 'B-2', perfil: 'diretor' },
    { ...ALUNO, matricula: 'x y' }, { ...ALUNO, matricula: 'ab' }, { ...ALUNO, matricula: "A';--" },
    { ...ALUNO, matricula: 'B-3', turma: '' },             // aluno exige turma
    { ...ALUNO, matricula: 'B-4', nome: '' }, { ...ALUNO, matricula: 'B-5', nome: 'n'.repeat(101) },
    { ...ALUNO, matricula: 'B-6', nome: 42 },
  ];
  for (const corpo of ruins) {
    assert.strictEqual((await marta.chamar('POST', '/api/usuarios', corpo)).status, 400, JSON.stringify(corpo).slice(0, 70));
  }
});

test('matrícula repetida é recusada (inclusive a da conta de administração)', async () => {
  assert.strictEqual((await marta.chamar('POST', '/api/usuarios', ALUNO)).status, 409);
  assert.strictEqual((await marta.chamar('POST', '/api/usuarios', { ...ALUNO, matricula: 'marta' })).status, 409);
});

test('campos extras (senha, suspensão, id) enviados pelo cliente são ignorados', async () => {
  const r = await marta.chamar('POST', '/api/usuarios', { ...ALUNO, matricula: 'A-3002', id: 1, senha_hash: 'x', suspenso_ate: '2999-01-01' });
  assert.strictEqual(r.status, 201);
  assert.notStrictEqual(r.dados.id, 1);
  assert.strictEqual(r.dados.status, 'ativo');
  assert.ok(!JSON.stringify(r.dados).includes('senha'));
});

test('nome com HTML é guardado como texto puro', async () => {
  const r = await marta.chamar('POST', '/api/usuarios', { ...ALUNO, matricula: 'A-3003', nome: '<script>alert(1)</script>' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.dados.nome, '<script>alert(1)</script>');
});

test('edita dados e mantém a própria matrícula, mas não pega a de outro', async () => {
  const [sofia] = await buscar('A-3001');
  const ok = await marta.chamar('PUT', `/api/usuarios/${sofia.id}`, { ...ALUNO, nome: 'Sofia Almeida Prado', turma: '8º Ano EF' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.dados.nome, 'Sofia Almeida Prado');
  assert.strictEqual(ok.dados.turma, '8º Ano EF');
  assert.strictEqual((await marta.chamar('PUT', `/api/usuarios/${sofia.id}`, { ...ALUNO, matricula: '2026001' })).status, 409);
});

test('trocar para um perfil com limite menor que os empréstimos em posse é recusado', async () => {
  const [prof] = await buscar('P-3001');
  const livres = (await marta.chamar('GET', '/api/obras?q=')).dados.flatMap((o) => o.exemplares).filter((e) => e.status === 'Disponível');
  for (let i = 0; i < 3; i++) {
    assert.strictEqual((await marta.chamar('POST', '/api/emprestimos', { usuario_id: prof.id, exemplar_id: livres[i].id })).status, 201);
  }
  const virarAluno = await marta.chamar('PUT', `/api/usuarios/${prof.id}`, { nome: prof.nome, matricula: prof.matricula, perfil: 'aluno', turma: '1º Ano EM' });
  assert.strictEqual(virarAluno.status, 409);
});

test('leitor com histórico não pode ser excluído; sem histórico pode', async () => {
  const [lucas] = await buscar('2026001');
  assert.strictEqual((await marta.chamar('DELETE', `/api/usuarios/${lucas.id}`)).status, 409);
  const [novo] = await buscar('A-3002');
  assert.strictEqual((await marta.chamar('DELETE', `/api/usuarios/${novo.id}`)).status, 200);
  assert.strictEqual((await marta.chamar('GET', `/api/usuarios/${novo.id}`)).status, 404);
});

test('a conta de administração é intocável pela API de leitores', async () => {
  assert.strictEqual((await marta.chamar('GET', '/api/usuarios/1')).status, 404);
  assert.strictEqual((await marta.chamar('PUT', '/api/usuarios/1', { ...ALUNO, matricula: 'novo-admin' })).status, 404);
  assert.strictEqual((await marta.chamar('DELETE', '/api/usuarios/1')).status, 404);
  assert.strictEqual((await marta.chamar('GET', '/api/usuarios/abc')).status, 400);
});

test('a ficha do balcão acha o leitor pelo id, mesmo com mais de 30 cadastrados', async () => {
  let ultimo;
  for (let i = 0; i < 35; i++) {
    ultimo = await marta.chamar('POST', '/api/usuarios', { ...ALUNO, matricula: `Z-${1000 + i}`, nome: `Leitor ${i}` });
  }
  assert.strictEqual((await buscar('')).length, 30); // a busca é limitada...
  const ficha = await marta.chamar('GET', `/api/usuarios/${ultimo.dados.id}`);
  assert.strictEqual(ficha.status, 200); // ...mas a ficha por id sempre funciona
  assert.strictEqual(ficha.dados.nome, 'Leitor 34');
});

test('A01 · cadastro de leitores exige sessão e rejeita origem externa', async () => {
  const anonimo = criarCliente(base);
  assert.strictEqual((await anonimo.chamar('POST', '/api/usuarios', ALUNO)).status, 401);
  assert.strictEqual((await anonimo.chamar('GET', '/api/usuarios/2')).status, 401);
  assert.strictEqual((await anonimo.chamar('PUT', '/api/usuarios/2', ALUNO)).status, 401);
  assert.strictEqual((await anonimo.chamar('DELETE', '/api/usuarios/2')).status, 401);
  assert.strictEqual((await marta.chamar('DELETE', '/api/usuarios/2', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});
