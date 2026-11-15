// Comunicação com o backend. A sessão vai no cookie HttpOnly, que o navegador envia sozinho:
// o JavaScript da página nunca enxerga nem guarda token (reduz o estrago de um eventual XSS).

let aoSessaoExpirar = () => {};

/** Define o que fazer quando o servidor responder 401 (sessão vencida). */
export const definirAoExpirar = (funcao) => { aoSessaoExpirar = funcao; };

/**
 * chamar('/api/obras?q=dom')
 * chamar('/api/emprestimos', { metodo: 'POST', corpo: { usuario_id: 1, exemplar_id: 2 } })
 * Lança Error com a mensagem do servidor quando a resposta não for 2xx.
 */
export async function chamar(caminho, { metodo = 'GET', corpo, ignorar401 = false } = {}) {
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
    credentials: 'same-origin',
  });
  const dados = await resposta.json().catch(() => ({}));

  if (resposta.status === 401 && !ignorar401) aoSessaoExpirar();
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível concluir a operação.');
  return dados;
}
