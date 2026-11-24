/** Painel ao vivo (batidas do dia) e fechamento na tela com detalhamento por colaborador. */

/** Batidas de um dia ('yyyy-MM-dd'), agrupadas por colaborador ativo. */
function apiAdminHoje(token, dia) {
  sessao_(token, true);
  var agora = new Date();
  var hoje = diaStr_(agora);
  dia = /^\d{4}-\d{2}-\d{2}$/.test(dia || '') ? dia : hoje;

  var a = aba_('Batidas'), n = a.getLastRow();
  var B = CAB.Batidas, I = {}; B.forEach(function (h, i) { I[h] = i; });
  // Hoje: só as últimas linhas (rápido). Outro dia: a aba inteira.
  var ini = dia === hoje ? Math.max(2, n - 800) : 2;
  var dados = n >= 2 ? a.getRange(ini, 1, n - ini + 1, B.length).getValues() : [];

  var defsT = tiposAjusteMapa_();
  var cols = lerObjetos_('Colaboradores').filter(function (c) { return c.login !== 'admin'; });
  var por = {};
  cols.forEach(function (c) { por[c.id] = { id: c.id, nome: c.nome, ativo: c.ativo === 'SIM', bat: {}, recusadas: [], ajustes: [] }; });

  dados.forEach(function (l) {
    var d = l[I.data_hora_servidor];
    if (!(d instanceof Date) || diaStr_(d) !== dia) return;
    var p = por[l[I.id_colaborador]];
    if (!p) return;
    var st = String(l[I.status] || '');
    var tipo = l[I.tipo];
    if (st.indexOf('RECUSADA') === 0) {
      p.recusadas.push({ hora: horaStr_(d), tipo: NOME_TIPO[tipo] || tipo, motivo: st.replace('RECUSADA: ', ''), selfie: l[I.link_selfie] });
    } else if (statusOk_(st)) {
      if (SEQ_TIPOS.indexOf(tipo) >= 0) {
        if (!p.bat[tipo]) p.bat[tipo] = { hora: horaStr_(d), selfie: l[I.link_selfie], dist: l[I.distancia_loja_m], origem: String(l[I.origem] || '') };
      } else p.ajustes.push(((defsT[tipo] && (defsT[tipo].chip || defsT[tipo].rotulo)) || NOME_TIPO[tipo] || tipo) + (l[I.observacao] ? ' (' + l[I.observacao] + ')' : ''));
    }
  });

  var cont = { trabalhando: 0, almoco: 0, saiu: 0, ausente: 0, abonado: 0 };
  var lista = Object.keys(por).map(function (id) { return por[id]; })
    .filter(function (p) { return p.ativo || Object.keys(p.bat).length || p.recusadas.length; })
    .map(function (p) {
      var b = p.bat, status;
      if (b.SAIDA) status = 'Saiu';
      else if (b.SAIDA_INTERVALO && !b.VOLTA_INTERVALO) status = 'No almoço';
      else if (b.ENTRADA) status = 'Trabalhando';
      else if (p.ajustes.length) status = 'Abonado';
      else status = 'Sem registro';
      var k = { 'Saiu': 'saiu', 'No almoço': 'almoco', 'Trabalhando': 'trabalhando', 'Abonado': 'abonado', 'Sem registro': 'ausente' }[status];
      cont[k]++;
      return { id: p.id, nome: p.nome, status: status, entrada: b.ENTRADA || null, saidaInt: b.SAIDA_INTERVALO || null,
        voltaInt: b.VOLTA_INTERVALO || null, saida: b.SAIDA || null, recusadas: p.recusadas, ajustes: p.ajustes };
    })
    .sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); });

  var fer = feriadosSet_();
  return { dia: dia, ehHoje: dia === hoje, atualizado: horaStr_(agora) + ':' + Utilities.formatDate(agora, TZ, 'ss'),
    semana: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][diaSemana_(dia)],
    feriado: fer[dia] ? String(fer[dia]) : '', contagem: cont, lista: lista };
}

/** Alertas de um dia do espelho, para achar oportunidades de ajuste. */
function alertasDia_(x, nota) {
  var al = [];
  if (nota === 'SEM REGISTRO') al.push('Sem registro');
  if (!x) return al;
  if (x.pendencia) al.push(x.pendencia);
  if (x.almoco !== null && x.almoco < 50 / 60) al.push('Almoço curto (' + horasTxt_(x.almoco) + ')');
  if (x.almoco !== null && x.almoco > 1.5) al.push('Almoço longo (' + horasTxt_(x.almoco) + ')');
  if (x.saldo <= -0.5 && !x.ajustes.length) al.push('Saldo negativo');
  if (x.saldo >= 1 && !x.ajustes.length) al.push('Hora a mais');
  return al;
}

