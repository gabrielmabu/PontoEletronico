/**
 * Modo totem: um tablet fixo na loja onde a equipe bate o ponto sem usar o próprio celular.
 * O admin ativa no aparelho e recebe uma chave assinada (HMAC) que SÓ permite listar a equipe e bater ponto.
 * A chave cai se: o admin que ativou trocar a senha, deixar de ser admin, ou alguém tocar em "Desligar todos os totens".
 * Formato: t1.<dados base64url>.<assinatura>
 */
var TOTEM_DIAS = 400;

function criarChaveTotem_(adm) {
  var dados = Utilities.base64EncodeWebSafe(JSON.stringify({
    a: String(adm.id), c: _cliente, e: Date.now() + TOTEM_DIAS * 864e5,
    s: String(adm.senha_salt || '').slice(0, 8), v: String(cfg_('totem_versao', '1'))
  })).replace(/=+$/, '');
  return 't1.' + dados + '.' + assinar_('totem|' + dados);
}

/** Valida a chave do totem (lança TOTEM_DESLIGADO se não vale mais). */
function totem_(chave) {
  var p = String(chave || '').split('.');
  var falha = function () { throw new Error('TOTEM_DESLIGADO'); };
  if (p.length !== 3 || p[0] !== 't1' || assinar_('totem|' + p[1]) !== p[2]) falha();
  var o;
  try { o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[1] + '==='.slice((p[1].length + 3) % 4))).getDataAsString()); } catch (e) { falha(); }
  if (!o || o.e < Date.now() || (o.c || '') !== _cliente || String(o.v) !== String(cfg_('totem_versao', '1'))) falha();
  var adm = colaboradorPorId_(o.a);
  if (!adm || adm.ativo !== 'SIM' || adm.perfil !== 'ADMIN' || String(adm.senha_salt || '').slice(0, 8) !== o.s) falha();
  return adm;
}

function prontoParaTotem_(c) {
  var temRosto = false;
  try { temRosto = JSON.parse(c.descritores_faciais || '[]').length > 0; } catch (e) {}
  if (!c.consentimento_lgpd_em || !temRosto) return 'Você ainda não tirou a sua foto no celular. Peça ajuda à gerente.';
  return '';
}

/** Admin: transforma este aparelho em totem. */
function apiTotemAtivar(token) {
  var adm = sessao_(token, true);
  log_(adm.login, 'TOTEM_ATIVADO', '');
  return { chave: criarChaveTotem_(adm) };
}

/** Admin: derruba todos os totens já ativados (perdeu o tablet, trocou de aparelho...). */
function apiTotemDesligarTodos(token) {
  var adm = sessao_(token, true);
  cfgGravar_('totem_versao', String(Number(cfg_('totem_versao', '1')) + 1), 'Versão das chaves do modo totem (aumentar desliga todos)');
  log_(adm.login, 'TOTEM_DESLIGADOS', '');
  return true;
}

/** Totem: equipe para a grade de botões (só nome; quem não está pronta aparece com o aviso). */
function apiTotemLista(chave) {
  totem_(chave);
  var l = lerObjetos_('Colaboradores').filter(function (c) { return c.ativo === 'SIM' && c.login !== 'admin'; })
    .map(function (c) { var av = prontoParaTotem_(c); return { id: String(c.id), nome: String(c.nome), aviso: av, foto: av ? '' : miniaturaValida_(c.foto_perfil) }; });
  l.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  return { equipe: l, empresa: String(cfg_('nome_empresa', '')), precisaoMin: Number(cfg_('precisao_gps_m', 100)) };
}

function colabDoTotem_(chave, id) {
  totem_(chave);
  var c = colaboradorPorId_(id);
  if (!c || c.ativo !== 'SIM' || c.login === 'admin') throw new Error('Não achei o seu nome. Chame a gerente.');
  var av = prontoParaTotem_(c);
  if (av) throw new Error(av);
  return c;
}

/**
 * Foto da bolinha para quem ainda não tem: o totem pede a última selfie aceita da pessoa, reduz no próprio aparelho
 * e devolve a miniatura (apiTotemSalvarFoto). Só funciona enquanto a pessoa está SEM foto, para não expor selfies à toa.
 */
function ultimaSelfie_(idColab) {
  var a = aba_('Batidas'), n = a.getLastRow();
  if (n < 2) return null;
  var cab = a.getRange(1, 1, 1, a.getLastColumn()).getValues()[0];
  var iC = cab.indexOf('id_colaborador'), iL = cab.indexOf('link_selfie'), iS = cab.indexOf('status'), iF = cab.indexOf('distancia_facial');
  if (iC < 0 || iL < 0) return null;
  // Entre as 15 selfies aceitas mais recentes, a MELHOR é a mais parecida com o cadastro do rosto (menor distância facial).
  var ini = Math.max(2, n - 6000), d = a.getRange(ini, 1, n - ini + 1, cab.length).getValues(), melhor = null, vistos = 0;
  for (var i = d.length - 1; i >= 0 && vistos < 15; i--) {
    if (String(d[i][iC]) !== String(idColab) || !statusOk_(d[i][iS])) continue;
    var m = String(d[i][iL] || '').match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
    if (!m) continue;
    vistos++;
    var dist = iF >= 0 && d[i][iF] !== '' ? Number(d[i][iF]) : 9;
    if (!melhor || dist < melhor.dist) melhor = { id: m[1] || m[2], dist: dist };
  }
  return melhor ? melhor.id : null;
}
function apiTotemSelfie(chave, id) {
  var c = colabDoTotem_(chave, id);
  if (miniaturaValida_(c.foto_perfil)) return null;
  var fid = ultimaSelfie_(c.id);
  if (!fid) return null;
  try {
    var b = DriveApp.getFileById(fid).getBlob();
    if (b.getBytes().length > 600000) return null;
    return 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
  } catch (e) { return null; }
}
function apiTotemSalvarFoto(chave, id, mini) {
  var c = colabDoTotem_(chave, id);
  if (miniaturaValida_(c.foto_perfil)) return false;   // já tem: quem atualiza é a próxima batida
  gravarMiniatura_(c, mini);
  return true;
}

/** Totem: o que a pessoa ainda pode bater hoje. */
function apiTotemEstado(chave, id) {
  var c = colabDoTotem_(chave, id);
  var hoje = diaStr_(new Date()), prox = proximosTipos_(batidasDoDia_(c.id, hoje)), sug = prox[0];
  if (prox.length > 1 && diaSemana_(hoje) === 6) sug = 'SAIDA';
  return { nome: String(c.nome), proximos: prox.map(function (t) { return { tipo: t, nome: NOME_TIPO[t] }; }), sugerido: sug };
}

/** Totem: bate o ponto da pessoa escolhida (mesma conferência de rosto do celular). */
function apiTotemBater(chave, id, dados) {
  var c = colabDoTotem_(chave, id);
  return baterPonto_(c, dados || {}, 'TOTEM');
}
