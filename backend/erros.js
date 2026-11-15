// Erro "esperado" da aplicação: carrega o código HTTP e uma mensagem segura para o usuário.
// Qualquer outro erro é tratado como falha interna e nunca vaza detalhes (OWASP A05).

class ErroHttp extends Error {
  constructor(status, mensagem, cabecalhos = {}) {
    super(mensagem);
    this.status = status;
    this.cabecalhos = cabecalhos;
  }
}

module.exports = { ErroHttp };
