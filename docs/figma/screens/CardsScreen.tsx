import { useState, useRef } from "react";

const cards = [
  {
    id: 1,
    name: "Nubank Ultraviolet",
    number: "**** **** **** 4782",
    holder: "LUCAS MENDES",
    expiry: "09/28",
    network: "Mastercard",
    gradient: "gradient-card-1",
    balance: 4200.0,
    limit: 12000.0,
    due: 890.4,
    dueDate: "22 set",
    transactions: [
      { name: "iFood", amount: -67.8, date: "15 set" },
      { name: "Netflix", amount: -39.9, date: "12 set" },
      { name: "Uber", amount: -28.4, date: "11 set" },
      { name: "Amazon", amount: -145.0, date: "09 set" },
    ],
  },
  {
    id: 2,
    name: "Itaú Personnalité",
    number: "**** **** **** 1234",
    holder: "LUCAS MENDES",
    expiry: "03/27",
    network: "Visa",
    gradient: "gradient-card-2",
    balance: 8500.0,
    limit: 20000.0,
    due: 2145.6,
    dueDate: "18 set",
    transactions: [
      { name: "Supermercado", amount: -312.4, date: "14 set" },
      { name: "Posto Shell", amount: -180.0, date: "10 set" },
      { name: "Farmácia", amount: -89.5, date: "08 set" },
      { name: "Restaurante", amount: -145.0, date: "07 set" },
    ],
  },
  {
    id: 3,
    name: "Inter Black",
    number: "**** **** **** 9988",
    holder: "LUCAS MENDES",
    expiry: "11/29",
    network: "Mastercard",
    gradient: "gradient-card-3",
    balance: 1200.0,
    limit: 5000.0,
    due: 456.2,
    dueDate: "25 set",
    transactions: [
      { name: "Spotify", amount: -21.9, date: "15 set" },
      { name: "App Store", amount: -14.9, date: "12 set" },
      { name: "iCloud", amount: -6.9, date: "01 set" },
      { name: "Canva Pro", amount: -69.9, date: "01 set" },
    ],
  },
];

const CARD_HEIGHT = 220;

function CreditCard({ card }: { card: (typeof cards)[0] }) {
  return (
    <div
      className={`w-full rounded-3xl p-6 ${card.gradient} relative overflow-hidden`}
      style={{ height: CARD_HEIGHT }}
    >
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background:
            "radial-gradient(circle at 80% 20%, #fff 0%, transparent 60%)",
        }}
      />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/60">{card.name}</p>

          <p className="text-lg font-bold text-white mt-1">
            R${" "}
            {card.balance.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>

        <div className="text-right">
          <div className="flex gap-0.5">
            <div className="w-7 h-7 rounded-full bg-white/30" />
            <div className="w-7 h-7 rounded-full bg-white/60 -ml-3" />
          </div>

          <p className="text-[10px] text-white/60 mt-1">{card.network}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-white font-mono text-sm tracking-widest">
          {card.number}
        </p>
      </div>

      <div className="flex items-end justify-between mt-4">
        <div>
          <p className="text-[9px] text-white/50 uppercase tracking-wider">
            Titular
          </p>

          <p className="text-xs text-white font-semibold">{card.holder}</p>
        </div>

        <div>
          <p className="text-[9px] text-white/50 uppercase tracking-wider">
            Validade
          </p>

          <p className="text-xs text-white font-semibold">{card.expiry}</p>
        </div>

        <div className="w-8" />
      </div>
    </div>
  );
}

