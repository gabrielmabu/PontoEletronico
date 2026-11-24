# Instalador (Etapa 3)

Aplicativo da web que roda **como a pessoa que abre o link** (a conta Google do cliente), com permissões mínimas
(`drive.file`, e-mail e acesso à internet do script). Ele cria na conta do cliente:

1. uma planilha nova, "Ponto — <empresa>" (o banco de dados dele);
2. uma pasta "Ponto — <empresa> (fotos do ponto)";
3. compartilha as duas (editor) com a conta do operador do servidor;
4. pede ao servidor (`apiRegistrarCliente`) que monte as abas, a loja e o administrador dentro da planilha.

No fim entrega o link do app: `https://gabrielmabu.github.io/PontoEletronico/?c=<id-do-cliente>`.

- Publicado pelo workflow `Publicar backend (Apps Script)` na implantação cujo ID está em `DEPLOYMENT_ID` (não é segredo).
- Enquanto o app do Google estiver "não verificado", quem instala vê um aviso: **Avançado → Acessar**.
- Se algo falhar no meio, o cliente pode abrir o link de novo: o instalador reaproveita o que já criou.
