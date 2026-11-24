/**
 * Captação de contatos (página /instalar, aberta pelo QR do cartão de visita).
 * Os contatos vão para uma planilha SEPARADA ("Ponto - Contatos (captação)"), criada na 1ª vez na conta do desenvolvedor,
 * para não misturar com os dados de nenhum cliente. Função pública (sem login): validações e limites abaixo.
 * LGPD: o aceite de receber novidades é opcional e fica registrado com data/hora; sem aceite, o contato é só do instalador.
 */
var CONTATOS_CAB = ['criado_em', 'empresa', 'responsavel', 'whatsapp_e164', 'email', 'colaboradores_faixa', 'aceita_marketing',
  'aceite_em', 'origem', 'status', 'visitas', 'ultimo_contato', 'observacao'];
var CONTATOS_FAIXAS = ['1 a 5', '6 a 15', '16 a 50', 'mais de 50'];

function contatosPlanilha_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('CONTATOS_SS'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Ponto - Contatos (captação)');
    props.setProperty('CONTATOS_SS', ss.getId());
    var a = ss.getSheets()[0]; a.setName('Contatos');
    a.getRange(1, 1, 1, CONTATOS_CAB.length).setValues([CONTATOS_CAB]).setFontWeight('bold');
    a.setFrozenRows(1);
    a.getRange('D:D').setNumberFormat('@');   // WhatsApp como texto (senão o + some)
  }
  return ss.getSheetByName('Contatos') || ss.getSheets()[0];
}

function contatoTexto_(v, max) {
  var s = String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;   // evita fórmula injetada na planilha
}

function apiCaptarContato(d) {
  d = d || {};
  if (String(d.site || '') !== '') return { ok: true };   // campo-isca preenchido por robô: finge que deu certo
  var empresa = contatoTexto_(d.empresa, 80), resp = contatoTexto_(d.responsavel, 80);
  if (empresa.length < 2) throw new Error('Informe o nome da empresa.');
  if (resp.length < 2) throw new Error('Informe o nome do responsável.');
  var dig = String(d.whatsapp || '').replace(/\D/g, '');
  if (dig.indexOf('55') === 0 && dig.length > 11) dig = dig.slice(2);
  if (dig.length < 10 || dig.length > 11) throw new Error('WhatsApp inválido. Use DDD + número, ex.: (81) 99999-9999.');
  if (dig.length === 11 && dig.charAt(2) !== '9') throw new Error('Celular com 11 dígitos precisa começar com 9 depois do DDD.');
  var email = contatoTexto_(d.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  var faixa = CONTATOS_FAIXAS.indexOf(String(d.faixa)) >= 0 ? String(d.faixa) : '';
  var aceita = d.aceita === true || d.aceita === 'true';
  var origem = String(d.origem || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Muitas pessoas enviando ao mesmo tempo. Tente de novo em instantes.');
  try {
    var cache = CacheService.getScriptCache(), n = Number(cache.get('cap_taxa') || 0);
    if (n >= 40) throw new Error('Muitas tentativas agora. Tente de novo em alguns minutos.');
    cache.put('cap_taxa', String(n + 1), 600);

    var a = contatosPlanilha_(), agora = new Date(), e164 = '+55' + dig;
    var ult = a.getLastRow(), col = ult > 1 ? a.getRange(2, 4, ult - 1, 1).getValues() : [];
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0]).replace(/\D/g, '') === '55' + dig) {                     // já existe: só soma a visita e atualiza o aceite se agora aceitou
        var lin = i + 2, vis = Number(a.getRange(lin, 11).getValue()) || 1;
        a.getRange(lin, 11, 1, 2).setValues([[vis + 1, agora]]);
        if (aceita && a.getRange(lin, 7).getValue() !== 'SIM') a.getRange(lin, 7, 1, 2).setValues([['SIM', agora]]);
        return { ok: true, repetido: true };
      }
    }
    a.appendRow([agora, empresa, resp, e164, email, faixa, aceita ? 'SIM' : 'NÃO', aceita ? agora : '', origem, 'novo', 1, agora, '']);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
