/**
 * Vários clientes no mesmo servidor (Etapa 2) e cadastro de novo cliente pelo instalador (Etapa 3).
 *
 * Como funciona:
 *  - O app manda "c" (id do cliente) em toda chamada. Sem "c" (ou "luciana") = cliente original, planilha em que este script está.
 *  - Cada cliente tem a SUA planilha e a SUA pasta de selfies, criadas na conta Google DELE pelo instalador
 *    (projeto "Ponto - Instalador", roda como o próprio cliente) e compartilhadas com a conta do operador (esta, que roda o servidor).
 *  - O catálogo de clientes fica na planilha de captação do operador (aba "Clientes"), nunca dentro de planilha de cliente.
 *  - Sessões, bloqueio de login e cache do cálculo são separados por cliente: o token de um cliente não vale em outro.
 */
var APP_BASE = 'https://gabrielmabu.github.io/PontoEletronico/';
var CLIENTES_CAB = ['id', 'empresa', 'planilha_id', 'pasta_id', 'email_dono', 'responsavel', 'whatsapp_e164', 'aceita_marketing',
  'origem', 'status', 'criado_em', 'app_url'];

/** "c" do pedido → id seguro. O cliente original (vazio, "luciana" ou "padrao") vira ''. */
function normalizarCliente_(c) {
  c = String(c === undefined || c === null ? '' : c).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  return (c === 'luciana' || c === 'padrao') ? '' : c;
}

function catalogoAba_() {
  var ss = contatosSS_(), a = ss.getSheetByName('Clientes');
  if (!a) {
    a = ss.insertSheet('Clientes');
    a.getRange(1, 1, 1, CLIENTES_CAB.length).setValues([CLIENTES_CAB]).setFontWeight('bold');
    a.setFrozenRows(1);
    a.getRange('G:G').setNumberFormat('@');
  }
  return a;
}

function clienteLinha_(id) {
  var a = catalogoAba_(), n = a.getLastRow();
  if (n < 2) return null;
  var v = a.getRange(2, 1, n - 1, CLIENTES_CAB.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]) === id) {
      var o = { _linha: i + 2 }; CLIENTES_CAB.forEach(function (h, k) { o[h] = v[i][k]; });
      return o;
    }
  }
  return null;
}

/** Abre a planilha do cliente (precisa estar compartilhada com a conta do operador). */
function clientePlanilha_(id) {
  var cache = CacheService.getScriptCache(), pid = cache.get('cli_' + id);
  if (!pid) {
    var l = clienteLinha_(id);
    if (!l || l.status !== 'ativo') throw new Error('Cliente não encontrado ou desativado.');
    pid = String(l.planilha_id);
    cache.put('cli_' + id, pid, 21600);
  }
  try { return SpreadsheetApp.openById(pid); }
  catch (e) { throw new Error('Sem acesso à planilha deste cliente. A planilha precisa estar compartilhada com a conta do operador.'); }
}

/** Nome e marca do cliente atual (público: usado na tela de login). */
function apiMarca() {
  return { cliente: _cliente || 'luciana', empresa: String(cfg_('nome_empresa', 'Ponto')) };
}

/** E-mail da conta que roda o servidor: o instalador compartilha a planilha e a pasta do cliente com ele. */
function apiOperadorEmail() {
  return Session.getEffectiveUser().getEmail();
}

