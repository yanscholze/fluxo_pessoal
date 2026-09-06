/**
 * Entrar no Fluxo.
 *
 * Mesmo e-mail e mesma senha do site. O aparelho não pergunta endereço de
 * servidor: ele já sabe para onde apontar, embutido no momento do build — e
 * perguntar isso na primeira tela é pedir ao usuário um dado que o aplicativo
 * tem. Quem hospeda em outro endereço troca em Ajustes, que é onde a resposta
 * "não é este servidor" cabe.
 *
 * O que fica guardado é o **token de aparelho** que o servidor devolve, no
 * armazenamento criptografado do Android. A senha existe durante a chamada e
 * some com a tela: nunca é escrita em disco, nem no banco local, nem em log.
 *
 * O pareamento por código continua no servidor e é mais forte para conectar um
 * aparelho de terceiro. Para o dono entrando no próprio celular, ele cobrava
 * abrir o site no computador antes de cada conexão — atrito sem ganho, já que
 * quem tem a senha entra pelo site de qualquer jeito.
 */

import { useCallback, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { normalizeBaseUrl, suggestedBaseUrl } from "../config.ts";
import { deviceName } from "../device.ts";
import { signIn, signUp } from "../net/auth.ts";
import { ApiError, OfflineError } from "../net/client.ts";
import { useSession } from "../state/session.tsx";
import { Body, Button, Card, Figure, Label, Notice, Small } from "../ui/primitives.tsx";
import { familiaDoPeso } from "../ui/fonts.ts";
import { radius, space, type, usePalette } from "../ui/theme.ts";

type Modo = "entrar" | "criar";

export function ConectarScreen() {
  const palette = usePalette();
  const { connect } = useSession();

  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** Onde o servidor mora. Vem do build; Ajustes troca depois, se precisar. */
  const [servidor, setServidor] = useState(suggestedBaseUrl());
  const [trocandoServidor, setTrocandoServidor] = useState(false);

  const criando = modo === "criar";

  const entrar = useCallback(async () => {
    const baseUrl = normalizeBaseUrl(servidor);
    if (!baseUrl) {
      setErro("O endereço do servidor está vazio. Toque em “Outro servidor” para informá-lo.");
      return;
    }
    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }
    if (criando && !nome.trim()) {
      setErro("Informe seu nome.");
      return;
    }

    setOcupado(true);
    setErro(null);

    try {
      const resultado = criando
        ? await signUp({ baseUrl, email, password: senha, displayName: nome })
        : await signIn({ baseUrl, email, password: senha, deviceName });

      // A senha sai da memória junto com a tela: o que persiste é o token.
      setSenha("");
      await connect({ baseUrl, token: resultado.token, user: resultado.user });
    } catch (problema) {
      setErro(
        problema instanceof OfflineError
          ? "Não foi possível falar com o servidor. Confira sua conexão."
          : problema instanceof ApiError
            ? problema.message
            : criando
              ? "Não foi possível criar a conta."
              : "Não foi possível entrar.",
      );
    } finally {
      setOcupado(false);
    }
  }, [servidor, email, senha, nome, criando, connect]);

  const campo = [
    { fontFamily: familiaDoPeso(type.body.fontWeight) },
    type.body,
    {
      marginTop: space.sm,
      color: palette.ink,
      backgroundColor: palette.surfaceSunken,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: 14,
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: space.xs, paddingTop: space.lg }}>
          <Figure small>Fluxo</Figure>
          <Body muted>
            {criando ? "Crie sua conta para começar." : "Entre com a sua conta do Fluxo."}
          </Body>
        </View>

        <Card>
          {criando ? (
            <>
              <Label>Nome</Label>
              <TextInput
                value={nome}
                onChangeText={setNome}
                autoCapitalize="words"
                autoComplete="name"
                placeholder="Como quer ser chamado"
                placeholderTextColor={palette.inkSubtle}
                style={campo}
              />
              <View style={{ height: space.md }} />
            </>
          ) : null}

          <Label>E-mail</Label>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            placeholder="voce@exemplo.com"
            placeholderTextColor={palette.inkSubtle}
            style={campo}
          />

          <View style={{ height: space.md }} />

          <Label>Senha</Label>
          <TextInput
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={criando ? "new-password" : "current-password"}
            placeholder={criando ? "Ao menos dez caracteres" : "Sua senha"}
            placeholderTextColor={palette.inkSubtle}
            onSubmitEditing={() => void entrar()}
            returnKeyType="go"
            style={campo}
          />

          <Button
            label={criando ? "Criar conta" : "Entrar"}
            onPress={() => void entrar()}
            busy={ocupado}
            style={{ marginTop: space.lg }}
          />

          <Button
            label={criando ? "Já tenho conta" : "Criar uma conta"}
            variant="ghost"
            onPress={() => {
              setModo(criando ? "entrar" : "criar");
              setErro(null);
            }}
            style={{ marginTop: space.sm }}
          />
        </Card>

        {erro ? <Notice tone="negative">{erro}</Notice> : null}

        {/* Escondido por padrão: a instalação normal aponta para o servidor do
            build, e um campo de endereço na primeira tela só cria dúvida sobre
            uma resposta que o aplicativo já tem. */}
        {trocandoServidor ? (
          <Card>
            <Label>Endereço do servidor</Label>
            <TextInput
              value={servidor}
              onChangeText={setServidor}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              inputMode="url"
              placeholder="fluxo.seudominio.com.br"
              placeholderTextColor={palette.inkSubtle}
              style={campo}
            />
            <Small style={{ marginTop: space.sm }}>
              O mesmo endereço que você usa no navegador.
            </Small>
          </Card>
        ) : (
          <Button
            label="Outro servidor"
            variant="ghost"
            onPress={() => setTrocandoServidor(true)}
          />
        )}

        <Card>
          <Label>Segurança</Label>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Small tone="muted">
              A senha é usada uma vez, para entrar, e não fica guardada no aparelho.
            </Small>
            <Small tone="muted">
              O que fica é um token deste aparelho, no armazenamento criptografado do Android.
            </Small>
            <Small>Você pode revogá-lo a qualquer momento pelo site, sem trocar a senha.</Small>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
