/**
 * Tipos de ajuste editáveis. Cada tipo é uma linha da aba "TiposAjuste".
 *
 * sistema:
 *  - ESTRUTURAL: batidas de horário e "só anotação"/"abonar horas/almoço" (o cálculo os trata de forma própria):
 *    só texto, sugestões e ativo são editáveis.
 *  - PADRAO: os que vieram do sistema antigo; todos os parâmetros editáveis, não podem ser removidos.
 *  - PERSONALIZADO: criados pelo administrador.
 *
 * Parâmetros do cálculo (tipos PADRAO e PERSONALIZADO):
 *  horas_modo: NENHUMA | JORNADA | METADE | NEG_JORNADA | INFORMADO   (horas que o dia passa a contar)
 *  saldo_modo: ZERO | HORAS | HORAS_MENOS_JORNADA | INFORMADO          (efeito no banco de horas)
 *  paga_dia / passagem: SIM | NÃO
 */

var ALERTAS_CATALOGO = [
  { codigo: 'SEM_REGISTRO', nome: 'Dia útil sem registro' },
  { codigo: 'FALTA_ENTRADA', nome: 'Falta entrada' },
  { codigo: 'FALTA_SAIDA', nome: 'Falta saída' },
  { codigo: 'FALTA_RETORNO', nome: 'Falta retorno do almoço' },
  { codigo: 'ALMOCO_CURTO', nome: 'Almoço curto' },
  { codigo: 'ALMOCO_LONGO', nome: 'Almoço longo' },
  { codigo: 'SALDO_NEGATIVO', nome: 'Saldo do dia negativo' },
  { codigo: 'HORA_A_MAIS', nome: 'Hora a mais no dia' },
  { codigo: 'BANCO_NEGATIVO', nome: 'Banco de horas negativo' }
];

var MODOS_HORAS = ['NENHUMA', 'JORNADA', 'METADE', 'NEG_JORNADA', 'INFORMADO'];
var MODOS_SALDO = ['ZERO', 'HORAS', 'HORAS_MENOS_JORNADA', 'INFORMADO'];

function tp_(codigo, rotulo, chip, quando, sistema, o) {
  o = o || {};
  return {
    codigo: codigo, rotulo: rotulo, chip: chip, quando: quando, efeito: o.efeito || '',
    horas_modo: o.h || '', saldo_modo: o.s || '', paga_dia: o.paga || '', passagem: o.pas || '',
    pede_hora: o.hora ? 'SIM' : 'NÃO', sugerir_para: o.sug || '', ativo: 'SIM', sistema: sistema,
    grava_como: o.grava || '', prefixo_obs: o.pref || ''
  };
}

var TIPOS_PADRAO = [
  tp_('ENTRADA', 'Lançar/corrigir ENTRADA', 'Lançar entrada', 'A pessoa esqueceu de bater a entrada ou bateu errado.', 'ESTRUTURAL',
    { hora: true, sug: 'FALTA_ENTRADA,SEM_REGISTRO',
      efeito: 'Grava o horário informado como entrada do dia (a batida anterior fica marcada como substituída, nunca apagada). Horas do dia = saída − entrada − almoço; o saldo é horas − jornada. O dia é pago, com passagem.' }),
  tp_('SAIDA_INTERVALO', 'Lançar/corrigir SAÍDA PARA O ALMOÇO', 'Corrigir ida ao almoço', 'Esqueceu de bater a ida ao almoço.', 'ESTRUTURAL',
    { hora: true, sug: 'ALMOCO_CURTO', efeito: 'Grava a saída do almoço. O tempo entre saída e retorno é descontado das horas trabalhadas.' }),
  tp_('VOLTA_INTERVALO', 'Lançar/corrigir RETORNO DO ALMOÇO', 'Corrigir retorno', 'Esqueceu de bater a volta (aparece "Falta retorno do almoço").', 'ESTRUTURAL',
    { hora: true, sug: 'FALTA_RETORNO,ALMOCO_CURTO,ALMOCO_LONGO', efeito: 'Grava o retorno do almoço. Sem ele o dia fica com pendência e o almoço não é descontado direito.' }),
  tp_('SAIDA', 'Lançar/corrigir SAÍDA PARA CASA', 'Lançar/corrigir saída', 'Esqueceu de bater a saída (aparece "Falta saída").', 'ESTRUTURAL',
    { hora: true, sug: 'FALTA_SAIDA,SALDO_NEGATIVO,HORA_A_MAIS', efeito: 'Grava a saída do dia. É ela que fecha as horas do dia e paga o dia; sem saída o dia não conta como pago.' }),
  tp_('ABONAR_FALTA', 'Abonar FALTA (dia inteiro)', 'Abonar falta', 'Falta justificada: atestado, declaração. Dia "sem registro".', 'PADRAO',
    { h: 'JORNADA', s: 'ZERO', paga: 'SIM', pas: 'NÃO', sug: 'SEM_REGISTRO' }),
  tp_('ABONAR_METADE', 'Abonar METADE do dia', 'Abonar metade', 'Meio período justificado (ex.: consulta pela manhã).', 'PADRAO',
    { h: 'METADE', s: 'HORAS_MENOS_JORNADA', paga: 'SIM', pas: 'SIM' }),
  tp_('RETIRAR_BANCO', 'FOLGA usando o banco de horas', 'Folga do banco', 'A pessoa folgou e vai compensar com horas que acumulou.', 'PADRAO',
    { h: 'NEG_JORNADA', s: 'HORAS', paga: 'SIM', pas: 'NÃO', sug: 'SEM_REGISTRO' }),
  tp_('ADICIONAR_BANCO', 'Somar/tirar HORAS do banco', 'Somar horas ao banco', 'Hora extra autorizada fora das batidas, perdão de horas negativas ou acerto manual de saldo.', 'PADRAO',
    { h: 'NENHUMA', s: 'INFORMADO', paga: 'NÃO', pas: 'NÃO', sug: 'BANCO_NEGATIVO' }),
  tp_('OBS_HORAS', 'Abonar HORAS (perdoar atraso/saída antecipada)', 'Abonar horas', 'Atraso ou saída antecipada justificados, mas a pessoa trabalhou o dia.', 'ESTRUTURAL',
    { grava: 'OBSERVACAO', pref: 'Abonar Horas', sug: 'ALMOCO_LONGO,SALDO_NEGATIVO',
      efeito: 'O saldo do dia vira zero: não desconta nem soma no banco. O dia é pago normal. Só funciona em dia que tenha a SAÍDA batida.' }),
  tp_('OBS_ALMOCO', 'Abonar ALMOÇO (almoço não batido)', 'Abonar almoço', 'Trabalhou o dia mas não bateu ida/volta do almoço.', 'ESTRUTURAL',
    { grava: 'OBSERVACAO', pref: 'Abonar Almoço',
      efeito: 'Desconta 1h de almoço do saldo do dia (saldo = horas − jornada − 1h), como no sistema antigo. Só funciona em dia com SAÍDA batida e sem batidas de almoço.' }),
  tp_('OBSERVACAO', 'Só ANOTAÇÃO (ATESTADO, FOLGA...)', 'Anotação', 'Registrar um aviso que aparece no espelho.', 'ESTRUTURAL',
    { efeito: 'Não altera horas, banco nem pagamento. Serve só de lembrete no espelho do dia.' })
];

