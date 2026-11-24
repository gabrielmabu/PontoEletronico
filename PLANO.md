# Plano: Ponto Facial → produto com instalador por QR code

> Documento vivo. Atualize o "Estado" ao terminar cada etapa.

## Estado (24/11/2026)
- ✅ **No ar (main / GitHub Pages):** app instalável (PWA), convite de instalação ao abrir o link, câmera guiada (luz, posição, foco, prova de vida por giro de cabeça, cadastro em 3 ângulos, média de amostras), modelos aquecidos após o login, comprovante tipo recibo.
- ⏳ **Teste em celular real** com a Luciana Noivas (cliente nº 1): manhã de 25/11.
- ⛔ **Backend (Apps Script) ainda fora do repositório.** É a 1ª tarefa da tarde (Etapa 1).

---

## Arquitetura alvo
O cliente final **só precisa de conta Google**. GitHub é só do desenvolvedor.

```
Cartão (QR) → GitHub Pages /instalar → "Entrar com Google" → Apps Script CENTRAL
                     │                                          │
               app único (?c=empresa)                 cria na conta do CLIENTE:
               PWA, logo/cores do cliente              planilha + pastas do Drive
                     │                                          │
                     └──────── API (mesmas fn) ────────► Sheets/Drive do cliente
GitHub Actions (clasp) ──publica──► Apps Script central (um código para todos)
```

| Peça | Papel |
|---|---|
| GitHub Pages | Front único (app + instalador), cache/CDN grátis, multi-cliente via `?c=<id>` |
| GitHub Actions + clasp | Merge na main publica o Apps Script automaticamente (`clasp push` + `clasp deploy -i <id fixo>`) |
| Apps Script central (conta do dev) | Backend de todos os clientes + instalador. Abre a planilha certa pelo `c` |
| Sheets/Drive do cliente | Banco grátis + selfies/atestados. Compartilhados com a conta do dev (operador LGPD) |
| Planilha "Catálogo" (conta do dev) | Lista de clientes **e base de mailing** (ver Etapa 3) |

**Por que central e não uma cópia por cliente:** uma atualização vale para todos, o cliente não precisa "implantar" nada e o instalador só pede o escopo `drive.file` (não sensível → verificação simples do Google, sem auditoria paga).

**Limites da conta gratuita:** cerca de 30 execuções simultâneas no Apps Script → cerca de 15 a 30 lojas. Acima disso: Workspace ou backend em Firebase, sem mudar front/instalador.

---

## Etapa 1: backend no repositório + publicação automática (tarde, no computador, ~15 min)
1. Ativar a "API Google Apps Script" em https://script.google.com/home/usersettings.
2. No computador: `npm i -g @google/clasp` → `clasp login` (abre o navegador, conta dona da planilha).
3. Na raiz do repo: `clasp clone <ID do script> --rootDir apps-script` (ID em Apps Script → ⚙️ Configurações do projeto).
4. Commit de `apps-script/` (código atual, **sem alterar nada**) → push.
5. Anotar o **ID da implantação atual** (Implantar → Gerenciar implantações). É ele que mantém a `API_URL` do `index.html`.
6. GitHub → Settings → Secrets → Actions: `CLASPRC_JSON` = conteúdo de `~/.clasprc.json`; `DEPLOYMENT_ID` = o ID do passo 5.
7. Criar `.github/workflows/apps-script.yml`: em push na main que mexa em `apps-script/**` → `clasp push -f` e `clasp deploy -i $DEPLOYMENT_ID -d "<sha>"`.
8. Testar: mudança inofensiva (comentário) → merge → nova versão aparece em "Gerenciar implantações".

## Etapa 2: servidor central multi-cliente
- Toda `fn` da API passa a receber o cliente (`c`). O servidor abre `SpreadsheetApp.openById(catalogo[c].planilha)` em vez da planilha vinculada. Cache do mapa em `CacheService`.
- Luciana Noivas = cliente nº 1; sem `?c=` o front usa o cliente padrão (compatibilidade total com o link atual).
- Front: `API_URL` e marca (nome, logo, cor) vêm de `apiMarca(c)`; manifest por cliente (ícone instalado com o logo dele).
- Conferir no código atual se a comparação facial usa **o menor** valor entre os 3 descritores do cadastro (ideal com fotos em ângulos) ou a média. Se for média, trocar para o menor.

## Etapa 3: instalador + mailing
Página `instalar/` (Pages) → Web App do instalador (executa como o usuário, escopo `drive.file` + e-mail).