export default function CardsScreen({
  onProfile,
  onInstallments,
}: {
  onProfile: () => void;
  onInstallments: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [peeked, setPeeked] = useState(false);

  const dragStartX = useRef(0);
  const dragStartY = useRef(0);

  const card = cards[currentIndex];
  const pct = (card.due / card.limit) * 100;

  const handleDragStart = (x: number, y: number) => {
    dragStartX.current = x;
    dragStartY.current = y;
  };

  const handleDragEnd = (x: number, y: number) => {
    const dx = x - dragStartX.current;
    const dy = y - dragStartY.current;

    /*
     * SWIPE VERTICAL
     *
     * Agora funciona na tela inteira:
     *
     * ↑ abre os detalhes
     * ↓ fecha os detalhes
     */
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy < -30) {
        setPeeked(true);
        return;
      }

      if (dy > 30) {
        setPeeked(false);
        return;
      }
    }

    /*
     * SWIPE HORIZONTAL
     *
     * Só troca cartão enquanto a tela
     * estiver fechada.
     */
    if (!peeked && Math.abs(dx) > 60) {
      const next =
        dx < 0
          ? Math.min(currentIndex + 1, cards.length - 1)
          : Math.max(currentIndex - 1, 0);

      if (next !== currentIndex) {
        setCurrentIndex(next);
      }
    }
  };

  return (
    <div
      className="flex flex-col select-none overflow-hidden"
      style={{
        background: "var(--background)",
        minHeight: "100%",
        height: "100%",
        position: "relative",
        touchAction: "pan-x",
      }}
      onTouchStart={(e) =>
        handleDragStart(e.touches[0].clientX, e.touches[0].clientY)
      }
      onTouchEnd={(e) =>
        handleDragEnd(
          e.changedTouches[0].clientX,
          e.changedTouches[0].clientY
        )
      }
      onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
      onMouseUp={(e) => handleDragEnd(e.clientX, e.clientY)}
    >
      {/* HEADER */}
      <div
        className="flex items-center justify-between px-5 pt-12 pb-4"
        style={{
          position: "relative",
          zIndex: 20,
        }}
      >
        <div>
          <h1 className="text-xl font-bold">Cartões</h1>

          <p
            className="text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            {peeked
              ? "Arraste ↓ para fechar"
              : "Arraste ← → para trocar ou ↑ para ver detalhes"}
          </p>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onProfile();
          }}
          className="w-9 h-9 rounded-full overflow-hidden border-2"
          style={{ borderColor: "var(--primary)" }}
        >
          <img
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=72&h=72&fit=crop&auto=format"
            alt="Perfil"
            className="w-full h-full object-cover"
          />
        </button>
      </div>

      {/* ===================================================== */}
      {/* CARD STAGE                                            */}
      {/* ===================================================== */}

      <div
        className="relative px-5"
        style={{
          /*
           * FECHADO:
           * ocupa a maior parte da tela para deixar
           * o cartão visualmente centralizado.
           *
           * ABERTO:
           * reduz a área reservada e libera espaço
           * para o painel subir.
           */
          height: peeked ? 82 : "calc(100vh - 230px)",

          minHeight: peeked ? 82 : 430,

          transition:
            "height 0.6s cubic-bezier(0.23,1,0.32,1), min-height 0.6s cubic-bezier(0.23,1,0.32,1)",

          position: "relative",

          /*
           * O cartão aberto fica acima do conteúdo.
           */
          zIndex: peeked ? 100 : 10,

          overflow: "visible",
        }}
      >
        {cards.map((c, i) => {
          const offset = i - currentIndex;

          /*
           * Quando aberto, nenhum cartão vizinho
           * é renderizado.
           */
          if (peeked && offset !== 0) {
            return null;
          }

          if (Math.abs(offset) > 1) {
            return null;
          }

          const isActive = offset === 0;

          const baseScale = 1 - Math.abs(offset) * 0.05;

          const baseTranslateY = Math.abs(offset) * 8;

          const opacity = isActive ? 1 : 0.28;

          /*
           * ESTADO ABERTO
           *
           * O cartão:
           *
           * 1. gira 90 graus;
           * 2. aumenta proporcionalmente;
           * 3. sobe;
           * 4. mantém exatamente a mesma proporção.
           */
          const rotation = isActive && peeked ? 90 : 0;

          const scale =
            isActive && peeked
              ? 1.75
              : isActive
              ? 1
              : baseScale;

          /*
           * Fechado:
           * cartão centralizado verticalmente.
           *
           * Aberto:
           * cartão sobe bastante para ficar
           * preso à região superior.
           */
          const translateY =
            isActive && peeked ? -435 : -CARD_HEIGHT / 2 + baseTranslateY;

          return (
            <div
              key={c.id}
              className="absolute inset-x-5"
              style={{
                /*
                 * Quando fechado o centro do cartão
                 * fica no centro da área disponível.
                 *
                 * Quando aberto partimos do topo
                 * antes da transformação.
                 */
                top: peeked ? 0 : "50%",

                transform: `
                  translateY(${translateY}px)
                  rotate(${rotation}deg)
                  scale(${scale})
                `,

                transformOrigin: "center center",

                opacity,

                zIndex:
                  isActive && peeked
                    ? 999
                    : isActive
                    ? 10
                    : 1,

                transition:
                  "top 0.6s cubic-bezier(0.23,1,0.32,1), transform 0.6s cubic-bezier(0.23,1,0.32,1), opacity 0.3s ease",

                pointerEvents: isActive ? "auto" : "none",

                willChange: "transform, top",
              }}
            >
              <CreditCard card={c} />
            </div>
          );
        })}

        {/* DOTS + INSTRUÇÃO */}
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{
            /*
             * Posicionados abaixo do cartão
             * enquanto fechado.
             */
            top: "calc(50% + 135px)",

            opacity: peeked ? 0 : 1,

            visibility: peeked ? "hidden" : "visible",

            transform: peeked
              ? "translateY(-20px)"
              : "translateY(0)",

            transition:
              "opacity 0.25s ease, transform 0.4s ease",

            pointerEvents: peeked ? "none" : "auto",
          }}
        >
          <div className="flex justify-center gap-2">
            {cards.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(i);
                  setPeeked(false);
                }}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === currentIndex ? 20 : 6,
                  height: 6,

                  background:
                    i === currentIndex
                      ? "var(--primary)"
                      : "var(--border)",
                }}
              />
            ))}
          </div>

          <div
            className="flex flex-col items-center gap-1 mt-6"
            style={{
              color: "var(--muted-foreground)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>

            <span className="text-[10px]">
              Arraste para ver detalhes
            </span>
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* DETAIL PANEL                                          */}
      {/* ===================================================== */}

      <div
        className="flex flex-col gap-4 px-5 pb-6"
        style={{
          /*
           * FECHADO:
           * completamente escondido.
           *
           * ABERTO:
           * sobe de baixo e aparece.
           */
          opacity: peeked ? 1 : 0,

          visibility: peeked ? "visible" : "hidden",

          transform: peeked
            ? "translateY(0)"
            : "translateY(220px)",

          pointerEvents: peeked ? "auto" : "none",

          position: "relative",

          /*
           * Menor que o cartão aberto.
           */
          zIndex: 20,

          transition:
            "transform 0.6s cubic-bezier(0.23,1,0.32,1), opacity 0.35s ease, visibility 0s linear 0.35s",

          /*
           * Permite scroll se os detalhes
           * ultrapassarem a área disponível.
           */
          overflowY: peeked ? "auto" : "hidden",

          flex: peeked ? 1 : "0 0 auto",
        }}
      >
        {/* CARD INFO */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">{card.name}</h3>

            <span
              className="text-xs font-mono px-2 py-1 rounded-lg"
              style={{
                background: "var(--muted)",
                color: "var(--primary)",
              }}
            >
              {pct.toFixed(0)}% usado
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div
              className="rounded-xl p-3"
              style={{ background: "var(--secondary)" }}
            >
              <p
                className="text-[10px] mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Fatura atual
              </p>

              <p
                className="text-sm font-bold font-mono"
                style={{ color: "#f43f5e" }}
              >
                R$ {card.due.toFixed(2)}
              </p>
            </div>

            <div
              className="rounded-xl p-3"
              style={{ background: "var(--secondary)" }}
            >
              <p
                className="text-[10px] mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Limite total
              </p>

              <p className="text-sm font-bold font-mono">
                R$ {card.limit.toLocaleString("pt-BR")}
              </p>
            </div>
          </div>

          {/* LIMIT BAR */}
          <div
            className="w-full h-1.5 rounded-full mb-1"
            style={{ background: "var(--secondary)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: "var(--primary)",
                transition: "width 0.6s ease",
              }}
            />
          </div>

          <p
            className="text-[10px] text-right mb-4"
            style={{ color: "var(--muted-foreground)" }}
          >
            R$ {(card.limit - card.due).toLocaleString("pt-BR")} disponível
          </p>

          {/* TRANSACTIONS */}
          <p
            className="text-xs font-semibold mb-3"
            style={{ color: "var(--muted-foreground)" }}
          >
            Últimos lançamentos
          </p>

          {card.transactions.map((t, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-2 border-b last:border-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <p className="text-sm">{t.name}</p>

                <p
                  className="text-[10px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t.date}
                </p>
              </div>

              <p
                className="text-sm font-mono"
                style={{ color: "#f43f5e" }}
              >
                -R$ {Math.abs(t.amount).toFixed(2)}
              </p>
            </div>
          ))}
        </div>

        {/* INSTALLMENTS */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInstallments();
          }}
          className="w-full py-4 rounded-2xl flex items-center justify-between px-5 transition-all active:scale-[0.98]"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "#7c5cfc22" }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12h.01M12 16h.01M8 12h.01M8 16h.01" />
              </svg>
            </div>

            <div className="text-left">
              <p className="text-sm font-semibold">Parcelamentos</p>

              <p
                className="text-[10px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                Ver compras parceladas
              </p>
            </div>
          </div>

          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ color: "var(--muted-foreground)" }}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}