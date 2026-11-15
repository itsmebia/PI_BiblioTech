// Servidor HTTP: aplica as defesas comuns a TODA requisição e despacha para a rota certa.
// Ordem de cada requisição da API: cabeçalhos de segurança → anti-CSRF → login → corpo → rota.

const http = require('node:http');
const config = require('./config');
const { ErroHttp } = require('./erros');
const { registrar } = require('./log');
const { aplicarCabecalhosDeSeguranca } = require('./seguranca/cabecalhos');
const { buscarSessao } = require('./seguranca/sessoes');
const { enviarJson, lerCorpoJson, lerCookie } = require('./http/resposta');
const { servirArquivo } = require('./http/estaticos');
const { encontrarRota } = require('./rotas');

const METODOS_QUE_ALTERAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Defesa anti-CSRF (OWASP A01), em camadas:
 *  1) cookie SameSite=Strict (ver resposta.js);
 *  2) o navegador informa em Sec-Fetch-Site de onde a requisição partiu — recusamos as de outros sites;
 *  3) exigir JSON (ver lerCorpoJson) impede envio por formulário HTML comum.
 */
function exigirOrigemConfiavel(req) {
  const origem = req.headers['sec-fetch-site'];
  if (METODOS_QUE_ALTERAM.has(req.method) && origem && origem !== 'same-origin' && origem !== 'none') {
    throw new ErroHttp(403, 'Origem da requisição não permitida.');
  }
}

async function tratarApi(req, res, url) {
  res.setHeader('Cache-Control', 'no-store'); // respostas da API trazem dados pessoais: nada de cache

  const encontrada = encontrarRota(req.method, url.pathname);
  if (!encontrada) throw new ErroHttp(404, 'Rota não encontrada.');
  const { rota, params } = encontrada;

  exigirOrigemConfiavel(req);

  // Controle de acesso (OWASP A01): tudo que não é explicitamente público exige sessão de administradora.
  const token = lerCookie(req, config.sessao.nomeCookie);
  const sessao = buscarSessao(token);
  if (!rota.publica) {
    if (!sessao) throw new ErroHttp(401, 'Sessão expirada. Faça login novamente.');
    if (sessao.perfil !== 'admin') throw new ErroHttp(403, 'Sem permissão para esta ação.');
  }

  const corpo = METODOS_QUE_ALTERAM.has(req.method) ? await lerCorpoJson(req) : {};
  await rota.executar({ req, res, url, params, corpo, sessao, token });
}

async function tratarRequisicao(req, res) {
  aplicarCabecalhosDeSeguranca(req, res);
  try {
    const url = new URL(req.url, 'http://interno'); // a base é só um apoio para o parser
    if (url.pathname.startsWith('/api/')) return await tratarApi(req, res, url);

    if (req.method !== 'GET') throw new ErroHttp(405, 'Método não permitido.', { Allow: 'GET' });
    if (!servirArquivo(url.pathname, res)) throw new ErroHttp(404, 'Não encontrado.');
  } catch (erro) {
    if (erro instanceof ErroHttp) {
      return enviarJson(res, erro.status, { erro: erro.message }, erro.cabecalhos);
    }
    // Falha inesperada: o detalhe vai para o log do servidor; o usuário só vê uma mensagem genérica.
    registrar('erro.interno', { caminho: req.url, mensagem: erro.message });
    enviarJson(res, 500, { erro: 'Erro interno do servidor.' });
  }
}

function criarServidor() {
  const servidor = http.createServer(tratarRequisicao);
  // Limites de tempo contra conexões lentas que seguram o servidor ocupado (Slowloris).
  servidor.headersTimeout = 15_000;
  servidor.requestTimeout = 30_000;
  return servidor;
}

module.exports = { criarServidor };
