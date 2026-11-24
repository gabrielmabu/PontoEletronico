/**
 * Instalador do app de ponto (Etapa 3).
 *
 * Roda COMO QUEM ABRE O LINK (a conta Google do próprio cliente), com permissões mínimas:
 *  - drive.file: só enxerga o que ele mesmo cria (a planilha e a pasta do cliente), nunca o resto do Drive;
 *  - userinfo.email: para saber qual conta está criando;
 *  - script.external_request: para falar com o servidor do app.
 *
 * O que faz: cria na conta do cliente uma planilha NOVA (o banco de dados dele) e uma pasta para as fotos do ponto,
 * compartilha as duas (editor) com a conta do operador do servidor e pede ao servidor que monte tudo dentro da planilha.
 * O cliente continua dono dos arquivos e pode remover o acesso do operador quando quiser (mas o app para de funcionar).
 */
var CENTRAL_URL = 'https://script.google.com/macros/s/AKfycbzjST21YKpX_8SPxxPHiqwtRPIycI9dkZfj2539kxcJ-NmrcBtjVdIpeVvupgJfmq3H/exec';

function doGet(e) {
  var p = (e && e.parameter) || {};
  var pre = { empresa: String(p.empresa || '').slice(0, 80), whatsapp: String(p.whatsapp || '').slice(0, 20), origem: String(p.origem || '').slice(0, 40), email: '' };
  try { pre.email = Session.getActiveUser().getEmail(); } catch (x) {}
  var t = HtmlService.createTemplateFromFile('Instalador');
  t.pre = JSON.stringify(pre).replace(/</g, '\\u003c');
  return t.evaluate().setTitle('Criar meu app de ponto').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function central_(fn, args) {
  var r = UrlFetchApp.fetch(CENTRAL_URL, { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ fn: fn, args: args }), muteHttpExceptions: true, followRedirects: true });
  var j;
  try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('O servidor do app não respondeu direito. Tente de novo em instantes.'); }
  if (!j.ok) throw new Error(j.erro || 'Erro no servidor do app.');
  return j.dados;
}

function google_(metodo, url, corpo) {
  var r = UrlFetchApp.fetch(url, {
    method: metodo, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: corpo ? JSON.stringify(corpo) : undefined
  });
  var txt = r.getContentText(), code = r.getResponseCode();
  if (code < 200 || code >= 300) {
    var m = ''; try { m = JSON.parse(txt).error.message; } catch (e) { m = txt.slice(0, 160); }
    throw new Error('Google (' + code + '): ' + m);
  }
  return txt ? JSON.parse(txt) : {};
}

function compartilhar_(idArquivo, email) {
  google_('post', 'https://www.googleapis.com/drive/v3/files/' + idArquivo + '/permissions?sendNotificationEmail=false&supportsAllDrives=true',
    { type: 'user', role: 'writer', emailAddress: email });
}

function limpo_(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

/** Chamado pela página. Devolve { id, appUrl, login, senhaPadrao }. Se der erro no meio, pode tentar de novo: reaproveita o que já criou. */
function criarEmpresa(d) {
  d = d || {};
  var empresa = limpo_(d.empresa, 80), resp = limpo_(d.responsavel, 80);
  if (empresa.length < 2) throw new Error('Informe o nome da empresa.');
  if (resp.length < 2) throw new Error('Informe o nome do responsável.');
  if (String(d.whatsapp || '').replace(/\D/g, '').length < 10) throw new Error('Informe o WhatsApp com DDD.');
  if (String(d.senha || '').length < 6) throw new Error('A senha de gestão precisa ter pelo menos 6 caracteres.');
  if (d.senha !== d.senha2) throw new Error('As duas senhas não são iguais.');
  if (d.ciente !== true) throw new Error('Marque a caixa confirmando que entendeu onde ficam os dados.');
  var email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Não consegui identificar sua conta Google. Entre na conta e abra o link de novo.');

  var props = PropertiesService.getUserProperties(), est = {};
  try { est = JSON.parse(props.getProperty('instalacao') || '{}'); } catch (e) { est = {}; }
  var operador = central_('apiOperadorEmail', []);

  if (!est.pastaId) {
    est.pastaId = google_('post', 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
      { name: 'Ponto — ' + empresa + ' (fotos do ponto)', mimeType: 'application/vnd.google-apps.folder' }).id;
    props.setProperty('instalacao', JSON.stringify(est));
  }
  if (!est.planilhaId) {
    est.planilhaId = google_('post', 'https://sheets.googleapis.com/v4/spreadsheets',
      { properties: { title: 'Ponto — ' + empresa, timeZone: 'America/Recife', locale: 'pt_BR' } }).spreadsheetId;
    props.setProperty('instalacao', JSON.stringify(est));
  }
  if (!est.compartilhado && operador.toLowerCase() !== email.toLowerCase()) {
    compartilhar_(est.pastaId, operador);
    compartilhar_(est.planilhaId, operador);
  }
  est.compartilhado = true; props.setProperty('instalacao', JSON.stringify(est));

  var dados = { empresa: empresa, responsavel: resp, whatsapp: d.whatsapp, emailDono: email, planilhaId: est.planilhaId, pastaId: est.pastaId,
    senhaAdmin: d.senha, raio: 150, origem: limpo_(d.origem, 40), aceita: d.aceita === true };
  var res, ultimoErro = null;
  for (var t = 0; t < 4; t++) {                       // o compartilhamento pode levar alguns segundos para valer
    try { res = central_('apiRegistrarCliente', [dados]); break; }
    catch (e) {
      ultimoErro = e;
      if (!/compartilhada|Não consegui abrir/.test(String(e.message))) throw e;
      Utilities.sleep(3000);
    }
  }
  if (!res) throw ultimoErro;
  props.deleteProperty('instalacao');
  return res;
}
