import { useState } from "react";
import React from "react";
import HomeScreen from "./screens/HomeScreen";
import StatementScreen from "./screens/StatementScreen";
import CardsScreen from "./screens/CardsScreen";
import ProjectsScreen from "./screens/ProjectsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import InstallmentsScreen from "./screens/InstallmentsScreen";

type Screen = "home" | "statement" | "cards" | "projects" | "settings" | "installments";

export default function App() {
  const [active, setActive] = useState<Screen>("home");

  const screens: Record<string, React.ReactElement> = {
    home: <HomeScreen onProfile={() => setActive("settings")} />,
    statement: <StatementScreen onProfile={() => setActive("settings")} />,
    cards: <CardsScreen onProfile={() => setActive("settings")} onInstallments={() => setActive("installments")} />,
    projects: <ProjectsScreen onProfile={() => setActive("settings")} />,
    settings: <SettingsScreen onBack={() => setActive("home")} />,
    installments: <InstallmentsScreen onBack={() => setActive("cards")} />,
  };

  const navItems = [
    { id: "home", label: "Início", icon: HomeIcon },
    { id: "statement", label: "Extrato", icon: StatementIcon },
    { id: "cards", label: "Cartões", icon: CardIcon },
    { id: "projects", label: "Projetos", icon: ProjectIcon },
  ] as const;

  return (
    <div className="flex flex-col h-full max-w-[440px] mx-auto relative overflow-hidden" style={{ background: "var(--background)" }}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {screens[active]}
      </div>

      {active !== "settings" && active !== "installments" && (
        <div
          className="absolute z-50 left-1/2 -translate-x-1/2"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 8px) + 42px)"}}
        >
          <button
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 active:scale-90"
            style={{ background: "var(--primary)", boxShadow: "0 8px 32px #7c5cfc66" }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      )}

      {active !== "settings" && active !== "installments" && (
        <nav className="shrink-0 glass border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-around py-2 px-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className="flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all duration-200"
                  style={{ color: isActive ? "var(--primary)" : "var(--muted-foreground)" }}
                >
                  <Icon size={22} filled={isActive} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="h-safe-bottom" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }} />
        </nav>
      )}
    </div>
  );
}


function HomeIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
      {filled
        ? <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        : <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}

function StatementIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
      {filled
        ? <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        : <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}

function CardIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
      {filled
        ? <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 4h16M4 12h4m-4 4h6" />
        : <path d="M3 10h18M7 15h.01M11 15h2M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1z" strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}

function ProjectIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
      {filled
        ? <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v2H4V6zM2 10h20v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8z" />
        : <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v2H4V6zM2 10h20v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8z" strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}
