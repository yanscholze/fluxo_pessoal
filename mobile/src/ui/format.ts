/**
 * Formatação para exibição.
 *
 * As funções de dinheiro e data vêm do domínio — `format` de `money.ts` e de
 * `local-date.ts`. O que existe aqui é só o que é específico de tela: rótulo
 * relativo ("hoje", "ontem") e recorte de texto.
 */

import { type Cents, format as formatMoney } from "@fluxo/core/kernel/money.ts";
import type { Competence } from "@fluxo/core/time/competence.ts";
import { formatShort as formatCompetence } from "@fluxo/core/time/competence.ts";
import {
  type LocalDate,
  addDays,
  formatShort as formatDateShort,
  todayIn,
} from "@fluxo/core/time/local-date.ts";

export function money(value: Cents): string {
  return formatMoney(value);
}

export function percent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}

export function competence(value: Competence): string {
  return formatCompetence(value);
}

/**
 * Data em linguagem de gente quando está perto, e curta quando não está.
 *
 * "12/08" não diz nada sobre proximidade; "hoje" e "ontem" dizem, e é isso que
 * o usuário procura ao abrir o extrato.
 */
export function relativeDate(value: LocalDate, today: LocalDate = todayIn()): string {
  if (value === today) return "hoje";
  if (value === addDays(today, -1)) return "ontem";
  if (value === addDays(today, 1)) return "amanhã";
  return formatDateShort(value);
}
