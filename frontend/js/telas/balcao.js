// Atendimento no balcão — a jornada principal da PoC:
// buscar o aluno → ver status e empréstimos → registrar devolução → fazer novo empréstimo → recibo.

import { chamar } from '../api.js';
import { $, el, renderizar, formatarData } from '../dom.js';
import { mostrarAviso } from '../avisos.js';

// ---------- Busca de usuários ----------

async function buscarUsuarios(evento) {
  evento.preventDefault();
  $('#ficha').hidden = true;
  try {
    const usuarios = await chamar(`/api/usuarios?q=${encodeURIComponent($('#busca-usuario').value)}`);
    renderizar($('#resultado-usuarios'), usuarios.length
      ? el('div', { classe: 'lista' }, usuarios.map(linhaDeUsuario))
      : el('p', { classe: 'vazio' }, 'Nenhum usuário encontrado.'));
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

function linhaDeUsuario(usuario) {
  return el('div', { classe: 'item' },
    el('span', {}, el('b', {}, usuario.nome), ` · ${usuario.matricula} · ${usuario.turma || usuario.perfil}`),
    el('span', {},
      el('span', { classe: `tag ${usuario.status}` }, usuario.status), ' ',
      el('button', { type: 'button', classe: 'btn sec', onclick: () => abrirFicha(usuario.id) }, 'Atender')));
}

// ---------- Ficha de atendimento ----------

/** Recarrega os dados do usuário (para refletir devoluções/empréstimos recém-feitos) e desenha a ficha. */
async function abrirFicha(usuarioId) {
  try {
    desenharFicha(await chamar(`/api/usuarios/${usuarioId}`));
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

function desenharFicha(usuario) {
  const suspenso = usuario.status === 'suspenso';
  const limiteAtingido = usuario.emprestimos_ativos.length >= usuario.limite;

  renderizar($('#resultado-usuarios'));
  $('#ficha').hidden = false;
  renderizar($('#ficha'),
    el('div', {},
      el('h3', {}, usuario.nome, ' ', el('span', { classe: `tag ${usuario.status}` }, usuario.status)),
      el('p', {},
        `Matrícula ${usuario.matricula} · ${usuario.turma || usuario.perfil} · ` +
        `${usuario.emprestimos_ativos.length}/${usuario.limite} obras em posse`,
        suspenso && el('br'),
        suspenso && el('b', { classe: 'erro' }, `Suspenso até ${formatarData(usuario.suspenso_ate)} por atraso.`))),
    secaoDeEmprestimosAtivos(usuario),
    secaoDeNovoEmprestimo(usuario, { suspenso, limiteAtingido }));
}

function secaoDeEmprestimosAtivos(usuario) {
  const ativos = usuario.emprestimos_ativos;
  return el('div', {},
    el('h3', {}, 'Empréstimos ativos'),
    ativos.length
      ? el('div', { classe: 'lista' }, ativos.map((e) => el('div', { classe: 'item' },
          el('span', {},
            el('b', {}, e.titulo), ` (${e.codigo})`, el('br'),
            el('small', {}, `Devolver até ${formatarData(e.data_prevista)} `),
            e.dias_atraso > 0 && el('span', { classe: 'tag atraso' }, `${e.dias_atraso} dia(s) de atraso`)),
          el('button', { type: 'button', classe: 'btn', onclick: () => registrarDevolucao(usuario.id, e.id) },
            'Registrar devolução'))))
      : el('p', { classe: 'vazio' }, 'Nenhum empréstimo ativo.'));
}

function secaoDeNovoEmprestimo(usuario, { suspenso, limiteAtingido }) {
  const bloqueio = suspenso
    ? 'Usuário suspenso: empréstimo bloqueado.'
    : limiteAtingido && 'Limite de obras atingido: registre uma devolução antes.';
  if (bloqueio) return el('div', {}, el('h3', {}, 'Novo empréstimo'), el('p', { classe: 'erro' }, bloqueio));

  const resultado = el('div');
  const campo = el('input', { maxlength: '60', placeholder: 'Buscar obra por título ou autor', 'aria-label': 'Buscar obra' });
  const formulario = el('form', { classe: 'busca', onsubmit: (e) => buscarObraParaEmprestar(e, usuario, campo, resultado) },
    campo, el('button', { classe: 'btn', type: 'submit' }, 'Buscar'));
  return el('div', {}, el('h3', {}, 'Novo empréstimo'), formulario, resultado);
}

// ---------- Ações ----------

async function registrarDevolucao(usuarioId, emprestimoId) {
  try {
    const r = await chamar(`/api/emprestimos/${emprestimoId}/devolucao`, { metodo: 'POST' });
    mostrarAviso(r.dias_atraso > 0
      ? `Devolução registrada com ${r.dias_atraso} dia(s) de atraso. Usuário suspenso até ${formatarData(r.suspenso_ate)}.`
      : 'Devolução registrada. Exemplar disponível novamente.');
    await abrirFicha(usuarioId);
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

async function buscarObraParaEmprestar(evento, usuario, campo, resultado) {
  evento.preventDefault();
  try {
    const obras = await chamar(`/api/obras?q=${encodeURIComponent(campo.value)}`);
    renderizar(resultado, obras.length
      ? el('div', { classe: 'lista' }, obras.map((o) => linhaDeObra(o, usuario)))
      : el('p', { classe: 'vazio' }, 'Nenhuma obra encontrada.'));
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

function linhaDeObra(obra, usuario) {
  const exemplarLivre = obra.exemplares.find((x) => x.status === 'Disponível');
  return el('div', { classe: 'item' },
    el('span', {}, el('b', {}, obra.titulo), ` · ${obra.autor}`, el('br'), el('small', {}, obra.localizacao)),
    exemplarLivre
      ? el('button', { type: 'button', classe: 'btn', onclick: () => emprestar(usuario.id, exemplarLivre.id) },
          `Emprestar (${obra.disponiveis} disp.)`)
      : el('span', { classe: 'tag emp' }, 'Indisponível'));
}

async function emprestar(usuarioId, exemplarId) {
  try {
    const r = await chamar('/api/emprestimos', { metodo: 'POST', corpo: { usuario_id: usuarioId, exemplar_id: exemplarId } });
    mostrarRecibo(r);
    await abrirFicha(usuarioId);
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

// ---------- Recibo ----------

function mostrarRecibo(r) {
  const linhas = [
    ['Aluno', r.usuario], ['Obra', r.titulo], ['Autor', r.autor], ['Exemplar', r.codigo],
    ['Retirada', formatarData(r.data_emprestimo)], ['Devolver até', formatarData(r.data_prevista)],
  ];
  renderizar($('#recibo-dados'), linhas.map(([rotulo, valor]) => [el('dt', {}, rotulo), el('dd', {}, valor)]));
  $('#recibo').hidden = false;
  $('#fechar-recibo').focus(); // acessibilidade: o foco vai para dentro do diálogo
}

export function iniciarBalcao() {
  $('#form-usuario').addEventListener('submit', buscarUsuarios);
  $('#fechar-recibo').addEventListener('click', () => { $('#recibo').hidden = true; });
}
