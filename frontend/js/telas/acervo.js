// Acervo: consulta com filtros e cadastro completo (obras e exemplares).
// Toda ação passa pela API, que valida de novo no servidor — a validação daqui é só para ajudar o usuário.

import { chamar } from '../api.js';
import { $, el, renderizar } from '../dom.js';
import { mostrarAviso } from '../avisos.js';

let generos = [];

// ---------- Listagem ----------

const CLASSE_STATUS = { 'Disponível': '', 'Emprestado': 'emprestado', 'Em Manutenção': 'manutencao' };

function cartaoDaObra(obra) {
  const podeExcluir = obra.exemplares.every((x) => x.historico === 0);
  return el('div', { classe: 'obra' },
    el('div', { classe: 'obra-topo' },
      el('span', {},
        el('b', {}, obra.titulo), ` · ${obra.autor}`, el('br'),
        el('small', {}, [obra.genero, obra.localizacao, obra.isbn && `ISBN ${obra.isbn}`].filter(Boolean).join(' · '))),
      el('span', { classe: obra.disponiveis ? 'tag' : 'tag emp' }, `${obra.disponiveis}/${obra.exemplares.length} disponíveis`)),
    el('div', { classe: 'exemplares' }, obra.exemplares.map(chipDoExemplar)),
    el('div', { classe: 'acoes' },
      el('button', { type: 'button', classe: 'btn sec peq', onclick: () => abrirFormulario(obra) }, 'Editar'),
      el('button', { type: 'button', classe: 'btn sec peq', onclick: () => adicionarExemplar(obra) }, '+ Exemplar'),
      podeExcluir && el('button', { type: 'button', classe: 'btn perigo peq', onclick: () => excluirObra(obra) }, 'Excluir obra')));
}

function chipDoExemplar(exemplar) {
  const emprestado = exemplar.status === 'Emprestado';
  const emManutencao = exemplar.status === 'Em Manutenção';
  return el('span', { classe: 'exemplar' },
    `${exemplar.codigo} `,
    el('span', { classe: `tag ${CLASSE_STATUS[exemplar.status]}` }, exemplar.status),
    !emprestado && el('button', {
      type: 'button', classe: 'btn sec peq',
      onclick: () => alterarStatus(exemplar, emManutencao ? 'Disponível' : 'Em Manutenção'),
    }, emManutencao ? 'Liberar' : 'Manutenção'),
    exemplar.historico === 0 && el('button', {
      type: 'button', classe: 'btn perigo peq', 'aria-label': `Remover ${exemplar.codigo}`,
      onclick: () => removerExemplar(exemplar),
    }, '✕'));
}

