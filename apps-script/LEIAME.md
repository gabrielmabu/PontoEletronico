# Backend (Apps Script)

Código do servidor do app. É o **mesmo código para todos os clientes**. Cada merge na `main` que mexer nesta pasta
**publica sozinho** (workflow `Publicar backend`) na implantação que o app já usa, então a URL não muda.

## Uma vez só: ligar a publicação automática (computador, ~10 min)
1. Ative a **API do Google Apps Script**: https://script.google.com/home/usersettings
2. No computador: `npm i -g @google/clasp` e depois `clasp login` (entre com a conta dona da planilha).
3. Abra o arquivo `.clasprc.json` da sua pasta de usuário (Windows: `C:\Users\<você>\.clasprc.json`).
4. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLASPRC_JSON` = o conteúdo inteiro do `.clasprc.json`
   - `DEPLOYMENT_ID` = o ID da implantação em uso (Apps Script → Implantar → Gerenciar implantações). É o trecho `AKfy...` da URL do app.
5. **Actions → Publicar backend → Run workflow** para testar. Uma nova versão deve aparecer em "Gerenciar implantações".

> ⚠️ O `CLASPRC_JSON` dá acesso à sua conta Google. Só em **Secrets**, nunca em arquivo do repositório.
> Se trocar a senha do Google ou revogar o acesso, rode `clasp login` de novo e atualize o segredo.

## Regras
- Nomes das funções `api*` e formatos de resposta **não mudam** (o app em produção chama por nome).
- Abas e colunas da planilha não mudam de nome; coluna nova vai no fim.
- Sem segredos no código: senhas e IDs de planilha ficam na aba `Config`/Propriedades do script.
- `Index.html` e `LogoB64.html` aqui são da versão antiga (tela dentro do Google). O app de verdade é o `index.html` da raiz.

## Arquivos novos desta etapa
- `Contatos.gs`: recebe os contatos da página `/instalar` (QR do cartão) e grava numa planilha separada de captação.
- `tests/`: testes que rodam no GitHub antes de publicar.
