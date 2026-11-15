// Datas no formato AAAA-MM-DD, sempre no fuso da biblioteca.
// Evita o erro clássico de usar toISOString() (UTC), que "vira o dia" às 21h no Brasil.

const { fusoHorario } = require('./config');

const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: fusoHorario, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Data de hoje + `deslocamentoDias` (pode ser negativo). */
function dia(deslocamentoDias = 0) {
  return formatador.format(Date.now() + deslocamentoDias * 86_400_000);
}

/** Quantos dias existem entre duas datas AAAA-MM-DD (positivo se `fim` é depois de `inicio`). */
function diasEntre(inicio, fim) {
  return Math.round((Date.parse(fim) - Date.parse(inicio)) / 86_400_000);
}

module.exports = { dia, diasEntre };
