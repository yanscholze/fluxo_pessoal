"use client";

/**
 * Abas das configurações.
 *
 * Cliente só por causa da aba ativa. O conteúdo continua sendo renderizado no
 * servidor e entra aqui como `children` — é o que permite a página seguir
 * buscando categorias e aparelhos sem virar componente de cliente inteiro.
 *
 * Todas as seções ficam montadas e a inativa é escondida por CSS: desmontar
 * jogaria fora o que o usuário digitou num formulário ao trocar de aba e
 * voltar.
 */

import { useState, type ReactNode } from "react";

import { Tabs } from "../../ui/controls.tsx";

export type Secao = { readonly value: string; readonly label: string; readonly content: ReactNode };

export function SettingsTabs({ sections }: { sections: readonly Secao[] }) {
  const [ativa, setAtiva] = useState(sections[0]?.value ?? "");

  return (
    <div>
      <Tabs
        value={ativa}
        onChange={setAtiva}
        tabs={sections.map((secao) => ({ value: secao.value, label: secao.label }))}
      />

      <div className="mt-5">
        {sections.map((secao) => (
          <div key={secao.value} hidden={secao.value !== ativa}>
            {secao.content}
          </div>
        ))}
      </div>
    </div>
  );
}