export async function carregarAcervo() {
  try {
    const consulta = new URLSearchParams({ q: $('#busca-obra').value, genero: $('#filtro-genero').value });
    const [obras, listaDeGeneros] = await Promise.all([chamar(`/api/obras?${consulta}`), chamar('/api/generos')]);
    atualizarFiltroDeGeneros(listaDeGeneros);

    const visiveis = $('#so-disponiveis').checked ? obras.filter((o) => o.disponiveis > 0) : obras;
    $('#contagem-obras').textContent = `${visiveis.length} obra(s) encontrada(s)`;
    renderizar($('#resultado-obras'), visiveis.length
      ? el('div', { classe: 'lista' }, visiveis.map(cartaoDaObra))
      : el('p', { classe: 'vazio' }, 'Nenhuma obra encontrada.'));
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

/** Mantém o filtro de gênero atualizado (um gênero novo cadastrado já aparece), preservando a seleção. */
function atualizarFiltroDeGeneros(lista) {
  generos = lista;
  const filtro = $('#filtro-genero');
  const escolhido = filtro.value;
  renderizar(filtro, el('option', { value: '' }, 'Todos os gêneros'),
    lista.map((g) => el('option', { value: g, selected: g === escolhido }, g)));
}

// ---------- Formulário de obra (criar / editar) ----------

function campo(rotulo, atributos, classe = '') {
  return el('label', { classe }, rotulo, el('input', atributos));
}

function abrirFormulario(obra = null) {
  const editando = obra !== null;
  const lista = el('datalist', { id: 'sugestoes-genero' }, generos.map((g) => el('option', { value: g })));
  const formulario = el('form', { classe: 'card', onsubmit: (e) => salvarObra(e, obra) },
    el('h3', {}, editando ? `Editar "${obra.titulo}"` : 'Nova obra'),
    el('div', { classe: 'formulario' },
      campo('Título *', { name: 'titulo', required: true, maxlength: '150', value: obra?.titulo ?? '' }, 'largo'),
      campo('Autor *', { name: 'autor', required: true, maxlength: '100', value: obra?.autor ?? '' }),
      campo('ISBN (10 ou 13 dígitos)', { name: 'isbn', maxlength: '20', inputmode: 'numeric', value: obra?.isbn ?? '' }),
      campo('Gênero', { name: 'genero', list: 'sugestoes-genero', maxlength: '50', value: obra?.genero ?? '' }),
      campo('Localização na biblioteca', { name: 'localizacao', maxlength: '100', placeholder: 'Sala · Estante · Prateleira', value: obra?.localizacao ?? '' }),
      !editando && campo('Quantidade de exemplares', { name: 'quantidade', type: 'number', min: '0', max: '50', value: '1' })),
    lista,
    el('div', { classe: 'acoes' },
      el('button', { classe: 'btn', type: 'submit' }, editando ? 'Salvar alterações' : 'Cadastrar obra'),
      el('button', { classe: 'btn sec', type: 'button', onclick: fecharFormulario }, 'Cancelar')));
  renderizar($('#cadastro-obra'), formulario);
  formulario.elements.titulo.focus();
}

const fecharFormulario = () => renderizar($('#cadastro-obra'));

async function salvarObra(evento, obra) {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(evento.target));
  if ('quantidade' in dados) dados.quantidade = Number(dados.quantidade);
  try {
    await (obra
      ? chamar(`/api/obras/${obra.id}`, { metodo: 'PUT', corpo: dados })
      : chamar('/api/obras', { metodo: 'POST', corpo: dados }));
    mostrarAviso(obra ? 'Obra atualizada.' : 'Obra cadastrada com sucesso.');
    fecharFormulario();
    await carregarAcervo();
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

// ---------- Ações sobre obras e exemplares ----------

/** Executa uma ação da API, avisa o resultado e recarrega a lista. */
async function executar(requisicao, mensagemDeSucesso) {
  try {
    await requisicao();
    mostrarAviso(mensagemDeSucesso);
    await carregarAcervo();
  } catch (erro) {
    mostrarAviso(erro.message, true);
  }
}

function adicionarExemplar(obra) {
  return executar(() => chamar(`/api/obras/${obra.id}/exemplares`, { metodo: 'POST', corpo: { quantidade: 1 } }),
    `Exemplar adicionado a "${obra.titulo}".`);
}

function alterarStatus(exemplar, status) {
  return executar(() => chamar(`/api/exemplares/${exemplar.id}`, { metodo: 'PATCH', corpo: { status } }),
    `${exemplar.codigo}: ${status}.`);
}

function removerExemplar(exemplar) {
  if (!confirm(`Remover o exemplar ${exemplar.codigo}? Esta ação não pode ser desfeita.`)) return;
  return executar(() => chamar(`/api/exemplares/${exemplar.id}`, { metodo: 'DELETE' }), `Exemplar ${exemplar.codigo} removido.`);
}

function excluirObra(obra) {
  if (!confirm(`Excluir "${obra.titulo}" e todos os seus exemplares? Esta ação não pode ser desfeita.`)) return;
  return executar(() => chamar(`/api/obras/${obra.id}`, { metodo: 'DELETE' }), `"${obra.titulo}" foi excluída do acervo.`);
}

export function iniciarAcervo() {
  $('#form-obra').addEventListener('submit', (e) => { e.preventDefault(); carregarAcervo(); });
  $('#filtro-genero').addEventListener('change', carregarAcervo);
  $('#so-disponiveis').addEventListener('change', carregarAcervo);
  $('#nova-obra').addEventListener('click', () => abrirFormulario());
}
