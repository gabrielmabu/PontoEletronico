// Teste local do servidor com vários clientes (Google simulado, com planilhas falsas). Uso: node teste-multicliente.js
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const SRC = fs.existsSync('src/Util.gs') ? require('path').join(__dirname, '..') + '/' : require('path').join(__dirname, '..') + '/';

// ---- planilha falsa
function Aba(nome) {
  this.nome = nome; this.d = [];
  const self = this;
  this.getName = () => self.nome; this.setName = n => { self.nome = n; };
  this.setFrozenRows = () => {};
  this.getLastRow = () => { let n = 0; self.d.forEach((l, i) => { if (l && l.some(x => x !== '' && x !== undefined)) n = i + 1; }); return n; };
  this.getLastColumn = () => self.d.reduce((m, l) => Math.max(m, (l || []).reduce((mm, x, i) => (x !== '' && x !== undefined ? i + 1 : mm), 0)), 0);
  this.appendRow = l => { self.d[self.getLastRow()] = l.slice(); };
  this.getRange = (r, c, nr, nc) => {
    nr = nr || 1; nc = nc || 1;
    const o = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((self.d[r - 1 + i] || [])[c - 1 + j] === undefined ? '' : self.d[r - 1 + i][c - 1 + j]))),
      setValues: v => { v.forEach((l, i) => { self.d[r - 1 + i] = self.d[r - 1 + i] || []; l.forEach((x, j) => { self.d[r - 1 + i][c - 1 + j] = x; }); }); return o; },
      getValue: () => (self.d[r - 1] || [])[c - 1] === undefined ? '' : self.d[r - 1][c - 1],
      setValue: x => { self.d[r - 1] = self.d[r - 1] || []; self.d[r - 1][c - 1] = x; return o; },
      setFontWeight: () => o, setNumberFormat: () => o
    };
    return o;
  };
}
function Livro(id, abas) {
  const self = this; this.id = id; this.abas = (abas || ['Página1']).map(n => new Aba(n));
  this.getId = () => id; this.getUrl = () => 'https://docs.google.com/spreadsheets/d/' + id;
  this.getSheets = () => self.abas; this.getSheetByName = n => self.abas.filter(a => a.nome === n)[0] || null;
  this.insertSheet = n => { const a = new Aba(n); self.abas.push(a); return a; };
  this.deleteSheet = a => { self.abas = self.abas.filter(x => x !== a); };
  this.setSpreadsheetTimeZone = () => {};
}
const livros = {}, arquivos = {}, pastas = {};
const reg = (id, dono, idade) => { livros[id] = new Livro(id); arquivos[id] = { getOwner: () => dono ? { getEmail: () => dono } : null, getDateCreated: () => new Date(Date.now() - (idade || 60000)) }; };
const luciana = new Livro('LUCIANA', ['Página1']);
const cacheMap = {}, props = {};
const ctx = {
  console, Date, Math, String, Number, Error, Object, Array, RegExp, JSON, Buffer,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => luciana,
    openById: id => { if (!livros[id]) throw new Error('sem acesso'); return livros[id]; },
    create: () => { const l = new Livro('CONTATOS' + Math.random().toString(36).slice(2), ['Página1']); livros[l.id] = l; return l; }
  },
  DriveApp: { getFileById: id => { if (!arquivos[id]) throw new Error('nf'); return arquivos[id]; }, getFolderById: id => { if (!pastas[id]) throw new Error('nf'); return pastas[id]; } },
  CacheService: { getScriptCache: () => ({ get: k => cacheMap[k] || null, put: (k, v) => { cacheMap[k] = v; }, remove: k => { delete cacheMap[k]; }, getAll: ks => { const o = {}; ks.forEach(k => { if (cacheMap[k]) o[k] = cacheMap[k]; }); return o; }, putAll: t => Object.assign(cacheMap, t) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'operador@exemplo.com' }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest(), b => (b > 127 ? b - 256 : b)),
    formatDate: (d, tz, f) => d.toISOString().slice(0, 10), newBlob: () => ({}), gzip: () => ({ getBytes: () => [] })
  },
  ContentService: { createTextOutput: s => ({ txt: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } }
};
vm.createContext(ctx);
['Util.gs', 'Auth.gs', 'Clientes.gs', 'Contatos.gs', 'Api.gs'].forEach(f => vm.runInContext(fs.readFileSync(SRC + f, 'utf8'), ctx, { filename: f }));
const run = s => vm.runInContext(s, ctx);
ctx.__post = o => JSON.parse(run('doPost({ postData: { contents: ' + JSON.stringify(JSON.stringify(o)) + ' } })').txt);

const ok = [];
const T = (t, c) => ok.push([t, !!c]);
const base = d => ({ empresa: 'Padaria São João', responsavel: 'Ana', whatsapp: '(81) 99999-1234', emailDono: 'ana@exemplo.com', planilhaId: 'P'.repeat(30), pastaId: 'F'.repeat(30), senhaAdmin: 'senha-forte-1', lat: -8.05, lng: -34.88, raio: 150, aceita: false, ...d });

T('cliente original: vazio, luciana e padrao viram ""', run("normalizarCliente_('')") === '' && run("normalizarCliente_('Luciana')") === '' && run("normalizarCliente_('padrao')") === '');
T('id de cliente é higienizado', run("normalizarCliente_('ACME-1!! /x')") === 'acme-1x');
T('chave de cache: original igual a antes; cliente com prefixo', run("kc_('calc_meta')") === 'calc_meta' && (run("_cliente='acme'"), run("kc_('calc_meta')") === 'acme:calc_meta') && (run("_cliente=''"), true));

