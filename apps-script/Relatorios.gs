/** PDFs: espelho de ponto (um ou todos os colaboradores) e fechamento do mês. Salvos no Drive. */

var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function empresa_() { var n = String(cfg_('nome_empresa', '')); return (!n || n === 'Ponto') ? 'Luciana Noivas' : n; }
function cabecalhoPdf_(titulo, sub) {
  return '<table class="cabt"><tr><td class="logo"><img src="' + logoDataUri_() + '"></td><td><h1>' + titulo + '</h1><h2>' + sub + '</h2></td></tr></table>';
}
function nomeMes_(mes) { var p = mes.split('-'); return MESES[+p[1] - 1] + '/' + p[0]; }
function reais_(v) { return 'R$ ' + (Math.round((v || 0) * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function h_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** Todos os dias do mês de um colaborador, com domingos, feriados e dias sem registro. */
function espelhoColabMes_(col, mes, calcDias, saldoTotal) {
  var fer = feriadosSet_();
  var por = {};
  calcDias.forEach(function (d) { if (String(d.idColab) === String(col.id)) por[d.data] = d; });
  var p = mes.split('-'), ano = +p[0], m = +p[1], hoje = diaStr_(new Date());
  var dias = [], tot = { horas: 0, saldo: 0, salario: 0, passagem: 0, dias: 0, semRegistro: 0 };
  for (var d = 1; d <= 31; d++) {
    var dt = new Date(Date.UTC(ano, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) break;
    var iso = mes + '-' + ('0' + d).slice(-2), ds = dt.getUTCDay();
    var x = por[iso];
    var nota = '';
    if (x) {
      tot.horas += x.horas || 0; tot.saldo += x.saldo; tot.salario += x.salario; tot.passagem += x.passagem; tot.dias += x.pagos;
      nota = [x.ajustes.join(', '), x.obs, x.pendencia].filter(Boolean).join(' · ');
    } else if (fer[iso]) nota = 'Feriado: ' + fer[iso];
    else if (ds === 0) nota = 'Domingo';
    else if (iso < hoje) { nota = 'SEM REGISTRO'; tot.semRegistro++; }
    dias.push({ data: ('0' + d).slice(-2) + '/' + ('0' + m).slice(-2), sem: DIAS_SEM[ds], x: x || null, nota: nota, cinza: !x && (ds === 0 || !!fer[iso]) });
  }
  return { dias: dias, tot: tot, banco: saldoTotal || 0 };
}

var CSS_PDF = '<style>' +
  'body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#222;margin:0}' +
  'h1{font-size:13pt;margin:0 0 2px}h2{font-size:10pt;margin:0 0 8px;font-weight:normal;color:#555}' +
  'table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#70122D;color:#fff;font-size:8pt;padding:4px 3px;text-align:left}' +
  'td{border-bottom:1px solid #ddd;padding:3px;font-size:8.5pt}tr.c td{background:#f2f2f2;color:#777}' +
  '.tot td{font-weight:bold;border-top:2px solid #70122D;background:#faf5f8}.neg{color:#c0392b}' +
  '.ass{margin-top:40px;width:100%}.ass td{border:0;text-align:center;padding-top:30px;font-size:8.5pt}' +
  '.ass span{display:block;border-top:1px solid #333;margin:0 20px;padding-top:3px}' +
  '.qb{page-break-before:always}.cabt{margin:0 0 8px;border-bottom:2px solid #70122D}.cabt td{border:0;vertical-align:middle;padding:0 0 6px}.cabt .logo{width:120px}.cabt img{width:110px;border-radius:4px}' +
  '.mut{color:#777;font-size:8pt}</style>';

function htmlEspelho_(col, mes, e, primeiro) {
  var neg = function (t) { return String(t).charAt(0) === '-' ? ' class="neg"' : ''; };
  var linhas = e.dias.map(function (d) {
    var x = d.x || {};
    return '<tr' + (d.cinza ? ' class="c"' : '') + '><td>' + d.data + '</td><td>' + d.sem + '</td><td>' + h_(x.entrada) + '</td><td>' + h_(x.saidaInt) +
      '</td><td>' + h_(x.voltaInt) + '</td><td>' + h_(x.saida) + '</td><td>' + (d.x ? horasTxt_(x.horas) : '') + '</td><td' + neg(horasTxt_(x.saldo)) + '>' +
      (d.x ? horasTxt_(x.saldo) : '') + '</td><td>' + h_(d.nota) + '</td></tr>';
  }).join('');
  var t = e.tot;
  return '<div' + (primeiro ? '' : ' class="qb"') + '>' + cabecalhoPdf_('Espelho de ponto — ' + h_(col.nome), h_(empresa_()) + ' · ' + nomeMes_(mes) + ' · Jornada: seg a sex 8h, sábado 4h') +
    '<table><tr><th>Dia</th><th></th><th>Entrada</th><th>Saída alm.</th><th>Retorno</th><th>Saída</th><th>Trabalhadas</th><th>Saldo</th><th>Ocorrências</th></tr>' +
    linhas + '<tr class="tot"><td colspan="6">Totais do mês · ' + t.dias + ' dias pagos' + (t.semRegistro ? ' · ' + t.semRegistro + ' dia(s) sem registro' : '') +
    '</td><td>' + horasTxt_(t.horas) + '</td><td' + neg(horasTxt_(t.saldo)) + '>' + horasTxt_(t.saldo) + '</td><td>Banco acumulado: ' + horasTxt_(e.banco) + '</td></tr></table>' +
    '<p class="mut">Salário do mês: ' + reais_(t.salario) + ' · Passagem: ' + reais_(t.passagem) + ' · Emitido em ' + dataHoraStr_(new Date()) + '</p>' +
    '<table class="ass"><tr><td><span>' + h_(col.nome) + '</span></td><td><span>Responsável</span></td></tr></table></div>';
}

function salvarPdf_(html, nomeArq) {
  var blob = Utilities.newBlob('<html><head><meta charset="utf-8">' + CSS_PDF + '</head><body>' + html + '</body></html>', 'text/html', 'r.html')
    .getAs('application/pdf').setName(nomeArq);
  var pasta = subpastaMes_(pastaPorConfig_('pasta_relatorios_id', 'Ponto Facial - Relatórios'), new Date());
  var f = pasta.createFile(blob);
  return { url: f.getUrl(), nome: nomeArq };
}

/** idColab = id de um colaborador ou 'TODOS' (ativos + quem teve registro no mês). */
function apiAdminPdfEspelho(token, idColab, mes) {
  var adm = sessao_(token, true);
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('Mês inválido.');
  var todos = idColab === 'TODOS';
  var calc = calcular_(todos ? {} : { idColaborador: idColab });
  var diasMes = calc.dias.filter(function (d) { return d.data.slice(0, 7) === mes; });
  var bancoAte = {};
  calc.dias.forEach(function (d) { if (d.data.slice(0, 7) <= mes) bancoAte[d.idColab] = (bancoAte[d.idColab] || 0) + d.saldo; });
  var comReg = {};
  diasMes.forEach(function (d) { comReg[d.idColab] = true; });
  var cols = lerObjetos_('Colaboradores').filter(function (c) {
    if (c.login === 'admin') return false;
    return todos ? (c.ativo === 'SIM' || comReg[c.id]) : String(c.id) === String(idColab);
  }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  if (!cols.length) throw new Error('Nenhum colaborador para esse mês.');
  var html = cols.map(function (c, i) { return htmlEspelho_(c, mes, espelhoColabMes_(c, mes, diasMes, bancoAte[c.id]), i === 0); }).join('');
  var r = salvarPdf_(html, 'Espelho ' + mes + ' - ' + (todos ? 'Todos' : cols[0].nome) + '.pdf');
  log_(adm.login, 'PDF_ESPELHO', mes + ' ' + (todos ? 'TODOS' : cols[0].login));
  return r;
}

function apiAdminPdfFechamento(token, mes) {
  var adm = sessao_(token, true);
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('Mês inválido.');
  var calc = calcular_({});
  var porColab = {}, bancoAte = {};
  calc.dias.forEach(function (d) {
    var mesD = d.data.slice(0, 7);
    if (mesD <= mes) bancoAte[d.idColab] = (bancoAte[d.idColab] || 0) + d.saldo;
    if (mesD !== mes) return;
    var q = +d.data.slice(8) <= 15 ? 0 : 1;
    var o = porColab[d.idColab] = porColab[d.idColab] || { nome: d.nome, q: [{ dias: 0, horas: 0, saldo: 0, sal: 0, pas: 0 }, { dias: 0, horas: 0, saldo: 0, sal: 0, pas: 0 }] };
    var x = o.q[q];
    x.dias += d.pagos; x.horas += d.horas || 0; x.saldo += d.saldo; x.sal += d.salario; x.pas += d.passagem;
  });
  var ids = Object.keys(porColab).sort(function (a, b) { return porColab[a].nome < porColab[b].nome ? -1 : 1; });
  if (!ids.length) throw new Error('Sem registros nesse mês.');
  var tg = { sal: 0, pas: 0 };
  var linhas = ids.map(function (id) {
    var o = porColab[id];
    return [0, 1].map(function (q) {
      var x = o.q[q]; tg.sal += x.sal; tg.pas += x.pas;
      return '<tr><td>' + (q === 0 ? '<b>' + h_(o.nome) + '</b>' : '') + '</td><td>' + (q + 1) + 'ª quinzena</td><td>' + x.dias + '</td><td>' +
        horasTxt_(x.horas) + '</td><td>' + horasTxt_(x.saldo) + '</td><td>' + (q === 1 ? horasTxt_(bancoAte[id] || 0) : '') + '</td><td>' +
        reais_(x.sal) + '</td><td>' + reais_(x.pas) + '</td><td><b>' + reais_(x.sal + x.pas) + '</b></td></tr>';
    }).join('');
  }).join('');
  var html = cabecalhoPdf_('Fechamento de ponto — ' + nomeMes_(mes), h_(empresa_())) +
    '<table><tr><th>Colaborador</th><th>Período</th><th>Dias pagos</th><th>Horas</th><th>Saldo banco</th><th>Banco acumulado</th><th>Salário</th><th>Passagem</th><th>Total</th></tr>' +
    linhas + '<tr class="tot"><td colspan="6">Total geral</td><td>' + reais_(tg.sal) + '</td><td>' + reais_(tg.pas) + '</td><td>' + reais_(tg.sal + tg.pas) + '</td></tr></table>' +
    '<p class="mut">1ª quinzena = metade do salário ÷ dias úteis (1 a 15). 2ª quinzena = salário restante (com desconto e abonos) ÷ dias úteis (16 ao fim). ' +
    'Dias úteis = segunda a sábado, menos feriados. Emitido em ' + dataHoraStr_(new Date()) + '.</p>' +
    '<table class="ass"><tr><td><span>Responsável</span></td><td><span>Financeiro / RH</span></td></tr></table>';
  var r = salvarPdf_(html, 'Fechamento ' + mes + '.pdf');
  log_(adm.login, 'PDF_FECHAMENTO', mes);
  return r;
}
