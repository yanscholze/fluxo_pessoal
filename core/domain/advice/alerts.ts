/**
 * Alertas.
 *
 * O Fluxo já sabe tudo o que precisa para avisar; o que faltava era **falar**.
 * Um painel só ajuda quem abre o painel, e a hora em que a informação muda uma
 * decisão quase nunca é a hora em que alguém decide conferir as finanças.
 *
 * Três regras moldam este módulo, e as três nasceram do mesmo receio — um
 * aplicativo que avisa demais é desinstalado, e aí não avisa mais nada:
 *
 * 1. **Todo alerta aponta um número que existe em outra tela.** Nada aqui
 *    inventa diagnóstico; tudo é leitura do que o razão já registrou. Se um
 *    alerta discordasse da tela, o usuário não teria como saber qual mentiu.
 * 2. **Todo alerta tem uma janela.** Avisar que a fatura vence em vinte dias
 *    não muda decisão nenhuma; avisar na véspera, sim. Fora da janela o alerta
 *    simplesmente não nasce.
 * 3. **Todo alerta traz o que fazer.** "Comprometimento alto" é constatação.
 *    "R$ 3.100 dos R$ 4.000 que entraram já estão comprometidos — sobram
 *    R$ 900 para o mês" é uma frase sobre a qual dá para agir.
 *
 * A severidade não é enfeite: ela decide o que interrompe. `urgente` merece
 * uma notificação no celular; `informativo` espera o usuário abrir o app.
 */

import type { Cents } from "../../kernel/money.ts";
import { type LocalDate, daysBetween } from "../../time/local-date.ts";

export type AlertSeverity = "urgente" | "atencao" | "informativo";

export type Alert = {
  /**
   * Identidade estável do alerta.
   *
   * O mesmo problema tem sempre a mesma chave, dia após dia. É o que permite
   * ao cliente lembrar que já notificou isto e não repetir a cada abertura —
   * a diferença entre um aplicativo que avisa e um que persegue.
   */
  readonly key: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  /** Uma frase. É o corpo da notificação, e ninguém lê duas. */
  readonly body: string;
  /** Para onde levar quem tocar no alerta. */
  readonly screen: "capturas" | "faturas" | "cartoes" | "painel" | "parcelamentos" | "saude";
};

/** O que o servidor apura para decidir o que dizer. */
export type AlertInput = {
  readonly today: LocalDate;
  /** Capturas automáticas esperando conferência. */
  readonly pendingCaptures: number;
  /** Quanto sobra para gastar até o fim do horizonte. */
  readonly freeToSpendCents: number;
  /** Receita que entrou na competência corrente. */
  readonly incomeThisMonthCents: number;
  /** O que já está comprometido: recorrências, parcelas e faturas a pagar. */
  readonly committedCents: number;
  /** Faturas vencidas, com o total devido. */
  readonly overdueInvoices: number;
  readonly overdueInvoiceCents: number;
  /** A próxima fatura a vencer, se houver alguma em aberto. */
  readonly nextInvoice: {
    readonly cardName: string;
    readonly dueDate: LocalDate;
    readonly amountCents: number;
  } | null;
  /** Uma entrada de renda notável registrada hoje — salário, pagamento grande. */
  readonly incomeToday: { readonly description: string; readonly amountCents: number } | null;
};

/**
 * Uma fatura em aberto, como o alerta precisa vê-la.
 *
 * Vem do painel, mas **sem** a classificação dele. O painel chama de "vencida"
 * toda competência anterior à ativa que ainda deve — o que é a definição certa
 * para ocupar limite de crédito, e a errada para avisar alguém.
 */
export type OpenInvoice = {
  readonly cardName: string;
  readonly dueDate: LocalDate;
  readonly amountCents: number;
};

/**
 * Separa o que está atrasado do que ainda vai vencer.
 *
 * Existe porque o painel não faz essa distinção e não precisa fazer: para
 * calcular limite disponível, uma fatura fechada e não paga é dívida, ponto.
 * Para **avisar**, a diferença é tudo.
 *
 * O cartão do usuário fecha no dia 12 e vence no 20. Entre os dias 13 e 20 a
 * fatura de setembro já saiu da competência ativa — que passou a ser outubro —
 * e o painel a lista entre as vencidas. Um alerta que confiasse nessa lista
 * anunciaria "Fatura vencida", em vermelho, por oito dias por mês, sobre uma
 * fatura rigorosamente em dia. Um aviso que mente uma vez é desligado; e junto
 * com ele morre o aviso de véspera, que é o que de fato salva o pagamento.
 *
 * O corte é a data de vencimento contra hoje, e nada mais.
 */
export function classifyInvoices(
  invoices: readonly OpenInvoice[],
  today: LocalDate,
): {
  readonly overdue: readonly OpenInvoice[];
  readonly overdueCents: number;
  readonly next: OpenInvoice | null;
} {
  const overdue = invoices.filter((invoice) => invoice.dueDate < today);
  const aVencer = [...invoices]
    .filter((invoice) => invoice.dueDate >= today)
    .sort((esquerda, direita) => esquerda.dueDate.localeCompare(direita.dueDate));

  return {
    overdue,
    overdueCents: overdue.reduce((soma, invoice) => soma + invoice.amountCents, 0),
    next: aVencer[0] ?? null,
  };
}

