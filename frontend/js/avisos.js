// Mensagem curta de retorno ao usuário (sucesso ou erro), que some sozinha.

import { $ } from './dom.js';

let temporizador;

export function mostrarAviso(mensagem, erro = false) {
  const aviso = $('#aviso');
  aviso.textContent = mensagem;
  aviso.className = erro ? 'aviso erro-box' : 'aviso';
  aviso.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { aviso.hidden = true; }, 6000);
}
