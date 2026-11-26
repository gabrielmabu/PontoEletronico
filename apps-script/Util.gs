/** Utilidades: planilha, Config, Log, datas. */

var TZ = 'America/Recife';

var CAB = {
  Config: ['chave', 'valor', 'descricao'],
  Lojas: ['id_loja', 'nome', 'endereco', 'latitude', 'longitude', 'raio_metros', 'ativa'],
  Colaboradores: ['id', 'nome', 'login', 'cargo', 'perfil', 'id_loja', 'id_jornada',
    'salario_padrao', 'passagem_dia', 'abono_qtd', 'desconto_pct',
    'senha_hash', 'senha_salt', 'primeiro_acesso', 'descritores_faciais',
    'consentimento_lgpd_em', 'ativo', 'criado_em', 'foto_perfil'],
  Jornadas: ['id_jornada', 'nome', 'horas_seg_sex', 'horas_sabado', 'horas_domingo', 'observacao'],
  Batidas: ['id', 'id_colaborador', 'nome', 'tipo', 'data_hora_servidor',
    'latitude', 'longitude', 'precisao_m', 'distancia_loja_m', 'id_loja',
    'distancia_facial', 'link_selfie', 'dispositivo', 'status',
    'origem', 'chave_origem', 'tipo_original', 'observacao', 'ajuste_horas'],
  Feriados: ['data', 'descricao'],
  Solicitacoes: ['id', 'id_colaborador', 'nome', 'data', 'tipo', 'motivo', 'observacao', 'link_anexo',
    'status', 'criado_em', 'analisado_por', 'analisado_em', 'resposta', 'id_batida'],
  Espelho: ['mes', 'quinzena', 'data', 'dia_semana', 'colaborador', 'entrada', 'saida_intervalo',
    'volta_intervalo', 'saida', 'almoco_h', 'horas_trabalhadas_h', 'saldo_banco_h',
    'ajustes', 'observacao', 'salario_dia', 'passagem_dia', 'pendencia'],
  Log: ['data_hora', 'usuario', 'acao', 'detalhe'],
  TiposAjuste: ['codigo', 'rotulo', 'chip', 'quando', 'efeito', 'horas_modo', 'saldo_modo', 'paga_dia', 'passagem',
    'pede_hora', 'sugerir_para', 'ativo', 'sistema', 'grava_como', 'prefixo_obs']
};

/** Cliente da chamada atual (vem de "c" no corpo do POST). Vazio = o cliente original (planilha em que o script está). */
var _cliente = '';
var _ssCliente = null;
/** Chave de cache/propriedade separada por cliente (cliente original mantém as chaves de sempre). */
function kc_(k) { return _cliente ? _cliente + ':' + k : k; }

function ss_() {
  if (_cliente) {
    if (!_ssCliente) _ssCliente = clientePlanilha_(_cliente);
    return _ssCliente;
  }
  return SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
}

/** Cria a coluna no fim do cabeçalho se a planilha ainda não tiver (planilhas antigas). */
function garantirColuna_(nome, col) {
  var a = aba_(nome), n = a.getLastColumn(), cab = n ? a.getRange(1, 1, 1, n).getValues()[0] : [];
  if (cab.indexOf(col) < 0) { a.getRange(1, n + 1).setValue(col).setFontWeight('bold'); delete _memo[nome]; }
}

function aba_(nome) {
  var s = ss_();
  var a = s.getSheetByName(nome);
  if (!a) {
    a = s.insertSheet(nome);
    if (CAB[nome]) {
      a.getRange(1, 1, 1, CAB[nome].length).setValues([CAB[nome]]).setFontWeight('bold');
      a.setFrozenRows(1);
    }
  }
  return a;
}

/** Dentro de uma chamada da API (doPost) as abas pequenas são lidas uma vez só. */
var _memoOn = false, _memo = {};
var ABAS_MEMO = { Colaboradores: 1, Lojas: 1, Config: 1, Jornadas: 1, Feriados: 1, TiposAjuste: 1 };

/** Lê uma aba como lista de objetos {cabecalho: valor, _linha: n}. */
function lerObjetos_(nome) {
  if (_memoOn && ABAS_MEMO[nome] && _memo[nome]) return _memo[nome].map(function (o) { return Object.assign({}, o); });
  var r = lerObjetosSheet_(nome);
  if (_memoOn && ABAS_MEMO[nome]) _memo[nome] = r.map(function (o) { return Object.assign({}, o); });
  return r;
}