function tiposAjusteLista_() {
  var l = lerObjetos_('TiposAjuste');
  if (l.length) return l;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!lerObjetosSheet_('TiposAjuste').length) TIPOS_PADRAO.forEach(function (t) { anexar_('TiposAjuste', t); });
  } finally { lock.releaseLock(); }
  return lerObjetos_('TiposAjuste');
}

function tiposAjusteMapa_() {
  var m = {};
  tiposAjusteLista_().forEach(function (t) { m[t.codigo] = t; });
  return m;
}

function apiAdminTiposAjuste(token) {
  sessao_(token, true);
  return {
    tipos: tiposAjusteLista_().map(function (t) {
      var o = {}; Object.keys(t).forEach(function (k) { if (k !== '_linha') o[k] = t[k]; });
      return o;
    }),
    alertas: ALERTAS_CATALOGO
  };
}

function apiAdminSalvarTipoAjuste(token, d) {
  var adm = sessao_(token, true);
  d = d || {};
  var lista = tiposAjusteLista_();
  var atual = d.codigo ? lista.filter(function (t) { return t.codigo === d.codigo; })[0] : null;
  if (d.codigo && !atual) throw new Error('Tipo de ajuste não encontrado.');
  var rotulo = String(d.rotulo || '').trim();
  if (!rotulo) throw new Error('Dê um nome ao ajuste.');
  var alertasOk = ALERTAS_CATALOGO.map(function (a) { return a.codigo; });
  var sug = (d.sugerir_para || []).filter(function (c) { return alertasOk.indexOf(c) >= 0; });
  var campos = {
    rotulo: rotulo, chip: String(d.chip || '').trim() || rotulo, quando: String(d.quando || '').trim(),
    sugerir_para: sug.join(','), ativo: d.ativo === false ? 'NÃO' : 'SIM'
  };

  if (atual && atual.sistema === 'ESTRUTURAL') {
    if (d.efeito !== undefined) campos.efeito = String(d.efeito).trim();
  } else {
    if (MODOS_HORAS.indexOf(d.horas_modo) < 0) throw new Error('Escolha como o dia conta as horas.');
    if (MODOS_SALDO.indexOf(d.saldo_modo) < 0) throw new Error('Escolha o efeito no banco de horas.');
    campos.horas_modo = d.horas_modo; campos.saldo_modo = d.saldo_modo;
    campos.paga_dia = d.paga_dia === 'SIM' ? 'SIM' : 'NÃO';
    campos.passagem = campos.paga_dia === 'SIM' && d.passagem === 'SIM' ? 'SIM' : 'NÃO';
    campos.pede_hora = 'NÃO';
    if (campos.horas_modo === 'NENHUMA' && campos.saldo_modo === 'ZERO' && campos.paga_dia === 'NÃO')
      throw new Error('Esse ajuste não faria nada. Para só deixar um aviso, use "Só anotação".');
    if (campos.horas_modo === 'NENHUMA' && (campos.saldo_modo === 'HORAS' || campos.saldo_modo === 'HORAS_MENOS_JORNADA'))
      throw new Error('Para mexer no banco a partir das horas do dia, escolha como o dia conta as horas.');
  }

  var nomeLogado = adm.login;
  if (atual) {
    atualizarLinha_('TiposAjuste', atual._linha, campos);
    log_(nomeLogado, 'TIPO_AJUSTE_EDITADO', atual.codigo + ' | ' + rotulo + ' | ' + [campos.horas_modo, campos.saldo_modo, campos.paga_dia, campos.passagem].join('/'));
  } else {
    campos.codigo = 'X' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss');
    campos.sistema = 'PERSONALIZADO';
    campos.efeito = '';
    anexar_('TiposAjuste', campos);
    log_(nomeLogado, 'TIPO_AJUSTE_NOVO', campos.codigo + ' | ' + rotulo + ' | ' + [campos.horas_modo, campos.saldo_modo, campos.paga_dia, campos.passagem].join('/'));
  }
  return apiAdminTiposAjuste(token);
}
