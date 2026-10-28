# Desenvolvimento e publicação do Fluxo

O fluxo é simples: issue quando há trabalho a rastrear, branch com escopo definido, pull request validado e versão estável na `main`. Não há necessidade de uma segunda branch permanente `develop`.

## Branches e etapas

- `main`: linha estável; recebe alterações por PR com CI aprovado. Não é uma cópia antiga do produto.
- `ai_service`: etapa de integração de IA já incorporada à `main` pela PR #3. Correções posteriores partem da `main` atual em branch própria; não reutilizar a etapa concluída para mudanças independentes.
- Evoluções grandes: abrir uma issue com escopo/critérios e uma branch `codex/feature-<tema>`, com PR em rascunho desde o início.
- Correções: abrir issue `bug` e branch `codex/fix-<numero>-<tema>`. Se uma correção pertence a uma etapa ainda não integrada, corrigir nessa etapa e referenciar a issue.
- Manutenção: `codex/chore-<tema>`. Uma alteração pequena também usa PR; não precisa de uma branch permanente adicional.

Cada PR representa uma mudança compreensível e preserva regras financeiras não relacionadas. Não misturar migrações de dados, refatorações visuais e alterações de cálculo sem necessidade. Não rebasear ou reescrever histórico já publicado para esconder uma fixture fictícia.

## Issues

Use o formulário **Relatar erro** para regressões e **Propor evolução** para novas etapas. Inclua comportamento observado/esperado, reprodução com dados fictícios, plataforma e versão/commit. Use os labels `bug`, `enhancement` e `documentation` existentes.

Vulnerabilidades e credenciais reais não vão para issues públicas: siga [SECURITY.md](SECURITY.md). Não publique tokens, extratos ou dados financeiros pessoais.

O PR referencia a issue com `Fixes #numero` quando a integração a resolve, ou `Refs #numero` quando faz parte de uma etapa. Ao concluir uma correção publicada diretamente de uma etapa autorizada, registrar commit/deploy na issue antes de encerrá-la.

## Verificações

```bash
npm ci
npm run check:secrets
npm test
npm run lint
npm run typecheck --workspace mobile
npm run build
npm run validate:ai-scheduled
npm run validate:ai-critical-path
```

O CI executa os mesmos checks sem chave Gemini real, sem secrets de produção e sem publicar automaticamente. Os jobs **Segredos** e **Qualidade** são as verificações exigidas para integrar à `main`. A revisão não exige aprovação de outra pessoa, pois este projeto pode ser mantido por um único autor; as verificações e o PR continuam obrigatórios.

O CI roda em PRs e em pushes na `main`. Branches de trabalho abrem PR cedo para receber os checks. Isso evita duas execuções com os mesmos nomes no mesmo commit, cujo cancelamento deixaria um check obrigatório bloqueando o merge apesar de a outra execução passar.

Antes de criar um commit, confira também o que está efetivamente no índice:

```bash
git add <arquivos-da-alteracao>
npm run check:secrets -- --staged
git diff --cached --stat
```

Fixtures que simulam credenciais são construídas em memória a partir de fragmentos, nunca copiadas inteiras para o fonte. Testes não têm exclusão no scanner. A checagem local detecta formatos conhecidos e complementa o secret scanning/push protection do GitHub; ela não prova ausência de toda espécie possível de segredo.

## Merge e releases

Prefira squash merge para PRs pequenos. Uma etapa extensa pode usar merge commit quando preservar seus commits ajuda a revisão. A branch de etapa só é removida depois da integração e quando não há mais trabalho dependente. Não apagar automaticamente branches antigas nem worktrees de outras etapas.

Uma release estável nasce de um commit validado da `main`, com tag SemVer e notas de versão. Use incremento minor para uma nova funcionalidade compatível, patch para correções e major para mudanças incompatíveis. As notas devem identificar migrations, testes, commit de origem, limitações e RPM/APK quando gerados. Não criar tags de versão a cada commit intermediário.

Há números de pacote diferentes nos manifests web, Android e RPM. Eles não são renumerados incidentalmente por uma correção de segurança; a release registra as versões reais dos artefatos, inclusive `versionCode` Android quando aplicável.

## Deploy

Produção usa o Worker e o D1 já existentes. A publicação é explícita, normalmente de um commit validado da `main`. Durante uma etapa, uma publicação expressamente autorizada de outra branch deve registrar branch, SHA e URL; isso não integra automaticamente a etapa à `main`.

```bash
npm run deploy
```

O script resolve o D1 de produção, verifica o binding do artefato e publica o Worker existente. Não colocar tokens no comando, workflow ou arquivos versionados. Após publicar, verificar assets/rotas, autenticação esperada e o endpoint da API; testes financeiros com escrita ficam restritos a banco descartável local.

RPM/APK assinados continuam sendo gerados pelos scripts locais com SDK/JDK e chaves do proprietário. O CI de qualidade não precisa dessas credenciais.

Referências: [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow), [Fluxo IA](docs/FLUXO-IA.md), [publicação](docs/03-publicacao.md).
