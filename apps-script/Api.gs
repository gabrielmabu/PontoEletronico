/**
 * API JSON para a tela hospedada fora do Google (GitHub Pages).
 * Corpo (POST, text/plain): { fn: 'apiLogin', args: [ ... ] }
 * Resposta: { ok: true, dados: ... } ou { ok: false, erro: 'mensagem' }
 * Só funções cujo nome começa com "api" podem ser chamadas.
 */
function doPost(e) {
  var saida;
  _memoOn = true; _memo = {};
  try {
    var req = JSON.parse(e.postData.contents);
    var fn = String(req.fn || '');
    if (!/^api[A-Z]\w*$/.test(fn) || typeof this[fn] !== 'function') throw new Error('Função inválida.');
    var args = Array.isArray(req.args) ? req.args : [];
    saida = { ok: true, dados: this[fn].apply(null, args) };
  } catch (err) {
    saida = { ok: false, erro: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(saida)).setMimeType(ContentService.MimeType.JSON);
}
