// Ponto de entrada do frontend: login, logout e navegação entre as abas.

import { chamar, definirAoExpirar } from './api.js';
import { $, renderizar } from './dom.js';
import { carregarPainel } from './telas/painel.js';
import { iniciarBalcao } from './telas/balcao.js';
import { carregarAcervo, iniciarAcervo } from './telas/acervo.js';
import { carregarLeitores, iniciarLeitores } from './telas/leitores.js';

// O que carregar ao abrir cada aba (o balcão só reage a buscas).
const ABAS = { painel: carregarPainel, balcao: () => {}, acervo: carregarAcervo, leitores: carregarLeitores };

function mostrarAba(nome) {
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== `aba-${nome}`; });
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === nome));
  ABAS[nome]();
}

function mostrarApp(nomeOperadora) {
  $('#operadora').textContent = nomeOperadora;
  $('#tela-login').hidden = true;
  $('#app').hidden = false;
  mostrarAba('painel');
}

function mostrarLogin(mensagem = '') {
  $('#app').hidden = true;
  $('#tela-login').hidden = false;
  $('#login-senha').value = '';
  $('#login-erro').textContent = mensagem;
}

async function entrar(evento) {
  evento.preventDefault();
  $('#login-erro').textContent = '';
  try {
    const { nome } = await chamar('/api/login', {
      metodo: 'POST',
      corpo: { matricula: $('#login-usuario').value, senha: $('#login-senha').value },
      ignorar401: true, // 401 aqui significa "senha errada", não "sessão vencida"
    });
    $('#login-senha').value = ''; // não deixa a senha parada no formulário
    mostrarApp(nome);
  } catch (erro) {
    $('#login-erro').textContent = erro.message;
  }
}

async function sair() {
  try { await chamar('/api/logout', { metodo: 'POST', ignorar401: true }); } catch { /* sai da tela de qualquer forma */ }
  renderizar($('#ficha'));
  mostrarLogin();
}

async function iniciar() {
  $('#form-login').addEventListener('submit', entrar);
  $('#sair').addEventListener('click', sair);
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));
  iniciarBalcao();
  iniciarAcervo();
  iniciarLeitores();
  definirAoExpirar(() => mostrarLogin('Sessão expirada. Faça login novamente.'));

  // Se o cookie de sessão ainda for válido (ex.: recarregou a página), entra direto.
  try {
    const { nome } = await chamar('/api/sessao', { ignorar401: true });
    mostrarApp(nome);
  } catch {
    mostrarLogin();
  }
}

iniciar();
