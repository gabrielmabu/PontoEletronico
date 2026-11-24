// Testes do gerador de escala por turnos. Uso: node teste-escala-turnos.js
const E = require('./escala-turnos.js');
const turnos = [
  { id: 'M', nome: 'Manhã', ini: '06:00', fim: '14:00', horas: 8 },
  { id: 'T', nome: 'Tarde', ini: '14:00', fim: '22:00', horas: 8 },
  { id: 'N', nome: 'Noite', ini: '22:00', fim: '06:00', horas: 8 }
];
const pessoas = (n, funcao, pre) => Array.from({ length: n }, (_, i) => ({ id: pre + i, nome: pre + (i + 1), funcao }));
const dem = (m, t, n) => ({ M: Array(7).fill(m), T: Array(7).fill(t), N: Array(7).fill(n) });
const base = { inicio: '2026-12-14', semanas: 4, turnos, descansoH: 11, maxSeguidos: 6, folgasSemana: 2, horasSemana: 42, semente: 7 };
const ok = [];
const t0 = Date.now();

// 1) matriz de descanso: T→M, N→M e N→T são proibidas; as demais passam
const pro = E.explicaTransicoes(E.gerar({ ...base, semanas: 1, pessoas: [], demanda: {} }).turnos, 11).map(x => x.de + '>' + x.para).sort().join(',');
ok.push(['descanso de 11 h proíbe T→M, N→M e N→T (e só elas)', pro === 'N>M,N>T,T>M']);

// 2) 24 h com 2 por turno: 42 vagas/semana → mínimo teórico 9 pessoas (5 turnos por pessoa). Com 8 falta gente.
let r = E.gerar({ ...base, pessoas: pessoas(8, 'Operador', 'O'), demanda: { Operador: dem(2, 2, 2) } });
let c = r.contratar.find(x => x.funcao === 'Operador');
ok.push(['8 pessoas para 2x3 turnos: avisa que precisa contratar', !!c && c.sugerido >= 1]);
ok.push(['mínimo teórico = +1 (9 pessoas)', !!c && c.minimoTeorico === 1]);
ok.push(['sugestão fecha com no máximo +2', !!c && c.sugerido !== null && c.sugerido <= 2]);
ok.push(['nenhuma regra dura violada (mesmo faltando gente)', r.violacoes.length === 0]);
console.log('  8 pessoas →', c && c.texto);

// 3) 11 pessoas: cobre tudo, sem violações
r = E.gerar({ ...base, pessoas: pessoas(11, 'Operador', 'O'), demanda: { Operador: dem(2, 2, 2) } });
ok.push(['11 pessoas cobrem tudo sem pedir contratação', r.falta.length === 0 && r.contratar.length === 0]);
ok.push(['11 pessoas: sem violações de descanso/folga/horas', r.violacoes.length === 0]);
// confere independentemente: cobertura por dia/turno
let cobreTudo = true;
for (let d = 0; d < r.dias.length; d++) for (const t of ['M', 'T', 'N']) {
  const n = Object.keys(r.grade).filter(id => r.grade[id][d] === t).length; if (n < 2) cobreTudo = false;
}
ok.push(['grade realmente tem 2 pessoas em cada turno todos os dias', cobreTudo]);

// 4) férias: uma pessoa indisponível na semana 2 → continua sem violar
const ps = pessoas(11, 'Operador', 'O'); for (let d = 7; d < 14; d++) { ps[0].indisp = ps[0].indisp || {}; ps[0].indisp['2026-12-' + (14 + d)] = true; }
const ps2 = ps.map(p => ({ ...p, indisp: p.indisp && Object.fromEntries(Object.keys(p.indisp).map(k => [k, true])) }));
r = E.gerar({ ...base, pessoas: ps2, demanda: { Operador: dem(2, 2, 2) } });
ok.push(['com férias de uma pessoa: nenhuma violação', r.violacoes.length === 0]);
ok.push(['dias de férias marcados X na grade', r.grade.O0.filter(x => x === 'X').length >= 1]);

// 5) pessoa só pode fazer um turno (ex.: só manhã) → respeitado
const so = pessoas(6, 'Atendente', 'A'); so[0].turnos = ['M'];
r = E.gerar({ ...base, semanas: 2, pessoas: so, demanda: { Atendente: dem(1, 1, 0) } });
ok.push(['restrição "só manhã" respeitada', r.grade.A0.every(x => x === 'M' || x === 'F' || x === 'X')]);

// 6) duas funções independentes: só a que falta pede contratação
r = E.gerar({ ...base, semanas: 2, pessoas: [...pessoas(6, 'Operador', 'O'), ...pessoas(1, 'Supervisor', 'S')], demanda: { Operador: dem(1, 1, 1), Supervisor: dem(1, 1, 1) } });
ok.push(['só Supervisor pede contratação', r.contratar.length === 1 && r.contratar[0].funcao === 'Supervisor']);
ok.push(['Supervisor: precisa de 4 (21 vagas/5 por pessoa = 5 pessoas, 1 existente → +4)', r.contratar[0].minimoTeorico === 4]);

// 7) comércio: 1 turno 09–18, 7 dias, 4 pessoas, 1 por dia → ok
r = E.gerar({ ...base, semanas: 2, turnos: [{ id: 'D', nome: 'Dia', ini: '09:00', fim: '18:00', horas: 8 }], pessoas: pessoas(4, 'Vendedora', 'V'), demanda: { Vendedora: { D: Array(7).fill(2) } } });
ok.push(['loja de 1 turno, 4 pessoas, 2 por dia: cobre sem violar', r.falta.length === 0 && r.violacoes.length === 0]);

// 8) determinismo
const a = JSON.stringify(E.gerar({ ...base, semanas: 2, pessoas: pessoas(11, 'Operador', 'O'), demanda: { Operador: dem(2, 2, 2) } }).grade);
const b = JSON.stringify(E.gerar({ ...base, semanas: 2, pessoas: pessoas(11, 'Operador', 'O'), demanda: { Operador: dem(2, 2, 2) } }).grade);
ok.push(['mesmo pedido gera a mesma escala', a === b]);

ok.forEach(([t, v]) => console.log((v ? 'OK    ' : 'FALHA ') + t));
console.log('tempo: ' + (Date.now() - t0) + ' ms');
process.exit(ok.every(x => x[1]) ? 0 : 1);
