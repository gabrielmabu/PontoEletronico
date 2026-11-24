/**
 * Cálculo do espelho, banco de horas e fechamento.
 * Reproduz EXATAMENTE as fórmulas da aba "Formulário Ponto" do sistema antigo
 * (ver REGRAS-LEVANTADAS.md e RESPOSTAS.md).
 */

function horasTxt_(h) {
  if (h === null || h === undefined || h === '') return '';
  var neg = h < 0, m = Math.round(Math.abs(h) * 60);
  return (neg ? '-' : '') + Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2);
}

var _ferCache = null;
function feriadosSet_() {
  if (_ferCache) return _ferCache;
  var s = _ferCache = {};
  lerObjetos_('Feriados').forEach(function (f) {
    if (f.data instanceof Date) s[diaStr_(f.data)] = f.descricao || true;
  });
  return s;
}

function jornadas_() {
  var m = {};
  lerObjetos_('Jornadas').forEach(function (j) { m[j.id_jornada] = j; });
  return m;
}

/** Horas da jornada no dia (legado: sábado 4h, demais dias 8h). */
function jornadaDia_(j, diaIso) {
  var ds = diaSemana_(diaIso);
  if (!j) return ds === 6 ? 4 : 8;
  if (ds === 6) return Number(j.horas_sabado);
  if (ds === 0) return Number(j.horas_domingo);
  return Number(j.horas_seg_sex);
}

/** Dias úteis (seg a sáb, menos feriados) entre dois dias do mesmo mês. Igual ao NETWORKDAYS.INTL(...,11,...). */
var _duCache = {};
function diasUteis_(ano, mes, d1, d2, fer) {
  var k = ano + '-' + mes + '-' + d1 + '-' + d2;
  if (_duCache[k] !== undefined) return _duCache[k];
  var n = 0;
  for (var d = d1; d <= d2; d++) {
    var dt = new Date(Date.UTC(ano, mes - 1, d));
    if (dt.getUTCMonth() !== mes - 1) break;
    var iso = ano + '-' + ('0' + mes).slice(-2) + '-' + ('0' + d).slice(-2);
    if (dt.getUTCDay() !== 0 && !fer[iso]) n++;
  }
  return (_duCache[k] = n);
}

/** Salário de um dia pago (coluna J do legado). */
function salarioDia_(col, diaIso, fer, cfgCalc) {
  var sal = Number(col && col.salario_padrao) || 0;
  if (!sal) return 0;
  var p = diaIso.split('-'), ano = +p[0], mes = +p[1], dia = +p[2];
  if (dia <= 15) {
    var du1 = diasUteis_(ano, mes, 1, 15, fer);
    return du1 ? (sal / 2) / du1 : 0;
  }
  var desc = (col.desconto_pct === '' || col.desconto_pct === undefined) ? cfgCalc.desconto : Number(col.desconto_pct);
  var restante = (sal / 2) - (sal / 2) * desc / 100 + (Number(col.abono_qtd) || 0) * cfgCalc.valorAbono;
  var du2 = diasUteis_(ano, mes, 16, 31, fer);
  return du2 ? restante / du2 : 0;
}

/**
 * Lê a aba Batidas e calcula os dias.
 * filtro: { idColaborador?, mesIni?: 'yyyy-MM', mesFim?: 'yyyy-MM' }
 * Retorna { dias: [...], saldoPorColab: {id: horas} } — o saldo é sempre do histórico inteiro.
 */
function calcular_(filtro) {
  filtro = filtro || {};
  var tudo = calcCacheLer_();
  if (!tudo) { tudo = calcularBruto_({}); calcCacheGravar_(tudo); }
  return {
    saldoPorColab: tudo.saldoPorColab,
    dias: tudo.dias.filter(function (d) {
      var mes = d.data.slice(0, 7);
      if (filtro.idColaborador && String(d.idColab) !== String(filtro.idColaborador)) return false;
      if (filtro.mesIni && mes < filtro.mesIni) return false;
      if (filtro.mesFim && mes > filtro.mesFim) return false;
      return true;
    })
  };
}

