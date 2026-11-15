// Testes de segurança, organizados pelas categorias do OWASP Top 10 (2021).

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { iniciarServidor, criarCliente } = require('./apoio');

let servidor, base;
test.before(async () => { ({ servidor, base } = await iniciarServidor()); });
test.after(() => servidor.close());

/** Requisição "crua", que não normaliza o caminho (o fetch esconderia ataques de path traversal). */
const requisicaoCrua = (caminho, metodo = 'GET') => new Promise((resolve, reject) => {
  const req = http.request(base + '/', { method: metodo, path: caminho }, (res) => {
    let corpo = '';
    res.on('data', (c) => (corpo += c));
    res.on('end', () => resolve({ status: res.statusCode, corpo }));
  });
  req.on('error', reject);
  req.end();
});

// ---------- A01: Controle de acesso quebrado ----------

test('A01 · rotas da API exigem sessão', async () => {
  const anonimo = criarCliente(base);
  for (const rota of ['/api/dashboard', '/api/atrasos', '/api/usuarios?q=', '/api/obras?q=', '/api/sessao']) {
    assert.strictEqual((await anonimo.chamar('GET', rota)).status, 401, rota);
  }
  assert.strictEqual((await anonimo.chamar('POST', '/api/emprestimos', { usuario_id: 2, exemplar_id: 1 })).status, 401);
});

test('A01 · path traversal não escapa da pasta do frontend', async () => {
  for (const caminho of ['/../backend/config.js', '/..%2fbackend%2fconfig.js', '/%2e%2e/backend/config.js', '/..%00/x', '/%zz']) {
    const r = await requisicaoCrua(caminho);
    assert.strictEqual(r.status, 404, caminho);
    assert.ok(!r.corpo.includes('senhaInicialAdmin'), 'vazou código-fonte');
  }
});

test('A01 · requisição vinda de outro site é recusada (anti-CSRF)', async () => {
  const c = criarCliente(base);
  await c.entrar();
  const r = await c.chamar('POST', '/api/emprestimos/1/devolucao', {}, { 'Sec-Fetch-Site': 'cross-site' });
  assert.strictEqual(r.status, 403);
});

// ---------- A02: Falhas criptográficas ----------

test('A02 · cookie de sessão é HttpOnly e SameSite=Strict, e a senha não aparece em lugar nenhum', async () => {
  const c = criarCliente(base);
  const r = await c.entrar();
  assert.strictEqual(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Strict/);
  assert.ok(!JSON.stringify(r.dados).includes('bibliotech123'));
  const { dados } = await c.chamar('GET', '/api/usuarios?q=');
  assert.ok(!JSON.stringify(dados).includes('senha'), 'a API não pode expor dados de senha');
});

// ---------- A03: Injeção ----------

test('A03 · SQL injection e curingas do LIKE viram texto comum', async () => {
  const c = criarCliente(base);
  await c.entrar();
  for (const q of ["' OR '1'='1", "'; DROP TABLE usuarios; --", '%', '_']) {
    const u = await c.chamar('GET', `/api/usuarios?q=${encodeURIComponent(q)}`);
    assert.strictEqual(u.status, 200);
    assert.deepStrictEqual(u.dados, [], `usuarios q=${q}`);
    assert.deepStrictEqual((await c.chamar('GET', `/api/obras?q=${encodeURIComponent(q)}`)).dados, [], `obras q=${q}`);
  }
  assert.ok((await c.chamar('GET', '/api/usuarios?q=')).dados.length > 0, 'a tabela continua existindo');
});

test('A03 · entradas inválidas são rejeitadas com 400', async () => {
  const c = criarCliente(base);
  await c.entrar();
  for (const id of ['1 OR 1=1', -1, 0, 1.5, null, {}, []]) {
    assert.strictEqual((await c.chamar('POST', '/api/emprestimos', { usuario_id: id, exemplar_id: 1 })).status, 400, JSON.stringify(id));
  }
  assert.strictEqual((await c.chamar('POST', '/api/emprestimos/abc/devolucao', {})).status, 400);
});

