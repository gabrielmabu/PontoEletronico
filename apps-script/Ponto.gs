/** Batida de ponto: LGPD, cadastro facial, GPS, rosto, selfie e histórico. */

var SEQ_TIPOS = ['ENTRADA', 'SAIDA_INTERVALO', 'VOLTA_INTERVALO', 'SAIDA'];
var NOME_TIPO = {
  ENTRADA: 'Entrada', SAIDA_INTERVALO: 'Saída para o almoço',
  VOLTA_INTERVALO: 'Retorno do almoço', SAIDA: 'Saída para casa',
  ABONAR_FALTA: 'Abonar falta', ABONAR_METADE: 'Abonar metade',
  ADICIONAR_BANCO: 'Adicionar banco de horas', RETIRAR_BANCO: 'Retirar banco de horas',
  OBSERVACAO: 'Observação', FALTANDO_REGISTRO: 'Faltando registro'
};

function statusOk_(s) { return String(s || '').indexOf('OK') === 0 || s === ''; }

/** Batidas OK de um colaborador num dia (lê só as últimas linhas, que são as recentes). */
function batidasDoDia_(idColab, diaIso) {
  var a = aba_('Batidas');
  var n = a.getLastRow();
  if (n < 2) return [];
  var ini = Math.max(2, n - 1000);
  var dados = a.getRange(ini, 1, n - ini + 1, CAB.Batidas.length).getValues();
  var iCol = CAB.Batidas.indexOf('id_colaborador'), iTipo = CAB.Batidas.indexOf('tipo'),
    iData = CAB.Batidas.indexOf('data_hora_servidor'), iSt = CAB.Batidas.indexOf('status');
  return dados.filter(function (l) {
    return String(l[iCol]) === String(idColab) && l[iData] instanceof Date &&
      diaStr_(l[iData]) === diaIso && statusOk_(l[iSt]);
  }).map(function (l) { return { tipo: l[iTipo], data: l[iData] }; })
    .sort(function (x, y) { return x.data - y.data; });
}

/** Próximos tipos possíveis, conforme o que já foi batido hoje. */
function proximosTipos_(batidas) {
  var feitos = {};
  batidas.forEach(function (b) { feitos[b.tipo] = true; });
  if (feitos.SAIDA) return [];
  if (!feitos.ENTRADA) return ['ENTRADA'];
  if (feitos.SAIDA_INTERVALO && !feitos.VOLTA_INTERVALO) return ['VOLTA_INTERVALO'];
  if (feitos.VOLTA_INTERVALO) return ['SAIDA'];
  return ['SAIDA_INTERVALO', 'SAIDA']; // sábado costuma ir direto para a saída
}

function lojaDoColaborador_(c) {
  var lojas = lerObjetos_('Lojas').filter(function (l) { return l.ativa === 'SIM'; });
  return lojas.filter(function (l) { return String(l.id_loja) === String(c.id_loja); })[0] || lojas[0];
}

function apiEstado(token) {
  var c = sessao_(token);
  var agora = new Date();
  var hoje = diaStr_(agora);
  var bat = batidasDoDia_(c.id, hoje);
  var prox = proximosTipos_(bat);
  var loja = lojaDoColaborador_(c);
  var sugerido = prox[0];
  if (prox.length > 1 && diaSemana_(hoje) === 6) sugerido = 'SAIDA';
  return {
    usuario: perfilPublico_(c),
    loja: loja ? loja.nome : '',
    agora: dataHoraStr_(agora),
    hoje: Utilities.formatDate(agora, TZ, 'dd/MM/yyyy'),
    batidas: bat.map(function (b) { return { tipo: NOME_TIPO[b.tipo] || b.tipo, hora: horaStr_(b.data) }; }),
    proximos: prox.map(function (t) { return { tipo: t, nome: NOME_TIPO[t] }; }),
    sugerido: sugerido,
    precisaoMin: Number(cfg_('precisao_gps_m', 100))
  };
}

function apiAceitarLgpd(token) {
  var c = sessao_(token);
  if (c.primeiro_acesso === 'SIM') throw new Error('Troque a senha primeiro.');
  atualizarLinha_('Colaboradores', c._linha, { consentimento_lgpd_em: new Date() });
  log_(c.login, 'ACEITE_LGPD', '');
  return perfilPublico_(colaboradorPorId_(c.id));
}

