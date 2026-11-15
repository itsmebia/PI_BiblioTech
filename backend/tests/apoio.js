// Apoio dos testes: sobe o servidor real com um banco temporário e oferece um "navegador" simples
// (guarda o cookie de sessão entre as chamadas). Sem mocks: os testes exercitam o sistema de verdade.

const os = require('node:os');
const path = require('node:path');

// Precisa vir ANTES de carregar o resto, porque a conexão com o banco abre no require.
process.env.DB_FILE = path.join(os.tmpdir(), `bibliotech-teste-${process.pid}.db`);

const { popularSeVazio } = require('../db/dados-demo');
const { criarServidor } = require('../app');

async function iniciarServidor() {
  popularSeVazio();
  const servidor = criarServidor();
  await new Promise((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  return { servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

/** Cliente que lembra o cookie, como um navegador. */
function criarCliente(base) {
  let cookie = '';
  const cliente = {
    async chamar(metodo, caminho, corpo, cabecalhos = {}) {
      const resposta = await fetch(base + caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...cabecalhos },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const setCookie = resposta.headers.getSetCookie()[0];
      if (setCookie) cookie = setCookie.split(';')[0];
      return { status: resposta.status, cabecalhos: resposta.headers, setCookie, dados: await resposta.json().catch(() => null) };
    },
    async entrar(matricula = 'marta', senha = 'bibliotech123') {
      return cliente.chamar('POST', '/api/login', { matricula, senha });
    },
    get cookie() { return cookie; },
  };
  return cliente;
}

module.exports = { iniciarServidor, criarCliente };
