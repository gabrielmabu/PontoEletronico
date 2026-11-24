/**
 * Instalador do app de ponto (Etapa 3).
 *
 * Roda COMO QUEM ABRE O LINK (a conta Google do próprio cliente), com só duas permissões, ambas não sensíveis:
 *  - drive.file: só enxerga o que ele mesmo cria (a planilha e a pasta do cliente), nunca o resto do Drive;
 *  - userinfo.email: para saber qual conta está criando.
 * Não tem acesso à internet: quem conversa com o servidor do app é a própria página (no navegador do cliente).
 *
 * Divisão do trabalho:
 *  1) página → servidor do app: pega o e-mail do operador (apiOperadorEmail);
 *  2) página → este script (prepararArquivos): cria a planilha e a pasta NA CONTA DO CLIENTE e compartilha (editor) com o operador;
 *  3) página → servidor do app (apiRegistrarCliente): monta as abas, a loja e o administrador e devolve o link do app;
 *  4) página → este script (concluirInstalacao): apaga o estado temporário.
 * Se algo falhar no meio, abrir o link de novo reaproveita a planilha e a pasta já criadas.
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var pre = { empresa: String(p.empresa || '').slice(0, 80), whatsapp: String(p.whatsapp || '').slice(0, 20), origem: String(p.origem || '').slice(0, 40), email: '' };
  try { pre.email = Session.getActiveUser().getEmail(); } catch (x) {}
  var t = HtmlService.createTemplateFromFile('Instalador');
  t.pre = JSON.stringify(pre).replace(/</g, '\\u003c');
  return t.evaluate().setTitle('Criar meu app de ponto').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function limpo_(v, max) { return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

function estado_() {
  try { return JSON.parse(PropertiesService.getUserProperties().getProperty('instalacao') || '{}'); } catch (e) { return {}; }
}
function salvarEstado_(est) { PropertiesService.getUserProperties().setProperty('instalacao', JSON.stringify(est)); }

/** Cria (ou reaproveita) a pasta e a planilha do cliente e compartilha com o operador. Devolve { planilhaId, pastaId, emailDono }. */
function prepararArquivos(d, operador) {
  d = d || {};
  var empresa = limpo_(d.empresa, 80);
  if (empresa.length < 2) throw new Error('Informe o nome da empresa.');
  if (limpo_(d.responsavel, 80).length < 2) throw new Error('Informe o nome do responsável.');
  if (String(d.whatsapp || '').replace(/\D/g, '').length < 10) throw new Error('Informe o WhatsApp com DDD.');
  if (d.ciente !== true) throw new Error('Marque a caixa confirmando que entendeu onde ficam os dados.');
  operador = String(operador || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(operador)) throw new Error('Não consegui falar com o servidor do app. Tente de novo em instantes.');
  var email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Não consegui identificar sua conta Google. Entre na conta e abra o link de novo.');

  var est = estado_();
  if (!est.pastaId) {
    est.pastaId = Drive.Files.create({ name: 'Ponto — ' + empresa + ' (fotos do ponto)', mimeType: 'application/vnd.google-apps.folder' }).id;
    salvarEstado_(est);
  }
  if (!est.planilhaId) {
    est.planilhaId = Drive.Files.create({ name: 'Ponto — ' + empresa, mimeType: 'application/vnd.google-apps.spreadsheet' }).id;
    salvarEstado_(est);
  }
  if (!est.compartilhado && operador !== email.toLowerCase()) {
    [est.pastaId, est.planilhaId].forEach(function (id) {
      Drive.Permissions.create({ type: 'user', role: 'writer', emailAddress: operador }, id, { sendNotificationEmail: false });
    });
  }
  est.compartilhado = true; salvarEstado_(est);
  return { planilhaId: est.planilhaId, pastaId: est.pastaId, emailDono: email };
}

/** Chamado pela página depois que o servidor registrou o cliente. */
function concluirInstalacao() { PropertiesService.getUserProperties().deleteProperty('instalacao'); return true; }
