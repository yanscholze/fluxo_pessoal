"use client";

/**
 * Quem paga o quê.
 *
 * Aponta-se o pagador uma vez e o recebimento passa a ser reconhecido — não há
 * automação a montar por evento, nem agendamento, nem data esperada. Um Pix da
 * Acme de R$ 3.000 encontra sozinho a parcela de R$ 3.000 do projeto da Acme.
 *
 * A régua da baixa automática é do domínio e **não** se configura aqui: nome
 * equivalente, valor idêntico e um único candidato. Deixar o usuário afrouxar
 * isso seria oferecer um botão para lançar dinheiro errado no razão — e o erro
 * só apareceria meses depois, no saldo que não fecha.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input, Select } from "../../ui/controls.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { Plus, Trash2 } from "../../ui/icons.tsx";
import { Badge, Notice } from "../../ui/primitives.tsx";

export type PayerRule = {
  readonly id: string;
  readonly payerName: string;
  readonly target: "project" | "salary" | "benefit";
  readonly projectId: string | null;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly isActive: boolean;
  readonly lastMatchedAt: string | null;
};

type Opcao = { readonly id: string; readonly name: string };

const ALVO: Record<PayerRule["target"], string> = {
  project: "Parcela de projeto",
  salary: "Salário",
  benefit: "Benefício",
};

export function PayerRules({
  rules,
  projects,
  accounts,
  categories,
}: {
  rules: readonly PayerRule[];
  projects: readonly Opcao[];
  accounts: readonly Opcao[];
  categories: readonly Opcao[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [alvo, setAlvo] = useState<PayerRule["target"]>("project");
  const [projeto, setProjeto] = useState("");
  const [conta, setConta] = useState(accounts[0]?.id ?? "");
  const [categoria, setCategoria] = useState("");

  const nomeDoProjeto = new Map(projects.map((item) => [item.id, item.name]));
  const nomeDaConta = new Map(accounts.map((item) => [item.id, item.name]));

  async function pedir(caminho: string, init: RequestInit): Promise<boolean> {
    setErro(null);
    const resposta = await fetch(caminho, init);
    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(corpo.error?.message ?? "Não foi possível concluir.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function criar() {
    setEnviando(true);
    const ok = await pedir("/api/v1/receipt-rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payerName: nome,
        target: alvo,
        accountId: conta,
        ...(alvo === "project" && projeto ? { projectId: projeto } : {}),
        ...(categoria ? { categoryId: categoria } : {}),
      }),
    });
    setEnviando(false);
    if (ok) {
      setAberto(false);
      setNome("");
      setProjeto("");
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-ink-muted">
          O recebimento só entra sozinho quando o nome e o valor batem exatamente e existe um único
          candidato. Fora disso, vira sugestão na fila.
        </p>
        <Button variant="secondary" icon={Plus} onClick={() => setAberto(true)}>
          Apontar pagador
        </Button>
      </div>

      {erro ? <Notice tone="negative">{erro}</Notice> : null}

      {rules.length ? (
        <ul className="border-t border-line">
          {rules.map((regra) => (
            <li key={regra.id} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`truncate text-body ${regra.isActive ? "text-ink" : "text-ink-subtle"}`}>
                    {regra.payerName}
                  </span>
                  <Badge tone={regra.isActive ? "info" : "neutral"}>{ALVO[regra.target]}</Badge>
                  {regra.isActive ? null : <Badge tone="neutral">desligada</Badge>}
                </span>
                <span className="block truncate text-caption text-ink-subtle">
                  {regra.projectId
                    ? `${nomeDoProjeto.get(regra.projectId) ?? "projeto removido"} · `
                    : regra.target === "project"
                      ? "qualquer projeto · "
                      : ""}
                  cai em {nomeDaConta.get(regra.accountId) ?? "conta removida"}
                </span>
              </span>

              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    pedir(`/api/v1/receipt-rules/${regra.id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ isActive: regra.isActive ? "false" : "true" }),
                    })
                  }
                  className="rounded-md border border-line px-3 py-1.5 text-caption text-ink-muted hover:bg-surface-sunken"
                >
                  {regra.isActive ? "Desligar" : "Ligar"}
                </button>
                <button
                  type="button"
                  aria-label={`Remover o pagador ${regra.payerName}`}
                  onClick={() => pedir(`/api/v1/receipt-rules/${regra.id}`, { method: "DELETE" })}
                  className="rounded-md border border-line px-2 py-1.5 text-ink-subtle hover:bg-surface-sunken hover:text-negative"
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-line px-3 py-4 text-body-sm text-ink-muted">
          Nenhum pagador apontado. Aponte o contratante de um projeto, a empresa que paga o salário
          ou quem credita o benefício, e os recebimentos passam a ser reconhecidos.
        </p>
      )}

      <Dialog
        open={aberto}
        onClose={() => setAberto(false)}
        title="Apontar pagador"
        description="O nome é o que aparece na notificação do Pix. Não precisa ser exato — a comparação ignora acentos, maiúsculas e o que sobra do nome."
        footer={
          <Button variant="primary" busy={enviando} onClick={criar} disabled={!conta || nome.trim().length < 3}>
            Apontar
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nome de quem paga" htmlFor="pagador-nome">
            <Input
              id="pagador-nome"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Padaria do Bairro, Acme Ltda…"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="O que este pagamento é" htmlFor="pagador-alvo">
              <Select
                id="pagador-alvo"
                value={alvo}
                onChange={(evento) => setAlvo(evento.target.value as PayerRule["target"])}
              >
                <option value="project">Parcela de projeto</option>
                <option value="salary">Salário</option>
                <option value="benefit">Benefício</option>
              </Select>
            </Field>

            {alvo === "project" ? (
              <Field label="Projeto" htmlFor="pagador-projeto" hint="Vazio vale para qualquer um">
                <Select
                  id="pagador-projeto"
                  value={projeto}
                  onChange={(evento) => setProjeto(evento.target.value)}
                >
                  <option value="">Qualquer projeto</option>
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cai em" htmlFor="pagador-conta">
              <Select id="pagador-conta" value={conta} onChange={(evento) => setConta(evento.target.value)}>
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Categoria" htmlFor="pagador-categoria" hint="Da receita gerada">
              <Select
                id="pagador-categoria"
                value={categoria}
                onChange={(evento) => setCategoria(evento.target.value)}
              >
                <option value="">Sem categoria</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {alvo === "project" ? (
            <Notice tone="info">
              A baixa acontece sozinha só quando o valor recebido é idêntico ao de uma única parcela
              em aberto. Qualquer outra situação vira sugestão para você conferir.
            </Notice>
          ) : (
            <Notice tone="info">
              Salário e benefício variam de mês a mês, então nunca entram sozinhos: chegam à fila
              como sugestão já apontada para a conta certa.
            </Notice>
          )}
        </div>
      </Dialog>
    </div>
  );
}
