# Fluxo Android

Aplicativo nativo Android do Fluxo, construído com Expo SDK 57 e React Native. O estado financeiro é mantido em SQLite no aparelho; alterações offline entram em uma fila local e são sincronizadas com a API v1 quando a conexão volta.

## Rodar durante o desenvolvimento

```bash
npm install
npm run android
```

O primeiro uso mostra **Conectar**. O app abre a página segura do Fluxo no navegador, o usuário confirma o aparelho e retorna automaticamente ao aplicativo. Os tokens ficam no armazenamento criptografado do Android.

## Validar

```bash
npm run typecheck
npm test
npx expo export --platform android
```

## Gerar APK de teste

Com uma conta Expo configurada:

```bash
npx eas-cli build --platform android --profile preview
```

O perfil `preview` produz um APK de instalação direta. O perfil `production` produz um Android App Bundle para a Play Store.

## Próximos módulos nativos

- widget Samsung/Android com saldo, fatura e ação de lançamento rápido;
- importação de arquivos compartilhados para o aplicativo;
- notificações de limites, vencimentos e previsões.
