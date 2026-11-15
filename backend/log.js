// Registro de eventos em uma linha JSON (fácil de filtrar e de enviar a um monitor).
// Serve principalmente para eventos de segurança (OWASP A09). NUNCA registre senhas ou tokens.

function registrar(evento, dados = {}) {
  console.log(JSON.stringify({ hora: new Date().toISOString(), evento, ...dados }));
}

module.exports = { registrar };
