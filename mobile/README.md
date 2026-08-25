# Fluxo — aplicativo Android

Cliente offline-first do Fluxo. Registra lançamentos sem rede, sincroniza
quando dá, e sugere lançamentos a partir das notificações de compra dos
aplicativos do banco.

## O que é compartilhado com o site

Toda regra financeira vem de `core/`, na raiz do repositório: competência de
fatura, postagem no razão, saldo, comprometido, limite disponível. O aplicativo
**não** reimplementa nenhum cálculo — `src/finance/derive.ts` traduz a linha do
banco local para o modelo do domínio e chama as mesmas funções que o servidor
chama.

`core/` é consumido como pacote — `@fluxo/core`, declarado como
`file:../core`. Assim o aplicativo depende dele explicitamente, em vez de
alcançá-lo subindo diretórios, e o `node_modules` do site continua sem nada de
React Native. Ver `metro.config.cjs`.

## Rodar

O aplicativo **não** funciona no Expo Go: o listener de notificações é um módulo
nativo, e o Expo Go não o contém. É preciso um build de desenvolvimento.

```bash
cd mobile && npm install
```

```bash
cd mobile && npm run android
```

O segundo comando faz o `prebuild`, compila e instala o APK num aparelho ou
emulador conectado — precisa do Android SDK e de um `adb devices` que enxergue
o aparelho.

Depois do primeiro build, o ciclo do dia a dia é:

```bash
cd mobile && npm start
```

## Conectar a uma conta

O aplicativo não pede senha. O fluxo é:

1. Na tela de conexão, informe o endereço do servidor (o mesmo do navegador).
2. O aplicativo mostra um código de seis caracteres.
3. No site, já autenticado, vá em **Conectar aparelho** e digite o código.
4. O aplicativo troca o código por um token próprio, revogável a qualquer
   momento.

Para apontar o build para um endereço padrão, defina `EXPO_PUBLIC_API_BASE_URL`
no momento do build. É só sugestão de preenchimento — o usuário pode trocar.

Ao rodar contra o servidor de desenvolvimento, o endereço é o IP da máquina na
rede local (`http://192.168.x.x:5173`), não `localhost`: `localhost`, no
aparelho, é o próprio aparelho.

## Leitura de notificações

Exige liberação manual em **Ajustes > Apps > Acesso especial > Acesso a
notificações** — o Android não oferece diálogo em runtime para isso. A tela de
Capturas leva direto para lá.

O serviço nativo (`plugins/native/notifications/`) roda com o aplicativo
fechado e apenas **encaminha o texto bruto** para `POST /api/v1/captures`. Toda
a interpretação — valor, estabelecimento, duplicidade, confiança — acontece no
servidor, com o mesmo domínio que o site usa. Nada entra no razão sem o usuário
confirmar.

## Testes

```bash
npm run test:mobile
```

Rodam da raiz do repositório, junto com `npm test`.

Cobrem o que é puro: derivação dos números a partir do banco local e
normalização do endereço do servidor. O resto — SQLite, rede, telas — depende
do aparelho.

## Estrutura

```
index.ts          entrada; instala o polyfill de crypto antes de tudo
App.tsx           provedores e a bifurcação conectado/desconectado
src/shell.tsx     abas e a folha de lançamento
src/screens/      telas
src/state/        sessão e estado financeiro (o que as telas leem)
src/finance/      tradução do banco local para o domínio compartilhado
src/net/          cliente HTTP, sincronização, pareamento, capturas
src/storage/      SQLite local, fila de saída, fila de capturas
src/session/      token no Keystore
src/ui/           tokens visuais e primitivas
plugins/          plugin de config e fontes Kotlin do listener
```

A dependência anda numa direção só: `telas → estado → rede/domínio →
persistência`. Tela não consulta SQLite e não faz conta de dinheiro.
