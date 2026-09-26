"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { Statement, StatementRow } from "../../../server/services/statement.ts";
import { Button, Field, Input, Select } from "../../ui/controls.tsx";
import { DataTable, Td, Tr } from "../../ui/data-display.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { dateShort, money } from "../../ui/format.ts";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Link2,
  type LucideIcon,
  Receipt,
} from "../../ui/icons.tsx";
import { Badge, Empty, type Tone } from "../../ui/primitives.tsx";
import { RowActions } from "./row-actions.tsx";

const NATUREZA: Record<StatementRow["kind"], { label: string; icon: LucideIcon; tone: Tone }> = {
  expense: { label: "Despesa", icon: ArrowDownRight, tone: "negative" },
  income: { label: "Receita", icon: ArrowUpRight, tone: "positive" },
  transfer: { label: "Transferência", icon: ArrowLeftRight, tone: "info" },
  invoice_payment: { label: "Pagamento de fatura", icon: Receipt, tone: "caution" },
  refund: { label: "Estorno", icon: ArrowUpRight, tone: "positive" },
};

/**
 * O extrato.
 *
 * Tabela, e não lista, porque aqui o usuário **compara**: varre a coluna de
 * valores procurando o gasto grande, confere datas em sequência, checa em que
 * conta caiu. Coluna alinhada é o que torna a varredura possível; a lista da
 * versão anterior obrigava a ler cada linha inteira.
 *
 * As colunas de contexto — natureza, conta, categoria — somem no celular. A
 * descrição, a data e o valor nunca somem: sem uma delas a linha deixa de ser
 * um lançamento.
 */
