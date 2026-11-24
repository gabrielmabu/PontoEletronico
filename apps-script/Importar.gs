/**
 * Botão "Atualizar da base antiga": importação incremental da aba "Formulário Ponto"
 * da planilha antiga para a aba Batidas.
 *
 * - Só ACRESCENTA linhas novas; nunca altera nem apaga o que já foi importado.
 * - Chave única por linha: carimbo (ms) | colaborador | tipo original.
 * - Pode rodar quantas vezes quiser: linhas já importadas são ignoradas.
 */

var ABA_ORIGEM = 'Formulário Ponto';

var MAPA_TIPOS = {
  '1-Entrada Pela Manhã': 'ENTRADA',
  '2-Saída Para o Almoço': 'SAIDA_INTERVALO',
  '3-Retorno Do Almoço': 'VOLTA_INTERVALO',
  '4-Saída Para Casa': 'SAIDA',
  'Abonar Falta': 'ABONAR_FALTA',
  'Abonar Metade': 'ABONAR_METADE',
  'Adicionar Banco de Horas': 'ADICIONAR_BANCO',
  'Retirar Banco de Horas': 'RETIRAR_BANCO',
  'Faltando Registro': 'FALTANDO_REGISTRO'
};

function menuAtualizarBaseAntiga() {
  var r = importarBaseAntiga();
  SpreadsheetApp.getUi().alert('Importação concluída',
    r.novas + ' linha(s) nova(s) importada(s).\n' + r.jaExistiam + ' já existiam (não foram alteradas).\n' +
    r.ignoradas + ' ignorada(s) (sem data, colaborador ou tipo).' +
    (r.semCadastro.length ? '\n\nNomes sem cadastro (importados sem vínculo): ' + r.semCadastro.join(', ') : ''),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function importarBaseAntiga() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Outra importação está em andamento. Tente de novo em instantes.');
  try {
    var idOrigem = String(cfg_('id_planilha_antiga', ''));
    if (!idOrigem) throw new Error('Preencha "id_planilha_antiga" na aba Config.');
    var origem = SpreadsheetApp.openById(idOrigem).getSheetByName(ABA_ORIGEM);
    if (!origem) throw new Error('Aba "' + ABA_ORIGEM + '" não encontrada na planilha antiga.');

    var destino = aba_('Batidas');
    var colChave = CAB.Batidas.indexOf('chave_origem') + 1;
    var existentes = {};
    var ultima = destino.getLastRow();
    if (ultima > 1) {
      destino.getRange(2, colChave, ultima - 1, 1).getValues().forEach(function (l) { if (l[0]) existentes[l[0]] = true; });
    }

    var n = origem.getLastRow();
    if (n < 2) return { novas: 0, jaExistiam: 0, ignoradas: 0, semCadastro: [] };
    var valores = origem.getRange(2, 1, n - 1, 4).getValues();           // A:D
    var exibidos = origem.getRange(2, 13, n - 1, 2).getDisplayValues();  // M:N (Ajustes, Observação)

    var mapa = {};
    lerObjetos_('Colaboradores').forEach(function (c) { mapa[normalizar_(c.nome)] = c; });
    var novas = [], jaExistiam = 0, ignoradas = 0, semCad = {};
    var I = {}; CAB.Batidas.forEach(function (h, i) { I[h] = i; });

    for (var i = 0; i < valores.length; i++) {
      var carimbo = valores[i][1], tipoOrig = String(valores[i][2] || '').trim(), nome = String(valores[i][3] || '').trim();
      if (!(carimbo instanceof Date) || !tipoOrig || !nome) { ignoradas++; continue; }
      var chave = carimbo.getTime() + '|' + nome + '|' + tipoOrig;
      if (existentes[chave]) { jaExistiam++; continue; }
      existentes[chave] = true;

      var c = mapa[normalizar_(nome)];
      if (!c) semCad[nome] = true;
      var l = CAB.Batidas.map(function () { return ''; });
      l[I.id] = Utilities.getUuid();
      l[I.id_colaborador] = c ? c.id : '';
      l[I.nome] = c ? c.nome : nome;
      l[I.tipo] = MAPA_TIPOS[tipoOrig] || 'OUTRO';
      l[I.data_hora_servidor] = carimbo;
      l[I.status] = 'OK';
      l[I.origem] = 'FORM';
      l[I.chave_origem] = chave;
      l[I.tipo_original] = tipoOrig;
      l[I.observacao] = String(exibidos[i][1] || '').trim();
      l[I.ajuste_horas] = duracaoParaHoras_(exibidos[i][0]);
      novas.push(l);
    }

    // Grava em blocos para não estourar o tempo/memória
    var BL = 5000;
    for (var b = 0; b < novas.length; b += BL) {
      var parte = novas.slice(b, b + BL);
      destino.getRange(destino.getLastRow() + 1, 1, parte.length, CAB.Batidas.length).setValues(parte);
      invalidarCalc_('Batidas');
    }
    var r = { novas: novas.length, jaExistiam: jaExistiam, ignoradas: ignoradas, semCadastro: Object.keys(semCad) };
    log_(Session.getEffectiveUser().getEmail(), 'IMPORTACAO_BASE_ANTIGA',
      r.novas + ' novas, ' + jaExistiam + ' já existiam, ' + ignoradas + ' ignoradas');
    return r;
  } finally {
    lock.releaseLock();
  }
}

/** "61:40:00" ou "-8:00:00" -> horas decimais. Vazio -> ''. */
function duracaoParaHoras_(txt) {
  txt = String(txt || '').trim();
  if (!txt || txt.indexOf(':') < 0) return '';
  var neg = txt.charAt(0) === '-';
  var p = txt.replace('-', '').split(':').map(Number);
  if (p.some(isNaN)) return '';
  var h = (p[0] || 0) + (p[1] || 0) / 60 + (p[2] || 0) / 3600;
  return Math.round((neg ? -h : h) * 10000) / 10000;
}
