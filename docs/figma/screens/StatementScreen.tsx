import { useState } from "react";

type Filter = "all" | "income" | "expense" | "predicted";

const allEntries = [
  { id: 1, name: "Salário", category: "Receita", amount: 8500.00, date: "15 set", type: "income", icon: "💼", predicted: false },
  { id: 2, name: "Mercado Extra", category: "Alimentação", amount: -182.50, date: "15 set", type: "expense", icon: "🛒", predicted: false },
  { id: 3, name: "Freelance UI", category: "Receita", amount: 1200.00, date: "12 set", type: "income", icon: "💻", predicted: false },
  { id: 4, name: "Netflix", category: "Assinatura", amount: -39.90, date: "12 set", type: "expense", icon: "🎬", predicted: false },
  { id: 5, name: "iFood", category: "Alimentação", amount: -67.80, date: "11 set", type: "expense", icon: "🍔", predicted: false },
  { id: 6, name: "Uber", category: "Transporte", amount: -28.40, date: "11 set", type: "expense", icon: "🚗", predicted: false },
  { id: 7, name: "Spotify", category: "Assinatura", amount: -21.90, date: "10 set", type: "expense", icon: "🎵", predicted: false },
  { id: 8, name: "Aluguel", category: "Moradia", amount: -2400.00, date: "18 set", type: "expense", icon: "🏠", predicted: true },
  { id: 9, name: "Cartão Nubank", category: "Fatura", amount: -890.40, date: "22 set", type: "expense", icon: "💳", predicted: true },
  { id: 10, name: "Bônus Q3", category: "Receita", amount: 2000.00, date: "30 set", type: "income", icon: "🎯", predicted: true },
  { id: 11, name: "Conta de Luz", category: "Utilidades", amount: -156.80, date: "25 set", type: "expense", icon: "⚡", predicted: true },
];

export default function StatementScreen({ onProfile }: { onProfile: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = allEntries.filter((e) => {
    if (filter === "income") return e.type === "income" && !e.predicted;
    if (filter === "expense") return e.type === "expense" && !e.predicted;
    if (filter === "predicted") return e.predicted;
    return true;
  });

  const totalIn = allEntries.filter((e) => e.type === "income" && !e.predicted).reduce((s, e) => s + e.amount, 0);
  const totalOut = allEntries.filter((e) => e.type === "expense" && !e.predicted).reduce((s, e) => s + Math.abs(e.amount), 0);
  const predictedTotal = allEntries.filter((e) => e.predicted).reduce((s, e) => s + e.amount, 0);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Tudo" },
    { key: "income", label: "Entradas" },
    { key: "expense", label: "Saídas" },
    { key: "predicted", label: "Previstos" },
  ];

  return (
    <div className="flex flex-col pb-4" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div>
          <h1 className="text-xl font-bold">Extrato</h1>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Setembro 2026</p>
        </div>
        <button onClick={onProfile} className="w-9 h-9 rounded-full overflow-hidden border-2" style={{ borderColor: "var(--primary)" }}>
          <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=72&h=72&fit=crop&auto=format" alt="Perfil" className="w-full h-full object-cover" />
        </button>
      </div>

      {/* Cycle summary */}
      <div className="grid grid-cols-3 gap-3 mx-5 mb-4">
        <div className="rounded-2xl p-3 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-[10px] mb-1" style={{ color: "#22c55e" }}>↑ Entrou</p>
          <p className="text-sm font-bold font-mono">R$ {totalIn.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-[10px] mb-1" style={{ color: "#f43f5e" }}>↓ Saiu</p>
          <p className="text-sm font-bold font-mono">R$ {totalOut.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-[10px] mb-1" style={{ color: "#f59e0b" }}>◷ Previsto</p>
          <p className="text-sm font-bold font-mono" style={{ color: predictedTotal > 0 ? "#22c55e" : "#f43f5e" }}>
            {predictedTotal > 0 ? "+" : ""}R$ {Math.abs(predictedTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 px-5 mb-4 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200"
            style={filter === f.key
              ? { background: "var(--primary)", color: "#fff" }
              : { background: "var(--secondary)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="flex flex-col px-5 gap-px">
        {filtered.map((entry, i) => {
          const showDate = i === 0 || filtered[i - 1].date !== entry.date;
          return (
            <div key={entry.id}>
              {showDate && (
                <p className="text-xs font-semibold pt-4 pb-2 sticky top-0" style={{ color: "var(--muted-foreground)", background: "var(--background)" }}>
                  {entry.date}{entry.predicted && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: "#f59e0b22", color: "#f59e0b" }}>Previsto</span>}
                </p>
              )}
              <div className="flex items-center gap-3 py-3 px-4 rounded-2xl transition-all active:scale-[0.98]" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: "var(--secondary)", opacity: entry.predicted ? 0.7 : 1 }}>
                  {entry.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ opacity: entry.predicted ? 0.7 : 1 }}>{entry.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{entry.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold font-mono" style={{ color: entry.amount > 0 ? "#22c55e" : "var(--foreground)", opacity: entry.predicted ? 0.7 : 1 }}>
                    {entry.amount > 0 ? "+" : ""}R$ {Math.abs(entry.amount).toFixed(2)}
                  </p>
                  {entry.predicted && <p className="text-[9px]" style={{ color: "#f59e0b" }}>previsão</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
