/** Painel do administrador. Todas as funções exigem perfil ADMIN. */

function apiAdminDados(token) {
  sessao_(token, true);
  var colabs = lerObjetos_('Colaboradores').map(function (c) {
    var p = perfilPublico_(c);
    p.cargo = c.cargo; p.ativo = c.ativo === 'SIM';
    p.salario = c.salario_padrao; p.passagem = c.passagem_dia; p.abono = c.abono_qtd; p.desconto = c.desconto_pct;
    return p;
  });
  var lojas = lerObjetos_('Lojas').map(function (l) {
    return { id: l.id_loja, nome: l.nome, endereco: l.endereco, lat: l.latitude, lng: l.longitude, raio: l.raio_metros, ativa: l.ativa === 'SIM' };
  });
  return { colaboradores: colabs, lojas: lojas, planilha: ss_().getUrl() };
}

function apiAdminSalvarColaborador(token, d) {
  var adm = sessao_(token, true);
  var nome = String(d.nome || '').trim();
  var login = normalizar_(d.login || nome.split(' ')[0]).replace(/\s+/g, '');
  if (!nome || !login) throw new Error('Informe nome e login.');
  var todos = lerObjetos_('Colaboradores');
  var dup = todos.filter(function (c) { return normalizar_(c.login) === login && String(c.id) !== String(d.id || ''); })[0];
  if (dup) throw new Error('Já existe um colaborador com o login "' + login + '".');
  var campos = {
    nome: nome, login: login, cargo: d.cargo || '', perfil: d.perfil === 'ADMIN' ? 'ADMIN' : 'COLABORADOR',
    salario_padrao: Number(d.salario) || '', passagem_dia: Number(d.passagem) || '',
    abono_qtd: Number(d.abono) || '', desconto_pct: d.desconto === '' || d.desconto === undefined ? '' : Number(d.desconto),
    ativo: d.ativo === false ? 'NÃO' : 'SIM'
  };
  if (d.id) {
    var c = todos.filter(function (x) { return String(x.id) === String(d.id); })[0];
    if (!c) throw new Error('Colaborador não encontrado.');
    atualizarLinha_('Colaboradores', c._linha, campos);
    log_(adm.login, 'EDITAR_COLABORADOR', login + (campos.ativo === 'NÃO' ? ' (desativado)' : ''));
  } else {
    var salt = novoSalt_();
    var loja = lerObjetos_('Lojas')[0];
    campos.id = 'C' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss');
    campos.id_loja = loja ? loja.id_loja : '';
    campos.id_jornada = 'PADRAO';
    campos.senha_salt = salt;
    campos.senha_hash = hashSenha_(String(cfg_('senha_padrao', senhaInicial_())), salt);
    campos.primeiro_acesso = 'SIM';
    campos.criado_em = new Date();
    anexar_('Colaboradores', campos);
    log_(adm.login, 'NOVO_COLABORADOR', login);
  }
  return apiAdminDados(token);
}

function apiAdminResetSenha(token, id) {
  var adm = sessao_(token, true);
  var c = colaboradorPorId_(id);
  if (!c) throw new Error('Colaborador não encontrado.');
  var salt = novoSalt_();
  atualizarLinha_('Colaboradores', c._linha, {
    senha_salt: salt, senha_hash: hashSenha_(String(cfg_('senha_padrao', senhaInicial_())), salt), primeiro_acesso: 'SIM'
  });
  CacheService.getScriptCache().remove('bloq_' + normalizar_(c.login));
  encerrarSessoesDe_(c.id);
  log_(adm.login, 'RESET_SENHA', c.login);
  return 'Senha de ' + c.nome + ' voltou para a senha padrão.';
}

function apiAdminResetRosto(token, id) {
  var adm = sessao_(token, true);
  var c = colaboradorPorId_(id);
  if (!c) throw new Error('Colaborador não encontrado.');
  atualizarLinha_('Colaboradores', c._linha, { descritores_faciais: '' });
  log_(adm.login, 'RESET_ROSTO', c.login);
  return c.nome + ' vai cadastrar o rosto de novo no próximo acesso.';
}

function apiAdminSalvarLoja(token, d) {
  var adm = sessao_(token, true);
  var lat = Number(d.lat), lng = Number(d.lng), raio = Number(d.raio) || 150;
  if (isNaN(lat) || isNaN(lng)) throw new Error('Latitude/longitude inválidas.');
  var campos = { nome: d.nome, endereco: d.endereco, latitude: lat, longitude: lng, raio_metros: raio, ativa: d.ativa === false ? 'NÃO' : 'SIM' };
  var l = lerObjetos_('Lojas').filter(function (x) { return String(x.id_loja) === String(d.id || ''); })[0];
  if (l) atualizarLinha_('Lojas', l._linha, campos);
  else { campos.id_loja = 'L' + (lerObjetos_('Lojas').length + 1); anexar_('Lojas', campos); }
  log_(adm.login, 'SALVAR_LOJA', d.nome + ' raio ' + raio);
  return apiAdminDados(token);
}

