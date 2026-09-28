/** Integrações da conta conectada. Segredos ficam apenas no servidor. */
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";

import { call } from "../net/client.ts";
import { Body, Button, Card, Label, Notice, Small } from "../ui/primitives.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

type Provider = "gemini" | "openai" | "github";
type Status = { activeAiProvider: "gemini" | "openai" | null; saved: Record<Provider, boolean> };
const providers: readonly { id: Provider; name: string; detail: string }[] = [
  { id: "gemini", name: "Google Gemini", detail: "TARS e comprovantes" },
  { id: "openai", name: "OpenAI", detail: "Alternativa para TARS e comprovantes" },
  { id: "github", name: "GitHub", detail: "Repositórios, commits, PRs e issues" },
];

export function IntegrationSettings({ baseUrl, token }: { baseUrl: string; token: string }) {
  const palette = usePalette();
  const [status, setStatus] = useState<Status | null>(null);
  const [values, setValues] = useState<Record<Provider, string>>({ gemini: "", openai: "", github: "" });
  const [busy, setBusy] = useState<Provider | null>(null);
  const [message, setMessage] = useState<{ provider: Provider; text: string; error: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    setStatus(null);
    setValues({ gemini: "", openai: "", github: "" });
    void call<Status>("/api/v1/integrations", { baseUrl, token })
      .then((result) => { if (live) setStatus(result); })
      .catch((error: unknown) => { if (live) setMessage({ provider: "gemini", text: error instanceof Error ? error.message : "Não foi possível consultar as integrações.", error: true }); });
    return () => { live = false; };
  }, [baseUrl, token]);

  async function update(method: "POST" | "PATCH" | "DELETE", provider: Provider) {
    setBusy(provider);
    setMessage(null);
    try {
      const result = await call<Status>("/api/v1/integrations", {
        baseUrl, token, method,
        body: method === "POST" ? { provider, token: values[provider].trim() } : { provider },
      });
      setStatus(result);
      if (method === "POST") setValues((current) => ({ ...current, [provider]: "" }));
      setMessage({ provider, text: method === "DELETE" ? "Chave removida desta conta." : method === "PATCH" ? "Provedor selecionado." : "Chave salva nesta conta.", error: false });
    } catch (error) {
      setMessage({ provider, text: error instanceof Error ? error.message : "Não foi possível atualizar.", error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <Label>Integrações desta conta</Label>
      <Body muted style={{ marginTop: space.sm }}>Cada login tem suas próprias chaves. Depois de salvar, elas não aparecem novamente.</Body>
      {status ? providers.map((provider) => {
        const saved = status.saved[provider.id];
        const selected = status.activeAiProvider === provider.id;
        return (
          <View key={provider.id} style={{ borderTopWidth: 1, borderColor: palette.line, paddingTop: space.md, marginTop: space.md, gap: space.sm }}>
            <Body strong>{provider.name}</Body>
            <Small>{provider.detail} · {saved ? "chave cadastrada" : "sem chave"}{selected ? " · ativo" : ""}</Small>
            <TextInput
              accessibilityLabel={`${saved ? "Substituir" : "Adicionar"} chave ${provider.name}`}
              placeholder="Cole a chave aqui"
              placeholderTextColor={palette.inkSubtle}
              secureTextEntry autoCapitalize="none" autoCorrect={false}
              value={values[provider.id]}
              onChangeText={(value) => setValues((current) => ({ ...current, [provider.id]: value }))}
              style={{ minHeight: 48, borderWidth: 1, borderColor: palette.line, borderRadius: radius.md, paddingHorizontal: space.md, color: palette.ink, backgroundColor: palette.surfaceSunken }}
            />
            <Button label={saved ? "Substituir chave" : "Salvar chave"} disabled={values[provider.id].trim().length < 8} busy={busy !== null} onPress={() => void update("POST", provider.id)} />
            {saved && provider.id !== "github" && !selected ? <Button label="Usar para TARS" variant="secondary" busy={busy !== null} onPress={() => void update("PATCH", provider.id)} /> : null}
            {saved ? <Button label="Excluir chave" variant="danger" busy={busy !== null} onPress={() => void update("DELETE", provider.id)} /> : null}
            {message?.provider === provider.id ? <Small tone={message.error ? "negative" : "positive"}>{message.text}</Small> : null}
          </View>
        );
      }) : <Notice tone="caution">{message?.text ?? "Consultando integrações…"}</Notice>}
      <Small style={{ marginTop: space.md }}>GitHub: prefira token fine-grained com leitura em Contents, Issues e Pull requests.</Small>
    </Card>
  );
}
