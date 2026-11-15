// Ponto de entrada: prepara o banco e liga o servidor.

const config = require('./config');
const { popularSeVazio } = require('./db/dados-demo');
const { criarServidor } = require('./app');

popularSeVazio();
criarServidor().listen(config.porta, config.host, () => {
  console.log(`BiblioTech rodando em http://${config.host}:${config.porta}`);
});
