import {
  LineChart, Line, ResponsiveContainer, Tooltip,
} from "recharts";

const projects = [
  {
    id: 1,
    name: "Reforma do Apê",
    color: "#7c5cfc",
    completion: 68,
    tasks: 24,
    pending: 8,
    budget: 45000,
    spent: 30600,
    paymentData: [
      { m: "M", v: 0 }, { m: "A", v: 5000 }, { m: "M", v: 12000 },
      { m: "J", v: 18000 }, { m: "J", v: 24000 }, { m: "A", v: 30600 },
    ],
    progressData: [
      { m: "M", v: 0 }, { m: "A", v: 15 }, { m: "M", v: 32 },
      { m: "J", v: 45 }, { m: "J", v: 58 }, { m: "A", v: 68 },
    ],
  },
  {
    id: 2,
    name: "App Fitness",
    color: "#22c55e",
    completion: 42,
    tasks: 56,
    pending: 33,
    budget: 18000,
    spent: 7560,
    paymentData: [
      { m: "J", v: 0 }, { m: "A", v: 2000 }, { m: "S", v: 4500 },
      { m: "O", v: 6000 }, { m: "N", v: 7560 }, { m: "D", v: 7560 },
    ],
    progressData: [
      { m: "J", v: 5 }, { m: "A", v: 12 }, { m: "S", v: 20 },
      { m: "O", v: 28 }, { m: "N", v: 37 }, { m: "D", v: 42 },
    ],
  },
  {
    id: 3,
    name: "Viagem Europa",
    color: "#f59e0b",
    completion: 85,
    tasks: 18,
    pending: 3,
    budget: 22000,
    spent: 18700,
    paymentData: [
      { m: "J", v: 3000 }, { m: "F", v: 7000 }, { m: "M", v: 10000 },
      { m: "A", v: 13500 }, { m: "M", v: 16000 }, { m: "J", v: 18700 },
    ],
    progressData: [
      { m: "J", v: 20 }, { m: "F", v: 35 }, { m: "M", v: 50 },
      { m: "A", v: 62 }, { m: "M", v: 75 }, { m: "J", v: 85 },
    ],
  },
  {
    id: 4,
    name: "Fundo de Emergência",
    color: "#06b6d4",
    completion: 55,
    tasks: 12,
    pending: 5,
    budget: 30000,
    spent: 16500,
    paymentData: [
      { m: "J", v: 2000 }, { m: "F", v: 5000 }, { m: "M", v: 8000 },
      { m: "A", v: 11000 }, { m: "M", v: 14000 }, { m: "J", v: 16500 },
    ],
    progressData: [
      { m: "J", v: 10 }, { m: "F", v: 20 }, { m: "M", v: 30 },
      { m: "A", v: 40 }, { m: "M", v: 48 }, { m: "J", v: 55 },
    ],
  },
];

function MiniLineChart({ data, color, dataKey }: { data: { m: string; v: number }[]; color: string; dataKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        <Tooltip
          contentStyle={{ background: "#12121a", border: "1px solid #1e1e30", borderRadius: 8, fontSize: 10, color: "#f0f0f8" }}
          labelFormatter={() => ""}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function ProjectsScreen({ onProfile }: { onProfile: () => void }) {
  return (
    <div className="flex flex-col pb-4" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-2">
        <div>
          <h1 className="text-xl font-bold">Projetos</h1>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{projects.length} projetos ativos</p>
        </div>
        <button onClick={onProfile} className="w-9 h-9 rounded-full overflow-hidden border-2" style={{ borderColor: "var(--primary)" }}>
          <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=72&h=72&fit=crop&auto=format" alt="Perfil" className="w-full h-full object-cover" />
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 px-5 mt-4 mb-5">
        <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-[10px] mb-1" style={{ color: "var(--muted-foreground)" }}>Total investido</p>
          <p className="text-sm font-bold">R$ {projects.reduce((s, p) => s + p.spent, 0).toLocaleString("pt-BR")}</p>
        </div>
        <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-[10px] mb-1" style={{ color: "var(--muted-foreground)" }}>Tarefas pendentes</p>
          <p className="text-sm font-bold">{projects.reduce((s, p) => s + p.pending, 0)}</p>
        </div>
      </div>

      {/* Project cards */}
      <div className="flex flex-col gap-4 px-5">
        {projects.map((project) => (
          <div key={project.id} className="rounded-3xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            {/* Top row */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: project.color }} />
                  <h3 className="font-semibold text-sm">{project.name}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${project.color}20`, color: project.color }}>
                    {project.completion}% concluído
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {project.tasks - project.pending}/{project.tasks} tarefas
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Pendências</p>
                <p className="text-lg font-bold" style={{ color: project.pending > 5 ? "#f43f5e" : "#22c55e" }}>{project.pending}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full mb-4" style={{ background: "var(--secondary)" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${project.completion}%`, background: project.color }} />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-2" style={{ background: "var(--secondary)" }}>
                <p className="text-[9px] mb-1 px-1" style={{ color: "var(--muted-foreground)" }}>Pagamentos</p>
                <MiniLineChart data={project.paymentData} color={project.color} dataKey="v" />
                <p className="text-[10px] font-mono px-1 mt-0.5" style={{ color: project.color }}>
                  R$ {project.spent.toLocaleString("pt-BR")} / {project.budget.toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="rounded-xl p-2" style={{ background: "var(--secondary)" }}>
                <p className="text-[9px] mb-1 px-1" style={{ color: "var(--muted-foreground)" }}>Progresso %</p>
                <MiniLineChart data={project.progressData} color={project.color} dataKey="v" />
                <p className="text-[10px] font-mono px-1 mt-0.5" style={{ color: project.color }}>
                  {project.tasks - project.pending} de {project.tasks} concluídas
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add project */}
      <button className="mx-5 mt-4 py-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-98" style={{ border: "2px dashed var(--border)", color: "var(--muted-foreground)" }}>
        <span className="text-lg">+</span>
        Novo projeto
      </button>
    </div>
  );
}
