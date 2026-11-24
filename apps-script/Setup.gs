/** Configuração inicial (rodar UMA vez pelo menu Ponto > Configuração inicial). */

var ID_PLANILHA_ANTIGA = '';   // preencha só se for rodar o Setup de novo; em produção o app lê da aba Config (id_planilha_antiga)
/** Senha inicial gerada na hora (não fica escrita no código). Troque pelo app: Configurações > Regras > Senhas. */
function senhaInicial_() {
  var p = PropertiesService.getScriptProperties(), v = p.getProperty('SENHA_INICIAL');
  if (!v) { v = Utilities.getUuid().replace(/-/g, '').slice(0, 10); p.setProperty('SENHA_INICIAL', v); }
  return v;
}

function logoDataUri_() {
  return 'data:image/jpeg;base64,' + HtmlService.createHtmlOutputFromFile('LogoB64').getContent().trim();
}

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.logo = logoDataUri_();
  return t.evaluate()
    .setTitle('Ponto · Luciana Noivas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Ponto')
    .addItem('Atualizar da base antiga', 'menuAtualizarBaseAntiga')
    .addItem('Gerar fechamento do mês...', 'menuFechamento')
    .addSeparator()
    .addItem('Configuração inicial (só uma vez)', 'menuConfiguracaoInicial')
    .addToUi();
}

function menuFechamento() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Fechamento', 'Mês no formato AAAA-MM (ex.: ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM') + ')', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var f = gerarFechamento_(r.getResponseText().trim());
  ui.alert('Fechamento gerado na aba "' + f.aba + '" (' + f.linhas + ' linhas). A aba Espelho também foi atualizada.');
}

function menuConfiguracaoInicial() {
  var r = configuracaoInicial();
  SpreadsheetApp.getUi().alert('Configuração concluída',
    r.colaboradores + ' colaboradores cadastrados (' + r.ativos + ' ativos).\n' +
    r.importacao.novas + ' registros do histórico importados.\n' +
    (r.importacao.semCadastro.length ? 'Sem cadastro: ' + r.importacao.semCadastro.join(', ') + '\n' : '') +
    '\nO app já está publicado: abra o link /exec e entre como admin.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function configuracaoInicial() {
  var s = ss_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', s.getId());
  s.setSpreadsheetTimeZone(TZ);
  ['Config', 'Lojas', 'Colaboradores', 'Jornadas', 'Batidas', 'Feriados', 'Espelho', 'Log'].forEach(aba_);
  var p1 = s.getSheetByName('Página1') || s.getSheetByName('Sheet1');
  if (p1 && p1.getLastRow() === 0) s.deleteSheet(p1);

  // Config
  if (aba_('Config').getLastRow() < 2) {
    var pasta = DriveApp.createFolder('Ponto Facial - Selfies');
    var cfg = [
      ['nome_empresa', 'Luciana Noivas', 'Nome mostrado no app'],
      ['senha_padrao', senhaInicial_(), 'Senha de primeiro acesso / reset'],
      ['limite_facial', 0.5, 'Distância facial máxima aceita (menor = mais rígido)'],
      ['precisao_gps_m', 100, 'Precisão mínima do GPS em metros'],
      ['fuso', TZ, 'Fuso horário'],
      ['pasta_selfies_id', pasta.getId(), 'Pasta do Drive das selfies'],
      ['id_planilha_antiga', ID_PLANILHA_ANTIGA, 'Planilha do Form antigo (botão Atualizar)'],
      ['desconto_2a_quinzena_pct', 13.66, 'Desconto padrão da 2ª quinzena (%)'],
      ['valor_abono', 59.82, 'Valor por abono (salário-família) na 2ª quinzena'],
      ['intervalo_min_batidas_min', 2, 'Minutos mínimos entre duas batidas'],
      ['sessao_horas', 6, 'Validade do login em horas (máx. 6 pelo CacheService)']
    ];
    aba_('Config').getRange(2, 1, cfg.length, 3).setValues(cfg);
  }
  _cfgCache = null;

  if (aba_('Jornadas').getLastRow() < 2) {
    anexar_('Jornadas', { id_jornada: 'PADRAO', nome: 'Padrão (seg-sex 8h, sáb 4h)', horas_seg_sex: 8, horas_sabado: 4, horas_domingo: 8,
      observacao: 'Igual ao sistema antigo. Domingo 8h mantido da fórmula antiga.' });
  }

  if (aba_('Lojas').getLastRow() < 2) {
    anexar_('Lojas', { id_loja: 'L1', nome: 'Loja Conde da Boa Vista',
      endereco: 'Av. Conde da Boa Vista, 1148 - Soledade, Recife - PE, 50060-001 (W4V5+5J)',
      latitude: -8.057164, longitude: -34.890931, raio_metros: 150, ativa: 'SIM' });
  }

  if (aba_('Feriados').getLastRow() < 2) {
    var fer = feriadosPadrao_(2023, 2027);
    aba_('Feriados').getRange(2, 1, fer.length, 2).setValues(fer);
    aba_('Feriados').getRange(2, 1, fer.length, 1).setNumberFormat('dd/MM/yyyy');
  }

  var cad = { colaboradores: 0, ativos: 0 };
  if (aba_('Colaboradores').getLastRow() < 2) cad = cadastrarColaboradoresDoLegado_();

  var imp = importarBaseAntiga();
  aba_('Batidas').getRange('E:E').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  protegerPlanilha_();
  return { colaboradores: cad.colaboradores, ativos: cad.ativos, importacao: imp };
}

/** Cria os colaboradores a partir da aba "Passagens e Salários" + nomes do histórico. */
function cadastrarColaboradoresDoLegado_() {
  var antiga = SpreadsheetApp.openById(ID_PLANILHA_ANTIGA);
  var sal = {};
  var ps = antiga.getSheetByName('Passagens e Salários').getDataRange().getValues();
  for (var i = 1; i < ps.length; i++) {
    if (!ps[i][0]) continue;
    var D = Number(ps[i][3]) || 0, E = Number(ps[i][4]) || 0;
    sal[normalizar_(ps[i][0])] = {
      passagem: Number(ps[i][1]) || '', salario: D || '', abono: Number(ps[i][5]) || '',
      desconto: D ? arred_((1 - E / (D / 2)) * 100, 2) : ''
    };
  }

  // Nomes e última data de cada um no histórico
  var f = antiga.getSheetByName(ABA_ORIGEM);
  var v = f.getRange(2, 2, f.getLastRow() - 1, 3).getValues(); // B:D
  var nomes = {};
  v.forEach(function (l) {
    if (!(l[0] instanceof Date) || !l[2]) return;
    var nome = String(l[2]).trim(), k = normalizar_(nome);
    var o = nomes[k] = nomes[k] || { nomes: {}, ultima: l[0] };
    o.nomes[nome] = (o.nomes[nome] || 0) + 1;
    if (l[0] > o.ultima) o.ultima = l[0];
  });

  var limiteAtivo = new Date(Date.now() - 45 * 864e5);
  var linhas = [], ativos = 0, seq = 1;
  var add = function (o) { linhas.push(CAB.Colaboradores.map(function (h) { return o[h] === undefined ? '' : o[h]; })); };

  var saltAdm = novoSalt_();
  add({ id: 'ADM', nome: 'Administrador', login: 'admin', cargo: 'Administrador', perfil: 'ADMIN', id_loja: 'L1', id_jornada: '',
    senha_hash: hashSenha_(senhaInicial_(), saltAdm), senha_salt: saltAdm, primeiro_acesso: 'NÃO', ativo: 'SIM', criado_em: new Date() });

  Object.keys(nomes).sort().forEach(function (k) {
    var o = nomes[k];
    // Grafia mais usada (ex.: "Mellyssa" e não "mellyssa")
    var nome = Object.keys(o.nomes).sort(function (a, b) { return o.nomes[b] - o.nomes[a]; })[0];
    var s = sal[k] || { passagem: 8.2, salario: 1480.35, abono: '', desconto: 13.66 };
    var ativo = o.ultima >= limiteAtivo;
    if (ativo) ativos++;
    var salt = novoSalt_();
    add({ id: 'C' + ('00' + seq++).slice(-3), nome: nome, login: k.split(' ')[0], cargo: '', perfil: 'COLABORADOR',
      id_loja: 'L1', id_jornada: 'PADRAO', salario_padrao: s.salario, passagem_dia: s.passagem, abono_qtd: s.abono,
      desconto_pct: s.desconto, senha_hash: hashSenha_(senhaInicial_(), salt), senha_salt: salt, primeiro_acesso: 'SIM',
      ativo: ativo ? 'SIM' : 'NÃO', criado_em: new Date() });
  });
  aba_('Colaboradores').getRange(2, 1, linhas.length, CAB.Colaboradores.length).setValues(linhas);
  return { colaboradores: linhas.length - 1, ativos: ativos };
}

function pascoa_(ano) {
  var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12);
}

