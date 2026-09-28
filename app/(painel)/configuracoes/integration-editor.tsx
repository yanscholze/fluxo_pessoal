"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { IntegrationStatus } from "../../../server/services/integration-credentials.ts";
import type { AiProvider, IntegrationProvider } from "../../../server/repositories/integrations.ts";
import { Button } from "../../ui/controls.tsx";
import { Badge, Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";

const PROVIDERS: readonly {
  id: IntegrationProvider;
  title: string;
  hint: string;
  keyUrl: string;
  keyLabel: string;
}[] = [
  { id: "gemini", title: "Google Gemini", hint: "TARS e leitura de comprovantes", keyUrl: "https://aistudio.google.com/app/apikey", keyLabel: "Criar chave no Google AI Studio" },
  { id: "openai", title: "OpenAI", hint: "Provedor alternativo para TARS e comprovantes", keyUrl: "https://platform.openai.com/api-keys", keyLabel: "Criar chave na OpenAI" },
  { id: "github", title: "GitHub", hint: "Repositórios, commits, pull requests e issues dos projetos", keyUrl: "https://github.com/settings/personal-access-tokens/new", keyLabel: "Criar token de acesso no GitHub" },
];

type ApiReply = { data?: IntegrationStatus; error?: { message?: string } };

export function IntegrationEditor({ initialStatus }: { initialStatus: IntegrationStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [tokens, setTokens] = useState<Record<IntegrationProvider, string>>({ gemini: "", openai: "", github: "" });
  const [busy, setBusy] = useState<IntegrationProvider | null>(null);
  const [feedback, setFeedback] = useState<{ provider: IntegrationProvider; text: string; error: boolean } | null>(null);

  async function update(method: "POST" | "PATCH" | "DELETE", provider: IntegrationProvider, token?: string) {
    setBusy(provider);
    setFeedback(null);
    try {
      const response = await fetch("/api/v1/integrations", {
        method,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(token === undefined ? { provider } : { provider, token }),
      });
      const body = (await response.json()) as ApiReply;
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Não foi possível atualizar a integração.");
      setStatus(body.data);
      if (method === "POST") setTokens((current) => ({ ...current, [provider]: "" }));
      setFeedback({ provider, text: method === "DELETE" ? "Chave removida desta conta." : method === "PATCH" ? "Provedor de IA selecionado." : "Chave salva nesta conta.", error: false });
      router.refresh();
    } catch (error) {
      setFeedback({ provider, text: error instanceof Error ? error.message : "Não foi possível atualizar a integração.", error: true });
    } finally {
      setBusy(null);
    }
  }

  function save(event: FormEvent<HTMLFormElement>, provider: IntegrationProvider) {
    event.preventDefault();
    const token = tokens[provider].trim();
    if (token) void update("POST", provider, token);
  }

  return (
    <div className="space-y-5">
      <Notice tone="info">Estas chaves pertencem somente à conta com a qual você entrou. Cada pessoa cadastra as próprias chaves e escolhe seu provedor de IA. Depois de salvas, as chaves não aparecem novamente na tela.</Notice>
      <div className="grid gap-4 lg:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const saved = status.saved[provider.id];
          const selected = status.activeAiProvider === provider.id;
          return (
            <Panel key={provider.id} padding="lg" className={provider.id === "github" ? "lg:col-span-2" : undefined}>
              <PanelHeader title={provider.title} hint={provider.hint} action={<Badge tone={saved ? "positive" : "neutral"}>{saved ? "Chave cadastrada" : "Sem chave"}</Badge>} />
              <form className="mt-4 space-y-3" onSubmit={(event) => save(event, provider.id)}>
                <label className="block text-body-sm font-medium text-ink" htmlFor={`token-${provider.id}`}>{saved ? "Substituir chave" : "Adicionar chave"}</label>
                <input id={`token-${provider.id}`} type="password" autoComplete="new-password" spellCheck={false}
                  value={tokens[provider.id]}
                  onChange={(event) => setTokens((current) => ({ ...current, [provider.id]: event.target.value }))}
                  placeholder="Cole a chave aqui" minLength={8} maxLength={1000}
                  className="w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 py-2 text-body-sm text-ink outline-none focus:border-accent" />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" variant="primary" busy={busy !== null} disabled={tokens[provider.id].trim().length < 8}>{saved ? "Substituir" : "Salvar chave"}</Button>
                  {saved && provider.id !== "github" && !selected ? <Button busy={busy !== null} onClick={() => void update("PATCH", provider.id as AiProvider)}>Usar para TARS</Button> : null}
                  {saved ? <Button variant="danger" busy={busy !== null} onClick={() => void update("DELETE", provider.id)}>Excluir chave</Button> : null}
                  {selected ? <Badge tone="accent">Provedor ativo do TARS</Badge> : null}
                </div>
              </form>
              <a href={provider.keyUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-block text-body-sm text-accent hover:underline">{provider.keyLabel} ↗</a>
              {provider.id === "github" ? <p className="mt-2 text-caption text-ink-subtle">Prefira um token fine-grained com acesso somente aos repositórios desejados e permissões de leitura em Contents, Issues e Pull requests.</p> : null}
              {feedback?.provider === provider.id ? <p role={feedback.error ? "alert" : "status"} className={`mt-3 text-body-sm ${feedback.error ? "text-negative" : "text-positive"}`}>{feedback.text}</p> : null}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
