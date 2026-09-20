# Mesa — o sistema visual

Extraído do protótipo do Lovable ("Mesa — Gestão financeira inteligente"),
`id-preview--84953a59-4cf6-5a70-ba9c-a166935d9180.lovable.app`, revisão
`9b55ffc431d27acb80b238c9721debb619c93a49`.

**Estes valores são regra.** O Fluxo se adapta a eles; eles não se adaptam ao
Fluxo. Única exceção combinada: a tela do TARS mantém a ideia que já era nossa.

## Cor

Tudo em OKLCH. Um tema só — escuro.

| Token do Mesa | Valor | Papel no Fluxo |
| --- | --- | --- |
| `--background` | `oklch(10.5% .025 308)` | `canvas` |
| `--card` | `oklch(16% .03 306)` | `surface` |
| `--popover` | `oklch(16% .03 306)` | superfície de sobreposição |
| `--secondary` | `oklch(21% .03 306)` | `surface-inset` |
| `--muted` | `oklch(20% .025 306)` | `surface-sunken` |
| `--accent` | `oklch(25% .05 304)` | `surface-raised` |
| `--foreground` | `oklch(97% .004 285)` | `ink` |
| `--secondary-foreground` | `oklch(92% .01 300)` | `ink-muted` |
| `--muted-foreground` | `oklch(63% .018 298)` | `ink-subtle` |
| `--primary` | `oklch(66% .24 304)` | `accent` — roxo vivo |
| `--primary-foreground` | `oklch(12% .03 306)` | `accent-ink` |
| `--border` | `oklch(100% 0 0 / .09)` | `line` |
| `--input` | `oklch(100% 0 0 / .05)` | fundo de campo |
| `--ring` | `oklch(66% .24 304)` | foco |
| `--success` | `oklch(76% .16 160)` | `positive` |
| `--coral` | `oklch(72% .18 17)` | `negative` |
| `--amber` | `oklch(82% .16 84)` | `caution` |
| `--destructive` | `oklch(57.7% .245 27.325)` | ação destrutiva |

Note que `--border` e `--input` são **branco com alfa**, não cinza sólido: a
linha clareia junto com o que está por baixo.

## Tipografia

**Space Grotesk**, pesos 300–700, do Google Fonts.

| Uso | Especificação |
| --- | --- |
| Valor monetário grande | `clamp(3.1rem, 8vw, 6rem)`, peso 500, `line-height: 1` |
| Título de painel | `.875rem` (text-sm), peso 600 |
| Subtítulo de painel | `.75rem` (text-xs), `muted-foreground` |
| Rótulo de métrica | `.625rem`, peso 600, caixa alta, `letter-spacing: .18em` |
| Número de métrica | `1.5rem` (text-2xl), peso 500, `tabular-nums` |
| Rótulo de gráfico | `.625rem` (text-[10px]), `muted-foreground` |

## Raio

`--radius: .9rem`. Os componentes usam valores próprios:

| Elemento | Raio |
| --- | --- |
| Painel (`glass-panel`) | `1.5rem` |
| Barra lateral | `1.75rem` |
| Cartão de crédito | `1.5rem` |
| Pílula de status | `999px` |
| Bolha de ícone | `.75rem` (rounded-xl) |
| Botão | `.375rem` (rounded-md) |

## Componentes do sistema

```css
.app-shell {
  display: flex;
  gap: 1rem;
  padding: 1rem;              /* .5rem no celular */
  min-height: 100vh;
  background: radial-gradient(circle at 12% 5%,
    color-mix(in oklab, var(--primary) 10%, transparent), transparent 30%);
}

.finance-sidebar {
  width: 16rem;
  height: calc(100vh - 2rem);
  position: sticky;
  top: 1rem;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 1.75rem;
  background: color-mix(in oklab, var(--card) 64%, transparent);
  backdrop-filter: blur(30px);
  transition: width .3s, transform .3s;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--background);
}

.content-area { width: 100%; padding: 2rem; }

.glass-panel {
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: 1.5rem;
}

.money-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 18rem;
  margin-bottom: 2rem;
  text-align: center;
}

.money-value {
  font-size: clamp(3.1rem, 8vw, 6rem);
  font-weight: 500;
  line-height: 1;
  background: linear-gradient(to bottom, var(--foreground), var(--muted-foreground));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
}

.metric-label {
  font-size: .625rem;
  font-weight: 600;
  line-height: 1rem;
  text-transform: uppercase;
  letter-spacing: .18em;
  color: var(--muted-foreground);
}

.credit-card {
  aspect-ratio: 1.586;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  border: 1px solid color-mix(in oklab, var(--primary) 40%, transparent);
  border-radius: 1.5rem;
  background: linear-gradient(145deg,
    color-mix(in oklab, var(--primary) 45%, var(--card)), var(--card) 68%);
  box-shadow: 0 30px 70px -28px color-mix(in oklab, var(--primary) 40%, transparent);
}

.tars-core {
  display: grid;
  place-items: center;
  width: 8rem;
  height: 8rem;
  border: 1px solid color-mix(in oklab, var(--primary) 35%, transparent);
  border-radius: 999px;
  box-shadow: 0 0 70px color-mix(in oklab, var(--primary) 22%, transparent);
}
```

## Padrões que se repetem

**Cabeçalho de painel** — grade `minmax(0,1fr) auto`, título `text-sm`
semibold, subtítulo `text-xs muted`, ação à direita (ícone de 9×9 ou botão
`h-8 text-xs`), `margin-bottom: 1.5rem`.

**Bolha de ícone colorida** — `size-10`, `rounded-xl`, `grid place-items-center`,
`ring-1`, fundo a 12% da cor e anel a 20%: `bg-success/12 ring-success/20`.

**Barra de proporção** — trilho `h-1.5 rounded-full bg-secondary`, preenchimento
`h-full rounded-full` na cor da série.

**Ponto de estado** — `size-2.5 rounded-full` com
`box-shadow: 0 0 10px currentColor`, cor conforme o tipo.

**Gráfico de barras** — `h-48`, barras `flex-1` com trilho `bg-secondary
rounded-xl` e preenchimento `bg-primary/70`, `group-hover:bg-primary`, transição
de 500ms.

**Lista** — `divide-y divide-border`, linha em grade
`auto minmax(0,1fr) auto`, `gap-3`, `py-3.5`.

## Navegação

Treze itens, nesta ordem. O TARS vem separado, no topo.

```
TARS · Painel · Lançamentos · Contas · Cartões · Compromissos
Parcelamentos · Assinaturas · Orçamentos · Viagens · Projetos
Relatórios · Automações
```

A barra superior traz mês corrente em `metric-label`, título da tela em
`text-lg font-semibold`, e à direita sino de notificações e botão "Novo".

## O que o Fluxo tem e o Mesa não desenhou

`metas`, `patrimônio`, `investimentos`, `recompensas`, `saúde`, `importar` e
`configurações`. Essas telas se desenham com o vocabulário acima — nenhum
elemento novo, nenhuma cor fora da tabela.

## Correspondência de nomes

| Mesa | Fluxo hoje |
| --- | --- |
| Compromissos | recorrências / planejamento |
| Automações | automáticos |
| TARS | assistente |
