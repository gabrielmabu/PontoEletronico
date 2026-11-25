/* Marca da empresa (logo, cores, fontes): leitura da logo, sugestão de cores e aplicação na tela.
 * Usado pelo app (index.html) e copiado para dentro do instalador (apps-script-instalador/Instalador.html).
 * MARCA-UTIL-INICIO */
var MarcaUtil = (function () {
  var FONTES_TEXTO = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Source Sans 3'];
  var FONTES_TITULO = ['Cormorant Garamond', 'Playfair Display', 'Merriweather', 'Lora', 'Montserrat', 'Poppins', 'Oswald', 'Raleway'];
  var PADRAO = { cor: '#70122D', cor2: '#8E2445', fonte: 'Inter', fonteTitulo: 'Cormorant Garamond' };
  var LOGO_MAX = 45000;

  function hexRgb(h) { h = String(h).replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgbHex(r) { return '#' + r.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return ('0' + v.toString(16)).slice(-2); }).join('').toUpperCase(); }
  function misturar(h1, h2, t) { var a = hexRgb(h1), b = hexRgb(h2); return rgbHex(a.map(function (v, i) { return v * (1 - t) + b[i] * t; })); }
  function lum(h) { var c = hexRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  /** Contraste (WCAG) entre duas cores: 4,5 ou mais = texto legível. */
  function contraste(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function escurecerAte(h, alvo) { var c = h; for (var i = 0; i < 25 && contraste(c, '#FFFFFF') < alvo; i++) c = misturar(c, '#000000', 0.1); return c; }

  function urlFontes(f, ft) {
    var fam = [ft || PADRAO.fonteTitulo, f || PADRAO.fonte].filter(function (v, i, a) { return a.indexOf(v) === i; });
    return 'https://fonts.googleapis.com/css2?' + fam.map(function (x) { return 'family=' + encodeURIComponent(x).replace(/%20/g, '+') + ':wght@400;500;600;700'; }).join('&') + '&display=swap';
  }
  function carregarFontes(f, ft) {
    var l = document.getElementById('marcaFontes');
    if (!l) { l = document.createElement('link'); l.id = 'marcaFontes'; l.rel = 'stylesheet'; document.head.appendChild(l); }
    var u = urlFontes(f, ft); if (l.href !== u) l.href = u;
  }

  /** Lê o arquivo da logo e devolve um dataURL pequeno (até 256 px; PNG, ou JPEG se ficar grande). */
  function lerLogo(arquivo) {
    return new Promise(function (ok, falha) {
      if (!arquivo) return falha(new Error('Escolha uma imagem.'));
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) return falha(new Error('Use uma imagem PNG, JPG, WEBP ou SVG.'));
      var fr = new FileReader();
      fr.onerror = function () { falha(new Error('Não consegui ler o arquivo.')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { falha(new Error('Não consegui abrir a imagem.')); };
        img.onload = function () {
          var gerar = function (lado) {
            var e = Math.min(1, lado / Math.max(img.width || lado, img.height || lado)), c = document.createElement('canvas');
            c.width = Math.max(1, Math.round((img.width || lado) * e)); c.height = Math.max(1, Math.round((img.height || lado) * e));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            var u = c.toDataURL('image/png');
            if (u.length > LOGO_MAX) {   // muito grande em PNG: JPEG com fundo branco
              var c2 = document.createElement('canvas'); c2.width = c.width; c2.height = c.height;
              var x2 = c2.getContext('2d'); x2.fillStyle = '#FFFFFF'; x2.fillRect(0, 0, c2.width, c2.height); x2.drawImage(c, 0, 0);
              u = c2.toDataURL('image/jpeg', 0.85);
            }
            return u;
          };
          var u = gerar(256); if (u.length > LOGO_MAX) u = gerar(160); if (u.length > LOGO_MAX) u = gerar(110);
          if (u.length > LOGO_MAX) return falha(new Error('Não consegui deixar a logo pequena o bastante. Tente outra imagem.'));
          ok(u);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(arquivo);
    });
  }

  /** Sugere a cor principal (escurecida até o texto branco ficar legível) e a de destaque, a partir das cores da logo. */
  function sugerirCores(dataUrl) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      img.onerror = function () { falha(new Error('Não consegui ler a logo.')); };
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = 48; c.height = 48;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0, 48, 48);
        var d = x.getImageData(0, 0, 48, 48).data, baldes = {};
        for (var i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mn > 230) continue;            // branco / fundo
          if (mx < 30) continue;             // preto
          var k = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5), o = baldes[k] = baldes[k] || { n: 0, r: 0, g: 0, b: 0, s: 0 };
          o.n++; o.r += r; o.g += g; o.b += b; o.s += mx ? (mx - mn) / mx : 0;
        }
        var melhor = null;
        Object.keys(baldes).forEach(function (k) { var o = baldes[k], peso = o.n * (0.25 + o.s / o.n); if (!melhor || peso > melhor.peso) melhor = { peso: peso, cor: rgbHex([o.r / o.n, o.g / o.n, o.b / o.n]) }; });
        if (!melhor) return falha(new Error('A logo não tem cor suficiente para sugerir uma paleta.'));
        var p = escurecerAte(melhor.cor, 4.5);
        ok({ cor: p, cor2: misturar(p, '#FFFFFF', 0.2) });
      };
      img.src = dataUrl;
    });
  }

  /** Aplica cores e fontes nas variáveis CSS da página. */
  function aplicar(m) {
    m = m || {};
    var raiz = document.documentElement.style, cor = m.cor || PADRAO.cor, cor2 = m.cor2 || PADRAO.cor2, f = m.fonte || PADRAO.fonte, ft = m.fonteTitulo || PADRAO.fonteTitulo;
    raiz.setProperty('--vinho', cor); raiz.setProperty('--vinho2', cor2); raiz.setProperty('--vinho-claro', misturar(cor, '#FFFFFF', 0.92));
    raiz.setProperty('--sans', "'" + f + "', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif");
    raiz.setProperty('--serif', "'" + ft + "', Georgia, serif");
    carregarFontes(f, ft);
    var t = document.querySelector('meta[name="theme-color"]'); if (t) t.content = cor;
  }
  /** Ícone quadrado do app a partir da logo: fundo branco, logo centralizada com margem (margem 0,2 = área segura do ícone "maskable"). */
  function iconeDaLogo(dataUrl, lado, margem) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      img.onerror = function () { falha(new Error('Não consegui ler a logo.')); };
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = c.height = lado;
        var x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, lado, lado);
        var util = lado * (1 - 2 * margem), e = util / Math.max(img.width || 1, img.height || 1), w = (img.width || 1) * e, h = (img.height || 1) * e;
        x.imageSmoothingQuality = 'high'; x.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
        ok(c.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }
  function personalizada(m) { return !!(m && (m.logo || m.cor || m.cor2 || m.fonte || m.fonteTitulo)); }

  return { FONTES_TEXTO: FONTES_TEXTO, FONTES_TITULO: FONTES_TITULO, PADRAO: PADRAO, LOGO_MAX: LOGO_MAX,
    lerLogo: lerLogo, sugerirCores: sugerirCores, aplicar: aplicar, contraste: contraste, misturar: misturar, personalizada: personalizada, iconeDaLogo: iconeDaLogo };
})();
/* MARCA-UTIL-FIM */
