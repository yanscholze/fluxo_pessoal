"use client";

/**
 * Entrada e cadastro.
 *
 * O formulário só coleta e envia; quem valida de verdade é o servidor. A
 * validação daqui existe para dar resposta imediata, nunca como garantia —
 * garantia que mora no cliente não é garantia.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, Input } from "../ui/controls.tsx";
import { Notice } from "../ui/primitives.tsx";

type Modo = "signin" | "signup";

type IssueResponse = {
  error?: { message?: string; issues?: { path: string; message: string }[] };
};

const MIN_SENHA = 10;

export function AccessForm() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("signin");
  const [erro, setErro] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [pendente, startTransition] = useTransition();

  const cadastrando = modo === "signup";

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setIssues({});

    const dados = new FormData(evento.currentTarget);
    const senha = String(dados.get("password") ?? "");

    if (cadastrando && senha.length < MIN_SENHA) {
      setIssues({ password: `Use ao menos ${MIN_SENHA} caracteres` });
      return;
    }

    const resposta = await fetch("/api/v1/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: modo,
        email: String(dados.get("email") ?? ""),
        password: senha,
        ...(cadastrando ? { displayName: String(dados.get("displayName") ?? "") } : {}),
      }),
    });

    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => ({}))) as IssueResponse;
      setErro(corpo.error?.message ?? "Não foi possível continuar. Tente de novo.");
      setIssues(Object.fromEntries((corpo.error?.issues ?? []).map((issue) => [issue.path, issue.message])));
      return;
    }

    startTransition(() => {
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-sm">
      <h2 className="text-title text-ink">
        {cadastrando ? "Criar sua conta" : "Entrar no Fluxo"}
      </h2>
      <p className="mt-1.5 text-body text-ink-muted">
        {cadastrando ? "Leva menos de um minuto." : "Bem-vindo de volta."}
      </p>

      <form onSubmit={enviar} className="mt-7 space-y-4" noValidate>
        {cadastrando ? (
          <Campo
            nome="displayName"
            rotulo="Como quer ser chamado"
            tipo="text"
            autoComplete="name"
            erro={issues.displayName}
            required
          />
        ) : null}

        <Campo
          nome="email"
          rotulo="E-mail"
          tipo="email"
          autoComplete="email"
          erro={issues.email}
          required
        />

        <Campo
          nome="password"
          rotulo="Senha"
          tipo="password"
          autoComplete={cadastrando ? "new-password" : "current-password"}
          erro={issues.password}
          dica={cadastrando ? `Ao menos ${MIN_SENHA} caracteres` : undefined}
          required
        />

        {erro ? (
          <div role="alert">
            <Notice tone="negative">{erro}</Notice>
          </div>
        ) : null}

        <Button type="submit" variant="primary" busy={pendente} className="h-10 w-full">
          {cadastrando ? "Criar conta" : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-center text-body-sm text-ink-muted">
        {cadastrando ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
        <button
          type="button"
          onClick={() => {
            setModo(cadastrando ? "signin" : "signup");
            setErro(null);
            setIssues({});
          }}
          className="font-semibold text-accent underline-offset-2 hover:underline"
        >
          {cadastrando ? "Entrar" : "Criar agora"}
        </button>
      </p>
    </div>
  );
}

function Campo({
  nome,
  rotulo,
  tipo,
  autoComplete,
  erro,
  dica,
  required,
}: {
  nome: string;
  rotulo: string;
  tipo: string;
  autoComplete: string;
  erro?: string;
  dica?: string;
  required?: boolean;
}) {
  return (
    <Field label={rotulo} htmlFor={nome} hint={erro ? undefined : dica} error={erro}>
      <Input
        id={nome}
        name={nome}
        type={tipo}
        autoComplete={autoComplete}
        required={required}
        invalid={Boolean(erro)}
        className="h-10"
      />
    </Field>
  );
}