/** Batidas recusadas dos últimos N dias. */
function apiAdminRecusadas(token, dias) {
  sessao_(token, true);
  var limite = new Date(Date.now() - (dias || 30) * 864e5);
  var a = aba_('Batidas'), n = a.getLastRow();
  if (n < 2) return [];
  var ini = Math.max(2, n - 5000);
  var B = CAB.Batidas, I = {}; B.forEach(function (h, i) { I[h] = i; });
  return a.getRange(ini, 1, n - ini + 1, B.length).getValues()
    .filter(function (l) { return String(l[I.status]).indexOf('RECUSADA') === 0 && l[I.data_hora_servidor] >= limite; })
    .reverse().slice(0, 200).map(function (l) {
      return { nome: l[I.nome], tipo: NOME_TIPO[l[I.tipo]] || l[I.tipo], quando: dataHoraStr_(l[I.data_hora_servidor]),
        motivo: String(l[I.status]).replace('RECUSADA: ', ''), selfie: l[I.link_selfie],
        distLoja: l[I.distancia_loja_m], distFacial: l[I.distancia_facial] };
    });
}

/**
 * Ajuste manual (nunca apaga a batida original).
 * d = { idColaborador, data: 'yyyy-MM-dd', hora: 'HH:mm', tipo, horas (p/ ADICIONAR_BANCO), observacao, justificativa }
 */
function apiAdminAjuste(token, d) {
  var adm = sessao_(token, true);
  var c = colaboradorPorId_(d.idColaborador);
  if (!c) throw new Error('Escolha o colaborador.');
  if (!d.justificativa || String(d.justificativa).trim().length < 3) throw new Error('A justificativa é obrigatória.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data || '')) throw new Error('Data inválida.');
  var hora = /^\d{2}:\d{2}$/.test(d.hora || '') ? d.hora : '12:00';
  var quando = Utilities.parseDate(d.data + ' ' + hora + ':00', TZ, 'yyyy-MM-dd HH:mm:ss');
var defs = tiposAjusteMapa_();
  var def = defs[d.tipo];
  var ehBatida = SEQ_TIPOS.indexOf(d.tipo) >= 0;
  if (!ehBatida && !(def && def.ativo !== 'NÃO' && (def.sistema !== 'ESTRUTURAL' || d.tipo === 'OBSERVACAO'))) throw new Error('Tipo de ajuste inválido ou desativado.');
  var pedeHoras = !!def && (def.horas_modo === 'INFORMADO' || def.saldo_modo === 'INFORMADO');
  if (pedeHoras && !String(d.horas == null ? '' : d.horas).trim()) throw new Error('Informe as horas do ajuste.');

  var reg = {
    id: Utilities.getUuid(), id_colaborador: c.id, nome: c.nome, tipo: d.tipo, data_hora_servidor: quando,
    status: 'OK', origem: 'AJUSTE:' + adm.login + ' em ' + dataHoraStr_(new Date()),
    observacao: d.observacao || '', ajuste_horas: pedeHoras ? (Number(String(d.horas).replace(',', '.')) || 0) : ''
  };

  // Batida de horário (entrada/saída): a anterior do mesmo tipo e dia é marcada como SUBSTITUIDA, nunca apagada.
  if (SEQ_TIPOS.indexOf(d.tipo) >= 0) {
    var a = aba_('Batidas'), n = a.getLastRow();
    if (n > 1) {
      var B = CAB.Batidas, I = {}; B.forEach(function (h, i) { I[h] = i; });
      var dados = a.getRange(2, 1, n - 1, B.length).getValues();
      for (var r = 0; r < dados.length; r++) {
        var l = dados[r];
        if (String(l[I.id_colaborador]) === String(c.id) && l[I.tipo] === d.tipo && l[I.data_hora_servidor] instanceof Date &&
          diaStr_(l[I.data_hora_servidor]) === d.data && statusOk_(l[I.status])) {
          a.getRange(r + 2, I.status + 1).setValue('SUBSTITUIDA por ajuste ' + reg.id);
        }
      }
    }
  }
  anexar_('Batidas', reg);
  log_(adm.login, 'AJUSTE_BATIDA', c.login + ' ' + d.data + ' ' + hora + ' ' + d.tipo + ' | ' + d.justificativa);
  return 'Ajuste registrado para ' + c.nome + '.';
}

function apiAdminImportar(token) {
  sessao_(token, true);
  return importarBaseAntiga();
}

function apiAdminEspelho(token, mes) {
  var adm = sessao_(token, true);
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw new Error('Mês inválido.');
  var r = gerarFechamento_(mes);
  log_(adm.login, 'FECHAMENTO', mes);
  return r;
}

/** Espelho na tela: dias de um colaborador num mês. */
function apiAdminEspelhoColab(token, id, mes) {
  sessao_(token, true);
  var calc = calcular_({ idColaborador: id, mesIni: mes, mesFim: mes });
  var tot = { horas: 0, saldo: 0, salario: 0, passagem: 0, dias: 0 };
  var dias = calc.dias.map(function (d) {
    tot.horas += d.horas || 0; tot.saldo += d.saldo; tot.salario += d.salario; tot.passagem += d.passagem; tot.dias += d.pagos;
    return { data: d.data.split('-').reverse().join('/'), semana: 'DSTQQSS'.charAt(diaSemana_(d.data)),
      entrada: d.entrada, saidaInt: d.saidaInt, voltaInt: d.voltaInt, saida: d.saida,
      trabalhadas: horasTxt_(d.horas), saldo: horasTxt_(d.saldo), ajustes: d.ajustes.join(', '), obs: d.obs,
      salario: arred_(d.salario), pendencia: d.pendencia };
  });
  return { dias: dias, banco: horasTxt_(calc.saldoPorColab[id] || 0),
    totais: { horas: horasTxt_(tot.horas), saldo: horasTxt_(tot.saldo), salario: arred_(tot.salario), passagem: arred_(tot.passagem), dias: tot.dias } };
}
