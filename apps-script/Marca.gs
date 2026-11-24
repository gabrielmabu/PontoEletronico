/**
 * Marca de cada empresa: logo, cor principal, cor de destaque e fontes. Escolhida no instalador e editável depois em
 * Configurações → Marca. Fica na aba Config do próprio cliente (chaves marca_*). O app aplica ao abrir.
 */
var MARCA_PADRAO = { cor: '#70122D', cor2: '#8E2445', fonte: 'Inter', fonteTitulo: 'Cormorant Garamond' };
var MARCA_FONTES_TEXTO = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Source Sans 3'];
var MARCA_FONTES_TITULO = ['Cormorant Garamond', 'Playfair Display', 'Merriweather', 'Lora', 'Montserrat', 'Poppins', 'Oswald', 'Raleway'];
var MARCA_LOGO_MAX = 45000;   // caracteres do dataURL (uma célula aguenta 50 mil); a tela reduz a imagem antes de enviar

/** Valida e normaliza; campo vazio = padrão. Lança erro com mensagem amigável. */
function validarMarca_(m) {
  m = m || {};
  var cor = function (v, nome) {
    v = String(v || '').trim();
    if (!v) return '';
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(nome + ' inválida. Use o formato #RRGGBB.');
    return v.toUpperCase();
  };
  var logo = String(m.logo || '');
  if (logo) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(logo)) throw new Error('Logo inválida: use uma imagem PNG, JPG ou WEBP.');
    if (logo.length > MARCA_LOGO_MAX) throw new Error('Logo grande demais. Use uma imagem menor (a tela já reduz; tente outro arquivo).');
  }
  var f = String(m.fonte || ''), ft = String(m.fonteTitulo || '');
  if (f && MARCA_FONTES_TEXTO.indexOf(f) < 0) throw new Error('Fonte do texto não disponível.');
  if (ft && MARCA_FONTES_TITULO.indexOf(ft) < 0) throw new Error('Fonte dos títulos não disponível.');
  return { logo: logo, cor: cor(m.cor, 'Cor principal'), cor2: cor(m.cor2, 'Cor de destaque'), fonte: f, fonteTitulo: ft };
}

/** Grava (ou cria) uma chave da aba Config. */
function cfgGravar_(chave, valor, descricao) {
  var l = lerObjetos_('Config').filter(function (x) { return x.chave === chave; })[0];
  if (l) atualizarLinha_('Config', l._linha, { valor: valor });
  else anexar_('Config', { chave: chave, valor: valor, descricao: descricao || '' });
  _cfgCache = null; delete _memo.Config;
}

function gravarMarca_(m) {
  cfgGravar_('marca_logo', m.logo, 'Logo da empresa (imagem em texto)');
  cfgGravar_('marca_cor', m.cor, 'Cor principal do app');
  cfgGravar_('marca_cor2', m.cor2, 'Cor de destaque do app');
  cfgGravar_('marca_fonte', m.fonte, 'Fonte do texto');
  cfgGravar_('marca_fonte_titulo', m.fonteTitulo, 'Fonte dos títulos');
}

function marcaAtual_() {
  return {
    logo: String(cfg_('marca_logo', '')), cor: String(cfg_('marca_cor', '')), cor2: String(cfg_('marca_cor2', '')),
    fonte: String(cfg_('marca_fonte', '')), fonteTitulo: String(cfg_('marca_fonte_titulo', ''))
  };
}

/** Admin: salva a marca (campos vazios = volta ao padrão). */
function apiAdminSalvarMarca(token, m) {
  var adm = sessao_(token, true);
  gravarMarca_(validarMarca_(m));
  log_(adm.login, 'MARCA', 'atualizada');
  return apiMarca();
}

/** Opções disponíveis (para as telas de escolha). Público. */
function apiMarcaOpcoes() {
  return { padrao: MARCA_PADRAO, fontesTexto: MARCA_FONTES_TEXTO, fontesTitulo: MARCA_FONTES_TITULO, logoMax: MARCA_LOGO_MAX };
}
