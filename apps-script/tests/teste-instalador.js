// Teste do instalador ponta a ponta com o Google SIMULADO: o código do instalador (apps-script-instalador/Codigo.gs) conversa com o
// código REAL do servidor (src/*.gs). Não prova o comportamento do Google de verdade (isso exige uma conta), mas pega erro de lógica.
// Uso: node teste-instalador.js
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const RAIZ = fs.existsSync('src/Util.gs') ? '.' : path.join(__dirname, '..');
const SRC = path.join(RAIZ, fs.existsSync(path.join(RAIZ, 'src/Util.gs')) ? 'src' : '.') + '/';
const INST = ['site/apps-script-instalador/Codigo.gs', 'apps-script-instalador/Codigo.gs', '../apps-script-instalador/Codigo.gs'].map(p => path.join(RAIZ, p)).filter(p => fs.existsSync(p))[0];

function Aba(n) {
  this.nome = n; this.d = []; const s = this;
  this.getName = () => s.nome; this.setName = x => { s.nome = x; }; this.setFrozenRows = () => {};
  this.getLastRow = () => { let n = 0; s.d.forEach((l, i) => { if (l && l.some(x => x !== '' && x !== undefined)) n = i + 1; }); return n; };
  this.getLastColumn = () => s.d.reduce((m, l) => Math.max(m, (l || []).reduce((mm, x, i) => (x !== '' && x !== undefined ? i + 1 : mm), 0)), 0);
  this.appendRow = l => { s.d[s.getLastRow()] = l.slice(); };
  this.getRange = (r, c, nr, nc) => { nr = nr || 1; nc = nc || 1; const o = {
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((s.d[r - 1 + i] || [])[c - 1 + j] === undefined ? '' : s.d[r - 1 + i][c - 1 + j]))),
    setValues: v => { v.forEach((l, i) => { s.d[r - 1 + i] = s.d[r - 1 + i] || []; l.forEach((x, j) => { s.d[r - 1 + i][c - 1 + j] = x; }); }); return o; },
    getValue: () => (s.d[r - 1] || [])[c - 1] === undefined ? '' : s.d[r - 1][c - 1],
    setValue: x => { s.d[r - 1] = s.d[r - 1] || []; s.d[r - 1][c - 1] = x; return o; }, setFontWeight: () => o, setNumberFormat: () => o }; return o; };
}
function Livro(id, abas) {
  const s = this; this.id = id; this.abas = (abas || ['Página1']).map(n => new Aba(n));
  this.getId = () => id; this.getSheets = () => s.abas; this.getSheetByName = n => s.abas.filter(a => a.nome === n)[0] || null;
  this.insertSheet = n => { const a = new Aba(n); s.abas.push(a); return a; }; this.deleteSheet = a => { s.abas = s.abas.filter(x => x !== a); };
  this.setSpreadsheetTimeZone = () => {};
}
const livros = {}, arquivos = {}, pastas = {}, cacheMap = {}, props = {};
const servidor = {
  console, Date, Math, String, Number, Error, Object, Array, RegExp, JSON, Buffer,
  SpreadsheetApp: { getActiveSpreadsheet: () => new Livro('LUCIANA'), openById: id => { if (!livros[id]) throw new Error('sem acesso'); return livros[id]; },
    create: () => { const l = new Livro('CONTATOS' + crypto.randomUUID(), ['Página1']); livros[l.id] = l; return l; } },
  DriveApp: { getFileById: id => { if (!arquivos[id]) throw new Error('nf'); return arquivos[id]; }, getFolderById: id => { if (!pastas[id]) throw new Error('nf'); return pastas[id]; } },
  CacheService: { getScriptCache: () => ({ get: k => cacheMap[k] || null, put: (k, v) => { cacheMap[k] = v; }, remove: k => { delete cacheMap[k]; }, getAll: () => ({}), putAll: () => {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'operador@exemplo.com' }) },
  Utilities: { getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest(), b => (b > 127 ? b - 256 : b)), formatDate: d => d.toISOString().slice(0, 10) },
  ContentService: { createTextOutput: s => ({ txt: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } }
};
vm.createContext(servidor);
['Util.gs', 'Auth.gs', 'Clientes.gs', 'Contatos.gs', 'Api.gs'].forEach(f => vm.runInContext(fs.readFileSync(SRC + f, 'utf8'), servidor, { filename: f }));
const postServidor = body => vm.runInContext('doPost({ postData: { contents: ' + JSON.stringify(body) + ' } })', servidor).txt;

// ---- Google simulado (o que o instalador chama por REST) e instalador
let emailAtivo = 'cliente@exemplo.com', falhasRegistro = 0;
const log = { pastas: 0, planilhas: 0, permissoes: [], chamadasCentral: [] };
const rid = () => crypto.randomBytes(16).toString('hex').slice(0, 33);
const respostaHttp = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj) });
const userProps = {};
const instalador = {
  console, Date, Math, String, Number, Error, Object, Array, RegExp, JSON,
  Session: { getActiveUser: () => ({ getEmail: () => emailAtivo }) },
  ScriptApp: { getOAuthToken: () => 'token-falso' },
  PropertiesService: { getUserProperties: () => ({ getProperty: k => userProps[k] || null, setProperty: (k, v) => { userProps[k] = v; }, deleteProperty: k => { delete userProps[k]; } }) },
  Utilities: { sleep: () => {} },
  HtmlService: {},
  UrlFetchApp: { fetch: (url, o) => {
    if (url.indexOf('script.google.com') >= 0) {
      const b = JSON.parse(o.payload); log.chamadasCentral.push(b.fn);
      if (b.fn === 'apiRegistrarCliente' && falhasRegistro > 0) { falhasRegistro--; return respostaHttp(200, { ok: false, erro: 'Não consegui abrir a planilha. Ela precisa estar compartilhada (editor) com a conta do operador.' }); }
      return { getContentText: () => postServidor(o.payload), getResponseCode: () => 200 };
    }
    if (o.headers.Authorization !== 'Bearer token-falso') return respostaHttp(401, { error: { message: 'sem token' } });
    if (/drive\/v3\/files\?/.test(url) && o.method === 'post') {
      const corpo = JSON.parse(o.payload); if (corpo.mimeType !== 'application/vnd.google-apps.folder') return respostaHttp(400, { error: { message: 'tipo' } });
      const id = rid(); log.pastas++; const dono = emailAtivo; pastas[id] = { getOwner: () => ({ getEmail: () => dono }) }; return respostaHttp(200, { id });
    }
    if (/sheets\.googleapis\.com\/v4\/spreadsheets$/.test(url)) {
      const id = rid(); log.planilhas++; const dono = emailAtivo; livros[id] = new Livro(id); arquivos[id] = { getOwner: () => ({ getEmail: () => dono }), getDateCreated: () => new Date() };
      return respostaHttp(200, { spreadsheetId: id });
    }
    const m = /drive\/v3\/files\/([^/]+)\/permissions/.exec(url);
    if (m) { const c = JSON.parse(o.payload); log.permissoes.push({ id: m[1], email: c.emailAddress, role: c.role }); return respostaHttp(200, { id: 'perm' }); }
    return respostaHttp(404, { error: { message: 'rota desconhecida ' + url } });
  } }
};
vm.createContext(instalador);
vm.runInContext(fs.readFileSync(INST, 'utf8'), instalador, { filename: 'Codigo.gs' });
const criar = d => { try { return vm.runInContext('criarEmpresa(' + JSON.stringify(d) + ')', instalador); } catch (e) { return { erro: e.message }; } };
const dados = (x = {}) => ({ empresa: 'Café do Zé', responsavel: 'Zé', whatsapp: '(81) 99999-1234', senha: 'minha-senha-9', senha2: 'minha-senha-9', ciente: true, aceita: true, origem: 'cartao', ...x });

