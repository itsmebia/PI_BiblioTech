// Tabela de rotas da API. Cada rota diz: método, caminho, se exige login e o que fazer.
// Os "manipuladores" só traduzem HTTP <-> serviços; as regras de negócio ficam em /servicos.

const config = require('./config');
const { ErroHttp } = require('./erros');
const { enviarJson, cookieDeSessao, ipDoCliente } = require('./http/resposta');
const { inteiroPositivo, texto } = require('./seguranca/validacao');
const { encerrarSessao } = require('./seguranca/sessoes');
const autenticacao = require('./servicos/autenticacao');
const circulacao = require('./servicos/circulacao');
const consultas = require('./servicos/consultas');
const acervo = require('./servicos/acervo');
const leitores = require('./servicos/leitores');

const rotas = [
  {
    metodo: 'POST', caminho: '/api/login', publica: true,
    executar: ({ req, res, corpo }) => {
      const matricula = texto(corpo.matricula, 'matricula', 50);
      const senha = texto(corpo.senha, 'senha', 200);
      const { token, nome } = autenticacao.entrar(matricula, senha, ipDoCliente(req));
      enviarJson(res, 200, { nome }, { 'Set-Cookie': cookieDeSessao(req, token, config.sessao.duracaoMs) });
    },
  },
  {
    metodo: 'POST', caminho: '/api/logout', publica: true,
    executar: ({ req, res, token }) => {
      encerrarSessao(token); // invalida no servidor, não só no navegador
      enviarJson(res, 200, { ok: true }, { 'Set-Cookie': cookieDeSessao(req, '', 0) });
    },
  },
  {
    metodo: 'GET', caminho: '/api/sessao',
    executar: ({ res, sessao }) => enviarJson(res, 200, { nome: sessao.nome }),
  },
  {
    metodo: 'GET', caminho: '/api/dashboard',
    executar: ({ res }) => enviarJson(res, 200, consultas.painel()),
  },
  {
    metodo: 'GET', caminho: '/api/atrasos',
    executar: ({ res }) => enviarJson(res, 200, consultas.usuariosEmAtraso()),
  },
  {
    metodo: 'GET', caminho: '/api/usuarios',
    executar: ({ res, url }) => enviarJson(res, 200, consultas.buscarUsuarios(url.searchParams.get('q'))),
  },
  {
    metodo: 'GET', caminho: '/api/usuarios/:id',
    executar: ({ res, params }) => {
      const leitor = consultas.usuarioPorId(inteiroPositivo(params.id, 'id'));
      if (!leitor) throw new ErroHttp(404, 'Usuário não encontrado.');
      enviarJson(res, 200, leitor);
    },
  },
  // ----- Cadastro de leitores -----
  {
    metodo: 'POST', caminho: '/api/usuarios',
    executar: ({ res, corpo }) => enviarJson(res, 201, leitores.criarLeitor(corpo)),
  },
  {
    metodo: 'PUT', caminho: '/api/usuarios/:id',
    executar: ({ res, params, corpo }) =>
      enviarJson(res, 200, leitores.editarLeitor(inteiroPositivo(params.id, 'id'), corpo)),
  },
  {
    metodo: 'DELETE', caminho: '/api/usuarios/:id',
    executar: ({ res, params }) => enviarJson(res, 200, leitores.excluirLeitor(inteiroPositivo(params.id, 'id'))),
  },
  {
    metodo: 'GET', caminho: '/api/obras',
    executar: ({ res, url }) =>
      enviarJson(res, 200, consultas.buscarObras(url.searchParams.get('q'), url.searchParams.get('genero'))),
  },
  {
    metodo: 'GET', caminho: '/api/generos',
    executar: ({ res }) => enviarJson(res, 200, consultas.listarGeneros()),
  },
  // ----- Cadastro do acervo -----
  {
    metodo: 'POST', caminho: '/api/obras',
    executar: ({ res, corpo }) => enviarJson(res, 201, acervo.criarObra(corpo)),
  },
  {
    metodo: 'PUT', caminho: '/api/obras/:id',
    executar: ({ res, params, corpo }) =>
      enviarJson(res, 200, acervo.editarObra(inteiroPositivo(params.id, 'id'), corpo)),
  },
  {
    metodo: 'DELETE', caminho: '/api/obras/:id',
    executar: ({ res, params }) => enviarJson(res, 200, acervo.excluirObra(inteiroPositivo(params.id, 'id'))),
  },
  {
    metodo: 'POST', caminho: '/api/obras/:id/exemplares',
    executar: ({ res, params, corpo }) =>
      enviarJson(res, 201, acervo.adicionarExemplares(inteiroPositivo(params.id, 'id'), corpo)),
  },
  {
    metodo: 'PATCH', caminho: '/api/exemplares/:id',
    executar: ({ res, params, corpo }) =>
      enviarJson(res, 200, acervo.alterarStatusDoExemplar(inteiroPositivo(params.id, 'id'), corpo)),
  },
  {
    metodo: 'DELETE', caminho: '/api/exemplares/:id',
    executar: ({ res, params }) => enviarJson(res, 200, acervo.removerExemplar(inteiroPositivo(params.id, 'id'))),
  },
  {
    metodo: 'POST', caminho: '/api/emprestimos',
    executar: ({ res, corpo }) => {
      const usuarioId = inteiroPositivo(corpo.usuario_id, 'usuario_id');
      const exemplarId = inteiroPositivo(corpo.exemplar_id, 'exemplar_id');
      enviarJson(res, 201, circulacao.emprestar(usuarioId, exemplarId));
    },
  },
  {
    metodo: 'POST', caminho: '/api/emprestimos/:id/devolucao',
    executar: ({ res, params }) => {
      enviarJson(res, 200, circulacao.devolver(inteiroPositivo(params.id, 'id')));
    },
  },
];

// Converte "/api/emprestimos/:id/devolucao" em uma expressão regular com grupos nomeados.
const compilar = (caminho) => new RegExp(`^${caminho.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
const tabela = rotas.map((rota) => ({ ...rota, padrao: compilar(rota.caminho) }));

/** Procura a rota que atende a requisição. Devolve { rota, params } ou null. */
function encontrarRota(metodo, caminho) {
  for (const rota of tabela) {
    const casou = rota.padrao.exec(caminho);
    if (rota.metodo === metodo && casou) return { rota, params: { ...casou.groups } };
  }
  return null;
}

module.exports = { encontrarRota };
