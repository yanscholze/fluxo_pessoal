import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_WIDGET_IDS, moveDashboardWidget, nextWidgetSize, normalizeDashboardLayout, updateDashboardWidget } from "../src/dashboard.ts";

test("normaliza layouts antigos e preserva o registro extensível", () => {
  const layout = normalizeDashboardLayout([{ id: "invoice", size: "P", visible: true }, { id: "invalid", size: "G" }]);
  assert.equal(layout[0]?.id, "invoice");
  assert.equal(layout.length, DASHBOARD_WIDGET_IDS.length);
  assert.equal(new Set(layout.map((item) => item.id)).size, DASHBOARD_WIDGET_IDS.length);
});

test("move, redimensiona e remove widgets sem perder preferências", () => {
  const initial = normalizeDashboardLayout(null);
  const moved = moveDashboardWidget(initial, "free", 3);
  assert.equal(moved[3]?.id, "free");
  const resized = updateDashboardWidget(moved, "free", { size: nextWidgetSize("G"), visible: false });
  assert.equal(resized.find((item) => item.id === "free")?.size, "P");
  assert.equal(resized.find((item) => item.id === "free")?.visible, false);
});
