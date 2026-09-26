import {
  BarChart, Bar, ResponsiveContainer, Tooltip, Cell,
} from "recharts";

const installments = [
  {
    id: 1,
    name: "MacBook Pro M4",
    store: "Apple Store",
    color: "#7c5cfc",
    total: 12 ,
    paid: 5,
    valuePerMonth: 1041.58,
    totalValue: 12499.00,
    paidValue: 5207.90,
    nextDue: "22 set",
    icon: "💻",
    monthlyData: [
      { m: "Mai", pago: 1041.58, total: 1041.58 },
      { m: "Jun", pago: 1041.58, total: 1041.58 },
      { m: "Jul", pago: 1041.58, total: 1041.58 },
      { m: "Ago", pago: 1041.58, total: 1041.58 },
      { m: "Set", pago: 1041.58, total: 1041.58 },
      { m: "Out", pago: 0, total: 1041.58 },
      { m: "Nov", pago: 0, total: 1041.58 },
      { m: "Dez", pago: 0, total: 1041.58 },
      { m: "Jan", pago: 0, total: 1041.58 },
      { m: "Fev", pago: 0, total: 1041.58 },
      { m: "Mar", pago: 0, total: 1041.58 },
      { m: "Abr", pago: 0, total: 1041.58 },
    ],
  },
  {
    id: 2,
    name: "iPhone 16 Pro",
    store: "iPlace",
    color: "#22c55e",
    total: 10,
    paid: 3,
    valuePerMonth: 689.90,
    totalValue: 6899.00,
    paidValue: 2069.70,
    nextDue: "18 set",
    icon: "📱",
    monthlyData: [
      { m: "Jul", pago: 689.90, total: 689.90 },
      { m: "Ago", pago: 689.90, total: 689.90 },
      { m: "Set", pago: 689.90, total: 689.90 },
      { m: "Out", pago: 0, total: 689.90 },
      { m: "Nov", pago: 0, total: 689.90 },
      { m: "Dez", pago: 0, total: 689.90 },
      { m: "Jan", pago: 0, total: 689.90 },
      { m: "Fev", pago: 0, total: 689.90 },
      { m: "Mar", pago: 0, total: 689.90 },
      { m: "Abr", pago: 0, total: 689.90 },
    ],
  },
  {
    id: 3,
    name: "Smart TV 65\"",
    store: "Magazine Luiza",
    color: "#f59e0b",
    total: 6,
    paid: 5,
    valuePerMonth: 416.50,
    totalValue: 2499.00,
    paidValue: 2082.50,
    nextDue: "25 set",
    icon: "📺",
    monthlyData: [
      { m: "Abr", pago: 416.50, total: 416.50 },
      { m: "Mai", pago: 416.50, total: 416.50 },
      { m: "Jun", pago: 416.50, total: 416.50 },
      { m: "Jul", pago: 416.50, total: 416.50 },
      { m: "Ago", pago: 416.50, total: 416.50 },
      { m: "Set", pago: 0, total: 416.50 },
    ],
  },
  {
    id: 4,
    name: "Sofá 3 lugares",
    store: "Tok&Stok",
    color: "#06b6d4",
    total: 8,
    paid: 2,
    valuePerMonth: 312.37,
    totalValue: 2499.00,
    paidValue: 624.74,
    nextDue: "30 set",
    icon: "🛋️",
    monthlyData: [
      { m: "Ago", pago: 312.37, total: 312.37 },
      { m: "Set", pago: 312.37, total: 312.37 },
      { m: "Out", pago: 0, total: 312.37 },
      { m: "Nov", pago: 0, total: 312.37 },
      { m: "Dez", pago: 0, total: 312.37 },
      { m: "Jan", pago: 0, total: 312.37 },
      { m: "Fev", pago: 0, total: 312.37 },
      { m: "Mar", pago: 0, total: 312.37 },
    ],
  },
];