/** Dentro de quantos dias uma fatura a vencer passa a merecer aviso. */
const JANELA_DA_FATURA = 3;

/**
 * A partir de quanto do que entrou já comprometido o aviso se justifica.
 *
 * Setenta por cento não é número redondo por acaso: abaixo disso a folga ainda
 * absorve um imprevisto, e avisar seria alarme falso. Acima, um gasto grande no
 * fim do mês estoura — e é exatamente aí que o aviso muda a decisão.
 */
const COMPROMETIMENTO_ALTO = 0.7;

/** Renda que merece a conversa sobre o mês. Abaixo disso é reembolso, não salário. */
const RENDA_NOTAVEL = 100_000;

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function diaEm(dias: number): string {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

/**
 * Os alertas que cabem hoje, do mais urgente ao menos.
 *
 * Função pura: a mesma entrada dá sempre a mesma saída, o que torna cada regra
 * testável sem banco e sem relógio. Quem decide *quando* perguntar é o cliente.
 */
export function buildAlerts(input: AlertInput): readonly Alert[] {
  const alertas: Alert[] = [];

  // --- o que já está atrasado -------------------------------------------
  if (input.overdueInvoices > 0) {
    alertas.push({
      key: "fatura-vencida",
      severity: "urgente",
      title: input.overdueInvoices === 1 ? "Fatura vencida" : "Faturas vencidas",
      body: `${reais(input.overdueInvoiceCents)} em ${input.overdueInvoices} fatura${
        input.overdueInvoices === 1 ? "" : "s"
      } que já passaram do vencimento.`,
      screen: "faturas",
    });
  }

  // --- o que vence agora --------------------------------------------------
  if (input.nextInvoice) {
    const dias = daysBetween(input.today, input.nextInvoice.dueDate);
    if (dias >= 0 && dias <= JANELA_DA_FATURA) {
      alertas.push({
        key: `fatura-vence-${input.nextInvoice.dueDate}`,
        severity: dias === 0 ? "urgente" : "atencao",
        title: `Fatura do ${input.nextInvoice.cardName} vence ${diaEm(dias)}`,
        body: `${reais(input.nextInvoice.amountCents)} a pagar.`,
        screen: "faturas",
      });
    }
  }

  // --- o dinheiro que acabou de entrar ------------------------------------
  //
  // Este é o alerta que o usuário pediu por nome, e é o mais delicado: chega
  // no melhor momento do mês, quando ninguém quer ouvir uma má notícia. Por
  // isso ele não julga — mostra o que já está reservado e deixa a conclusão
  // para quem recebeu.
  if (input.incomeToday && input.incomeToday.amountCents >= RENDA_NOTAVEL) {
    const sobra = input.freeToSpendCents;
    alertas.push({
      key: `renda-${input.today}`,
      severity: "informativo",
      title: `Entrou ${reais(input.incomeToday.amountCents)}`,
      body:
        input.committedCents > 0
          ? `${reais(input.committedCents)} já estão comprometidos com contas e faturas. Livre para gastar: ${reais(sobra)}.`
          : `Livre para gastar: ${reais(sobra)}.`,
      screen: "painel",
    });
  }

  // --- a folga do mês -----------------------------------------------------
  if (input.freeToSpendCents < 0) {
    alertas.push({
      key: "livre-negativo",
      severity: "urgente",
      title: "O mês não fecha",
      body: `Faltam ${reais(Math.abs(input.freeToSpendCents))} para cobrir o que já está comprometido.`,
      screen: "saude",
    });
  } else if (
    input.incomeThisMonthCents > 0 &&
    input.committedCents / input.incomeThisMonthCents >= COMPROMETIMENTO_ALTO
  ) {
    const porcento = Math.round((input.committedCents / input.incomeThisMonthCents) * 100);
    alertas.push({
      key: "comprometimento-alto",
      severity: "atencao",
      title: `${porcento}% da renda já está comprometida`,
      body: `${reais(input.committedCents)} de ${reais(input.incomeThisMonthCents)}. Sobram ${reais(
        input.freeToSpendCents,
      )} para o resto do mês.`,
      screen: "saude",
    });
  }

  // --- o que espera uma conferência ---------------------------------------
  if (input.pendingCaptures > 0) {
    alertas.push({
      key: "capturas-pendentes",
      severity: "atencao",
      title:
        input.pendingCaptures === 1
          ? "1 captura aguardando"
          : `${input.pendingCaptures} capturas aguardando`,
      body: "Compras lidas da notificação do banco que ainda não viraram lançamento.",
      screen: "capturas",
    });
  }

  const ordem: Record<AlertSeverity, number> = { urgente: 0, atencao: 1, informativo: 2 };
  return alertas.sort((esquerda, direita) => ordem[esquerda.severity] - ordem[direita.severity]);
}

export type { Cents };
