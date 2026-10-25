# Segurança

Não inclua credenciais ou dados pessoais em issues, PRs, screenshots ou logs. Para uma vulnerabilidade, use [reporte privado no GitHub](https://github.com/yanscholze/fluxo_pessoal/security/advisories/new).

As chaves pessoais são configuradas em Configurações → Integrações, cifradas por conta no backend. Alternativas por ambiente ficam em arquivos ignorados ou secrets do Worker; exemplos versionados ficam vazios. Nunca coloque chaves no frontend, APK, fonte ou repositório.

## Alertas de secret scanning

1. Verifique de onde o valor veio sem copiá-lo para comentários ou logs.
2. Se for uma credencial real ou houver dúvida sobre sua origem, trate-a como exposta: revogue/rotacione no provedor e avalie o alcance antes de encerrar o alerta.
3. Se houver evidência de que é uma fixture fictícia, remova o formato completo do fonte e mantenha a cobertura gerando o exemplo em memória. Classifique o alerta como **used in tests**, com a justificativa correta; não use **revoked** para algo que nunca foi uma chave válida.
4. Preserve secret scanning e push protection. Não excluir diretórios de testes da varredura nem reescrever o histórico publicado apenas para ocultar um falso positivo.

`npm run check:secrets` examina arquivos versionados e novos não ignorados; `npm run check:secrets -- --staged` examina o índice que será commitado. O CI confere novamente a revisão recebida. A saída contém somente arquivo, linha e tipo do possível segredo, sem seu valor. O scanner cobre formatos conhecidos de Google, GitHub, OpenAI, AWS, JWT e chaves privadas; não substitui revisão e proteção do provedor.
