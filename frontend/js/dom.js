// Criação de elementos HTML de forma segura.
// Todo texto entra como nó de texto — nunca como HTML montado em string — então um nome como
// "<img onerror=...>" aparece como texto puro e não executa nada (OWASP A03, XSS).

/**
 * el('button', { classe: 'btn', onclick: fn, 'data-id': 3 }, 'Salvar')
 *  - `classe`  → atributo class
 *  - `onXxx`   → listener de evento
 *  - demais    → atributos normais
 * Os filhos podem ser texto, números, elementos, listas (achatadas) ou null/false (ignorados).
 */
export function el(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor == null || valor === false) continue;
    if (nome === 'classe') elemento.className = valor;
    else if (nome.startsWith('on')) elemento.addEventListener(nome.slice(2), valor);
    else elemento.setAttribute(nome, valor === true ? '' : valor);
  }
  elemento.append(...filhos.flat(Infinity).filter((f) => f != null && f !== false));
  return elemento;
}

/** Troca todo o conteúdo de um contêiner pelos novos filhos. */
export function renderizar(conteiner, ...filhos) {
  conteiner.replaceChildren(...filhos.flat(Infinity).filter((f) => f != null && f !== false));
}

export const $ = (seletor) => document.querySelector(seletor);

/** '2026-11-10' → '10/11/2026' */
export const formatarData = (iso) => iso.split('-').reverse().join('/');