function slugCliente_(s) {
  var t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return t || 'empresa';
}
function sufixoAleatorio_(n) {
  var c = 'abcdefghijkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}
function senhaAleatoria_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

function validarWhats_(v) {
  var dig = String(v || '').replace(/\D/g, '');
  if (dig.indexOf('55') === 0 && dig.length > 11) dig = dig.slice(2);
  if (dig.length < 10 || dig.length > 11) throw new Error('WhatsApp inválido. Use DDD + número.');
  return '+55' + dig;
}

/**
 * Chamado pelo instalador (que roda na conta do cliente) depois de criar a planilha e a pasta e compartilhar com o operador.
 * d = { empresa, responsavel, whatsapp, emailDono, planilhaId, pastaId, senhaAdmin, lat, lng, raio, origem, aceita }
 */
function apiRegistrarCliente(d) {
  d = d || {};
  var empresa = contatoTexto_(d.empresa, 80), resp = contatoTexto_(d.responsavel, 80);
  if (empresa.length < 2) throw new Error('Informe o nome da empresa.');
  if (resp.length < 2) throw new Error('Informe o nome do responsável.');
  var zap = validarWhats_(d.whatsapp);
  var email = String(d.emailDono || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail da conta inválido.');
  var idRe = /^[A-Za-z0-9_-]{20,80}$/;
  if (!idRe.test(String(d.planilhaId || '')) || !idRe.test(String(d.pastaId || ''))) throw new Error('Identificadores da planilha/pasta inválidos.');
  var senha = String(d.senhaAdmin || '');
  if (senha.length < 6) throw new Error('A senha de gestão precisa ter pelo menos 6 caracteres.');
  var lat = d.lat === '' || d.lat === undefined || d.lat === null ? '' : Number(d.lat), lng = d.lng === '' || d.lng === undefined || d.lng === null ? '' : Number(d.lng);
  if (lat !== '' && (isNaN(lat) || Math.abs(lat) > 90)) throw new Error('Latitude inválida.');
  if (lng !== '' && (isNaN(lng) || Math.abs(lng) > 180)) throw new Error('Longitude inválida.');
  var raio = Math.max(20, Math.min(2000, Number(d.raio) || 150));
  var origem = String(d.origem || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Muitas instalações ao mesmo tempo. Tente de novo em instantes.');
  var id = '', linhaCat = 0;
  try {
    var cache = CacheService.getScriptCache(), n = Number(cache.get('reg_taxa') || 0);
    if (n >= 15) throw new Error('Muitas tentativas agora. Tente de novo em alguns minutos.');
    cache.put('reg_taxa', String(n + 1), 600);

    // a planilha tem de estar compartilhada com o operador, ser NOVA e VAZIA, e pertencer a quem pediu
    var ss;
    try { ss = SpreadsheetApp.openById(d.planilhaId); }
    catch (e) { throw new Error('Não consegui abrir a planilha. Ela precisa estar compartilhada (editor) com a conta do operador.'); }
    var abas = ss.getSheets();
    if (abas.length !== 1 || abas[0].getLastRow() > 0 || abas[0].getLastColumn() > 0) throw new Error('Esta planilha já tem conteúdo. O instalador só aceita uma planilha nova e vazia.');
    var arq = DriveApp.getFileById(d.planilhaId), dono = arq.getOwner();
    if (!dono || dono.getEmail().toLowerCase() !== email) throw new Error('A planilha não pertence à conta informada.');
    if (Date.now() - arq.getDateCreated().getTime() > 6 * 3600 * 1000) throw new Error('A planilha é antiga demais para ser registrada. Rode o instalador de novo.');
    var pasta;
    try { pasta = DriveApp.getFolderById(d.pastaId); } catch (e) { throw new Error('Não consegui abrir a pasta de fotos. Ela precisa estar compartilhada (editor) com a conta do operador.'); }
    if (!pasta.getOwner() || pasta.getOwner().getEmail().toLowerCase() !== email) throw new Error('A pasta não pertence à conta informada.');

    // id único
    do { id = slugCliente_(empresa) + '-' + sufixoAleatorio_(4); } while (clienteLinha_(id));
    var cat = catalogoAba_();
    cat.appendRow([id, empresa, d.planilhaId, d.pastaId, email, resp, zap, d.aceita === true ? 'SIM' : 'NÃO', origem, 'provisionando', new Date(), APP_BASE + '?c=' + id]);
    linhaCat = cat.getLastRow();

    _cliente = id; _ssCliente = ss; _cfgCache = null; _memo = {};
    var senhaPadrao = provisionarCliente_(ss, { empresa: empresa, pastaId: d.pastaId, senhaAdmin: senha, lat: lat, lng: lng, raio: raio, id: id });
    cat.getRange(linhaCat, 10).setValue('ativo');
    CacheService.getScriptCache().put('cli_' + id, d.planilhaId, 21600);
    log_('instalador', 'CLIENTE_CRIADO', id);
    return { id: id, appUrl: APP_BASE + '?c=' + id, login: 'admin', senhaPadrao: senhaPadrao };
  } catch (e) {
    if (linhaCat) { try { catalogoAba_().getRange(linhaCat, 10).setValue('erro: ' + String(e.message || e).slice(0, 120)); } catch (x) {} }
    throw e;
  } finally { lock.releaseLock(); }
}

/** Monta a estrutura de um cliente novo (abas, config, loja, jornada, administrador). Roda com _cliente/_ssCliente já definidos. */
function provisionarCliente_(ss, p) {
  ss.setSpreadsheetTimeZone(TZ);
  var padrao = ss.getSheets()[0];
  ['Config', 'Lojas', 'Colaboradores', 'Jornadas', 'Batidas', 'Feriados', 'Solicitacoes', 'Espelho', 'Log'].forEach(aba_);
  if (!CAB[padrao.getName()]) ss.deleteSheet(padrao);
  var senhaPadrao = senhaAleatoria_();
  [
    ['nome_empresa', p.empresa, 'Nome mostrado no app'],
    ['senha_padrao', senhaPadrao, 'Senha de primeiro acesso / reset'],
    ['limite_facial', 0.5, 'Distância facial máxima aceita (menor = mais rígido)'],
    ['precisao_gps_m', 100, 'Precisão mínima do GPS em metros'],
    ['fuso', TZ, 'Fuso horário'],
    ['pasta_selfies_id', p.pastaId, 'Pasta do Drive das selfies'],
    ['desconto_2a_quinzena_pct', 0, 'Desconto padrão da 2ª quinzena (%)'],
    ['valor_abono', 0, 'Valor por abono na 2ª quinzena'],
    ['intervalo_min_batidas_min', 2, 'Minutos mínimos entre duas batidas'],
    ['sessao_horas', 6, 'Validade do login em horas (máx. 6 pelo CacheService)'],
    ['alerta_banco_negativo_h', 8, 'Alerta de banco de horas negativo (horas)'],
    ['cliente_id', p.id, 'Identificador deste cliente no servidor']
  ].forEach(function (l) { anexar_('Config', { chave: l[0], valor: l[1], descricao: l[2] }); });
  anexar_('Jornadas', { id_jornada: 'PADRAO', nome: 'Padrão (seg-sex 8h, sáb 4h)', horas_seg_sex: 8, horas_sabado: 4, horas_domingo: 8, observacao: '' });
  anexar_('Lojas', { id_loja: 'L1', nome: p.empresa, endereco: '', latitude: p.lat, longitude: p.lng, raio_metros: p.raio, ativa: 'SIM' });
  var salt = novoSalt_();
  anexar_('Colaboradores', { id: 'ADM', nome: 'Administrador', login: 'admin', cargo: 'Administrador', perfil: 'ADMIN', id_loja: 'L1', id_jornada: '',
    senha_hash: hashSenha_(p.senhaAdmin, salt), senha_salt: salt, primeiro_acesso: 'NÃO', ativo: 'SIM', criado_em: new Date() });
  _cfgCache = null;
  return senhaPadrao;
}
