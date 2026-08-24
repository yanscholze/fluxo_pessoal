import { closingDateFor, cycleWindowFor, dueDateFor } from "./domain/card/invoice-cycle.ts";
import { competence, shift, competenceFromParts } from "./time/competence.ts";
import { addDays } from "./time/local-date.ts";

// janelas invertidas ou vencimento antes do fechamento
for (let cd = 1; cd <= 31; cd++) {
  for (let dd = 1; dd <= 31; dd++) {
    for (const adj of ["next","previous"] as const) {
      const cfg: any = { closingDay: cd, dueDay: dd, dueAdjustment: adj };
      for (let y = 2024; y <= 2030; y++) for (let m = 1; m <= 12; m++) {
        const c = competenceFromParts(y, m);
        const w = cycleWindowFor(cfg, c);
        const close = closingDateFor(cfg, c);
        const due = dueDateFor(cfg, c);
        if (w.start > w.end) console.log("JANELA INVERTIDA", cd, dd, adj, c, JSON.stringify(w));
        if (due <= close) console.log("VENCIMENTO <= FECHAMENTO", cd, dd, adj, c, "close", close, "due", due);
      }
    }
  }
}
console.log("fim");
