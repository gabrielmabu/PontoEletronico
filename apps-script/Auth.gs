/** Login, sessão, senha e bloqueio por tentativas. */

var MAX_TENTATIVAS = 5;
var BLOQUEIO_SEG = 15 * 60;

function hashSenha_(senha, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + senha, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function novoSalt_() { return Utilities.getUuid().replace(/-/g, ''); }

function colaboradorPorLogin_(login) {
  var l = normalizar_(login);
  return lerObjetos_('Colaboradores').filter(function (c) { return normalizar_(c.login) === l; })[0];
}

function colaboradorPorId_(id) {
  return lerObjetos_('Colaboradores').filter(function (c) { return String(c.id) === String(id); })[0];
}

/** Valida o token e devolve o colaborador (lança erro se inválido). */
var DIAS_LEMBRAR = 90;

/** Sessões "manter conectado" ficam em ScriptProperties (sobrevivem ao limite de 6h do cache). */
function sessaoPersistente_(token) {
  var p = PropertiesService.getScriptProperties();
  var raw = p.getProperty('sess_' + token);
  if (!raw) return null;
  var s = JSON.parse(raw);
  if (s.exp < Date.now()) { p.deleteProperty('sess_' + token); return null; }
  if ((s.c || '') !== _cliente) return null;   // token de outro cliente não vale aqui
  return s;
}

/** Derruba todas as sessões salvas de um colaborador (usado no reset de senha). */
function encerrarSessoesDe_(idColab) {
  var p = PropertiesService.getScriptProperties();
  var todas = p.getProperties();
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf('sess_') !== 0) return;
    try {
      var s = JSON.parse(todas[k]);
      if ((String(s.id) === String(idColab) && (s.c || '') === _cliente) || s.exp < Date.now()) p.deleteProperty(k);
    } catch (e) { p.deleteProperty(k); }
  });
}

/**
 * "Manter conectado" sem guardar nada no servidor: o token é assinado (HMAC-SHA256) e carrega quem é, de qual cliente,
 * até quando vale e um pedaço do "sal" da senha. Trocar ou resetar a senha muda o sal e derruba o token na hora.
 * (Antes ficava em Propriedades do script, que têm limite de ~500 KB no total: com muitos clientes parava de funcionar.)
 * Formato: v2.<dados em base64url>.<assinatura em base64url>
 */
function segredoToken_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('TOKEN_SEGREDO');
  if (!s) { s = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); p.setProperty('TOKEN_SEGREDO', s); }
  return s;
}
function assinar_(dados) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(dados, segredoToken_())).replace(/=+$/, ''); }
function criarTokenLembrar_(c) {
  var dados = Utilities.base64EncodeWebSafe(JSON.stringify({ u: String(c.id), c: _cliente, e: Date.now() + DIAS_LEMBRAR * 864e5, s: String(c.senha_salt || '').slice(0, 8) })).replace(/=+$/, '');
  return 'v2.' + dados + '.' + assinar_(dados);
}
/** Devolve o colaborador do token assinado, ou null se inválido/expirado/de outro cliente/senha trocada. */
function lerTokenLembrar_(token) {
  var p = String(token).split('.');
  if (p.length !== 3 || p[0] !== 'v2' || !p[1] || !p[2]) return null;
  if (assinar_(p[1]) !== p[2]) return null;
  var o;
  try { o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[1] + '==='.slice((p[1].length + 3) % 4))).getDataAsString()); } catch (e) { return null; }
  if (!o || o.e < Date.now() || (o.c || '') !== _cliente) return null;
  var c = colaboradorPorId_(o.u);
  if (!c || String(c.senha_salt || '').slice(0, 8) !== o.s) return null;
  return c;
}