const ok = []; const T = (t, c) => ok.push([t, !!c]);
T('exige marcar que entendeu onde ficam os dados', /Marque a caixa/.test(criar(dados({ ciente: false })).erro));
T('exige senhas iguais', /não são iguais/.test(criar(dados({ senha2: 'outra' })).erro));
T('exige senha de 6+ caracteres', /pelo menos 6/.test(criar(dados({ senha: '123', senha2: '123' })).erro));
T('nada foi criado nas recusas', log.pastas === 0 && log.planilhas === 0);

const r = criar(dados());
T('cria com sucesso e devolve id e link com ?c=', r.id && /\?c=cafe-do-ze-[a-z0-9]{4}$/.test(r.appUrl));
T('criou 1 pasta e 1 planilha na conta do cliente', log.pastas === 1 && log.planilhas === 1);
T('compartilhou pasta e planilha (editor) com o operador, e só com ele', log.permissoes.length === 2 && log.permissoes.every(p => p.email === 'operador@exemplo.com' && p.role === 'writer'));
T('devolveu a senha padrão dos colaboradores (8 caracteres)', typeof r.senhaPadrao === 'string' && r.senhaPadrao.length === 8);
T('login de admin no app novo funciona com a senha escolhida', JSON.parse(postServidor(JSON.stringify({ c: r.id, fn: 'apiLogin', args: ['admin', 'minha-senha-9', false] }))).ok === true);
T('estado temporário limpo ao terminar', !userProps.instalacao);

// falha no meio (compartilhamento ainda não propagou): 2 tentativas e dá certo, sem duplicar nada
log.pastas = 0; log.planilhas = 0; log.permissoes = []; falhasRegistro = 2; emailAtivo = 'outra@exemplo.com';
const r2 = criar(dados({ empresa: 'Loja Dois' }));
T('repete o registro quando o compartilhamento ainda não propagou', r2.id && /^loja-dois-/.test(r2.id));
T('na repetição não cria pasta/planilha duplicada', log.pastas === 1 && log.planilhas === 1);

// falha definitiva e nova tentativa: reaproveita o que já criou
log.pastas = 0; log.planilhas = 0; log.permissoes = []; falhasRegistro = 9; emailAtivo = 'terceira@exemplo.com';
const f = criar(dados({ empresa: 'Loja Tres' }));
T('falha persistente devolve o erro (não esconde)', /compartilhada/.test(f.erro || ''));
const antes = { p: log.pastas, s: log.planilhas }; falhasRegistro = 0;
const r3 = criar(dados({ empresa: 'Loja Tres' }));
T('nova tentativa reaproveita a pasta e a planilha já criadas', r3.id && log.pastas === antes.p && log.planilhas === antes.s);

// o próprio operador testando com a conta dele: não tenta compartilhar consigo mesmo
log.permissoes = []; emailAtivo = 'operador@exemplo.com';
const r4 = criar(dados({ empresa: 'Teste do Operador' }));
T('operador testando: cria sem compartilhar consigo mesmo', r4.id && log.permissoes.length === 0);

ok.forEach(([t, v]) => console.log((v ? 'OK    ' : 'FALHA ') + t));
process.exit(ok.every(x => x[1]) ? 0 : 1);
