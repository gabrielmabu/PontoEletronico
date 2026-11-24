/** Regras editáveis pelo administrador dentro do app (antes só pela planilha). */

// Só estas chaves aparecem e podem ser alteradas. tipo: n = número, t = texto.
var REGRAS_CONFIG = [
  { chave: 'desconto_2a_quinzena_pct', rotulo: 'Desconto da 2ª quinzena (%)', tipo: 'n', min: 0, max: 100,
    ajuda: 'Desconto padrão aplicado ao salário da 2ª quinzena. Quem tem % próprio na ficha do colaborador usa o dele.' },
  { chave: 'valor_abono', rotulo: 'Valor do abono (R$)', tipo: 'n', min: 0, max: 100000,
    ajuda: 'Valor somado na 2ª quinzena por cada abono (salário-família) do colaborador.' },
  { chave: 'alerta_banco_negativo_h', rotulo: 'Alertar banco negativo a partir de (horas)', tipo: 'n', min: 1, max: 200, padrao: 8,
    ajuda: 'Quando o banco de horas de alguém chega a esse valor negativo, o fechamento mostra um aviso com as formas de resolver.' },
  { chave: 'limite_facial', rotulo: 'Rigor do reconhecimento facial', tipo: 'n', min: 0.3, max: 0.8,
    ajuda: 'Distância máxima aceita. Menor = mais rígido (recusa mais). Padrão 0,50. Se está recusando gente certa, suba para 0,55.' },
  { chave: 'precisao_gps_m', rotulo: 'Precisão mínima do GPS (metros)', tipo: 'n', min: 10, max: 1000,
    ajuda: 'Se o GPS do celular estiver menos preciso que isso, a batida é recusada. O raio da loja fica na aba Loja.' },
  { chave: 'intervalo_min_batidas_min', rotulo: 'Intervalo mínimo entre batidas (min)', tipo: 'n', min: 0, max: 120,
    ajuda: 'Evita batida duplicada: duas batidas seguidas em menos que isso são recusadas.' },
  { chave: 'senha_padrao', rotulo: 'Senha padrão (primeiro acesso e reset)', tipo: 't',
    ajuda: 'Usada para novos colaboradores e quando você reseta a senha de alguém. Não muda a senha de quem já trocou.' },
  { chave: 'nome_empresa', rotulo: 'Nome da empresa nos relatórios', tipo: 't', ajuda: 'Aparece no cabeçalho dos PDFs.' }
];

function apiAdminRegras(token) {
  sessao_(token, true);
  var cfg = {};
  lerObjetos_('Config').forEach(function (o) { cfg[o.chave] = o.valor; });
  var j = lerObjetos_('Jornadas').filter(function (x) { return x.id_jornada === 'PADRAO'; })[0] || {};
  var fer = lerObjetos_('Feriados').filter(function (f) { return f.data instanceof Date; })
    .map(function (f) { return { data: diaStr_(f.data), descricao: String(f.descricao || '') }; })
    .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  return {
    config: REGRAS_CONFIG.map(function (r) {
      var v = cfg[r.chave];
      return { chave: r.chave, rotulo: r.rotulo, tipo: r.tipo, ajuda: r.ajuda, min: r.min, max: r.max, valor: (v === undefined || v === '') ? (r.padrao === undefined ? '' : r.padrao) : v };
    }),
    jornada: { seg_sex: Number(j.horas_seg_sex) || 8, sabado: Number(j.horas_sabado) || 4, domingo: Number(j.horas_domingo) || 8 },
    feriados: fer
  };
}

