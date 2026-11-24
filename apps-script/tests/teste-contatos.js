// Teste local da captação de contatos (serviços do Google simulados). Uso: node teste-contatos.js
const fs = require('fs'), vm = require('vm');
const linhas = [['cab']];
const aba = {
  getLastRow: () => linhas.length,
  getRange: (r, c, nr, nc) => { const o = {
    getValues: () => linhas.slice(r - 1, r - 1 + (nr || 1)).map(l => l.slice(c - 1, c - 1 + (nc || 1))),
    getValue: () => linhas[r - 1][c - 1],
    setValues: v => { linhas[r - 1] = linhas[r - 1] || []; v[0].forEach((x, k) => { linhas[r - 1][c - 1 + k] = x; }); return o; },
    setNumberFormat: () => o, setFontWeight: () => o
  }; return o; },
  appendRow: l => linhas.push(l), setName() {}, setFrozenRows() {}
};
const props = {};
const ctx = {
  console, Date, String, Number, Error, Object, Array, RegExp,
  SpreadsheetApp: { create: () => ({ getId: () => 'ss1', getSheets: () => [aba], getSheetByName: () => aba }), openById: () => ({ getSheetByName: () => aba, getSheets: () => [aba] }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => { const m = {}; return { get: k => m[k] || null, put: (k, v) => { m[k] = v; } }; } }
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'Contatos.gs'), 'utf8'), ctx);
const f = o => { try { return vm.runInContext('apiCaptarContato(' + JSON.stringify(o) + ')', ctx); } catch (e) { return { erro: e.message }; } };
const base = { empresa: 'Padaria Sol', responsavel: 'Ana', whatsapp: '(81) 99999-1234', faixa: '6 a 15', aceita: false, origem: 'Cartao-Evento!' };
const ok = [];
ok.push(['contato válido entra', f(base).ok === true && linhas.length === 2]);
ok.push(['WhatsApp salvo em E.164', linhas[1][3] === '+5581999991234']);
ok.push(['origem higienizada', linhas[1][8] === 'cartao-evento']);
ok.push(['sem aceite: marketing NÃO e sem data', linhas[1][6] === 'NÃO' && linhas[1][7] === '']);
ok.push(['repetido não duplica, soma visita', f(base).repetido === true && linhas.length === 2 && linhas[1][10] === 2]);
ok.push(['repetido com aceite grava o aceite', f({ ...base, aceita: true }).ok && linhas[1][6] === 'SIM' && linhas[1][7] instanceof Date]);
ok.push(['WhatsApp curto é recusado', /WhatsApp inválido/.test(f({ ...base, whatsapp: '8199' }).erro)]);
ok.push(['celular sem 9 é recusado', /começar com 9/.test(f({ ...base, whatsapp: '81 88888-1234' }).erro)]);
ok.push(['aceita +55 na frente', f({ ...base, whatsapp: '+55 81 98888-0000' }).ok === true]);
ok.push(['empresa vazia é recusada', /empresa/.test(f({ ...base, empresa: ' ' }).erro)]);
ok.push(['e-mail inválido é recusado', /E-mail/.test(f({ ...base, whatsapp: '81 97777-0000', email: 'x@' }).erro)]);
const n = linhas.length; f({ ...base, whatsapp: '81 96666-0000', site: 'http://spam' });
ok.push(['campo-isca: finge ok e não grava', linhas.length === n]);
f({ ...base, whatsapp: '81 95555-0000', empresa: '=HYPERLINK("x")' });
ok.push(['fórmula injetada é neutralizada', linhas[linhas.length - 1][1].charAt(0) === "'"]);
ok.forEach(([t, r]) => console.log((r ? 'OK    ' : 'FALHA ') + t));
process.exit(ok.every(x => x[1]) ? 0 : 1);