/** Resumo do fechamento na tela, com os dias de cada colaborador para o "+". */
function apiAdminFechamentoTela(token, mes) {
  sessao_(token, true);
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('Mês inválido.');
  var calc = calcular_({});
  var diasMes = calc.dias.filter(function (d) { return d.data.slice(0, 7) === mes; });
  var bancoAte = {}, comReg = {};
  calc.dias.forEach(function (d) { if (d.data.slice(0, 7) <= mes) bancoAte[d.idColab] = (bancoAte[d.idColab] || 0) + d.saldo; });
  diasMes.forEach(function (d) { comReg[d.idColab] = true; });

  var cols = lerObjetos_('Colaboradores').filter(function (c) { return c.login !== 'admin' && (comReg[c.id] || c.ativo === 'SIM'); })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  var tg = { sal: 0, pas: 0, alertas: 0, bancoNeg: 0 };
  var limBanco = Number(cfg_('alerta_banco_negativo_h', 8));
  var saldoMes = {};
  calc.dias.forEach(function (d) { var k = d.idColab + '|' + d.data.slice(0, 7); saldoMes[k] = (saldoMes[k] || 0) + d.saldo; });
  var mesesAte = function (m, n) { var p = m.split('-'), a = +p[0], b = +p[1], out = []; for (var i = n - 1; i >= 0; i--) { var x = new Date(Date.UTC(a, b - 1 - i, 1)); out.push(x.getUTCFullYear() + '-' + ('0' + (x.getUTCMonth() + 1)).slice(-2)); } return out; };

  var lista = cols.map(function (c) {
    var e = espelhoColabMes_(c, mes, diasMes, bancoAte[c.id]);
    var q = [{ dias: 0, horas: 0, saldo: 0, sal: 0, pas: 0 }, { dias: 0, horas: 0, saldo: 0, sal: 0, pas: 0 }];
    var alertas = 0;
    var dias = e.dias.map(function (d, i) {
      var x = d.x, qi = i < 15 ? 0 : 1;
      if (x) { var t = q[qi]; t.dias += x.pagos; t.horas += x.horas || 0; t.saldo += x.saldo; t.sal += x.salario; t.pas += x.passagem; }
      var al = alertasDia_(x, d.nota);
      alertas += al.length ? 1 : 0;
      return { iso: mes + '-' + d.data.slice(0, 2), data: d.data, sem: d.sem, cinza: d.cinza,
        entrada: x ? x.entrada : '', saidaInt: x ? x.saidaInt : '', voltaInt: x ? x.voltaInt : '', saida: x ? x.saida : '',
        horas: x ? horasTxt_(x.horas) : '', saldo: x ? horasTxt_(x.saldo) : '', saldoNum: x ? arred_(x.saldo) : 0, salario: x ? arred_(x.salario) : 0,
        nota: d.nota, alertas: al };
    });
    tg.alertas += alertas;
    var quinz = q.map(function (t) {
      tg.sal += t.sal; tg.pas += t.pas;
      return { dias: t.dias, horas: horasTxt_(t.horas), saldo: horasTxt_(t.saldo), sal: arred_(t.sal), pas: arred_(t.pas), total: arred_(t.sal + t.pas) };
    });
    var bn = bancoAte[c.id] || 0, negativo = bn <= -limBanco;
    if (negativo) tg.bancoNeg++;
    var evolucao = mesesAte(mes, 6).map(function (m) { return { mes: nomeMes_(m), saldo: horasTxt_(saldoMes[c.id + '|' + m] || 0), neg: (saldoMes[c.id + '|' + m] || 0) < 0 }; });
    return { id: c.id, nome: c.nome, ativo: c.ativo === 'SIM', banco: horasTxt_(bn), bancoNum: arred_(bn), bancoNegativo: negativo, evolucao: evolucao,
      q: quinz, total: arred_(quinz[0].total + quinz[1].total), alertas: alertas, dias: dias };
  });

  var hoje = diaStr_(new Date());
  return { mes: mes, nomeMes: nomeMes_(mes), emAndamento: hoje.slice(0, 7) === mes, lista: lista,
    limiteBanco: limBanco,
    total: { sal: arred_(tg.sal), pas: arred_(tg.pas), geral: arred_(tg.sal + tg.pas), alertas: tg.alertas, bancoNeg: tg.bancoNeg } };
}
