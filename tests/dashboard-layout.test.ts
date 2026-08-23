import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DASHBOARD_WIDGET_ORDER, normalizeDashboardWidgetOrder, reorderDashboardWidgets } from "../lib/dashboard-layout.ts";

test("preserva uma ordem personalizada válida", () => {
  assert.deepEqual(normalizeDashboardWidgetOrder(["invoice", "free", "next", "balance", "installments"]), ["invoice", "free", "next", "balance", "installments"]);
});

test("recupera widgets ausentes e remove valores inválidos", () => {
  assert.deepEqual(normalizeDashboardWidgetOrder(["balance", "unknown", "balance"]), ["balance", "free", "installments", "invoice", "next"]);
});

test("move um widget para a posição do widget de destino", () => {
  assert.deepEqual(reorderDashboardWidgets(DEFAULT_DASHBOARD_WIDGET_ORDER, "next", "balance"), ["free", "next", "balance", "installments", "invoice"]);
});