function calcularBruto_(filtro) {
  filtro = filtro || {};
  var a = aba_('Batidas');
  var n = a.getLastRow();
  var colabs = {};
  lerObjetos_('Colaboradores').forEach(function (c) { colabs[c.id] = c; });
  var jorn = jornadas_();
  var defs = tiposAjusteMapa_();
  var fer = feriadosSet_();
  var cfgCalc = { desconto: Number(cfg_('desconto_2a_quinzena_pct', 13.66)), valorAbono: Number(cfg_('valor_abono', 59.82)) };
  var res = { dias: [], saldoPorColab: {} };
  if (n < 2) return res;

  var B = CAB.Batidas;
  var dados = a.getRange(2, 1, n - 1, B.length).getValues();
  var I = {}; B.forEach(function (h, i) { I[h] = i; });

  // Agrupa por colaborador + dia
  var grupos = {};
  for (var r = 0; r < dados.length; r++) {
    var l = dados[r];
    var idc = l[I.id_colaborador];
    if (!idc || !(l[I.data_hora_servidor] instanceof Date) || !statusOk_(l[I.status])) continue;
    if (filtro.idColaborador && String(idc) !== String(filtro.idColaborador)) continue;
    var dia = diaStr_(l[I.data_hora_servidor]);
    var k = idc + '|' + dia;
    (grupos[k] = grupos[k] || { idc: idc, dia: dia, linhas: [] }).linhas.push(l);
  }

  Object.keys(grupos).sort().forEach(function (k) {
    var g = grupos[k], col = colabs[g.idc] || {}, dia = g.dia;
    var j = jornadaDia_(jorn[col.id_jornada], dia);
    var sab = diaSemana_(dia) === 6;
    g.linhas.sort(function (x, y) { return x[I.data_hora_servidor] - y[I.data_hora_servidor]; });

    var primeira = {}, obs = [], ajustes = [];
    g.linhas.forEach(function (l) {
      var t = l[I.tipo];
      if (!primeira[t]) primeira[t] = l;
      if (l[I.observacao]) obs.push(String(l[I.observacao]));
    });
    var t = function (tipo) { return primeira[tipo] ? primeira[tipo][I.data_hora_servidor] : null; };
    var ent = t('ENTRADA'), si = t('SAIDA_INTERVALO'), vi = t('VOLTA_INTERVALO'), sai = t('SAIDA');

    var horas = null, saldo = 0, pagos = 0, salario = 0, passagem = 0, pend = [];
    var almoco = (si && vi) ? (vi - si) / 3.6e6 : null;
    var pagar = function (comPassagem) {
      pagos++;
      salario += salarioDia_(col, dia, fer, cfgCalc);
      if (comPassagem) passagem += Number(col.passagem_dia) || 0;
    };

    // Linha "4-Saída Para Casa"
    if (sai) {
      var obsSaida = normalizar_(primeira.SAIDA[I.observacao]);
      var obsDia = obs.map(normalizar_);
      var comeca = function (txt) { return obsSaida === txt || obsDia.some(function (o) { return o.indexOf(txt) === 0; }); };
      var abonarHoras = comeca('abonar horas');
      var abonarAlmoco = comeca('abonar almoco');
      if (ent) {
        horas = (sai - ent) / 3.6e6 - (almoco || 0);
        if (abonarHoras) saldo += 0;
        else if (abonarAlmoco) saldo += horas - j - 1;
        else saldo += horas - j;
        pagar(true);
      } else pend.push('Falta entrada');
    } else if (ent && dia < diaStr_(new Date())) pend.push('Falta saída');
    if (si && !vi) pend.push('Falta retorno do almoço');

    // Linhas de ajuste (cada linha conta separado, como no legado)
    g.linhas.forEach(function (l) {
      var df = defs[l[I.tipo]];
      if (!df || !df.horas_modo || !df.saldo_modo) return;   // batidas, anotações e tipos sem parâmetros
      var info = Number(l[I.ajuste_horas]) || 0, h = 0;
      if (df.horas_modo === 'JORNADA') h = j;
      else if (df.horas_modo === 'METADE') h = j / 2;
      else if (df.horas_modo === 'NEG_JORNADA') h = -j;
      else if (df.horas_modo === 'INFORMADO') h = info;
      if (df.horas_modo !== 'NENHUMA') horas = (horas || 0) + h;
      var ds = 0;
      if (df.saldo_modo === 'HORAS') ds = df.horas_modo === 'NENHUMA' ? info : h;
      else if (df.saldo_modo === 'HORAS_MENOS_JORNADA') ds = h - j;
      else if (df.saldo_modo === 'INFORMADO') ds = info;
      saldo += ds;
      if (df.paga_dia === 'SIM') pagar(df.passagem === 'SIM');
      var rot = df.chip || df.rotulo || l[I.tipo];
      ajustes.push(rot + ((df.saldo_modo === 'HORAS' || df.saldo_modo === 'INFORMADO') ? ' ' + horasTxt_(ds) : ''));
    });

    res.saldoPorColab[g.idc] = (res.saldoPorColab[g.idc] || 0) + saldo;

    var mes = dia.slice(0, 7);
    if (filtro.mesIni && mes < filtro.mesIni) return;
    if (filtro.mesFim && mes > filtro.mesFim) return;
    res.dias.push({
      idColab: g.idc, nome: col.nome || g.linhas[0][I.nome], data: dia,
      entrada: horaStr_(ent), saidaInt: horaStr_(si), voltaInt: horaStr_(vi), saida: horaStr_(sai),
      almoco: almoco, horas: horas, saldo: saldo, ajustes: ajustes, obs: obs.join(' / '),
      pagos: pagos, salario: salario, passagem: passagem, pendencia: pend.join(', '),
      feriado: fer[dia] ? String(fer[dia]) : ''
    });
  });
  return res;
}

