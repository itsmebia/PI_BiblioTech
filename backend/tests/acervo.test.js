// Testes do cadastro do acervo (obras e exemplares), pela API.

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

const NOVA = { titulo: 'A Moreninha', autor: 'Joaquim Manuel de Macedo', isbn: '978-85-0000-999-1', genero: 'Romance', localizacao: 'Sala 1 · Estante F', quantidade: 2 };
const obraPorTitulo = async (titulo) => (await marta.chamar('GET', `/api/obras?q=${encodeURIComponent(titulo)}`)).dados.find((o) => o.titulo === titulo);

test('cadastrar obra cria os exemplares com códigos únicos e ISBN normalizado', async () => {
  const r = await marta.chamar('POST', '/api/obras', NOVA);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.dados.isbn, '9788500009991');
  assert.strictEqual(r.dados.exemplares.length, 2);
  assert.strictEqual(new Set(r.dados.exemplares.map((e) => e.codigo)).size, 2);
  assert.ok(r.dados.exemplares.every((e) => e.status === 'Disponível'));
});

test('campos obrigatórios, tamanhos e ISBN são validados', async () => {
  const ruins = [{ ...NOVA, titulo: '' }, { ...NOVA, autor: 'x'.repeat(101) }, { ...NOVA, isbn: '123' },
    { ...NOVA, quantidade: 0.5 }, { ...NOVA, quantidade: 999 }, { ...NOVA, titulo: 42 }, { ...NOVA, genero: {} }];
  for (const corpo of ruins) {
    assert.strictEqual((await marta.chamar('POST', '/api/obras', corpo)).status, 400, JSON.stringify(corpo).slice(0, 60));
  }
});

test('ISBN repetido é recusado, mas a obra pode manter o próprio ISBN ao editar', async () => {
  assert.strictEqual((await marta.chamar('POST', '/api/obras', { ...NOVA, titulo: 'Outra' })).status, 409);
  const obra = await obraPorTitulo('A Moreninha');
  const edicao = await marta.chamar('PUT', `/api/obras/${obra.id}`, { ...NOVA, titulo: 'A Moreninha (edição escolar)' });
  assert.strictEqual(edicao.status, 200);
  assert.strictEqual(edicao.dados.titulo, 'A Moreninha (edição escolar)');
  // Tentar usar o ISBN de outra obra do acervo:
  const outra = await marta.chamar('PUT', `/api/obras/${obra.id}`, { ...NOVA, isbn: '9788535911664' });
  assert.strictEqual(outra.status, 409);
});

test('campos extras enviados pelo cliente são ignorados (mass assignment)', async () => {
  const r = await marta.chamar('POST', '/api/obras', { ...NOVA, isbn: null, titulo: 'Livro Extra', id: 9999, exemplares: [{ status: 'Emprestado' }] });
  assert.strictEqual(r.status, 201);
  assert.notStrictEqual(r.dados.id, 9999);
  assert.ok(r.dados.exemplares.every((e) => e.status === 'Disponível'));
});

test('texto com HTML é guardado como texto puro (a tela é quem escapa)', async () => {
  const r = await marta.chamar('POST', '/api/obras', { ...NOVA, isbn: null, titulo: '<img src=x onerror=alert(1)>', quantidade: 0 });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.dados.titulo, '<img src=x onerror=alert(1)>');
  assert.strictEqual(r.dados.exemplares.length, 0);
});