**Formulário** (campos com * são obrigatórios):
| Campo | Regra |
|---|---|
| Nome da empresa* | |
| Logo* | PNG/JPG até 2 MB; gera ícones do app |
| Nome do responsável* | |
| **WhatsApp*** | Formato BR: `+55 (DD) 9XXXX-XXXX`, com máscara; validar 10–11 dígitos; salvar em E.164 (`+55DD9XXXXXXXX`) |
| E-mail | Vem da conta Google (não digita) |
| Localização da loja* | "Usar minha localização" ou endereço |
| Nº de colaboradores | Faixas: 1–5 / 6–15 / 16–50 / 50+ (qualifica o lead) |
| ☐ Aceito receber novidades e ofertas por WhatsApp/e-mail | **Opcional e desmarcado** (LGPD: consentimento de marketing separado do uso do app) |

**Catálogo/Mailing** (aba `Clientes` na planilha do dev): `id, empresa, responsavel, whatsapp_e164, email, colaboradores_faixa, aceita_marketing, aceite_em, origem (utm do QR), criado_em, planilha_id, status (teste/ativo/cancelado), ultimo_acesso`.
- QR do cartão com `?origem=cartao-<evento>` para medir de onde veio cada lead.
- Botão "Falar com o desenvolvedor" (link `wa.me/<seu número>`) no fim da instalação e no painel admin.
- Ao instalar: notificar o dev (e-mail via `MailApp` com resumo do lead).

**O que o instalador cria na conta do cliente:** planilha a partir do modelo (abas atuais, sem dados), pastas (Selfies, Relatórios, Atestados), Config preenchida, compartilhamento com a conta do dev, linha no Catálogo. Fim: link do app + QR + convite de instalação + login do admin.

## Etapa 4: recuperação de senha ("Esqueci minha senha")
Simples e sem custo de SMS/WhatsApp API:

**Colaborador(a), pelo rosto** (caminho principal):
1. Login → "Esqueci minha senha" → escolhe o nome.
2. Abre a câmera com **prova de vida** (mesmo `obterRosto(..., { vida: true })`).
3. Servidor `apiRecuperarPorRosto(login, descritor)`: compara com o cadastro (mesmo limite facial), com no máximo 3 tentativas por hora por login e registro no `Log`.
4. Se bater: gera token de 10 min → tela "Crie sua nova senha" (reusa a tela `trocar`).
- Sem rosto cadastrado ou falhou 3x → **"Pedir ao gestor"**: cria pedido; o admin vê um aviso no painel com o botão "Resetar senha" (já existe `apiAdminResetSenha` → senha padrão + primeiro acesso).

**Administrador (dono da empresa), pelo Google:**
- "Esqueci minha senha" no login do admin → envia **link por e-mail** para o e-mail da conta Google cadastrada (`MailApp`, token de uso único, 15 min) → define nova senha.
- Alternativa: entrar de novo pelo instalador com a mesma conta Google ("Já tenho o app") → redefine a senha do admin.

## Etapa 5: tour + padrões CLT
- **Tour do admin** (4 telas, "Pular", "Rever tour" no menu): boas-vindas → confirmar loja/raio → adicionar colaboradores (mostra senha padrão) → bater ponto de teste (marcado TESTE, fora do espelho). Checklist no painel para o que faltar.
- **Mini-tour da colaboradora** na 1ª batida: luz, moldura, giro do rosto.
- **Padrões da planilha modelo:**
  - Jornada de 44h semanais (seg–sex 8h + sáb 4h, domingo folga; alternativa seg–sex 8h48).
  - Almoço de no mínimo 1h e 2 min entre batidas.
  - Tolerância de 5 min por marcação, máx. 10 min/dia (CLT art. 58 §1º).
  - Banco de horas de 6 meses.
  - Hora extra de 50% em dia útil e 100% em domingo/feriado; adicional noturno 22h–5h (exibição).
  - Feriados nacionais do ano.
  - Raio de 150 m, GPS de 100 m, limite facial de 0,5 e sessão de 6h.

## Etapa 6: lançamento comercial
- Domínio próprio no Pages (ex.: `ponto.<sua-marca>.com.br`), política de privacidade e termos.
- Verificação OAuth da marca no Google Cloud (escopo `drive.file`).
- Cartão com QR → `/instalar?origem=cartao`.

---

## Como testar (sem celular)
Chromium/Playwright com câmera falsa:
- Gerar vídeo `.y4m` de um rosto com `ffmpeg` (imagem parada = teste de foto; concatenar frente→lado→frente = teste da prova de vida).
- `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=rosto.y4m`.
- Interceptar `script.google.com` com respostas falsas (`apiEu`, `apiEstado`, `apiBaterPonto`).
- Modelos do face-api: se o jsDelivr estiver bloqueado, baixar de `raw.githubusercontent.com/vladmandic/face-api/master/model/` e servir pela rota.
