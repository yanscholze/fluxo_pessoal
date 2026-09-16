type SettingsItem = { label: string; value?: string; icon: string; danger?: boolean };

const sections: { title: string; items: SettingsItem[] }[] = [
  {
    title: "Conta",
    items: [
      { label: "Lucas Mendes", value: "lucas@email.com", icon: "👤" },
      { label: "Telefone", value: "+55 11 99999-4782", icon: "📱" },
      { label: "Plano", value: "Premium ✦", icon: "⭐" },
    ],
  },
  {
    title: "Preferências",
    items: [
      { label: "Notificações", value: "Ativado", icon: "🔔" },
      { label: "Face ID / Biometria", value: "Ativado", icon: "🔐" },
      { label: "Moeda padrão", value: "BRL — R$", icon: "💱" },
      { label: "Tema", value: "Escuro", icon: "🌙" },
    ],
  },
  {
    title: "Dados e privacidade",
    items: [
      { label: "Exportar dados", icon: "📤" },
      { label: "Política de privacidade", icon: "📄" },
      { label: "Termos de uso", icon: "📋" },
    ],
  },
  {
    title: "Suporte",
    items: [
      { label: "Ajuda e FAQ", icon: "❓" },
      { label: "Fale conosco", icon: "💬" },
      { label: "Versão", value: "2.4.1", icon: "🔧" },
    ],
  },
  {
    title: "Sessão",
    items: [
      { label: "Sair da conta", icon: "🚪", danger: true },
    ],
  },
];

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col pb-8" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-12 pb-6">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--secondary)", border: "1px solid var(--border)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">Configurações</h1>
      </div>

      {/* Profile card */}
      <div className="mx-5 mb-6 rounded-3xl p-5 flex items-center gap-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="relative">
          <img
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop&auto=format"
            alt="Perfil"
            className="w-16 h-16 rounded-2xl object-cover"
          />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs" style={{ background: "var(--primary)" }}>✏️</div>
        </div>
        <div>
          <p className="font-bold text-base">Lucas Mendes</p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>lucas@email.com</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#7c5cfc22", color: "var(--primary)" }}>Premium ✦</span>
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.title} className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider px-5 mb-2" style={{ color: "var(--muted-foreground)" }}>{section.title}</p>
          <div className="mx-5 rounded-2xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            {section.items.map((item, i) => (
              <button
                key={item.label}
                className="w-full flex items-center gap-3 px-4 py-3.5 transition-all active:opacity-70 text-left"
                style={{ borderBottom: i < section.items.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <span className="text-base w-7 text-center">{item.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: item.danger ? "#f43f5e" : "var(--foreground)" }}>{item.label}</p>
                </div>
                {item.value && (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{item.value}</p>
                )}
                {!item.danger && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--muted-foreground)" }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
