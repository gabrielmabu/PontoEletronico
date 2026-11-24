// Teste local do cálculo de ajustes (stubs do Apps Script). Uso: node teste-calculo.js
const fs = require('fs'), vm = require('vm');
const ctx = {
  console, Date, Math, Number, String, Object, Array, JSON, isNaN,
  Utilities: {
    formatDate(d, tz, f) { // America/Recife = UTC-3 fixo
      const x = new Date(d.getTime() - 3 * 3600e3), p = n => ('0' + n).slice(-2);
      const m = { yyyy: x.getUTCFullYear(), MM: p(x.getUTCMonth() + 1), dd: p(x.getUTCDate()), HH: p(x.getUTCHours()), mm: p(x.getUTCMinutes()), ss: p(x.getUTCSeconds()) };
      return f.replace(/yyyy|MM|dd|HH|mm|ss/g, k => m[k]);
    }
  },
  CacheService: { getScriptCache: () => ({ get() { return null; }, remove() {}, put() {}, putAll() {}, getAll() { return {}; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
};
vm.createContext(ctx);
['Util.gs', 'Ponto.gs', 'Calculo.gs', 'Ajustes.gs'].forEach(f => vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..') + '/' + f, 'utf8'), ctx, { filename: f }));

const D = (iso, hm) => new Date(iso + 'T' + hm + ':00-03:00');
const colab = { id: 'C1', nome: 'Teste', id_jornada: 'PADRAO', salario_padrao: 1800, passagem_dia: 8.2, abono_qtd: 0, desconto_pct: '', ativo: 'SIM' };
let linhas = [];
const B = ctx.CAB.Batidas;
function lin(tipo, iso, hm, extra) {
  const o = Object.assign({ id: Math.random(), id_colaborador: 'C1', nome: 'Teste', tipo, data_hora_servidor: D(iso, hm), status: 'OK' }, extra || {});
  return B.map(c => o[c] === undefined ? '' : o[c]);
}
vm.runInContext(`
  var __linhas = [];
  function aba_(n) { return { getLastRow: function () { return n === 'Batidas' ? __linhas.length + 1 : 1; }, getRange: function () { return { getValues: function () { return __linhas; } }; } }; }
  function lerObjetos_(n) {
    if (n === 'Colaboradores') return [__colab];
    if (n === 'Jornadas') return [{ id_jornada: 'PADRAO', horas_seg_sex: 8, horas_sabado: 4, horas_domingo: 8 }];
    if (n === 'Feriados') return [];
    if (n === 'TiposAjuste') return TIPOS_PADRAO.map(function (t) { return Object.assign({}, t); });
    return [];
  }
  function cfg_(k, p) { return p; }
`, ctx);
ctx.__colab = colab;

function dia(batidas, iso) {
  ctx.__linhas = batidas;
  const r = vm.runInContext('calcularBruto_({})', ctx);
  return r.dias.filter(d => d.data === iso)[0];
}
const QUA = '2026-11-04', SAB = '2026-11-07';   // quarta e sábado
let falhas = 0;
function esperar(nome, d, exp) {
  const ok = Object.keys(exp).every(k => JSON.stringify(d[k]) === JSON.stringify(exp[k]));
  if (!ok) falhas++;
  console.log((ok ? 'OK    ' : 'FALHA ') + nome, ok ? '' : JSON.stringify({ obtido: ['horas', 'saldo', 'pagos', 'passagem', 'ajustes'].reduce((a, k) => (a[k] = d[k], a), {}), esperado: exp }));
}
esperar('Abonar falta (qua)', dia([lin('ABONAR_FALTA', QUA, '12:00')], QUA), { horas: 8, saldo: 0, pagos: 1, passagem: 0, ajustes: ['Abonar falta'] });
esperar('Abonar falta (sáb)', dia([lin('ABONAR_FALTA', SAB, '12:00')], SAB), { horas: 4, saldo: 0, pagos: 1, passagem: 0 });
esperar('Abonar metade (qua)', dia([lin('ABONAR_METADE', QUA, '12:00')], QUA), { horas: 4, saldo: -4, pagos: 1, passagem: 8.2, ajustes: ['Abonar metade'] });
esperar('Abonar metade (sáb)', dia([lin('ABONAR_METADE', SAB, '12:00')], SAB), { horas: 2, saldo: -2, pagos: 1, passagem: 8.2 });
esperar('Folga do banco (qua)', dia([lin('RETIRAR_BANCO', QUA, '12:00')], QUA), { horas: -8, saldo: -8, pagos: 1, passagem: 0, ajustes: ['Folga do banco -8:00'] });
esperar('Folga do banco (sáb)', dia([lin('RETIRAR_BANCO', SAB, '12:00')], SAB), { horas: -4, saldo: -4, pagos: 1, passagem: 0 });
esperar('Somar 2,5h ao banco', dia([lin('ADICIONAR_BANCO', QUA, '12:00', { ajuste_horas: 2.5 })], QUA), { horas: null, saldo: 2.5, pagos: 0, passagem: 0, ajustes: ['Somar horas ao banco 2:30'] });
esperar('Tirar 1h do banco', dia([lin('ADICIONAR_BANCO', QUA, '12:00', { ajuste_horas: -1 })], QUA), { saldo: -1, pagos: 0 });
// dia normal 08:00–17:00 com 1h de almoço = 8h, saldo 0, e abonos combinados
const normal = [lin('ENTRADA', QUA, '08:00'), lin('SAIDA_INTERVALO', QUA, '12:00'), lin('VOLTA_INTERVALO', QUA, '13:00'), lin('SAIDA', QUA, '17:00')];
esperar('Dia normal', dia(normal, QUA), { horas: 8, saldo: 0, pagos: 1, passagem: 8.2 });
esperar('Dia normal + abonar metade', dia(normal.concat([lin('ABONAR_METADE', QUA, '12:00')]), QUA), { horas: 12, saldo: -4, pagos: 2 });
esperar('Saída 16h (-1h) + Abonar Horas', dia([lin('ENTRADA', QUA, '08:00'), lin('SAIDA_INTERVALO', QUA, '12:00'), lin('VOLTA_INTERVALO', QUA, '13:00'), lin('SAIDA', QUA, '16:00', { observacao: 'Abonar Horas - consulta' })], QUA), { horas: 7, saldo: 0 });
esperar('Sem almoço + Abonar Almoço', dia([lin('ENTRADA', QUA, '08:00'), lin('SAIDA', QUA, '17:00', { observacao: 'Abonar Almoço' })], QUA), { horas: 9, saldo: 0 });

// tipo personalizado: "Abonar 2h (consulta)" = horas informadas, banco recebe o mesmo, não paga dia
ctx.TIPOS_PADRAO.push({ codigo: 'X1', rotulo: 'Abonar 2h', chip: 'Abonar 2h', horas_modo: 'INFORMADO', saldo_modo: 'HORAS', paga_dia: 'NÃO', passagem: 'NÃO', sistema: 'PERSONALIZADO', ativo: 'SIM' });
const saida6 = [lin('ENTRADA', QUA, '08:00'), lin('SAIDA_INTERVALO', QUA, '12:00'), lin('VOLTA_INTERVALO', QUA, '13:00'), lin('SAIDA', QUA, '15:00')];
esperar('Personalizado: saiu 15h (−2h) + abonar 2h', dia(saida6.concat([lin('X1', QUA, '12:00', { ajuste_horas: 2 })]), QUA), { horas: 8, saldo: 0, pagos: 1, ajustes: ['Abonar 2h 2:00'] });
console.log(falhas ? falhas + ' FALHA(S)' : 'Tudo certo');
process.exit(falhas ? 1 : 0);
