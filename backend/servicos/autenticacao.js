// Login da operadora. Reúne as defesas de autenticação (OWASP A07) em um só lugar.

const { db } = require('../db/conexao');
const { ErroHttp } = require('../erros');
const { conferirSenha, HASH_FALSO } = require('../seguranca/senhas');
const { criarSessao } = require('../seguranca/sessoes');
const limitador = require('../seguranca/limitador');
const { registrar } = require('../log');

// Mensagem única para "usuário não existe" e "senha errada": não ajuda quem tenta adivinhar.
const MENSAGEM_PADRAO = 'Usuário ou senha inválidos.';

/** Devolve o token da nova sessão, ou lança ErroHttp (401 credencial errada / 429 muitas tentativas). */
function entrar(matricula, senha, ip) {
  const chaveLimite = `${ip}|${matricula.toLowerCase()}`;

  const espera = limitador.segundosDeBloqueio(chaveLimite);
  if (espera > 0) {
    registrar('login.bloqueado', { ip, matricula });
    throw new ErroHttp(429, `Muitas tentativas. Tente novamente em ${Math.ceil(espera / 60)} minuto(s).`,
      { 'Retry-After': String(espera) });
  }

  const usuario = db.prepare("SELECT * FROM usuarios WHERE matricula = ? AND perfil = 'admin'").get(matricula);
  // Sempre conferimos um hash (o verdadeiro ou um falso) para gastar o mesmo tempo nos dois casos.
  const senhaCorreta = conferirSenha(senha, usuario ? usuario.senha_hash : HASH_FALSO);

  if (!usuario || !senhaCorreta) {
    limitador.registrarFalha(chaveLimite);
    registrar('login.falha', { ip, matricula });
    throw new ErroHttp(401, MENSAGEM_PADRAO);
  }

  limitador.registrarSucesso(chaveLimite);
  registrar('login.sucesso', { usuario: usuario.id });
  return { token: criarSessao(usuario), nome: usuario.nome };
}

module.exports = { entrar };
