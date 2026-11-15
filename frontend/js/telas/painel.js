// Painel inicial: indicadores do acervo e lista de usuários em atraso.

import { chamar } from '../api.js';
import { $, el, renderizar, formatarData } from '../dom.js';
import { mostrarAviso } from '../avisos.js';

const indicador = (valor, rotulo, alerta = false) =>
  el('div', { classe: alerta ? 'indicador alerta' : 'indicador' }, el('b', {}, valor), rotulo);

function linhaDeAtraso(a) {
  return el('tr', {},
    el('td', {}, a.nome, el('br'), el('small', {}, a.matricula)),
    el('td', {}, a.turma),
    el('td', {}, a.titulo),
    el('td', {}, formatarData(a.data_prevista)),
    el('td', {}, el('span', { classe: 'tag atraso' }, `${a.dias_atraso} dia(s)`)));
}

export async function carregarPainel() {
  try {
    const [resumo, atrasos] = await Promise.all([chamar('/api/dashboard'), chamar('/api/atrasos')]);

    renderizar($('#indicadores'),
      indicador(resumo.obras, 'obras no acervo'),
      indicador(resumo.exemplares_disponiveis, 'exemplares disponíveis'),
      indicador(resumo.emprestados, 'emprestados agora'),
      indicador(resumo.em_atraso, 'em atraso', resumo.em_atraso > 0));

    renderizar($('#tabela-atrasos'), atrasos.length
      ? [el('tr', {}, ...['Usuário', 'Turma', 'Obra', 'Previsto', 'Atraso'].map((t) => el('th', {}, t))),
         ...atrasos.map(linhaDeAtraso)]
      : el('tr', {}, el('td', { classe: 'vazio' }, 'Nenhum usuário em atraso. 🎉')));
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}