// ---------- A04: Design inseguro ----------

test('A04 · corpo grande demais é recusado e JSON quebrado dá 400', async () => {
  const c = criarCliente(base);
  const grande = await c.chamar('POST', '/api/login', { matricula: 'x', senha: 'a'.repeat(20_000) });
  assert.strictEqual(grande.status, 413);
  const resposta = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{quebrado' });
  assert.strictEqual(resposta.status, 400);
});

test('A04 · POST sem application/json é recusado (415)', async () => {
  const resposta = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'matricula=marta' });
  assert.strictEqual(resposta.status, 415);
});

// ---------- A05: Configuração insegura ----------

test('A05 · cabeçalhos de segurança presentes e API sem cache', async () => {
  const pagina = await fetch(base + '/');
  assert.match(pagina.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(pagina.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.strictEqual(pagina.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(pagina.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(pagina.headers.get('referrer-policy'), 'no-referrer');
  const api = await fetch(base + '/api/dashboard');
  assert.strictEqual(api.headers.get('cache-control'), 'no-store');
  assert.strictEqual(pagina.headers.get('x-powered-by'), null);
});

test('A05 · erros não vazam detalhes internos e métodos errados são recusados', async () => {
  const c = criarCliente(base);
  await c.entrar();
  const inexistente = await c.chamar('GET', '/api/nao-existe');
  assert.strictEqual(inexistente.status, 404);
  assert.deepStrictEqual(Object.keys(inexistente.dados), ['erro']);
  assert.strictEqual((await requisicaoCrua('/', 'POST')).status, 405);
});

test('A05 · o frontend não usa scripts inline nem innerHTML (compatível com a CSP)', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'há <script> inline');
  assert.ok(!/\son\w+=/i.test(html), 'há manipulador de evento inline');
  const fs = require('node:fs');
  const path = require('node:path');
  const pasta = path.join(__dirname, '..', '..', 'frontend', 'js');
  const arquivos = fs.readdirSync(pasta, { recursive: true }).filter((f) => f.endsWith('.js'));
  for (const f of arquivos) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(fs.readFileSync(path.join(pasta, f), 'utf8')), `${f} usa API insegura`);
  }
});

// ---------- A07: Falhas de identificação e autenticação ----------

test('A07 · usuário inexistente e senha errada recebem a mesma resposta', async () => {
  const c = criarCliente(base);
  const senhaErrada = await c.entrar('marta', 'errada');
  const naoExiste = await c.entrar('fantasma', 'errada');
  assert.strictEqual(senhaErrada.status, 401);
  assert.strictEqual(naoExiste.status, 401);
  assert.strictEqual(senhaErrada.dados.erro, naoExiste.dados.erro);
});

test('A07 · logout invalida a sessão no servidor', async () => {
  const c = criarCliente(base);
  await c.entrar();
  const cookieAntigo = c.cookie;
  assert.strictEqual((await c.chamar('GET', '/api/sessao')).status, 200);
  await c.chamar('POST', '/api/logout', {});
  const reutilizado = await fetch(base + '/api/sessao', { headers: { Cookie: cookieAntigo } });
  assert.strictEqual(reutilizado.status, 401, 'o cookie antigo ainda funciona após o logout');
});

test('A07 · após 5 falhas o login é bloqueado, mesmo com a senha certa', async () => {
  const c = criarCliente(base);
  for (let i = 0; i < 5; i++) assert.strictEqual((await c.entrar('marta', `errada${i}`)).status, 401);
  const bloqueado = await c.entrar('marta', 'bibliotech123');
  assert.strictEqual(bloqueado.status, 429);
  assert.ok(Number(bloqueado.cabecalhos.get('retry-after')) > 0);
});