export function StatementList({
  rows,
  options,
}: {
  rows: readonly StatementRow[];
  options: Statement["options"];
}) {
  const router = useRouter();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [agrupando, setAgrupando] = useState(false);
  const [nomeDoGrupo, setNomeDoGrupo] = useState("");
  const [categoriaDoGrupo, setCategoriaDoGrupo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const idsSelecionados = useMemo(() => new Set(selecionados), [selecionados]);
  const selecionadas = rows.filter((row) => idsSelecionados.has(row.id));
  const despesasSelecionaveis = (row: StatementRow) =>
    row.kind === "expense" && row.originKind === "card" && !row.installmentLabel;

  function alternarSelecao(row: StatementRow) {
    if (!despesasSelecionaveis(row)) return;

    setSelecionados((atual) => {
      if (atual.includes(row.id)) return atual.filter((id) => id !== row.id);
      const primeira = rows.find((item) => item.id === atual[0]);
      // Um parcelamento é de um cartão só. Ao trocar de cartão, começar outra
      // seleção é mais claro que permitir uma combinação que o servidor recusa.
      if (primeira && primeira.originId !== row.originId) return [row.id];
      return [...atual, row.id];
    });
  }

  function abrirAgrupamento() {
    const descricoesIguais = selecionadas.every((row) => row.description === selecionadas[0]?.description);
    const categoriasIguais = selecionadas.every((row) => row.categoryId === selecionadas[0]?.categoryId);
    setNomeDoGrupo(descricoesIguais ? (selecionadas[0]?.description ?? "") : "Compra parcelada");
    setCategoriaDoGrupo(categoriasIguais ? (selecionadas[0]?.categoryId ?? "") : "");
    setErro(null);
    setAgrupando(true);
  }

  async function agrupar() {
    setEnviando(true);
    setErro(null);
    const resposta = await fetch("/api/v1/installments/group", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transactionIds: selecionados,
        description: nomeDoGrupo,
        categoryId: categoriaDoGrupo || null,
      }),
    });
    setEnviando(false);

    if (!resposta.ok) {
      const body = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(body.error?.message ?? "Não foi possível agrupar os lançamentos.");
      return;
    }

    setAgrupando(false);
    setSelecionados([]);
    router.refresh();
  }

  if (!rows.length) {
    return (
      <Empty
        icon={Receipt}
        title="Nenhum lançamento nesta competência"
        hint="Registre um movimento ou navegue para outro mês."
      />
    );
  }

  return (
    <>
      {selecionados.length ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-accent-wash px-3 py-2">
          <p className="text-body-sm text-ink">
            {selecionados.length} lançamento{selecionados.length > 1 ? "s" : ""} selecionado
            {selecionados.length > 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelecionados([])}>
              Limpar
            </Button>
            <Button size="sm" variant="primary" icon={Link2} disabled={selecionados.length < 2} onClick={abrirAgrupamento}>
              Agrupar em parcelamento
            </Button>
          </div>
        </div>
      ) : null}
      <DataTable
        caption="Lançamentos da competência"
        columns={[
          { key: "descricao", header: "Lançamento", flexible: true },
          { key: "categoria", header: "Categoria", hideBelow: "md" },
          { key: "conta", header: "Conta", hideBelow: "lg" },
          { key: "natureza", header: "Natureza", hideBelow: "lg" },
          { key: "data", header: "Data", align: "right", width: "5.5rem", hideBelow: "sm" },
          { key: "valor", header: "Valor", align: "right", width: "8rem" },
          { key: "acoes", header: "Ações", align: "right", width: "4.5rem" },
          { key: "selecionar", header: "Agrupar", align: "right", width: "4.25rem" },
        ]}
      >
        {rows.map((row) => {
          const natureza = NATUREZA[row.kind];
          const Icone = natureza.icon;
          const entrada = row.kind === "income";
          const previsto = row.state === "planned";

          // Em compra no crédito a competência é a da fatura, não a do mês da
          // compra. Mostrar as duas evita a dúvida de "por que isso aparece em
          // agosto se comprei em julho?".
          const faturaDeOutroMes =
            row.originKind === "card" && row.competence !== row.occurredOn.slice(0, 7);

          return (
            <Tr key={row.id}>
              <Td truncate>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                      entrada ? "bg-positive-wash text-positive" : "bg-surface-inset text-ink-muted"
                    }`}
                  >
                    <Icone size={14} strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className={`truncate text-body ${previsto ? "text-ink-muted" : "text-ink"}`}>
                        {row.description}
                      </span>
                      {previsto ? <Badge tone="caution">previsto</Badge> : null}
                      {row.state === "review" ? <Badge tone="accent">a revisar</Badge> : null}
                    </span>
                    {/* A data desce para cá exatamente quando a coluna some.
                        Num extrato, a data não é contexto: é o eixo da leitura,
                        e escondê-la sem devolvê-la deixaria a linha sem
                        resposta para "quando foi isso". */}
                    <span className="mt-0.5 block truncate text-caption text-ink-subtle">
                      <span className="@sm:hidden">{dateShort(row.occurredOn)}</span>
                      {row.installmentLabel ? (
                        <>
                          <span className="@sm:hidden"> · </span>
                          {row.installmentLabel}
                        </>
                      ) : null}
                      {faturaDeOutroMes ? (
                        <>
                          {row.installmentLabel ? " · " : <span className="@sm:hidden"> · </span>}
                          {`fatura ${row.competence}`}
                        </>
                      ) : null}
                    </span>
                  </span>
                </span>
              </Td>

              <Td hideBelow="md">
                {row.categoryName ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.categoryColor ?? "var(--color-line-strong)" }}
                      aria-hidden
                    />
                    <span className="truncate text-body-sm text-ink-muted">{row.categoryName}</span>
                  </span>
                ) : (
                  <span className="text-caption text-ink-subtle">sem categoria</span>
                )}
              </Td>

              <Td hideBelow="lg" className="truncate text-body-sm text-ink-muted">
                {row.originName}
                {row.destinationName ? ` → ${row.destinationName}` : ""}
              </Td>

              <Td hideBelow="lg">
                <Badge tone={natureza.tone}>{natureza.label}</Badge>
              </Td>

              <Td align="right" hideBelow="sm" className="tabular whitespace-nowrap text-caption text-ink-subtle">
                {dateShort(row.occurredOn)}
              </Td>

              <Td align="right">
                <span
                  className={`tabular whitespace-nowrap text-body font-medium ${
                    entrada ? "text-positive" : previsto ? "text-ink-muted" : "text-ink"
                  }`}
                >
                  {entrada ? "+ " : "− "}
                  {money(row.amountCents)}
                </span>
              </Td>

              {/* Corrigir e apagar ficam na linha, e a coluna não some no
                  celular: é justamente lá que o valor é digitado com pressa. */}
              <Td align="right">
                <RowActions row={row} options={options} />
              </Td>
              <Td align="right">
                {despesasSelecionaveis(row) ? (
                  <input
                    type="checkbox"
                    checked={idsSelecionados.has(row.id)}
                    onChange={() => alternarSelecao(row)}
                    aria-label={`Selecionar ${row.description} para agrupar`}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                ) : null}
              </Td>
            </Tr>
          );
        })}
      </DataTable>

      <Dialog
        open={agrupando}
        onClose={() => {
          setAgrupando(false);
          setErro(null);
        }}
        title="Agrupar em parcelamento"
        description={`Os ${selecionados.length} lançamentos manterão seus valores, datas e faturas; apenas passarão a aparecer como uma compra só.`}
        footer={
          <Button variant="primary" busy={enviando} onClick={() => void agrupar()}>
            Criar parcelamento
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nome do parcelamento" htmlFor="nome-do-grupo">
            <Input id="nome-do-grupo" value={nomeDoGrupo} onChange={(event) => setNomeDoGrupo(event.target.value)} />
          </Field>
          <Field label="Categoria" htmlFor="categoria-do-grupo">
            <Select id="categoria-do-grupo" value={categoriaDoGrupo} onChange={(event) => setCategoriaDoGrupo(event.target.value)}>
              <option value="">Sem categoria</option>
              {options.categories
                .filter((category) => category.kind === "expense")
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </Select>
          </Field>
          {erro ? <p role="alert" className="text-body-sm text-negative">{erro}</p> : null}
        </div>
      </Dialog>
    </>
  );
}