/** Feriados observados no histórico (dias sem batida), de anoIni a anoFim. */
function feriadosPadrao_(anoIni, anoFim) {
  var fixos = [['01-01', 'Confraternização Universal'], ['03-06', 'Data Magna de Pernambuco'], ['04-21', 'Tiradentes'],
    ['05-01', 'Dia do Trabalho'], ['06-24', 'São João'], ['07-16', 'N. Sra. do Carmo (Recife)'],
    ['07-23', 'Folga da empresa (sem batidas no histórico)'], ['09-07', 'Independência'], ['10-12', 'N. Sra. Aparecida'],
    ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Consciência Negra'],
    ['12-08', 'N. Sra. da Conceição (Recife)'], ['12-25', 'Natal']];
  var out = [];
  for (var ano = anoIni; ano <= anoFim; ano++) {
    fixos.forEach(function (f) { var p = f[0].split('-'); out.push([new Date(ano, +p[0] - 1, +p[1], 12), f[1]]); });
    var pa = pascoa_(ano);
    out.push([new Date(pa.getTime() - 48 * 864e5), 'Carnaval (segunda)']);
    out.push([new Date(pa.getTime() - 47 * 864e5), 'Carnaval (terça)']);
    out.push([new Date(pa.getTime() - 2 * 864e5), 'Sexta-feira Santa']);
  }
  return out.sort(function (a, b) { return a[0] - b[0]; });
}

function protegerPlanilha_() {
  try {
    var dono = Session.getEffectiveUser().getEmail();
    ss_().getSheets().forEach(function (a) {
      var p = a.protect().setDescription('Somente o dono edita');
      p.getEditors().forEach(function (u) { if (u.getEmail() !== dono) p.removeEditor(u); });
      if (p.canDomainEdit()) p.setDomainEdit(false);
    });
  } catch (e) { console.error('proteção', e); }
}
