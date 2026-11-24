// Vigia de normas trabalhistas. Roda toda semana no GitHub Actions.
// Consulta fontes públicas, compara com o que já foi visto (regras/vigia-estado.json) e, se houver novidade,
// abre um aviso (issue) no GitHub para uma pessoa revisar. NUNCA altera regras/trabalhistas.json sozinho.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ESTADO = 'regras/vigia-estado.json';
const SECO = process.argv.includes('--seco');        // só mostra, não grava nem abre aviso
const BUSCAS = [
  '"escala 6x1" OR "fim da 6x1"',
  '"jornada de trabalho" portaria MTE',
  '"jornada de trabalho" "Emenda Constitucional"',
  'CLT "jornada" "regulamenta" 2026',
  'férias CLT alteração portaria MTE'
];
const PALAVRAS = /(6x1|5x2|jornada|escala de trabalho|portaria|emenda constitucional|CLT|f[eé]rias|descanso semanal|banco de horas|ponto eletr[oô]nico|registro de ponto)/i;

const estado = fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, 'utf8')) : { vistos: [], primeira: true };
const vistos = new Set(estado.vistos);
const achados = [];

const dec = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (x, t) => { const m = x.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return m ? dec(m[1]) : ''; };

async function pegar(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vigia-regras)' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(url + ' → ' + r.status);
  return r;
}

async function noticias() {
  for (const q of BUSCAS) {
    try {
      const xml = await (await pegar('https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=pt-BR&gl=BR&ceid=BR:pt-419')).text();
      for (const it of xml.split('<item>').slice(1, 16)) {
        const titulo = tag(it, 'title'), link = tag(it, 'link'), data = tag(it, 'pubDate'), fonte = tag(it, 'source');
        const idade = (Date.now() - new Date(data).getTime()) / 864e5;
        if (!link || !PALAVRAS.test(titulo) || idade > 14) continue;
        achados.push({ id: 'n:' + link, texto: '**' + titulo + '**' + (fonte ? ' (' + fonte + ')' : '') + ' — ' + (data ? new Date(data).toLocaleDateString('pt-BR') : ''), link });
      }
    } catch (e) { console.error('busca falhou:', q, e.message); }
  }
}

async function camara() {   // PECs e projetos sobre jornada, mais recentes (dados abertos da Câmara)
  for (const sigla of ['PEC']) {
    try {
      const j = await (await pegar('https://dadosabertos.camara.leg.br/api/v2/proposicoes?siglaTipo=' + sigla + '&keywords=jornada%20de%20trabalho&ordenarPor=id&ordem=DESC&itens=8&formato=json')).json();
      for (const p of (j.dados || [])) {
        achados.push({ id: 'c:' + p.id, texto: '**' + p.siglaTipo + ' ' + p.numero + '/' + p.ano + '** (Câmara): ' + String(p.ementa || '').slice(0, 220), link: 'https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=' + p.id });
      }
    } catch (e) { console.error('câmara falhou:', sigla, e.message); }
  }
}

await noticias();
await camara();

const novos = achados.filter((a, i, v) => !vistos.has(a.id) && v.findIndex(b => b.id === a.id) === i);
console.log('itens encontrados: ' + achados.length + ' · novos: ' + novos.length + (estado.primeira ? ' · (primeira execução: só registra a base)' : ''));
novos.slice(0, 10).forEach(n => console.log(' - ' + n.texto));
if (SECO) process.exit(0);

if (novos.length && !estado.primeira) {
  const corpo = 'O vigia semanal encontrou **' + novos.length + '** novidade(s) que podem afetar as regras do app (jornada, escala, férias).\n\n' +
    novos.slice(0, 25).map(n => '- ' + n.texto + '\n  ' + n.link).join('\n') +
    '\n\n**O que fazer:** abra os links, veja se algo muda `regras/trabalhistas.json` (limites de horas, datas, férias). ' +
    'Se mudar, peça ao Claude para atualizar o arquivo e subir a `VERSAO` em `sw.js`. Nada foi alterado automaticamente.\n\n' +
    '_Atenção: notícias podem estar erradas. Confirme na norma oficial (DOU / Planalto) antes de mudar._';
  try {
    execFileSync('gh', ['issue', 'create', '--title', 'Vigia: possível mudança nas regras trabalhistas (' + new Date().toLocaleDateString('pt-BR') + ')', '--body', corpo, '--label', 'regras'], { stdio: 'inherit' });
  } catch {
    execFileSync('gh', ['issue', 'create', '--title', 'Vigia: possível mudança nas regras trabalhistas (' + new Date().toLocaleDateString('pt-BR') + ')', '--body', corpo], { stdio: 'inherit' });
  }
}
novos.forEach(n => vistos.add(n.id));
fs.writeFileSync(ESTADO, JSON.stringify({ atualizado_em: new Date().toISOString().slice(0, 10), vistos: [...vistos].slice(-600) }, null, 1) + '\n');