/** Gera/atualiza a aba Espelho para um mês ('yyyy-MM'). Inclui dias úteis sem registro dos ativos. */
function gerarEspelho_(mes) {
  var calc = calcular_({ mesIni: mes, mesFim: mes });
  var colabs = lerObjetos_('Colaboradores').filter(function (c) { return c.ativo === 'SIM'; });
  var fer = feriadosSet_();
  var chave = {};
  calc.dias.forEach(function (d) { chave[d.idColab + '|' + d.data] = true; });

  var p = mes.split('-'), ano = +p[0], m = +p[1];
  var hoje = diaStr_(new Date());
  colabs.forEach(function (c) {
    if (c.perfil === 'ADMIN' && !c.id_jornada) return;
    for (var d = 1; d <= 31; d++) {
      var dt = new Date(Date.UTC(ano, m - 1, d));
      if (dt.getUTCMonth() !== m - 1) break;
      var iso = mes + '-' + ('0' + d).slice(-2);
      if (iso >= hoje || dt.getUTCDay() === 0 || fer[iso] || chave[c.id + '|' + iso]) continue;
      calc.dias.push({ idColab: c.id, nome: c.nome, data: iso, entrada: '', saidaInt: '', voltaInt: '', saida: '',
        almoco: null, horas: null, saldo: 0, ajustes: [], obs: '', pagos: 0, salario: 0, passagem: 0,
        pendencia: 'SEM REGISTRO', feriado: '' });
    }
  });
  calc.dias.sort(function (x, y) { return x.nome === y.nome ? (x.data < y.data ? -1 : 1) : (x.nome < y.nome ? -1 : 1); });

  var linhas = calc.dias.map(function (d) {
    return [mes, +d.data.slice(8) <= 15 ? '1ª QUINZENA' : '2ª QUINZENA', d.data.split('-').reverse().join('/'),
      ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][diaSemana_(d.data)], d.nome,
      d.entrada, d.saidaInt, d.voltaInt, d.saida, horasTxt_(d.almoco), horasTxt_(d.horas), horasTxt_(d.saldo),
      d.ajustes.join(', '), d.obs, arred_(d.salario), arred_(d.passagem), d.pendencia];
  });

  var a = aba_('Espelho');
  if (a.getLastRow() > 1) a.getRange(2, 1, a.getLastRow() - 1, CAB.Espelho.length).clearContent();
  if (linhas.length) a.getRange(2, 1, linhas.length, CAB.Espelho.length).setValues(linhas);
  return { linhas: linhas.length };
}

/** Fechamento do mês por colaborador e quinzena em uma aba nova "Fechamento yyyy-MM". */
function gerarFechamento_(mes) {
  var calcTudo = calcular_({});
  var porColab = {};
  var saldoAteFim = {};
  calcTudo.dias.forEach(function (d) {
    var mesD = d.data.slice(0, 7);
    if (mesD <= mes) saldoAteFim[d.idColab] = (saldoAteFim[d.idColab] || 0) + d.saldo;
    if (mesD !== mes) return;
    var q = +d.data.slice(8) <= 15 ? 1 : 2;
    var k = d.nome + '|' + q;
    var o = porColab[k] = porColab[k] || { nome: d.nome, id: d.idColab, q: q, dias: 0, horas: 0, saldo: 0, salario: 0, passagem: 0, pend: 0 };
    o.dias += d.pagos; o.horas += d.horas || 0; o.saldo += d.saldo; o.salario += d.salario; o.passagem += d.passagem;
    if (d.pendencia) o.pend++;
  });
  var nome = 'Fechamento ' + mes;
  var s = ss_();
  var a = s.getSheetByName(nome);
  if (a) a.clear(); else a = s.insertSheet(nome);
  var cab = ['Colaborador', 'Quinzena', 'Dias pagos', 'Horas trabalhadas', 'Saldo banco no período',
    'Banco acumulado até o fim do mês', 'Total salário', 'Total passagem', 'Dias com pendência'];
  var linhas = Object.keys(porColab).sort().map(function (k) {
    var o = porColab[k];
    return [o.nome, o.q + 'ª QUINZENA', o.dias, horasTxt_(o.horas), horasTxt_(o.saldo),
      horasTxt_(saldoAteFim[o.id] || 0), arred_(o.salario), arred_(o.passagem), o.pend];
  });
  a.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
  if (linhas.length) {
    a.getRange(2, 1, linhas.length, cab.length).setValues(linhas);
    a.getRange(2, 7, linhas.length, 2).setNumberFormat('"R$" #,##0.00');
  }
  a.setFrozenRows(1);
  a.autoResizeColumns(1, cab.length);
  gerarEspelho_(mes);
  return { aba: nome, linhas: linhas.length, url: s.getUrl() + '#gid=' + a.getSheetId() };
}
