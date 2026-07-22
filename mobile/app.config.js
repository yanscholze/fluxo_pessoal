import base from "./app.json" with { type: "json" };

export default {
  ...base.expo,
  plugins: [
    ...(base.expo.plugins ?? []),
    "./plugins/with-lock-screen-widgets.cjs",
    [
      "react-native-android-widget",
      {
        widgets: [
          {
            name: "FluxoSummary",
            label: "Fluxo — Resumo",
            description: "Saldo, livre para gastar e fatura atual.",
            minWidth: "180dp",
            minHeight: "110dp",
            targetCellWidth: 4,
            targetCellHeight: 2,
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 1800000
          },
          {
            name: "FluxoQuickEntry",
            label: "Fluxo — Lançamento rápido",
            description: "Atalho compacto para registrar um lançamento.",
            minWidth: "110dp",
            minHeight: "55dp",
            targetCellWidth: 2,
            targetCellHeight: 1,
            resizeMode: "horizontal",
            updatePeriodMillis: 1800000
          }
        ]
      }
    ]
  ]
};
