// Leitores: cadastro de alunos e professores (criar, editar, excluir) e consulta de status.
// O servidor valida tudo de novo; as regras daqui só ajudam a preencher o formulário.

import { chamar } from '../api.js';
import { $, el, renderizar, formatarData } from '../dom.js';
import { mostrarAviso } from '../avisos.js';

const ROTULO_PERFIL = { aluno: 'Aluno', professor: 'Professor' };

// ---------- Listagem ----------

function cartaoDoLeitor(leitor) {
  const detalhe = [ROTULO_PERFIL[leitor.perfil], leitor.turma, `Matrícula ${leitor.matricula}`].filter(Boolean).join(' · ');
  return el('div', { classe: 'obra' },
    el('div', { classe: 'obra-topo' },
      el('span', {},
        el('b', {}, leitor.nome), el('br'), el('small', {}, detalhe),
        leitor.suspenso_ate && el('br'),
        leitor.suspenso_ate && el('small', { classe: 'erro' }, `Suspenso até ${formatarData(leitor.suspenso_ate)}`)),
      el('span', {},
        el('span', { classe: `tag ${leitor.status}` }, leitor.status), ' ',
        el('span', { classe: 'tag emp' }, `${leitor.emprestimos_ativos.length}/${leitor.limite} obras`))),
    el('div', { classe: 'acoes' },
      el('button', { type: 'button', classe: 'btn sec peq', onclick: () => abrirFormulario(leitor) }, 'Editar'),
      leitor.historico === 0 &&
        el('button', { type: 'button', classe: 'btn perigo peq', onclick: () => excluirLeitor(leitor) }, 'Excluir')));
}

export async function carregarLeitores() {
  try {
    const leitores = await chamar(`/api/usuarios?q=${encodeURIComponent($('#busca-leitor').value)}`);
    $('#contagem-leitores').textContent = `${leitores.length} leitor(es) encontrado(s)`;
    renderizar($('#resultado-leitores'), leitores.length
      ? el('div', { classe: 'lista' }, leitores.map(cartaoDoLeitor))
      : el('p', { classe: 'vazio' }, 'Nenhum leitor encontrado.'));
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

// ---------- Formulário (criar / editar) ----------

function abrirFormulario(leitor = null) {
  const editando = leitor !== null;
  const turma = el('input', { name: 'turma', maxlength: '30', placeholder: 'Ex.: 1º Ano EM', value: leitor?.turma ?? '' });
  const rotuloTurma = el('label', {}, 'Turma *', turma);
  const perfil = el('select', { name: 'perfil', onchange: () => ajustarTurma() },
    Object.entries(ROTULO_PERFIL).map(([valor, rotulo]) =>
      el('option', { value: valor, selected: valor === (leitor?.perfil ?? 'aluno') }, rotulo)));

  // Professor não tem turma: o campo some e deixa de ser obrigatório.
  function ajustarTurma() {
    const ehAluno = perfil.value === 'aluno';
    rotuloTurma.hidden = !ehAluno;
    turma.required = ehAluno;
  }

  const formulario = el('form', { classe: 'card', onsubmit: (e) => salvarLeitor(e, leitor) },
    el('h3', {}, editando ? `Editar ${leitor.nome}` : 'Novo leitor'),
    el('div', { classe: 'formulario' },
      el('label', { classe: 'largo' }, 'Nome completo *', el('input', { name: 'nome', required: true, maxlength: '100', value: leitor?.nome ?? '' })),
      el('label', {}, 'Matrícula *', el('input', {
        name: 'matricula', required: true, maxlength: '20', pattern: '[A-Za-z0-9\\-]{3,20}',
        title: '3 a 20 letras, números ou hífen', value: leitor?.matricula ?? '' })),
      el('label', {}, 'Perfil *', perfil),
      rotuloTurma),
    el('div', { classe: 'acoes' },
      el('button', { classe: 'btn', type: 'submit' }, editando ? 'Salvar alterações' : 'Cadastrar leitor'),
      el('button', { classe: 'btn sec', type: 'button', onclick: fecharFormulario }, 'Cancelar')));
  renderizar($('#cadastro-leitor'), formulario);
  ajustarTurma();
  formulario.elements.nome.focus();
}

const fecharFormulario = () => renderizar($('#cadastro-leitor'));

async function salvarLeitor(evento, leitor) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.target));
  try {
    await (leitor
      ? chamar(`/api/usuarios/${leitor.id}`, { metodo: 'PUT', corpo: dados })
      : chamar('/api/usuarios', { metodo: 'POST', corpo: dados }));
    mostrarAviso(leitor ? 'Cadastro atualizado.' : 'Leitor cadastrado com sucesso.');
    fecharFormulario();
    await carregarLeitores();
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

async function excluirLeitor(leitor) {
  if (!confirm(`Excluir o cadastro de ${leitor.nome}? Esta ação não pode ser desfeita.`)) return;
  try {
    await chamar(`/api/usuarios/${leitor.id}`, { metodo: 'DELETE' });
    mostrarAviso(`Cadastro de ${leitor.nome} excluído.`);
    await carregarLeitores();
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

export function iniciarLeitores() {
  $('#form-leitores').addEventListener('submit', (e) => { e.preventDefault(); carregarLeitores(); });
  $('#novo-leitor').addEventListener('click', () => abrirFormulario());
}
