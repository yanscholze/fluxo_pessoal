import { useState } from "react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis,
} from "recharts";

const spendData = [
  { d: "01", v: 420 }, { d: "05", v: 380 }, { d: "10", v: 610 },
  { d: "15", v: 520 }, { d: "20", v: 780 }, { d: "25", v: 430 },
  { d: "30", v: 290 },
];

const transactions = [
  { id: 1, name: "Mercado Extra", category: "Alimentação", amount: -182.50, date: "Hoje, 14h32", icon: "🛒", color: "#22c55e" },
  { id: 2, name: "Salário", category: "Receita", amount: 8500.00, date: "Hoje, 08h00", icon: "💼", color: "#7c5cfc" },
  { id: 3, name: "Spotify", category: "Assinatura", amount: -21.90, date: "Ontem", icon: "🎵", color: "#1db954" },
  { id: 4, name: "iFood", category: "Alimentação", amount: -67.80, date: "Ontem", icon: "🍔", color: "#ea1d2c" },
  { id: 5, name: "Freelance UI", category: "Receita", amount: 1200.00, date: "12 set", icon: "💻", color: "#7c5cfc" },
];

const pending = [
  { id: 1, name: "Aluguel", amount: -2400.00, due: "Vence em 3 dias", icon: "🏠" },
  { id: 2, name: "Cartão Nubank", amount: -890.40, due: "Vence em 7 dias", icon: "💳" },
  { id: 3, name: "Conta de Luz", amount: -156.80, due: "Vence em 12 dias", icon: "⚡" },
];

function ProfileAvatar({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary flex-shrink-0" style={{ borderColor: "var(--primary)" }}>
      <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=72&h=72&fit=crop&auto=format" alt="Perfil" className="w-full h-full object-cover" />
    </button>
  );
}

export default function HomeScreen({ onProfile }: { onProfile: () => void }) {
  const [tab, setTab] = useState<"transactions" | "pending">("transactions");

  return (
    <div className="flex flex-col gap-0 pb-4" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Bom dia,</p>
          <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Lucas Mendes</h2>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted-foreground)" }}>
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: "var(--primary)" }} />
          </button>
          <ProfileAvatar onClick={onProfile} />
        </div>
      </div>

      {/* Free to Spend — hero */}
      <div className="px-5 py-6 text-center relative">
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse at 50% 0%, #7c5cfc 0%, transparent 70%)" }} />
        <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>Livre para gastar</p>
        <h1 className="text-[52px] font-bold leading-none tracking-tight" style={{ color: "var(--foreground)" }}>
          R$<span>4.287</span><span className="text-3xl">,<span style={{ color: "var(--primary)" }}>50</span></span>
        </h1>
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Entradas R$ 9.700</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: "#f43f5e" }} />
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Saídas R$ 5.412</span>
          </div>
        </div>
      </div>

      {/* Spending Chart */}
      <div className="mx-5 rounded-2xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">Gastos — Setembro</span>
          <span className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background: "var(--muted)", color: "var(--primary)" }}>-R$ 1.412</span>
        </div>
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={spendData}>
            <defs>
              <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c5cfc" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#7c5cfc" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="d" hide />
            <Tooltip
              contentStyle={{ background: "#12121a", border: "1px solid #1e1e30", borderRadius: 8, fontSize: 12, color: "#f0f0f8" }}
              formatter={(v) => [`R$ ${v}`, "Gastos"]}
            />
            <Area type="monotone" dataKey="v" stroke="#7c5cfc" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mx-5 mt-5 p-1 rounded-xl" style={{ background: "var(--secondary)" }}>
        {(["transactions", "pending"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
            style={tab === t
              ? { background: "var(--primary)", color: "#fff" }
              : { color: "var(--muted-foreground)" }
            }
          >
            {t === "transactions" ? "Transações" : `Pendências (${pending.length})`}
          </button>
        ))}
      </div>

      {/* Transactions */}
      {tab === "transactions" && (
        <div className="flex flex-col gap-1 px-5 mt-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-3 px-1">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: "var(--secondary)" }}>
                {tx.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.name}</p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{tx.date} · {tx.category}</p>
              </div>
              <p className="text-sm font-semibold font-mono" style={{ color: tx.amount > 0 ? "#22c55e" : "var(--foreground)" }}>
                {tx.amount > 0 ? "+" : ""}R$ {Math.abs(tx.amount).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Pending */}
      {tab === "pending" && (
        <div className="flex flex-col gap-3 px-5 mt-3">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg" style={{ background: "var(--secondary)" }}>
                {p.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs" style={{ color: "#f59e0b" }}>{p.due}</p>
              </div>
              <p className="text-sm font-semibold font-mono" style={{ color: "#f43f5e" }}>
                R$ {Math.abs(p.amount).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
