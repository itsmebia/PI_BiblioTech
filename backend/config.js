// Configuração central do sistema.
// Tudo que pode mudar entre ambientes (desenvolvimento x produção) vem de variáveis de ambiente.
// Assim nenhum segredo fica escrito no código (OWASP A02/A05).

const path = require('node:path');

const emProducao = process.env.NODE_ENV === 'production';

const config = {
  emProducao,
  porta: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0', // em produção, prefira 127.0.0.1 atrás de um proxy reverso
  arquivoBanco: process.env.DB_FILE || path.join(__dirname, 'bibliotech.db'),
  pastaFrontend: path.join(__dirname, '..', 'frontend'),

  // Fuso usado para calcular "hoje" (a biblioteca fecha o prazo pelo dia local, não em UTC).
  fusoHorario: 'America/Sao_Paulo',

  // Só confie nos cabeçalhos X-Forwarded-* quando houver um proxy reverso na frente da aplicação.
  confiarProxy: process.env.TRUST_PROXY === '1',

  sessao: {
    nomeCookie: 'bt_sessao',
    duracaoMs: 8 * 60 * 60 * 1000, // um turno de trabalho
  },

  // Proteção contra tentativa e erro de senha (OWASP A07).
  loginLimite: {
    maxFalhas: 5,
    janelaMs: 15 * 60 * 1000,
  },

  limiteCorpoBytes: 10 * 1024, // nenhuma requisição da API precisa de mais que isso
  maxResultadosBusca: 30,

  // Regras de circulação por perfil: quantas obras ao mesmo tempo e por quantos dias.
  politica: {
    aluno: { limite: 2, dias: 7 },
    professor: { limite: 5, dias: 15 },
    admin: { limite: 5, dias: 15 },
  },
};

/**
 * Senha da conta de administração usada na carga inicial de dados.
 * Em produção ela é OBRIGATÓRIA e vem do ambiente; só em desenvolvimento há um valor de demonstração.
 */
function senhaInicialAdmin() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (emProducao) throw new Error('Defina ADMIN_PASSWORD para iniciar em produção.');
  return 'bibliotech123';
}

module.exports = Object.freeze({ ...config, senhaInicialAdmin });
