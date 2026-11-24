/**
 * Tratamento de ponto: o colaborador solicita abono (com atestado anexo),
 * o admin aprova ou recusa. Na aprovação o abono é lançado em Batidas.
 */

var TIPOS_SOLIC = {
  ABONAR_FALTA: 'Falta (dia inteiro)',
  ABONAR_METADE: 'Meia jornada',
  ABONAR_HORAS: 'Abonar horas do dia (atraso/saída antecipada)'
};
var MAX_ANEXO_MB = 8;

function pastaPorConfig_(chave, nome) {
  var id = cfg_(chave, '');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var p = DriveApp.createFolder(nome);
  var a = aba_('Config');
  var linhas = lerObjetos_('Config').filter(function (o) { return o.chave === chave; });
  if (linhas.length) atualizarLinha_('Config', linhas[0]._linha, { valor: p.getId() });
  else a.appendRow([chave, p.getId(), nome]);
  _cfgCache = null;
  return p;
}

function subpastaMes_(raiz, d) {
  var mes = Utilities.formatDate(d, TZ, 'yyyy-MM');
  var it = raiz.getFoldersByName(mes);
  return it.hasNext() ? it.next() : raiz.createFolder(mes);
}

/** d = { data:'yyyy-MM-dd', tipo, motivo, observacao, anexo:{nome, tipo, base64} } */
function apiSolicitarAbono(token, d) {
  var c = sessao_(token);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data || '')) throw new Error('Informe a data.');
  if (!TIPOS_SOLIC[d.tipo]) throw new Error('Escolha o tipo do abono.');
  if (!d.motivo) throw new Error('Escolha o motivo.');
  var dup = lerObjetos_('Solicitacoes').filter(function (s) {
    return String(s.id_colaborador) === String(c.id) && diaIso_(s.data) === d.data && s.status === 'PENDENTE';
  });
  if (dup.length) throw new Error('Já existe uma solicitação pendente para esse dia.');

  var link = '';
  if (d.anexo && d.anexo.base64) {
    var bytes = Utilities.base64Decode(d.anexo.base64);
    if (bytes.length > MAX_ANEXO_MB * 1024 * 1024) throw new Error('Anexo maior que ' + MAX_ANEXO_MB + ' MB.');
    var tipoMime = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(d.anexo.tipo) ? d.anexo.tipo : 'application/octet-stream';
    var ext = tipoMime === 'application/pdf' ? '.pdf' : '.jpg';
    var pasta = subpastaMes_(pastaPorConfig_('pasta_anexos_id', 'Ponto Facial - Atestados'), new Date());
    var arq = pasta.createFile(Utilities.newBlob(bytes, tipoMime, d.data + '_' + c.login + '_' + normalizar_(d.motivo).replace(/\W+/g, '-') + ext));
    link = arq.getUrl();
  } else if (normalizar_(d.motivo) === 'atestado') {
    throw new Error('Anexe a foto ou o PDF do atestado.');
  }

  var id = 'S' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
  anexar_('Solicitacoes', {
    id: id, id_colaborador: c.id, nome: c.nome, data: Utilities.parseDate(d.data + ' 12:00', TZ, 'yyyy-MM-dd HH:mm'),
    tipo: d.tipo, motivo: d.motivo, observacao: String(d.observacao || '').slice(0, 500), link_anexo: link,
    status: 'PENDENTE', criado_em: new Date()
  });
  log_(c.login, 'SOLICITACAO_ABONO', d.data + ' ' + d.tipo + ' ' + d.motivo);
  return 'Solicitação enviada. Você vai ver aqui quando for analisada.';
}

function diaIso_(v) { return v instanceof Date ? diaStr_(v) : String(v || '').slice(0, 10); }

function solicPublica_(s) {
  return {
    id: s.id, nome: s.nome, idColab: s.id_colaborador, data: diaIso_(s.data).split('-').reverse().join('/'),
    tipo: TIPOS_SOLIC[s.tipo] || s.tipo, motivo: s.motivo, obs: s.observacao, anexo: s.link_anexo,
    status: s.status, resposta: s.resposta, criado: s.criado_em instanceof Date ? dataHoraStr_(s.criado_em) : ''
  };
}

function apiMinhasSolicitacoes(token) {
  var c = sessao_(token);
  return lerObjetos_('Solicitacoes').filter(function (s) { return String(s.id_colaborador) === String(c.id); })
    .reverse().slice(0, 30).map(solicPublica_);
}

function apiAdminSolicitacoes(token, todas) {
  sessao_(token, true);
  return lerObjetos_('Solicitacoes').filter(function (s) { return todas || s.status === 'PENDENTE'; })
    .reverse().slice(0, 200).map(solicPublica_);
}

function apiAdminAnalisarSolicitacao(token, id, aprovar, resposta) {
  var adm = sessao_(token, true);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Sistema ocupado, tente de novo.');
  try {
    var s = lerObjetos_('Solicitacoes').filter(function (x) { return x.id === id; })[0];
    if (!s) throw new Error('Solicitação não encontrada.');
    if (s.status !== 'PENDENTE') throw new Error('Essa solicitação já foi analisada.');
    if (!aprovar && !String(resposta || '').trim()) throw new Error('Escreva o motivo da recusa.');
    var campos = { status: aprovar ? 'APROVADA' : 'RECUSADA', analisado_por: adm.login, analisado_em: new Date(), resposta: resposta || '' };
    if (aprovar) {
      var dia = diaIso_(s.data);
      var idBat = Utilities.getUuid();
      anexar_('Batidas', {
        id: idBat, id_colaborador: s.id_colaborador, nome: s.nome,
        tipo: s.tipo === 'ABONAR_HORAS' ? 'OBSERVACAO' : s.tipo,
        data_hora_servidor: Utilities.parseDate(dia + ' 12:00:00', TZ, 'yyyy-MM-dd HH:mm:ss'),
        status: 'OK', origem: 'SOLICITACAO ' + s.id + ' aprovada por ' + adm.login,
        observacao: s.tipo === 'ABONAR_HORAS' ? 'Abonar Horas - ' + s.motivo : s.motivo, link_selfie: s.link_anexo
      });
      campos.id_batida = idBat;
    }
    atualizarLinha_('Solicitacoes', s._linha, campos);
    log_(adm.login, aprovar ? 'ABONO_APROVADO' : 'ABONO_RECUSADO', s.nome + ' ' + diaIso_(s.data) + ' ' + s.tipo + (resposta ? ' | ' + resposta : ''));
    return aprovar ? 'Abono aprovado e lançado no ponto de ' + s.nome + '.' : 'Solicitação recusada.';
  } finally {
    lock.releaseLock();
  }
}
