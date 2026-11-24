# ⚠️ Aviso para o Claude (leia antes de mexer)

Este projeto está em transição de "app de ponto de um cliente" para **produto com instalador por QR code**.
**O plano completo e o estado atual estão em [`PLANO.md`](PLANO.md). Comece por lá.**

**Próxima tarefa:** *Etapa 1* do PLANO.md: trazer o backend (Apps Script) para `apps-script/` com `clasp` e configurar a publicação automática pelo GitHub Actions. O dono do projeto vai estar no computador: guie passo a passo, em português simples.

## O que existe hoje
- `index.html`: app inteiro (front), publicado pelo GitHub Pages a partir da `main`. **Está em produção** com a cliente Luciana Noivas: colaboradoras batem ponto todo dia por ele.
- `manifest.webmanifest`, `sw.js`, `icons/`: app instalável (PWA). Ao mudar arquivos do app, **suba a `VERSAO` em `sw.js`** para os celulares pegarem a atualização.
- Backend: Apps Script vinculado à planilha "Ponto Facial Noivas", chamado por `api(fn, ...)` em `index.html` (`API_URL`).

## Regras
- **Não quebrar a produção:** manter os nomes e formatos das `fn` da API (`apiLogin`, `apiBaterPonto`, `apiCadastrarRosto`…) e a `API_URL`. Publicar sempre na **mesma implantação** (`clasp deploy -i <id>`), senão a URL muda.
- Abas e colunas da planilha não mudam de nome. Coluna nova vai sempre **no fim**.
- Textos para o usuário em **português do Brasil**; números no padrão BR (vírgula decimal).
- Nada de segredos no repositório: o GitHub Pages publica tudo que está aqui. Tokens só em GitHub Secrets.
- Dados pessoais (LGPD): selfies/descritores só para ponto; consentimento de marketing do instalador é **separado e opcional**.
- Teste antes de subir: ver "Como testar" no fim do PLANO.md (Playwright com câmera falsa e API interceptada).
