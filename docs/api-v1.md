# API Fluxo v1

Esta é a primeira versão do contrato compartilhado pelo site e pelo futuro aplicativo Android. A interface web atual continua usando `/api/finance`; os novos clientes devem usar as rotas abaixo.

## Descoberta

`GET /api/v1` informa a versão do contrato, os recursos disponíveis e o limite de alterações por lote.

## Estado financeiro

`GET /api/v1/finance` devolve o mesmo retrato financeiro usado pelo site, protegido pela autenticação do proprietário.

## Sincronização

`GET /api/v1/sync` devolve um retrato completo do estado atual. `POST /api/v1/sync` recebe até 50 alterações pendentes do dispositivo e devolve o resultado individual de cada uma junto do novo retrato completo.

Cada alteração contém:

- `mutationId`: identificador único da tentativa, reutilizado em novas tentativas;
- `entityId`: identificador estável do lançamento;
- `operation`: `upsert` ou `delete`;
- `baseVersion`: versão que o dispositivo editou;
- `data`: lançamento completo, obrigatório em `upsert`.

Os resultados possíveis são `applied`, `conflict`, `duplicate`, `noop` e `rejected`. Uma alteração aplicada incrementa a versão do lançamento. Uma alteração baseada em versão antiga retorna `conflict` e a versão atual do servidor, sem sobrescrever dados silenciosamente.

Exclusões são lógicas. O lançamento deixa de aparecer no retrato e seu efeito no saldo é revertido, mas o registro permanece disponível para consistência da sincronização.

## Autenticação móvel

As rotas v1 aceitam a identidade autenticada do site ou uma sessão de aparelho. O Android inicia a autorização em `/conectar-android`, o usuário confirma dentro do Fluxo e o navegador devolve uma sessão revogável ao aplicativo.

O token do aparelho é aleatório e somente seu hash é persistido no D1. A sessão dura 180 dias, pode ser renovada conectando novamente o mesmo aparelho e pode ser revogada pelo proprietário. O aplicativo guarda as credenciais no armazenamento criptografado do Android e nunca recebe nem armazena a senha do usuário.

Requisições móveis enviam o token do aparelho em `Authorization: Bearer …`. O acesso ao dispatcher do site usa separadamente a credencial privada entregue durante a autorização; ela não fica gravada no código-fonte nem no APK.