function validarDescritor_(d) {
  if (!Array.isArray(d) || d.length !== 128) throw new Error('Rosto inválido. Tire a foto de novo.');
  return d.map(function (x) { return Math.round(Number(x) * 1e6) / 1e6; });
}

function apiCadastrarRosto(token, descritores) {
  var c = sessao_(token);
  if (c.primeiro_acesso === 'SIM') throw new Error('Troque a senha primeiro.');
  if (!c.consentimento_lgpd_em) throw new Error('É preciso aceitar o termo de uso da biometria.');
  if (!Array.isArray(descritores) || descritores.length < 3) throw new Error('São necessárias 3 fotos.');
  var lista = descritores.map(validarDescritor_);
  atualizarLinha_('Colaboradores', c._linha, { descritores_faciais: JSON.stringify(lista) });
  log_(c.login, 'CADASTRO_FACIAL', lista.length + ' descritores');
  return perfilPublico_(colaboradorPorId_(c.id));
}

function distanciaEuclid_(a, b) {
  var s = 0;
  for (var i = 0; i < 128; i++) { var d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

function haversine_(lat1, lon1, lat2, lon2) {
  var R = 6371000, rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function salvarSelfie_(c, dataUrl, agora) {
  if (!dataUrl) return '';
  try {
    var idPasta = cfg_('pasta_selfies_id', '');
    if (!idPasta) return '';
    var raiz = DriveApp.getFolderById(idPasta);
    var mes = Utilities.formatDate(agora, TZ, 'yyyy-MM');
    var it = raiz.getFoldersByName(mes);
    var pasta = it.hasNext() ? it.next() : raiz.createFolder(mes);
    var b64 = String(dataUrl).split(',')[1];
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg',
      Utilities.formatDate(agora, TZ, 'yyyy-MM-dd_HH-mm-ss') + '_' + c.login + '.jpg');
    return pasta.createFile(blob).getUrl();
  } catch (e) {
    console.error('selfie', e);
    return '';
  }
}

/**
 * dados = { tipo, lat, lng, precisao, descritor[128], foto (dataURL jpeg), dispositivo }
 */
function apiBaterPonto(token, dados) {
  var c = sessao_(token);
  if (c.primeiro_acesso === 'SIM') throw new Error('Troque a senha padrão antes de bater o ponto.');
  return baterPonto_(c, dados || {}, 'APP');
}

/**
 * Registra a batida de c. origem 'APP' (celular da pessoa) ou 'TOTEM' (tablet da loja).
 * No totem o aparelho é fixo e foi liberado pelo admin: sem GPS ou com GPS impreciso a batida vale;
 * só recusa se o GPS for preciso e mostrar que o tablet está fora da loja.
 */
function baterPonto_(c, dados, origem) {
  var totem = origem === 'TOTEM';
  var cadastrados = [];
  try { cadastrados = JSON.parse(c.descritores_faciais || '[]'); } catch (e) {}
  if (!cadastrados.length) throw new Error('Faça o cadastro do rosto antes de bater o ponto.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Sistema ocupado, tente de novo em alguns segundos.');
  try {
    var agora = new Date();
    var hoje = diaStr_(agora);
    var bat = batidasDoDia_(c.id, hoje);

    // Duplicidade: menos de N minutos desde a última batida OK
    var minIntervalo = Number(cfg_('intervalo_min_batidas_min', 2));
    if (bat.length && (agora - bat[bat.length - 1].data) < minIntervalo * 60000) {
      throw new Error((totem ? c.nome.split(' ')[0] + ' já bateu' : 'Você já bateu') + ' o ponto há menos de ' + minIntervalo + ' minutos.');
    }

    var prox = proximosTipos_(bat);
    if (!prox.length) throw new Error('Todas as batidas de hoje já foram registradas.');
    var tipo = prox.indexOf(dados.tipo) >= 0 ? dados.tipo : prox[0];

    var loja = lojaDoColaborador_(c);
    var lat = Number(dados.lat), lng = Number(dados.lng), prec = Number(dados.precisao);
    var reg = {
      id: Utilities.getUuid(), id_colaborador: c.id, nome: c.nome, tipo: tipo,
      data_hora_servidor: agora, latitude: isNaN(lat) ? '' : lat, longitude: isNaN(lng) ? '' : lng,
      precisao_m: isNaN(prec) ? '' : Math.round(prec), id_loja: loja ? loja.id_loja : '',
      dispositivo: String(dados.dispositivo || '').slice(0, 250), origem: totem ? 'TOTEM' : 'APP'
    };

    var motivo = '';
    // GPS (validado no servidor)
    if (isNaN(lat) || isNaN(lng)) { if (!totem) motivo = 'Sem localização'; }
    else if (prec > Number(cfg_('precisao_gps_m', 100))) { if (!totem) motivo = 'GPS impreciso (' + Math.round(prec) + ' m)'; }
    else if (loja) {
      var dist = haversine_(lat, lng, Number(loja.latitude), Number(loja.longitude));
      reg.distancia_loja_m = Math.round(dist);
      if (dist > Number(loja.raio_metros || 150)) motivo = 'Fora do raio da loja (' + Math.round(dist) + ' m)';
    }

    // Rosto
    var descr = null;
    try { descr = validarDescritor_(dados.descritor); } catch (e) { if (!motivo) motivo = 'Rosto não detectado'; }
    if (descr) {
      var menor = Math.min.apply(null, cadastrados.map(function (d) { return distanciaEuclid_(d, descr); }));
      reg.distancia_facial = arred_(menor, 4);
      if (!motivo && menor > Number(cfg_('limite_facial', 0.5))) motivo = 'Rosto não reconhecido';
    }

    reg.link_selfie = salvarSelfie_(c, dados.foto, agora);
    reg.status = motivo ? 'RECUSADA: ' + motivo : 'OK';
    anexar_('Batidas', reg);

    if (motivo) {
      log_(c.login, 'BATIDA_RECUSADA', motivo + (totem ? ' (totem)' : ''));
      var msg = motivo;
      if (motivo === 'Rosto não reconhecido') msg = totem ? 'Rosto não reconhecido para ' + c.nome.split(' ')[0] + '. Confira se tocou no seu nome e tente de novo, olhando para a câmera.'
        : 'Rosto não reconhecido. Tente de novo com mais luz, olhando para a câmera.';
      if (motivo.indexOf('GPS impreciso') === 0) msg = motivo + '. Vá para um local aberto e tente de novo.';
      if (motivo.indexOf('Fora do raio') === 0) msg = motivo + (totem ? '. O tablet do totem parece estar fora da loja.' : '. O ponto só pode ser batido na loja.');
      throw new Error(msg);
    }
    return {
      nome: c.nome, tipo: NOME_TIPO[tipo], dataHora: dataHoraStr_(agora),
      loja: loja ? loja.nome : '', distancia: reg.distancia_loja_m
    };
  } finally {
    lock.releaseLock();
  }
}

/** Histórico do próprio colaborador: dias do mês + saldo do banco. mes = 'yyyy-MM' */
function apiHistorico(token, mes) {
  var c = sessao_(token);
  mes = mes || Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  var calc = calcular_({ idColaborador: c.id });
  var dias = calc.dias.filter(function (d) { return d.data.indexOf(mes) === 0; });
  var saldoMes = dias.reduce(function (s, d) { return s + (d.saldo || 0); }, 0);
  return {
    mes: mes,
    saldoBanco: horasTxt_(calc.saldoPorColab[c.id] || 0),
    saldoMes: horasTxt_(saldoMes),
    dias: dias.map(function (d) {
      return {
        data: d.data.split('-').reverse().join('/'), semana: 'DSTQQSS'.charAt(diaSemana_(d.data)),
        entrada: d.entrada, saidaInt: d.saidaInt, voltaInt: d.voltaInt, saida: d.saida,
        trabalhadas: d.horas === null ? '' : horasTxt_(d.horas), saldo: horasTxt_(d.saldo || 0),
        ajustes: d.ajustes.join(', '), pendencia: d.pendencia
      };
    })
  };
}
