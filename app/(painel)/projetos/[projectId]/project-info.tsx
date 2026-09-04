"use client";

/**
 * Ficha do projeto: onde ele mora e por onde se entra.
 *
 * É o cartão que se abre quando a pergunta é "cadê o painel da Cloudflare
 * desse cliente?" — a informação que hoje mora num arquivo de texto, num
 * favorito ou na memória, e some justamente quando é precisa.
 *
 * Cada linha é um link quando tem endereço e um campo quando está em edição.
 * O mesmo cartão faz as duas coisas: abrir uma tela separada para editar
 * quatro URLs seria mais telas do que informação.
 *
 * **Não existe campo de senha, e isso é de propósito.** O que se guarda é
 * *onde* a credencial está — "1Password, cofre Clientes". Senha em texto no
 * banco transformaria um vazamento do Fluxo num vazamento de todos os
 * projetos, e o Fluxo não é um cofre: não tem criptografia por chave do
 * usuário, não tem rotação, não tem auditoria de acesso.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Input } from "../../../ui/controls.tsx";
import {
  Check,
  ExternalLink,
  Github,
  KeyRound,
  Pencil,
  Server,
  Settings,
  User,
  X,
} from "../../../ui/icons.tsx";
import { Notice, Panel, PanelHeader, join } from "../../../ui/primitives.tsx";

export type ProjectInfo = {
  readonly repositoryUrl: string | null;
  readonly mainBranch: string | null;
  readonly productionUrl: string | null;
  readonly infraUrl: string | null;
  readonly adminUrl: string | null;
  readonly adminUser: string | null;
  readonly credentialsHint: string | null;
  readonly documentationUrl: string | null;
};

type CampoDeLink = {
  readonly chave: keyof ProjectInfo;
  readonly rotulo: string;
  readonly icone: typeof Github;
  readonly exemplo: string;
  /** Linha de texto, não endereço: não vira link. */
  readonly texto?: boolean;
};

const CAMPOS: readonly CampoDeLink[] = [
  { chave: "productionUrl", rotulo: "Site", icone: ExternalLink, exemplo: "https://cliente.com.br" },
  {
    chave: "infraUrl",
    rotulo: "Infraestrutura",
    icone: Server,
    exemplo: "https://dash.cloudflare.com/...",
  },
  { chave: "adminUrl", rotulo: "Painel do site", icone: Settings, exemplo: "https://cliente.com.br/admin" },
  { chave: "repositoryUrl", rotulo: "Repositório", icone: Github, exemplo: "https://github.com/..." },
  { chave: "documentationUrl", rotulo: "Documentação", icone: ExternalLink, exemplo: "https://..." },
  { chave: "adminUser", rotulo: "Usuário de acesso", icone: User, exemplo: "admin@cliente.com.br", texto: true },
  {
    chave: "credentialsHint",
    rotulo: "Senha guardada em",
    icone: KeyRound,
    exemplo: "1Password · cofre Clientes",
    texto: true,
  },
  { chave: "mainBranch", rotulo: "Branch principal", icone: Github, exemplo: "main", texto: true },
];

/** Deixa o endereço legível: sem protocolo, sem barra final. */
function enxuto(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function ProjectInfoCard({ projectId, info }: { projectId: string; info: ProjectInfo }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const preenchidos = CAMPOS.filter((campo) => info[campo.chave]);

  function abrir() {
    setRascunho(
      Object.fromEntries(CAMPOS.map((campo) => [campo.chave, info[campo.chave] ?? ""])),
    );
    setErro(null);
    setEditando(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);

    // Manda todos os campos, inclusive os vazios: é assim que apagar um
    // endereço que mudou funciona.
    const resposta = await fetch(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rascunho),
    });

    setSalvando(false);

    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
      setErro(dados.error?.message ?? "Não foi possível salvar.");
      return;
    }

    setEditando(false);
    router.refresh();
  }

  return (
    <Panel>
      <PanelHeader
        title="Ficha do projeto"
        hint={editando ? "Deixe em branco para apagar" : "Endereços e acesso"}
        action={
          editando ? (
            <span className="flex gap-1.5">
              <Button size="sm" variant="ghost" icon={X} onClick={() => setEditando(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" icon={Check} busy={salvando} onClick={salvar}>
                Salvar
              </Button>
            </span>
          ) : (
            <Button size="sm" icon={Pencil} onClick={abrir}>
              Editar
            </Button>
          )
        }
      />

      {editando ? (
        <div className="mt-1 grid gap-3.5 sm:grid-cols-2">
          {CAMPOS.map((campo) => (
            <Field key={campo.chave} label={campo.rotulo} htmlFor={`info-${campo.chave}`}>
              <Input
                id={`info-${campo.chave}`}
                value={rascunho[campo.chave] ?? ""}
                onChange={(evento) =>
                  setRascunho((atual) => ({ ...atual, [campo.chave]: evento.target.value }))
                }
                placeholder={campo.exemplo}
                inputMode={campo.texto ? "text" : "url"}
              />
            </Field>
          ))}

          <p className="text-caption text-ink-subtle sm:col-span-2">
            Não guarde a senha aqui — só onde ela está. O Fluxo não é um cofre: não criptografa por
            chave sua nem registra quem acessou.
          </p>

          {erro ? (
            <div className="sm:col-span-2">
              <Notice tone="negative">{erro}</Notice>
            </div>
          ) : null}
        </div>
      ) : preenchidos.length ? (
        <ul className="mt-1 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {preenchidos.map((campo) => {
            const valor = info[campo.chave] as string;
            const Icone = campo.icone;
            const ehLink = !campo.texto && /^https?:\/\//.test(valor);

            return (
              <li key={campo.chave} className="flex min-w-0 items-center gap-2.5">
                <Icone size={15} strokeWidth={1.5} className="shrink-0 text-ink-subtle" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-caption text-ink-subtle">{campo.rotulo}</span>
                  {ehLink ? (
                    <a
                      href={valor}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={join(
                        "block truncate text-body-sm text-ink transition-colors",
                        "hover:text-accent hover:underline underline-offset-2",
                      )}
                      title={valor}
                    >
                      {enxuto(valor)}
                    </a>
                  ) : (
                    <span className="block truncate text-body-sm text-ink" title={valor}>
                      {valor}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body-sm text-ink-muted">
          Nenhum endereço cadastrado. Guarde aqui o site, o painel da hospedagem e o repositório —
          é o que se procura quando o cliente chama.
        </p>
      )}
    </Panel>
  );
}