test('adicionar exemplares e colocar em manutenção bloqueia o empréstimo', async () => {
  const obra = await obraPorTitulo('A Moreninha (edição escolar)');
  const mais = await marta.chamar('POST', `/api/obras/${obra.id}/exemplares`, { quantidade: 1 });
  assert.strictEqual(mais.status, 201);
  assert.strictEqual(mais.dados.exemplares.length, 3);

  const pedro = (await marta.chamar('GET', '/api/usuarios?q=2026003')).dados[0];
  const exemplar = mais.dados.exemplares[0];
  const manutencao = await marta.chamar('PATCH', `/api/exemplares/${exemplar.id}`, { status: 'Em Manutenção' });
  assert.strictEqual(manutencao.dados.exemplares.find((e) => e.id === exemplar.id).status, 'Em Manutenção');
  assert.strictEqual((await marta.chamar('POST', '/api/emprestimos', { usuario_id: pedro.id, exemplar_id: exemplar.id })).status, 409);

  await marta.chamar('PATCH', `/api/exemplares/${exemplar.id}`, { status: 'Disponível' });
  assert.strictEqual((await marta.chamar('POST', '/api/emprestimos', { usuario_id: pedro.id, exemplar_id: exemplar.id })).status, 201);
});

test('status manual só aceita Disponível/Em Manutenção e nunca mexe em exemplar emprestado', async () => {
  const obra = await obraPorTitulo('A Moreninha (edição escolar)');
  const emprestado = obra.exemplares.find((e) => e.status === 'Emprestado');
  assert.strictEqual((await marta.chamar('PATCH', `/api/exemplares/${emprestado.id}`, { status: 'Em Manutenção' })).status, 409);
  assert.strictEqual((await marta.chamar('PATCH', `/api/exemplares/${obra.exemplares[0].id}`, { status: 'Emprestado' })).status, 400);
  assert.strictEqual((await marta.chamar('PATCH', '/api/exemplares/999999', { status: 'Disponível' })).status, 404);
});

test('o que tem histórico de empréstimos não pode ser excluído', async () => {
  const obra = await obraPorTitulo('A Moreninha (edição escolar)');
  const comHistorico = obra.exemplares.find((e) => e.historico > 0);
  assert.strictEqual((await marta.chamar('DELETE', `/api/exemplares/${comHistorico.id}`)).status, 409);
  assert.strictEqual((await marta.chamar('DELETE', `/api/obras/${obra.id}`)).status, 409);
  // Obra do acervo original, com histórico:
  const dom = await obraPorTitulo('Dom Casmurro');
  assert.strictEqual((await marta.chamar('DELETE', `/api/obras/${dom.id}`)).status, 409);
});

test('obra sem histórico e seus exemplares podem ser removidos', async () => {
  const obra = await obraPorTitulo('Livro Extra');
  const sem = obra.exemplares[0];
  assert.strictEqual((await marta.chamar('DELETE', `/api/exemplares/${sem.id}`)).status, 200);
  assert.strictEqual((await marta.chamar('DELETE', `/api/obras/${obra.id}`)).status, 200);
  assert.strictEqual(await obraPorTitulo('Livro Extra'), undefined);
  assert.strictEqual((await marta.chamar('DELETE', `/api/obras/${obra.id}`)).status, 404);
});

test('filtro por gênero e lista de gêneros', async () => {
  const generos = (await marta.chamar('GET', '/api/generos')).dados;
  assert.ok(generos.includes('Fantasia') && generos.includes('Poesia'));
  const fantasia = (await marta.chamar('GET', '/api/obras?q=&genero=Fantasia')).dados;
  assert.ok(fantasia.length >= 2 && fantasia.every((o) => o.genero === 'Fantasia'));
});

test('A01 · cadastro exige sessão e rejeita origem externa', async () => {
  const anonimo = criarCliente(base);
  assert.strictEqual((await anonimo.chamar('POST', '/api/obras', NOVA)).status, 401);
  assert.strictEqual((await anonimo.chamar('PUT', '/api/obras/1', NOVA)).status, 401);
  assert.strictEqual((await anonimo.chamar('DELETE', '/api/obras/1')).status, 401);
  assert.strictEqual((await anonimo.chamar('PATCH', '/api/exemplares/1', { status: 'Disponível' })).status, 401);
  const cruzada = await marta.chamar('DELETE', '/api/obras/1', undefined, { 'Sec-Fetch-Site': 'cross-site' });
  assert.strictEqual(cruzada.status, 403);
});