function MiniBarChart({ data, color }: { data: { m: string; pago: number; total: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={52}>
      <BarChart data={data} barCategoryGap="20%" barGap={2}>
        <Tooltip
          contentStyle={{ background: "#12121a", border: "1px solid #1e1e30", borderRadius: 8, fontSize: 10, color: "#f0f0f8" }}
          formatter={(v) => [`R$ ${Number(v).toFixed(2)}`, ""]}
          labelFormatter={(l) => l}
        />
        <Bar dataKey="total" radius={[3, 3, 0, 0]} fill={`${color}22`} />
        <Bar dataKey="pago" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.pago > 0 ? color : "transparent"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function InstallmentsScreen({ onBack }: { onBack: () => void }) {
  const totalCommitted = installments.reduce((s, i) => s + (i.totalValue - i.paidValue), 0);
  const totalPaid = installments.reduce((s, i) => s + i.paidValue, 0);

  return (
    <div className="flex flex-col pb-8" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-12 pb-4">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold">Parcelamentos</h1>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{installments.length} compras ativas</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mx-5 mb-5">
        <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-[10px] mb-1" style={{ color: "var(--muted-foreground)" }}>Já pago</p>
          <p className="text-sm font-bold font-mono" style={{ color: "#22c55e" }}>
            R$ {totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-[10px] mb-1" style={{ color: "var(--muted-foreground)" }}>A pagar</p>
          <p className="text-sm font-bold font-mono" style={{ color: "#f43f5e" }}>
            R$ {totalCommitted.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-4 px-5">
        {installments.map((inst) => {
          const pct = Math.round((inst.paid / inst.total) * 100);
          const remaining = inst.total - inst.paid;

          return (
            <div key={inst.id} className="rounded-3xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              {/* Top */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0" style={{ background: "var(--secondary)" }}>
                    {inst.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm leading-tight">{inst.name}</h3>
                    <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{inst.store}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${inst.color}20`, color: inst.color }}>
                    {pct}% pago
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full mb-3" style={{ background: "var(--secondary)" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: inst.color }} />
              </div>

              {/* Stats row */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 rounded-xl p-2.5" style={{ background: "var(--secondary)" }}>
                  <p className="text-[9px] mb-0.5" style={{ color: "var(--muted-foreground)" }}>Parcelas</p>
                  <p className="text-xs font-bold font-mono">{inst.paid}<span style={{ color: "var(--muted-foreground)" }}>/{inst.total}</span></p>
                </div>
                <div className="flex-1 rounded-xl p-2.5" style={{ background: "var(--secondary)" }}>
                  <p className="text-[9px] mb-0.5" style={{ color: "var(--muted-foreground)" }}>Por mês</p>
                  <p className="text-xs font-bold font-mono">R$ {inst.valuePerMonth.toFixed(2)}</p>
                </div>
                <div className="flex-1 rounded-xl p-2.5" style={{ background: "var(--secondary)" }}>
                  <p className="text-[9px] mb-0.5" style={{ color: "var(--muted-foreground)" }}>Restam</p>
                  <p className="text-xs font-bold font-mono" style={{ color: remaining <= 2 ? "#22c55e" : "var(--foreground)" }}>{remaining}x</p>
                </div>
              </div>

              {/* Bar chart */}
              <div className="rounded-xl p-3" style={{ background: "var(--secondary)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px]" style={{ color: "var(--muted-foreground)" }}>Pagamentos por mês</p>
                  <p className="text-[9px] font-mono" style={{ color: inst.color }}>
                    R$ {inst.paidValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de R$ {inst.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <MiniBarChart data={inst.monthlyData} color={inst.color} />
              </div>

              {/* Next due */}
              <div className="flex items-center justify-between mt-3">
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Próximo vencimento</p>
                <p className="text-[10px] font-semibold" style={{ color: "#f59e0b" }}>{inst.nextDue}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
