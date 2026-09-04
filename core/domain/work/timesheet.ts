/**
 * O relatório de horas de um projeto.
 *
 * A pergunta que ele responde é uma só: **o projeto pagou o tempo que custou**.
 * Ela não se responde com o total de horas nem com o valor do contrato
 * separadamente — só com os dois juntos, e divididos.
 *
 * O valor/hora efetivo é **receita ÷ horas trabalhadas**, calculado aqui e em
 * nenhum outro lugar. Nada disso é guardado na sessão de trabalho: uma sessão
 * registra que três horas aconteceram numa terça-feira, não quanto elas
 * valeram. Congelar o preço em cada linha faz o relatório do projeto depender
 * de quando cada hora foi lançada, e não do que o projeto rendeu — e aí
 * receber uma parcela a mais não muda um número que deveria mudar.
 *
 * Divide-se pelo tempo **todo**, cobrável ou não. Dividir só pelas horas
 * cobráveis inflaria o número justamente nos projetos que deram mais
 * retrabalho, escondendo o prejuízo que se quer enxergar.
 */

import type { Cents } from "../../kernel/money.ts";
import type { LocalDate } from "../../time/local-date.ts";
import { type Activity, ACTIVITIES, isDelivery, isRework } from "./activity.ts";
import { effectiveRate, type Milli, sumMilli, toHours, ZERO_MILLI } from "./hours.ts";

/** Uma sessão de trabalho, do jeito que o relatório precisa dela. */
export type SessionLike = {
  readonly id: string;
  readonly workedOn: LocalDate;
  readonly duration: Milli;
  readonly activity: Activity;
  readonly billable: boolean;
  readonly description: string;
};

export type ActivityTotal = {
  readonly activity: Activity;
  readonly worked: Milli;
  /** Fatia do tempo total, em pontos percentuais. Somam 100 entre si. */
  readonly percent: number;
  readonly sessions: number;
};

export type Timesheet = {
  readonly worked: Milli;
  readonly billableWorked: Milli;
  readonly sessions: number;
  /** Só as categorias com tempo lançado, da maior para a menor. */
  readonly byActivity: readonly ActivityTotal[];
  /** Tempo em categorias que produzem entrega. */
  readonly deliveryWorked: Milli;
  /** Tempo consertando o que já deveria funcionar. */
  readonly reworkWorked: Milli;
  /** Fatia de retrabalho no total, em pontos percentuais. */
  readonly reworkPercent: number;
  /** O que o projeto rendeu de verdade — parcelas recebidas. */
  readonly revenue: Cents;
  /**
   * Receita ÷ horas trabalhadas. `null` sem horas lançadas: dividir por zero
   * daria infinito, e "infinito por hora" não é informação, é bug na tela.
   */
  readonly effectiveRate: Cents | null;
  /** Primeira e última sessão, para saber em quanto tempo o esforço se espalhou. */
  readonly firstOn: LocalDate | null;
  readonly lastOn: LocalDate | null;
  /** Em quantos dias distintos houve trabalho. */
  readonly workedDays: number;
};

export const EMPTY_TIMESHEET: Timesheet = {
  worked: ZERO_MILLI,
  billableWorked: ZERO_MILLI,
  sessions: 0,
  byActivity: [],
  deliveryWorked: ZERO_MILLI,
  reworkWorked: ZERO_MILLI,
  reworkPercent: 0,
  revenue: 0 as Cents,
  effectiveRate: null,
  firstOn: null,
  lastOn: null,
  workedDays: 0,
};

/**
 * Monta o relatório de um projeto.
 *
 * `revenue` é o que **entrou**, não o contratado: um contrato de dez mil com
 * três mil recebidos rendeu três mil, e o valor/hora efetivo precisa dizer
 * isso enquanto o resto não chega.
 */
export function buildTimesheet(
  sessions: readonly SessionLike[],
  revenue: Cents,
): Timesheet {
  if (sessions.length === 0) return { ...EMPTY_TIMESHEET, revenue };

  const worked = sumMilli(sessions.map((sessao) => sessao.duration));
  const billableWorked = sumMilli(
    sessions.filter((sessao) => sessao.billable).map((sessao) => sessao.duration),
  );

  const porCategoria = new Map<Activity, { worked: number; sessions: number }>();
  for (const sessao of sessions) {
    const atual = porCategoria.get(sessao.activity) ?? { worked: 0, sessions: 0 };
    porCategoria.set(sessao.activity, {
      worked: atual.worked + sessao.duration,
      sessions: atual.sessions + 1,
    });
  }

  const byActivity: ActivityTotal[] = ACTIVITIES.filter((atividade) => porCategoria.has(atividade))
    .map((atividade) => {
      const totais = porCategoria.get(atividade)!;
      return {
        activity: atividade,
        worked: totais.worked as Milli,
        percent: worked > 0 ? (totais.worked / worked) * 100 : 0,
        sessions: totais.sessions,
      };
    })
    .sort((esquerda, direita) => direita.worked - esquerda.worked);

  const deliveryWorked = sumMilli(
    sessions.filter((sessao) => isDelivery(sessao.activity)).map((sessao) => sessao.duration),
  );
  const reworkWorked = sumMilli(
    sessions.filter((sessao) => isRework(sessao.activity)).map((sessao) => sessao.duration),
  );

  const datas = sessions.map((sessao) => sessao.workedOn).sort();

  return {
    worked,
    billableWorked,
    sessions: sessions.length,
    byActivity,
    deliveryWorked,
    reworkWorked,
    reworkPercent: worked > 0 ? (reworkWorked / worked) * 100 : 0,
    revenue,
    effectiveRate: effectiveRate(revenue, worked),
    firstOn: datas[0] ?? null,
    lastOn: datas[datas.length - 1] ?? null,
    workedDays: new Set(datas).size,
  };
}

/**
 * Média de horas por projeto.
 *
 * Recebe o tempo de cada projeto, e não a soma: a média de "todas as horas
 * dividido por todos os projetos" incluiria no divisor os projetos em que
 * ninguém lançou nada, e o resultado diria que se trabalha menos do que se
 * trabalha. Só entra projeto com tempo lançado.
 */
export function averageHoursPerProject(workedByProject: readonly Milli[]): number {
  const comTempo = workedByProject.filter((tempo) => tempo > 0);
  if (comTempo.length === 0) return 0;
  return toHours(sumMilli(comTempo)) / comTempo.length;
}