function apiAdminSalvarRegras(token, d) {
  var adm = sessao_(token, true);
  d = d || {};
  var linhas = lerObjetos_('Config');
  var mudou = [];
  (d.config || []).forEach(function (it) {
    var r = REGRAS_CONFIG.filter(function (x) { return x.chave === it.chave; })[0];
    if (!r) return;
    var v = it.valor;
    if (r.tipo === 'n') {
      v = Number(String(v).replace(',', '.'));
      if (isNaN(v) || v < r.min || v > r.max) throw new Error(r.rotulo + ': informe um número entre ' + r.min + ' e ' + r.max + '.');
    } else {
      v = String(v || '').trim();
      if (!v) throw new Error(r.rotulo + ': não pode ficar vazio.');
      if (r.chave === 'senha_padrao' && v.length < 6) throw new Error('A senha padrão precisa ter pelo menos 6 caracteres.');
    }
    var l = linhas.filter(function (x) { return x.chave === r.chave; })[0];
    if (l && String(l.valor) === String(v)) return;
    if (l) atualizarLinha_('Config', l._linha, { valor: v });
    else anexar_('Config', { chave: r.chave, valor: v, descricao: r.rotulo });
    mudou.push(r.chave + '=' + (r.chave === 'senha_padrao' ? '***' : v));
  });
  if (d.jornada) {
    var j = lerObjetos_('Jornadas').filter(function (x) { return x.id_jornada === 'PADRAO'; })[0];
    var h = { horas_seg_sex: Number(d.jornada.seg_sex), horas_sabado: Number(d.jornada.sabado), horas_domingo: Number(d.jornada.domingo) };
    Object.keys(h).forEach(function (k) { if (isNaN(h[k]) || h[k] < 0 || h[k] > 12) throw new Error('Jornada: use horas entre 0 e 12.'); });
    if (j) atualizarLinha_('Jornadas', j._linha, h);
    mudou.push('jornada ' + h.horas_seg_sex + '/' + h.horas_sabado + '/' + h.horas_domingo);
  }
  if (mudou.length) log_(adm.login, 'REGRAS', mudou.join('; '));
  return apiAdminRegras(token);
}

function apiAdminSalvarFeriado(token, data, descricao) {
  var adm = sessao_(token, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) throw new Error('Data inválida.');
  descricao = String(descricao || '').trim();
  if (!descricao) throw new Error('Dê um nome ao feriado (ex.: Natal).');
  var ja = lerObjetos_('Feriados').filter(function (f) { return f.data instanceof Date && diaStr_(f.data) === data; })[0];
  if (ja) atualizarLinha_('Feriados', ja._linha, { descricao: descricao });
  else anexar_('Feriados', { data: Utilities.parseDate(data + ' 12:00:00', TZ, 'yyyy-MM-dd HH:mm:ss'), descricao: descricao });
  log_(adm.login, 'FERIADO', data + ' ' + descricao);
  return apiAdminRegras(token);
}

function apiAdminExcluirFeriado(token, data) {
  var adm = sessao_(token, true);
  var f = lerObjetos_('Feriados').filter(function (x) { return x.data instanceof Date && diaStr_(x.data) === data; })[0];
  if (!f) throw new Error('Feriado não encontrado.');
  delete _memo['Feriados']; invalidarCalc_('Feriados');
  aba_('Feriados').deleteRow(f._linha);
  log_(adm.login, 'FERIADO_EXCLUIDO', data + ' ' + f.descricao);
  return apiAdminRegras(token);
}

/** Troca a senha da conta de gestão (a conta administradora que está logada). */
function apiAdminSenhaGestao(token, nova, confirmacao) {
  var adm = sessao_(token, true);
  nova = String(nova || '');
  if (nova.length < 6) throw new Error('A senha de gestão precisa ter pelo menos 6 caracteres.');
  if (nova !== String(confirmacao || '')) throw new Error('As duas senhas não são iguais.');
  if (nova === String(cfg_('senha_padrao', senhaInicial_()))) throw new Error('Escolha uma senha diferente da senha padrão dos colaboradores.');
  var salt = novoSalt_();
  atualizarLinha_('Colaboradores', adm._linha, { senha_hash: hashSenha_(nova, salt), senha_salt: salt, primeiro_acesso: 'NÃO' });
  log_(adm.login, 'SENHA_GESTAO', '');
  return 'Senha de gestão alterada. Use a nova no próximo acesso.';
}