function lerObjetosSheet_(nome) {
  var a = aba_(nome);
  var n = a.getLastRow();
  if (n < 2) return [];
  var dados = a.getRange(1, 1, n, a.getLastColumn()).getValues();
  var cab = dados[0];
  var out = [];
  for (var i = 1; i < dados.length; i++) {
    var o = { _linha: i + 1 };
    for (var j = 0; j < cab.length; j++) o[cab[j]] = dados[i][j];
    out.push(o);
  }
  return out;
}

/** Atualiza campos de uma linha (por _linha) sem mexer nas outras colunas. */
function atualizarLinha_(nome, linha, campos) {
  delete _memo[nome]; if (_cfgCache && nome === 'Config') _cfgCache = null;
  if (nome !== 'Colaboradores' || Object.keys(campos).some(function (k) { return /^(nome|salario_padrao|passagem_dia|abono_qtd|desconto_pct|id_jornada|ativo)$/.test(k); })) invalidarCalc_(nome);
  var a = aba_(nome);
  var cab = a.getRange(1, 1, 1, a.getLastColumn()).getValues()[0];
  for (var k in campos) {
    var c = cab.indexOf(k);
    if (c < 0) throw new Error('Coluna ' + k + ' não existe em ' + nome);
    a.getRange(linha, c + 1).setValue(campos[k]);
  }
}

function anexar_(nome, obj) {
  delete _memo[nome]; invalidarCalc_(nome);
  var cab = CAB[nome];
  var linha = cab.map(function (c) { return obj[c] === undefined ? '' : obj[c]; });
  aba_(nome).appendRow(linha);
}

var _cfgCache = null;
function cfg_(chave, padrao) {
  if (!_cfgCache) {
    _cfgCache = {};
    lerObjetos_('Config').forEach(function (o) { _cfgCache[o.chave] = o.valor; });
  }
  var v = _cfgCache[chave];
  return (v === '' || v === undefined || v === null) ? padrao : v;
}

function log_(usuario, acao, detalhe) {
  try { anexar_('Log', { data_hora: new Date(), usuario: usuario || '', acao: acao, detalhe: detalhe || '' }); }
  catch (e) { console.error(e); }
}

function diaStr_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function horaStr_(d) { return d ? Utilities.formatDate(d, TZ, 'HH:mm') : ''; }
function dataHoraStr_(d) { return Utilities.formatDate(d, TZ, 'dd/MM/yyyy HH:mm:ss'); }
function diaSemana_(diaIso) { // 0 = domingo ... 6 = sábado
  var p = diaIso.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
}

function normalizar_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function arred_(n, casas) { var f = Math.pow(10, casas || 2); return Math.round(n * f) / f; }

// ---------- Cache do cálculo (evita reler as 25 mil linhas a cada tela) ----------
var ABAS_CALC = { Batidas: 1, Colaboradores: 1, Config: 1, Jornadas: 1, Feriados: 1, TiposAjuste: 1 };

/** Chame depois de mexer em dados que entram no cálculo. */
function invalidarCalc_(nomeAba) {
  if (nomeAba && !ABAS_CALC[nomeAba]) return;
  try { CacheService.getScriptCache().remove(kc_('calc_meta')); } catch (e) {}
}

/** Edição manual na planilha também derruba o cache. */
function onEdit() { invalidarCalc_(); }

function calcCacheLer_() {
  var c = CacheService.getScriptCache();
  var meta = c.get(kc_('calc_meta'));
  if (!meta) return null;
  try {
    var m = JSON.parse(meta);
    if (m.dia !== diaStr_(new Date())) return null;
    var chaves = []; for (var i = 0; i < m.n; i++) chaves.push(kc_('calc_' + i));
    var got = c.getAll(chaves), s = '';
    for (var j = 0; j < m.n; j++) { if (!got[kc_('calc_' + j)]) return null; s += got[kc_('calc_' + j)]; }
    var bytes = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip')).getDataAsString();
    return JSON.parse(bytes);
  } catch (e) { return null; }
}

function calcCacheGravar_(obj) {
  try {
    var s = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json')).getBytes());
    var t = {}, n = 0;
    for (var p = 0; p < s.length; p += 90000) { t[kc_('calc_' + n)] = s.substr(p, 90000); n++; }
    var meta = JSON.stringify({ n: n, dia: diaStr_(new Date()) });
    var c = CacheService.getScriptCache();
    c.putAll(t, 21600);
    c.put(kc_('calc_meta'), meta, 21600);   // por último: só vale com todos os pedaços gravados
  } catch (e) { console.error(e); }
}
