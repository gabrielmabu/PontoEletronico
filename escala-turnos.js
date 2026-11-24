/* Gerador de escala por turnos (3 turnos, descanso mínimo entre jornadas, cobertura por função).
 *
 * Como funciona (sem biblioteca externa, roda no navegador e no Node):
 *  1) cada função (cargo) é resolvida separadamente;
 *  2) começa por uma montagem gulosa dia a dia e melhora por busca local (recozimento simulado) com semente fixa → o mesmo
 *     pedido gera sempre a mesma escala;
 *  3) regras DURAS nunca são quebradas: descanso mínimo entre turnos (CLT art. 66, 11 h), folgas na semana (EC 141/2026),
 *     limite de horas na semana, máximo de dias seguidos, turnos permitidos de cada pessoa, férias/indisponibilidade;
 *  4) o que não couber vira FALTA DE COBERTURA (não vira violação). Daí sai o "precisa contratar +N de <função>":
 *     mínimo teórico (conta de capacidade) e quantidade que o gerador de fato conseguiu fechar acrescentando pessoas virtuais.
 *
 * Células da grade: 'F' folga · 'X' indisponível (férias, atestado) · id do turno (ex.: 'M', 'T', 'N').
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.EscalaTurnos = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {

  var DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

  function minDe(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function hh(min) { return Math.floor(min / 60) + ':' + ('0' + (min % 60)).slice(-2); }
  function prng(seed) { var a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function isoMais(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  /** Normaliza turnos: fim <= início = vira a meia-noite; horas pagas = duração − intervalo (se não informado). */
  function turnosNorm(turnos) {
    return turnos.map(function (t, i) {
      var ini = minDe(t.ini), fim = minDe(t.fim);
      if (ini === null || fim === null) throw new Error('Turno "' + (t.nome || i + 1) + '": informe início e fim (hh:mm).');
      if (fim <= ini) fim += 1440;
      var dur = fim - ini;
      var horas = t.horas !== undefined && t.horas !== '' && t.horas !== null ? Math.round(Number(t.horas) * 60) : dur - (dur > 360 ? 60 : 0);
      return { id: String(t.id || 'T' + (i + 1)), nome: t.nome || ('Turno ' + (i + 1)), ini: ini, fim: fim, dur: dur, horas: Math.max(0, Math.min(dur, horas)) };
    });
  }

  /** Matriz de transições entre dias seguidos: ok[a][b] = descanso suficiente entre fim de a (dia d) e início de b (dia d+1). */
  function matrizDescanso(T, descansoH) {
    var ok = [];
    for (var a = 0; a < T.length; a++) { ok[a] = []; for (var b = 0; b < T.length; b++) ok[a][b] = (1440 + T[b].ini) - T[a].fim >= descansoH * 60; }
    return ok;
  }

  function explicaTransicoes(T, descansoH) {
    var ok = matrizDescanso(T, descansoH), proibidas = [];
    for (var a = 0; a < T.length; a++) for (var b = 0; b < T.length; b++) if (!ok[a][b]) {
      var gap = (1440 + T[b].ini) - T[a].fim;
      proibidas.push({ de: T[a].id, para: T[b].id, descanso_min: gap, texto: T[a].nome + ' → ' + T[b].nome + ' no dia seguinte: só ' + hh(Math.max(0, gap)) + ' h de descanso (mínimo ' + descansoH + ' h)' });
    }
    return proibidas;
  }

  /* ---------------- núcleo: uma função (cargo) ---------------- */
  function resolverFuncao(ctx, pessoas, demanda, semente) {
    var T = ctx.T, K = T.length, D = ctx.D, P = pessoas.length, rnd = prng(semente);
    var okTr = ctx.ok, maxDiasSem = Math.max(0, 7 - ctx.folgasSemana), maxSeg = ctx.maxSeguidos, capMin = ctx.horasSemanaMin;
    var g = [], i, d, p, t;
    for (p = 0; p < P; p++) { g[p] = []; for (d = 0; d < D; d++) g[p][d] = pessoas[p].indisp && pessoas[p].indisp[ctx.dias[d]] ? -1 : 0; }
    var permit = pessoas.map(function (x) { return T.map(function (s) { return !x.turnos || x.turnos.indexOf(s.id) >= 0; }); });
    var need = [], cnt = [];                                   // need[d][t] / cnt[d][t]
    for (d = 0; d < D; d++) { need[d] = []; cnt[d] = []; var dw = ctx.dow[d]; for (t = 0; t < K; t++) { need[d][t] = Number((demanda[T[t].id] || [])[dw]) || 0; cnt[d][t] = 0; } }
    var cntS = [], cntFim = [];                                // por pessoa: quantos de cada turno / quantos fins de semana
    for (p = 0; p < P; p++) { cntS[p] = T.map(function () { return 0; }); cntFim[p] = 0; }

    function sh(p, d) { var v = d < 0 || d >= D ? 0 : g[p][d]; return v > 0 ? v : 0; }   // turno 1..K ou 0
    function weekOk(p, w) {                                    // dias e horas da semana w respeitam o limite
      var n = 0, h = 0;
      for (var x = w * 7; x < w * 7 + 7; x++) { var v = g[p][x]; if (v > 0) { n++; h += T[v - 1].horas; } }
      return n <= maxDiasSem && h <= capMin;
    }
    function cellOk(p, d) {                                    // célula (já aplicada) respeita as regras duras
      var v = g[p][d]; if (v <= 0) return true;
      if (!permit[p][v - 1]) return false;
      var a = sh(p, d - 1), b = sh(p, d + 1);
      if (a && !okTr[a - 1][v - 1]) return false;
      if (b && !okTr[v - 1][b - 1]) return false;
      var run = 1, x = d - 1; while (x >= 0 && g[p][x] > 0) { run++; x--; }
      x = d + 1; while (x < D && g[p][x] > 0) { run++; x++; }
      if (run > maxSeg) return false;
      return weekOk(p, Math.floor(d / 7));
    }
    function dCostDem(d, t) { var c = cnt[d][t], n = need[d][t]; return c < n ? 1000 * (n - c) : 4 * (c - n); }
    function pairCost(p, d) {                                  // custo da transição entre d e d+1
      if (d < 0 || d + 1 >= D) return 0;
      var a = g[p][d], b = g[p][d + 1]; if (a <= 0 || b <= 0 || a === b) return 0;
      return b > a ? 3 : 9;                                    // rodízio para frente (M→T→N) é melhor que voltar
    }
    function weekUnder(p, w) { var n = 0, off = 0; for (var x = w * 7; x < w * 7 + 7; x++) { if (g[p][x] > 0) n++; else if (g[p][x] < 0) off++; } return Math.max(0, Math.min(maxDiasSem, 7 - off) - n) * 3; }
    function fair(p) { var s = 0; for (var k = 0; k < K; k++) s += cntS[p][k] * cntS[p][k]; return 2 * s + 1.5 * cntFim[p] * cntFim[p]; }
    function ehFim(d) { return ctx.dow[d] >= 5; }

    function aplicar(p, d, v) {                                // troca o valor da célula mantendo contadores
      var o = g[p][d]; if (o === v) return;
      if (o > 0) { cnt[d][o - 1]--; cntS[p][o - 1]--; if (ehFim(d)) cntFim[p]--; }
      if (v > 0) { cnt[d][v - 1]++; cntS[p][v - 1]++; if (ehFim(d)) cntFim[p]++; }
      g[p][d] = v;
    }
    /** Tenta um movimento (lista de {p,d,v}); devolve o delta de custo se aceito (e fica aplicado), senão desfaz e devolve null. */
    function tentar(mov, temp) {
      var antes = [], pessoasAfet = {}, demAfet = {}, semAfet = {}, pares = {}, m;
      for (i = 0; i < mov.length; i++) { m = mov[i]; if (g[m.p][m.d] < 0) return null; }
      function foto() {
        var c = 0, k;
        for (k in pessoasAfet) c += fair(+k);
        for (k in demAfet) { var pr = k.split(','); c += dCostDem(+pr[0], +pr[1]); }
        for (k in semAfet) { var q = k.split(','); c += weekUnder(+q[0], +q[1]); }
        for (k in pares) { var z = k.split(','); c += pairCost(+z[0], +z[1]); }
        return c;
      }
      for (i = 0; i < mov.length; i++) {
        m = mov[i]; pessoasAfet[m.p] = 1; semAfet[m.p + ',' + Math.floor(m.d / 7)] = 1; pares[m.p + ',' + (m.d - 1)] = 1; pares[m.p + ',' + m.d] = 1;
        var o = g[m.p][m.d]; if (o > 0) demAfet[m.d + ',' + (o - 1)] = 1; if (m.v > 0) demAfet[m.d + ',' + (m.v - 1)] = 1;
      }
      var c0 = foto();
      for (i = 0; i < mov.length; i++) { antes.push(g[mov[i].p][mov[i].d]); aplicar(mov[i].p, mov[i].d, mov[i].v); }
      var valido = true;
      for (i = 0; i < mov.length && valido; i++) valido = cellOk(mov[i].p, mov[i].d) && (mov[i].d + 1 >= D || cellOk(mov[i].p, mov[i].d + 1)) && (mov[i].d < 1 || cellOk(mov[i].p, mov[i].d - 1));
      var delta = valido ? foto() - c0 : 0;
      if (valido && (delta <= 0 || (temp > 0 && rnd() < Math.exp(-delta / temp)))) return delta;
      for (i = mov.length - 1; i >= 0; i--) aplicar(mov[i].p, mov[i].d, antes[i]);
      return null;
    }

    // 1) montagem gulosa dia a dia
    var ordemTurnos = []; for (t = 0; t < K; t++) ordemTurnos.push(t);
    ordemTurnos.sort(function (a, b) { return T[b].ini - T[a].ini; });         // turnos mais tarde primeiro (os mais difíceis)
    for (d = 0; d < D; d++) {
      var w = Math.floor(d / 7);
      ordemTurnos.forEach(function (tt) {
        while (cnt[d][tt] < need[d][tt]) {
          var melhor = -1, chave = 1e9;
          for (p = 0; p < P; p++) {
            if (g[p][d] !== 0 || !permit[p][tt]) continue;
            g[p][d] = tt + 1;
            var viavel = cellOk(p, d);
            g[p][d] = 0;
            if (!viavel) continue;
            var dias = 0; for (var x = w * 7; x < w * 7 + 7; x++) if (g[p][x] > 0) dias++;
            var k2 = dias * 10 + (sh(p, d - 1) === tt + 1 ? 0 : 3) + cntS[p][tt] * 0.5 + rnd();
            if (k2 < chave) { chave = k2; melhor = p; }
          }
          if (melhor < 0) break;
          aplicar(melhor, d, tt + 1);
        }
      });
    }

    // 2) busca local
    var iter = Math.min(ctx.iteracoesMax, Math.max(20000, 350 * P * D)), T0 = 40, T1 = 0.4;
    for (var it = 0; it < iter; it++) {
      var temp = T0 * Math.pow(T1 / T0, it / iter), r = rnd();
      p = Math.floor(rnd() * P); d = Math.floor(rnd() * D);
      if (r < 0.40) {                                                           // muda uma célula
        var v = Math.floor(rnd() * (K + 1)); tentar([{ p: p, d: d, v: v }], temp);
      } else if (r < 0.70) {                                                    // troca valores entre duas pessoas no mesmo dia
        var q = Math.floor(rnd() * P); if (q === p) continue;
        tentar([{ p: p, d: d, v: g[q][d] < 0 ? 0 : g[q][d] }, { p: q, d: d, v: g[p][d] < 0 ? 0 : g[p][d] }], temp);
      } else {                                                                  // muda o dia de trabalho (folga ↔ turno)
        var d2 = Math.floor(rnd() * D); if (d2 === d || g[p][d] <= 0 || g[p][d2] !== 0) continue;
        tentar([{ p: p, d: d, v: 0 }, { p: p, d: d2, v: rnd() < 0.7 ? g[p][d] : 1 + Math.floor(rnd() * K) }], temp);
      }
    }
    // descida final (só aceita melhoria)
    for (it = 0; it < iter / 4; it++) {
      p = Math.floor(rnd() * P); d = Math.floor(rnd() * D);
      tentar([{ p: p, d: d, v: Math.floor(rnd() * (K + 1)) }], 0);
    }

    var faltas = [], total = 0;
    for (d = 0; d < D; d++) for (t = 0; t < K; t++) if (cnt[d][t] < need[d][t]) { faltas.push({ d: d, t: t, faltam: need[d][t] - cnt[d][t] }); total += need[d][t] - cnt[d][t]; }
    return { g: g, faltas: faltas, totalFaltas: total, cnt: cnt, need: need };
  }

  /** Conta de capacidade: pessoas mínimas para cobrir a demanda da função, com 2 folgas/semana e limite de horas. */
  function minimoTeorico(ctx, demanda, nIndisponiveisPorDia) {
    var T = ctx.T, semanas = ctx.D / 7, total = 0, pico = 0, d, t;
    var maiorHora = Math.max.apply(null, T.map(function (s) { return s.horas || 1; }));
    var porSemanaPessoa = Math.min(7 - ctx.folgasSemana, Math.floor(ctx.horasSemanaMin / maiorHora), 7);
    for (d = 0; d < ctx.D; d++) {
      var dia = 0;
      for (t = 0; t < T.length; t++) dia += Number((demanda[T[t].id] || [])[ctx.dow[d]]) || 0;
      total += dia; pico = Math.max(pico, dia + ((nIndisponiveisPorDia && nIndisponiveisPorDia[d]) || 0));
    }
    if (!porSemanaPessoa) return 0;
    return Math.max(Math.ceil(total / semanas / porSemanaPessoa), pico);
  }

  /** Verificação independente da grade final (usada nos testes e para mostrar "violações": deve vir vazia). */
  function validar(ctx, pessoas, grade) {
    var T = ctx.T, porId = {}; T.forEach(function (s, i) { porId[s.id] = i; });
    var viol = [], maxDiasSem = 7 - ctx.folgasSemana;
    pessoas.forEach(function (pe) {
      var row = grade[pe.id] || [], run = 0;
      for (var d = 0; d < ctx.D; d++) {
        var c = row[d], idx = porId[c];
        if (idx === undefined) { run = 0; continue; }
        run++; if (run > ctx.maxSeguidos) viol.push(pe.nome + ': mais de ' + ctx.maxSeguidos + ' dias seguidos (' + ctx.dias[d] + ')');
        if (pe.turnos && pe.turnos.indexOf(c) < 0) viol.push(pe.nome + ': turno ' + c + ' não permitido (' + ctx.dias[d] + ')');
        var prox = porId[row[d + 1]];
        if (prox !== undefined && !ctx.ok[idx][prox]) viol.push(pe.nome + ': descanso menor que ' + ctx.descansoH + ' h entre ' + c + ' e ' + row[d + 1] + ' (' + ctx.dias[d] + ')');
      }
      for (var w = 0; w < ctx.D / 7; w++) {
        var n = 0, h = 0;
        for (var x = w * 7; x < w * 7 + 7; x++) { var ix = porId[row[x]]; if (ix !== undefined) { n++; h += T[ix].horas; } }
        if (n > maxDiasSem) viol.push(pe.nome + ': ' + n + ' dias na semana ' + (w + 1) + ' (máx. ' + maxDiasSem + ')');
        if (h > ctx.horasSemanaMin) viol.push(pe.nome + ': ' + hh(h) + ' h na semana ' + (w + 1) + ' (máx. ' + hh(ctx.horasSemanaMin) + ')');
      }
    });
    return viol;
  }

  /**
   * cfg = {
   *   inicio: 'AAAA-MM-DD' (segunda-feira), semanas: 4,
   *   turnos: [{id,nome,ini:'06:00',fim:'14:00',horas?}],
   *   descansoH: 11, maxSeguidos: 6, folgasSemana: 2, horasSemana: 42,
   *   pessoas: [{id,nome,funcao,turnos?:[ids], indisp?:{'AAAA-MM-DD':true}}],
   *   demanda: { 'Função': { M:[seg..dom], T:[...], N:[...] } },
   *   maxContratar: 8, semente: 7
   * }
   */
  function gerar(cfg) {
    var T = turnosNorm(cfg.turnos || []);
    if (!T.length) throw new Error('Cadastre pelo menos um turno.');
    var semanas = Math.max(1, Math.min(12, Number(cfg.semanas) || 4)), D = semanas * 7;
    var dias = [], dow = [];
    for (var d = 0; d < D; d++) { dias.push(isoMais(cfg.inicio, d)); dow.push(d % 7); }
    var ctx = {
      T: T, D: D, dias: dias, dow: dow, descansoH: cfg.descansoH === undefined ? 11 : Number(cfg.descansoH), ok: null,
      maxSeguidos: Number(cfg.maxSeguidos) || 6, folgasSemana: cfg.folgasSemana === undefined ? 2 : Number(cfg.folgasSemana),
      horasSemanaMin: Math.round((Number(cfg.horasSemana) || 44) * 60), iteracoesMax: cfg.iteracoesMax || 250000
    };
    ctx.ok = matrizDescanso(T, ctx.descansoH);
    var maxCont = cfg.maxContratar === undefined ? 8 : cfg.maxContratar, semente = Number(cfg.semente) || 7;
    var funcoes = {}, demanda = cfg.demanda || {};
    (cfg.pessoas || []).forEach(function (p) { (funcoes[p.funcao || 'Equipe'] = funcoes[p.funcao || 'Equipe'] || []).push(p); });
    Object.keys(demanda).forEach(function (f) { funcoes[f] = funcoes[f] || []; });

    var grade = {}, falta = [], contratar = [], resumoFuncoes = [];
    Object.keys(funcoes).forEach(function (f) {
      var pess = funcoes[f], dem = demanda[f] || {};
      var temDemanda = Object.keys(dem).some(function (k) { return (dem[k] || []).some(function (n) { return Number(n) > 0; }); });
      var indispPorDia = dias.map(function (iso) { return pess.filter(function (x) { return x.indisp && x.indisp[iso]; }).length; });
      var teor = minimoTeorico(ctx, dem, indispPorDia);
      var atual = null, fecha = null;
      if (!temDemanda) { pess.forEach(function (x) { grade[x.id] = dias.map(function (iso) { return x.indisp && x.indisp[iso] ? 'X' : 'F'; }); }); return; }
      for (var extra = 0; extra <= maxCont; extra++) {
        var lista = pess.slice();
        for (var k = 0; k < extra; k++) lista.push({ id: 'NOVO_' + f + '_' + (k + 1), nome: 'NOVO ' + (k + 1) + ' (' + f + ')', funcao: f, virtual: true });
        var rodada = null;
        for (var tent = 0; tent < 3; tent++) {                                  // 3 sementes: guarda a melhor
          var r = resolverFuncao(ctx, lista, dem, semente + tent * 101 + extra * 13);
          if (!rodada || r.totalFaltas < rodada.r.totalFaltas) rodada = { r: r, lista: lista };
          if (r.totalFaltas === 0) break;
        }
        if (extra === 0) atual = rodada;                                        // escala "como está", só com as pessoas atuais
        if (rodada.r.totalFaltas === 0) { if (extra > 0) fecha = rodada; break; }
      }
      var usar = atual;
      // grade mostrada: a atual; se faltou gente e há solução com contratação, mostra a que fecha (pessoas virtuais marcadas)
      if (atual.r.totalFaltas > 0 && fecha) usar = fecha;
      usar.lista.forEach(function (x, ip) {
        grade[x.id] = usar.r.g[ip].map(function (v) { return v < 0 ? 'X' : (v === 0 ? 'F' : T[v - 1].id); });
      });
      // faltas "como está" (com as pessoas atuais)
      var porTurno = {};
      atual.r.faltas.forEach(function (x) {
        falta.push({ funcao: f, turno: T[x.t].id, turnoNome: T[x.t].nome, iso: dias[x.d], faltam: x.faltam });
        var kk = T[x.t].id; porTurno[kk] = (porTurno[kk] || 0) + x.faltam;
      });
      var sug = atual.r.totalFaltas === 0 ? 0 : (fecha ? fecha.lista.length - pess.length : null);
      if (atual.r.totalFaltas > 0) contratar.push({
        funcao: f, atuais: pess.length, minimoTeorico: Math.max(0, teor - pess.length), sugerido: sug, naoFechou: sug === null,
        faltas: atual.r.totalFaltas, porTurno: porTurno,
        texto: sug === null
          ? 'Mesmo com +' + maxCont + ' pessoas de ' + f + ' o gerador não fechou: revise a demanda ou os turnos (descanso mínimo).'
          : 'Precisa contratar +' + sug + ' de ' + f + ' (' + atual.r.totalFaltas + ' vagas de turno sem cobertura em ' + semanas + ' semana(s); conta mínima: +' + Math.max(0, teor - pess.length) + ').'
      });
      resumoFuncoes.push({ funcao: f, pessoas: pess.length, minimoTeoricoTotal: teor });
    });

    var todas = []; Object.keys(funcoes).forEach(function (f) { funcoes[f].forEach(function (x) { todas.push(x); }); });
    var virtuais = []; Object.keys(grade).forEach(function (id) { if (id.indexOf('NOVO_') === 0) { var m = /^NOVO_(.*)_(\d+)$/.exec(id); virtuais.push({ id: id, nome: 'NOVO ' + m[2] + ' (' + m[1] + ')', funcao: m[1] }); } });
    var violacoes = validar(ctx, todas.concat(virtuais), grade);
    return { dias: dias, turnos: T, grade: grade, virtuais: virtuais, falta: falta, contratar: contratar, violacoes: violacoes,
      transicoesProibidas: explicaTransicoes(T, ctx.descansoH), resumoFuncoes: resumoFuncoes, ok: falta.length === 0 && violacoes.length === 0 };
  }

  return { gerar: gerar, validar: validar, explicaTransicoes: explicaTransicoes, minimoTeorico: minimoTeorico, DIAS: DIAS };
});