function sessao_(token, exigirAdmin) {
  if (!token) throw new Error('SESSAO_EXPIRADA');
  if (String(token).indexOf('v2.') === 0) {
    var cv = lerTokenLembrar_(token);
    if (!cv || cv.ativo !== 'SIM') throw new Error('SESSAO_EXPIRADA');
    if (exigirAdmin && cv.perfil !== 'ADMIN') throw new Error('Acesso restrito ao administrador.');
    return cv;
  }
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess_' + token);
  var s = raw ? JSON.parse(raw) : sessaoPersistente_(token);
  if (!s) throw new Error('SESSAO_EXPIRADA');
  if ((s.c || '') !== _cliente) throw new Error('SESSAO_EXPIRADA');
  if (!raw) cache.put('sess_' + token, JSON.stringify({ id: s.id, c: _cliente }), 21600);
  var c = colaboradorPorId_(s.id);
  if (!c || c.ativo !== 'SIM') throw new Error('SESSAO_EXPIRADA');
  if (exigirAdmin && c.perfil !== 'ADMIN') throw new Error('Acesso restrito ao administrador.');
  return c;
}

function perfilPublico_(c) {
  var temRosto = false;
  try { temRosto = JSON.parse(c.descritores_faciais || '[]').length > 0; } catch (e) {}
  return {
    id: c.id, nome: c.nome, login: c.login, perfil: c.perfil,
    primeiroAcesso: c.primeiro_acesso === 'SIM',
    lgpd: !!c.consentimento_lgpd_em,
    temRosto: temRosto
  };
}

function apiLogin(login, senha, lembrar) {
  login = String(login || '').trim();
  var chave = normalizar_(login);
  var cache = CacheService.getScriptCache();
  if (cache.get(kc_('bloq_' + chave))) {
    throw new Error('Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.');
  }
  var c = colaboradorPorLogin_(login);
  var ok = c && c.ativo === 'SIM' && hashSenha_(String(senha || ''), c.senha_salt) === c.senha_hash;
  if (!ok) {
    var n = Number(cache.get(kc_('falha_' + chave)) || 0) + 1;
    if (n >= MAX_TENTATIVAS) {
      cache.put(kc_('bloq_' + chave), '1', BLOQUEIO_SEG);
      cache.remove(kc_('falha_' + chave));
      log_(login, 'LOGIN_BLOQUEADO', MAX_TENTATIVAS + ' tentativas erradas');
      throw new Error('Muitas tentativas erradas. Acesso bloqueado por 15 minutos.');
    }
    cache.put(kc_('falha_' + chave), String(n), BLOQUEIO_SEG);
    log_(login, 'LOGIN_FALHOU', 'tentativa ' + n);
    throw new Error('Login ou senha inválidos. Tentativas restantes: ' + (MAX_TENTATIVAS - n));
  }
  cache.remove(kc_('falha_' + chave));
  var token;
  if (lembrar) token = criarTokenLembrar_(c);   // nada guardado no servidor
  else {
    token = Utilities.getUuid();
    var horas = Number(cfg_('sessao_horas', 12));
    cache.put('sess_' + token, JSON.stringify({ id: c.id, c: _cliente }), Math.min(horas * 3600, 21600));
  }
  log_(c.login, 'LOGIN', lembrar ? 'manter conectado' : '');
  return { token: token, usuario: perfilPublico_(c) };
}

/** Lista pública para a tela de login: colaboradores ativos + admin (só nome e login). */
function apiListaLogin() {
  var l = lerObjetos_('Colaboradores').filter(function (c) { return c.ativo === 'SIM'; })
    .map(function (c) { return { login: c.login, nome: c.login === 'admin' ? 'Administrador' : c.nome }; });
  l.sort(function (a, b) {
    if (a.login === 'admin') return 1;
    if (b.login === 'admin') return -1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return l;
}

function apiSair(token) {
  if (token) {
    CacheService.getScriptCache().remove('sess_' + token);
    PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
  }
  return true;
}

function apiTrocarSenha(token, nova, confirmacao) {
  var c = sessao_(token);
  nova = String(nova || '');
  if (nova.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  if (nova !== String(confirmacao || '')) throw new Error('As duas senhas não são iguais.');
  if (nova === String(cfg_('senha_padrao', senhaInicial_()))) throw new Error('Escolha uma senha diferente da senha padrão.');
  var salt = novoSalt_();
  atualizarLinha_('Colaboradores', c._linha, { senha_hash: hashSenha_(nova, salt), senha_salt: salt, primeiro_acesso: 'NÃO' });
  log_(c.login, 'TROCA_SENHA', '');
  return perfilPublico_(colaboradorPorId_(c.id));
}

function apiEu(token) {
  return perfilPublico_(sessao_(token));
}