// --- cadastro de cliente novo
reg('P'.repeat(30), 'ana@exemplo.com'); pastas['F'.repeat(30)] = { getOwner: () => ({ getEmail: () => 'ana@exemplo.com' }) };
const bad = d => { try { run('apiRegistrarCliente(' + JSON.stringify(base(d)) + ')'); return null; } catch (e) { return e.message; } };
T('rejeita senha curta', /pelo menos 6/.test(bad({ senhaAdmin: '123' })));
T('rejeita planilha sem acesso (não compartilhada)', /compartilhada/.test(bad({ planilhaId: 'Z'.repeat(30) })));
T('rejeita id de planilha inválido', /inválidos/.test(bad({ planilhaId: 'curto' })));
T('rejeita planilha de outro dono', /não pertence/.test(bad({ emailDono: 'outro@exemplo.com' })));
reg('Q'.repeat(30), 'ana@exemplo.com', 7 * 3600 * 1000); pastas['G'.repeat(30)] = pastas['F'.repeat(30)];
T('rejeita planilha antiga (>6 h)', /antiga demais/.test(bad({ planilhaId: 'Q'.repeat(30), pastaId: 'G'.repeat(30) })));
livros['P'.repeat(30)].abas[0].appendRow(['dado']);
T('rejeita planilha com conteúdo', /já tem conteúdo/.test(bad({})));
livros['P'.repeat(30)].abas[0].d = [];

const r1 = run('apiRegistrarCliente(' + JSON.stringify(base({})) + ')');
T('cadastra cliente: id com nome da empresa sem acento', /^padaria-sao-joao-[a-z0-9]{4}$/.test(r1.id));
T('devolve o link do app com ?c=', r1.appUrl.endsWith('?c=' + r1.id));
const nomes = livros['P'.repeat(30)].abas.map(a => a.nome);
T('planilha do cliente ganhou as abas e perdeu a "Página1"', ['Config', 'Lojas', 'Colaboradores', 'Jornadas', 'Batidas', 'Feriados', 'Log'].every(n => nomes.includes(n)) && !nomes.includes('Página1'));
T('administrador criado sem senha em texto', JSON.stringify(livros['P'.repeat(30)].getSheetByName('Colaboradores').d).indexOf('senha-forte-1') < 0);
const cat = Object.values(livros).filter(l => l.getSheetByName('Clientes'))[0].getSheetByName('Clientes');
T('catálogo marca o cliente como ativo', cat.d[1][0] === r1.id && cat.d[1][9] === 'ativo');

// --- isolamento por cliente (via doPost, como o app faz)
reg('R'.repeat(30), 'bia@exemplo.com'); pastas['H'.repeat(30)] = { getOwner: () => ({ getEmail: () => 'bia@exemplo.com' }) };
const r2 = run('apiRegistrarCliente(' + JSON.stringify(base({ empresa: 'Loja Bia', emailDono: 'bia@exemplo.com', planilhaId: 'R'.repeat(30), pastaId: 'H'.repeat(30), senhaAdmin: 'outra-senha-2' })) + ')');
const l1 = ctx.__post({ c: r1.id, fn: 'apiLogin', args: ['admin', 'senha-forte-1', false] });
T('login do cliente 1 funciona', l1.ok && !!l1.dados.token);
T('mesma senha NÃO entra no cliente 2', !ctx.__post({ c: r2.id, fn: 'apiLogin', args: ['admin', 'senha-forte-1', false] }).ok);
T('senha do cliente 2 entra no cliente 2', ctx.__post({ c: r2.id, fn: 'apiLogin', args: ['admin', 'outra-senha-2', false] }).ok);
T('token do cliente 1 vale no cliente 1', ctx.__post({ c: r1.id, fn: 'apiEu', args: [l1.dados.token] }).ok);
const cruz = ctx.__post({ c: r2.id, fn: 'apiEu', args: [l1.dados.token] });
T('token do cliente 1 NÃO vale no cliente 2', !cruz.ok && /SESSAO_EXPIRADA/.test(cruz.erro));
const semC = ctx.__post({ fn: 'apiEu', args: [l1.dados.token] });
T('token do cliente 1 NÃO vale no cliente original', !semC.ok && /SESSAO_EXPIRADA/.test(semC.erro));
T('cliente inexistente é recusado', /não encontrado/.test(ctx.__post({ c: 'fantasma-abcd', fn: 'apiMarca', args: [] }).erro));
T('marca do cliente devolve o nome da empresa', ctx.__post({ c: r1.id, fn: 'apiMarca', args: [] }).dados.empresa === 'Padaria São João');
T('operador: e-mail da conta que roda o servidor', ctx.__post({ fn: 'apiOperadorEmail', args: [] }).dados === 'operador@exemplo.com');
T('cliente desativado é recusado', (() => { cat.d[1][9] = 'inativo'; delete cacheMap['cli_' + r1.id]; return /não encontrado/.test(ctx.__post({ c: r1.id, fn: 'apiMarca', args: [] }).erro); })());

ok.forEach(([t, v]) => console.log((v ? 'OK    ' : 'FALHA ') + t));
process.exit(ok.every(x => x[1]) ? 0 : 1);
