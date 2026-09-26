import Link from "next/link";
import type { ReactNode } from "react";

import { addDays, type LocalDate } from "../../../core/time/local-date.ts";
import type { Dashboard } from "../../../server/services/dashboard.ts";
import type { GoalsView } from "../../../server/services/goals.ts";
import type { TarsPendingCounts } from "../../../server/services/tars.ts";
import { LinkButton } from "../controls.tsx";
import { competenceLong, dateShort, money, percent, relativeDay } from "../format.ts";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Briefcase, CalendarClock, ChevronRight,
  CircleAlert, CircleCheck, CreditCard, FileText, LayoutDashboard, Plus, Receipt,
  Sparkles, Target, Wallet, Zap,
} from "../icons.tsx";
import type { LucideIcon } from "../icons.tsx";
import { TaskBoard } from "../work/task-board.tsx";
import styles from "./tars.module.css";
import { Waveform } from "./waveform.tsx";

type Signal = { id: string; label: string; detail: string; href: string; urgent?: boolean };
type AgendaItem = { id: string; label: string; amount: number; dueOn: LocalDate; kind: string; href: string; income?: boolean };
const SHORT_MONTH = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

export function TarsOverview({
  firstName,
  dashboard,
  goals,
  pending,
  assistantReady,
}: {
  firstName: string;
  dashboard: Dashboard;
  goals: GoalsView;
  pending: TarsPendingCounts;
  assistantReady: boolean;
}) {
  const { freeToSpend, position, monthFlow, today } = dashboard;
  // O serviço do painel também traz ciclos anteriores ainda abertos. Um ciclo
  // anterior não significa atraso: somente o vencimento passado o determina.
  const invoices = dashboard.cards.flatMap((card) =>
    [...card.overdueInvoices, ...(card.currentInvoice ? [card.currentInvoice] : []), ...card.upcomingInvoices]
      .filter((invoice) => invoice.outstandingCents > 0)
      .map((invoice) => ({ ...invoice, cardId: card.id, cardName: card.name })),
  );
  const overdue = invoices.filter((invoice) => invoice.dueDate < today);
  const activeGoals = goals.goals.filter((goal) => !goal.isAchieved);
  const lateGoals = activeGoals.filter((goal) => goal.behindSchedule || (goal.targetDate !== null && goal.targetDate < today));
  const signals: Signal[] = [];

  if (freeToSpend.amountCents < 0) signals.push({ id: "cash", label: "O ciclo fica negativo", detail: `${money(Math.abs(freeToSpend.amountCents))} faltam para cobrir faturas e compromissos previstos.`, href: "/painel", urgent: true });
  if (overdue.length) signals.push({ id: "invoices", label: `${overdue.length} fatura${overdue.length === 1 ? " vencida" : "s vencidas"}`, detail: `${money(overdue.reduce((total, invoice) => total + invoice.outstandingCents, 0))} ainda em aberto.`, href: "/cartoes", urgent: true });
  if (pending.captures) signals.push({ id: "captures", label: `${pending.captures} captura${pending.captures === 1 ? "" : "s"} para revisar`, detail: "Confira os dados antes de confirmar.", href: "/automaticos" });
  if (pending.imports) signals.push({ id: "imports", label: `${pending.imports} importaç${pending.imports === 1 ? "ão" : "ões"} em revisão`, detail: "Retome de onde você parou.", href: "/automaticos?aba=importacoes" });
  if (lateGoals.length) signals.push({ id: "goals", label: `${lateGoals.length} meta${lateGoals.length === 1 ? " pede" : "s pedem"} atenção`, detail: "Revise o prazo ou o ritmo dos aportes.", href: "/patrimonio?aba=metas" });

  const horizon = addDays(today, 30);
  const agenda: AgendaItem[] = [
    ...invoices.filter((invoice) => invoice.dueDate >= today && invoice.dueDate <= horizon).map((invoice) => ({
      id: `invoice-${invoice.cardId}-${invoice.competence}`, label: invoice.cardName,
      amount: invoice.outstandingCents, dueOn: invoice.dueDate, kind: "Fatura", href: `/cartoes?cartao=${invoice.cardId}`,
    })),
    ...dashboard.upcoming.map((item) => ({
      id: `entry-${item.transactionId}-${item.dueOn}-${item.kind}`, label: item.description,
      amount: item.amountCents, dueOn: item.dueOn,
      kind: item.kind === "income" ? "Entrada prevista" : "Despesa prevista",
      income: item.kind === "income",
      href: item.source === "recurrence" ? "/planejamento?aba=recorrencias" : "/lancamentos",
    })),
  ].sort((left, right) => left.dueOn.localeCompare(right.dueOn)).slice(0, 3);

  const goalPreview = [...activeGoals].sort((left, right) => Number(right.behindSchedule) - Number(left.behindSchedule) || right.percent - left.percent).slice(0, 2);
  const hasAccounts = dashboard.accounts.length > 0;
  const intro = freeToSpend.amountCents < 0
    ? "Sua projeção pede atenção. Vamos começar pelos compromissos que mais pesam."
    : overdue.length
      ? "Há faturas vencidas para resolver. As prioridades estão logo abaixo."
      : `Seu dinheiro, seus compromissos e seus planos. Tudo em perspectiva, ${firstName}.`;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>INÍCIO / CENTRO DE COMANDO</p>
          {/* `h2`: o `h1` da página é o "TARS" da barra de cima, e dois numa
              página só deixam o leitor de tela sem saber qual é o título. */}
          <h2>Olá, {firstName}<span className={styles.greetingDot}>.</span></h2>
          <p className={styles.intro}>{intro}</p>
        </div>
        <div className={styles.headerActions}>
          <LinkButton href="/painel" icon={LayoutDashboard}>Abrir painel</LinkButton>
          <LinkButton href="/lancamentos?novo=1" variant="primary" icon={Plus}>Novo lançamento</LinkButton>
        </div>
      </header>

      <section className={styles.console} aria-label="TARS: visão financeira e prioridades">
        <header className={styles.consoleHeader}>
          <div className={styles.brand}>
            <div className={styles.brandGlyph} aria-hidden="true"><span /><span /><span /><span /></div>
            <div><span className={styles.brandName}>TARS</span><p>SEU UNIVERSO EM ORDEM</p></div>
          </div>
          <div className={styles.consoleMeta}>
            <span><i aria-hidden="true" />DADOS DO FLUXO</span>
            <span>{dateShort(today)} · {competenceLong(dashboard.competence)}</span>
          </div>
          <Link href="#conversa" className={styles.consoleAction}><Sparkles size={15} aria-hidden="true" />{assistantReady ? "Conversar" : "Conheça o TARS"}<ArrowUpRight size={15} aria-hidden="true" /></Link>
        </header>

        <div className={styles.hudGrid}>
          <div className={styles.sideColumn}>
            <HudPanel number="01" title="Posição financeira" icon={Wallet}>
              <p className={styles.metricLabel}>Saldo disponível hoje</p>
              <p className={styles.primaryMetric}>{money(freeToSpend.liquidBalanceCents)}</p>
              <p className={styles.metricHint}>Nas contas de uso corrente em reais</p>
              <dl className={styles.financialRows}>
                <div><dt>Comprometido no ciclo</dt><dd>{money(position.committedCents)}</dd></div>
                {dashboard.benefitFreeToSpend ? (
                  <div>
                    <dt>Vale no fim do ciclo</dt>
                    <dd>{money(dashboard.benefitFreeToSpend.amountCents)}</dd>
                  </div>
                ) : null}
                <div><dt>Entradas do mês <ArrowDownRight aria-hidden="true" size={13} /></dt><dd className={styles.positive}>{money(monthFlow.incomeCents)}</dd></div>
                <div><dt>Saídas do mês <ArrowUpRight aria-hidden="true" size={13} /></dt><dd>{money(monthFlow.expenseCents)}</dd></div>
              </dl>
              <p className={styles.smallNote}>Entradas e saídas confirmadas em contas de uso corrente.</p>
              <PanelLink href="/contas">Ver minhas contas</PanelLink>
            </HudPanel>

            <HudPanel number="02" title="No seu horizonte" icon={CalendarClock}>
              {agenda.length ? (
                <ul className={styles.agendaList}>
                  {agenda.map((item) => <li key={item.id}>
                    <Link href={item.href} className={styles.agendaItem}>
                      <span className={styles.dateChip}><strong>{item.dueOn.slice(8)}</strong><span>{SHORT_MONTH.format(new Date(`${item.dueOn}T12:00:00Z`)).replace(".", "")}</span></span>
                      <span className={styles.agendaCopy}><strong>{item.label}</strong><span>{item.kind} · {relativeDay(item.dueOn, today)}</span><b className={item.income ? styles.positive : undefined}>{item.income ? "+ " : ""}{money(item.amount)}</b></span>
                      <ChevronRight aria-hidden="true" size={14} />
                    </Link>
                  </li>)}
                </ul>
              ) : <QuietState icon={CalendarClock} title="Horizonte livre" description="Nenhum evento previsto nos próximos 30 dias." />}
              <PanelLink href="/planejamento?aba=recorrencias">Abrir planejamento</PanelLink>
            </HudPanel>
          </div>

          <div className={styles.corePanel}>
            <div className={styles.coreCoordinates} aria-hidden="true"><span>FLUXO / TARS</span><span>VISÃO INTEGRADA</span></div>
            <div className={styles.orbit}>
              {/*
               * Cada peça do desenho gira sozinha, e nenhuma acompanha a outra.
               *
               * Os anéis inteiros — o de 139, o de 113 e o de 88 — ficam
               * parados de propósito: circunferência contínua girando é
               * indistinguível de circunferência parada, e animá-la seria pagar
               * repintura por quadro sem ninguém ver nada. Gira o que tem
               * assimetria: o tracejado, os dois arcos, a cruz e os pontos.
               *
               * Os arcos e os pontos moram no mesmo raio de 139. Girando em
               * sentidos e ritmos diferentes, eles se cruzam — é o que dá a
               * impressão de mecanismo, e não de imagem com filtro.
               *
               * O `<g>` é que gira; o `transform` de cada peça continua sendo o
               * ângulo em que ela foi desenhada. Pôr os dois no mesmo elemento
               * faria a animação apagar a posição inicial e os arcos saltariam
               * ao carregar.
               */}
              <svg className={styles.orbitDrawing} viewBox="0 0 360 360" fill="none" aria-hidden="true">
                <g className={`${styles.spin} ${styles.spinOuter}`}>
                  <circle className={styles.outerRing} cx="180" cy="180" r="160" strokeWidth="1" strokeDasharray="3 9" />
                </g>
                <circle className={styles.trackRing} cx="180" cy="180" r="139" strokeWidth="1" />
                <g className={`${styles.spin} ${styles.spinArcWide}`}>
                  <circle className={styles.accentArc} cx="180" cy="180" r="139" strokeWidth="3" strokeDasharray="64 810" transform="rotate(-45 180 180)" />
                </g>
                <g className={`${styles.spin} ${styles.spinArcThin}`}>
                  <circle className={styles.accentArc} cx="180" cy="180" r="139" strokeWidth="2" strokeDasharray="22 852" transform="rotate(135 180 180)" />
                </g>
                <circle className={styles.middleRing} cx="180" cy="180" r="113" strokeWidth="1" />
                <g className={`${styles.spin} ${styles.spinCrosshair}`}>
                  <path className={styles.crosshair} d="M180 8V75M180 285V352M8 180H75M285 180H352M76 76L100 100M260 260L284 284M76 284L100 260M260 100L284 76" strokeWidth="1" />
                </g>
                <circle className={styles.innerRing} cx="180" cy="180" r="88" strokeWidth="1" />
                <g className={`${styles.spin} ${styles.spinPoints}`}>
                  <circle className={styles.orbitPoint} cx="180" cy="41" r="4" />
                  <circle className={styles.orbitPoint} cx="41" cy="180" r="3" />
                  <circle className={styles.orbitPoint} cx="278" cy="278" r="3" />
                </g>
              </svg>
              <div className={styles.coreIdentity}>
                <span className={styles.coreEyebrow}>CENTRO DE COMANDO</span>
                <span className={styles.coreName}>TARS</span>
                <span className={styles.coreStatus}>Tudo começa aqui</span>
                <Waveform />
              </div>
            </div>
            <div className={styles.freeSpend}>
              <span className={styles.metricLabel}>{freeToSpend.amountCents < 0 ? "Déficit projetado" : "Livre para gastar"}</span>
              <strong className={freeToSpend.amountCents < 0 ? styles.negative : undefined}>{money(freeToSpend.amountCents)}</strong>
              <p>Sobra do ciclo até {dateShort(freeToSpend.windowEnd)}<br />Saldo, entradas, faturas e compromissos previstos.</p>
              <Link href={hasAccounts ? "/painel" : "/contas"} className={styles.coreLink}>{hasAccounts ? "Entender minha projeção" : "Adicionar minha primeira conta"}<ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
            <div className={styles.coreFooter}><span className={styles.statusDot} aria-hidden="true" />{signals.length ? `${signals.length} ${signals.length === 1 ? "ponto" : "pontos"} de atenção` : "Visão dos seus dados atuais"}</div>
          </div>

          <div className={styles.sideColumn}>
            <HudPanel number="03" title="Precisa de você" icon={CircleAlert}>
              {signals.length ? (
                <ul className={styles.signalList}>
                  {signals.map((signal) => <li key={signal.id}>
                    <Link href={signal.href} className={styles.signalItem}>
                      <span className={`${styles.signalDot} ${signal.urgent ? styles.signalUrgent : ""}`} aria-hidden="true" />
                      <span><strong>{signal.label}</strong><p>{signal.detail}</p></span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </Link>
                  </li>)}
                </ul>
              ) : <QuietState icon={CircleCheck} title="Sem alertas por aqui" description="Nenhuma fatura vencida, revisão pendente ou alerta de caixa e metas nos dados atuais." />}
              <PanelLink href="/automaticos">Central de automações</PanelLink>
            </HudPanel>

            <HudPanel number="04" title="Construindo o futuro" icon={Target}>
              <div className={styles.wealthRow}><div><p className={styles.metricLabel}>Patrimônio líquido</p><p className={styles.wealthMetric}>{money(position.netWorthCents)}</p></div><ArrowUpRight aria-hidden="true" size={20} /></div>
              <p className={styles.metricHint}>{money(position.investmentsCents)} em investimentos</p>
              {goalPreview.length ? <ul className={styles.goalList}>{goalPreview.map((goal) => <li key={goal.goalId}>
                <Link href="/patrimonio?aba=metas" className={styles.goalLink}>
                  <span><strong>{goal.name}</strong><b>{percent(goal.percent)}</b></span>
                  <div className={styles.progressTrack} aria-hidden="true"><div style={{ width: `${Math.max(0, Math.min(100, goal.percent))}%` }} /></div>
                  <small>{money(goal.current)} de {money(goal.target)}</small>
                </Link>
              </li>)}</ul> : <p className={styles.goalEmpty}>{goals.goals.length ? "Suas metas estão concluídas. Qual será a próxima?" : "Dê um destino aos seus próximos passos. Crie sua primeira meta."}</p>}
              <PanelLink href="/patrimonio">Abrir visão geral</PanelLink>
            </HudPanel>
          </div>
        </div>
        <footer className={styles.consoleFooter}><span>FINANÇAS · PLANOS · TRABALHO</span><span>{assistantReady ? "Conversa disponível abaixo" : "Visão financeira ativa · IA em preparação"}</span></footer>
      </section>

      <nav className={styles.quickActions} aria-label="Atalhos do TARS">
        <QuickAction href="/lancamentos?novo=1" icon={Receipt} label="Registrar movimento" detail="Receita, despesa ou transferência" />
        <QuickAction href="/cartoes" icon={CreditCard} label="Conferir faturas" detail="Vencimentos e limite disponível" />
        <QuickAction href="/automaticos?aba=importacoes" icon={FileText} label="Importar extrato" detail="Traga seus registros para o Fluxo" />
        <QuickAction href="/planejamento" icon={Zap} label="Planejar compromissos" detail="Parcelas, recorrências e assinaturas" />
      </nav>

      {/*
       * As pendências antes dos projetos.
       *
       * Quem abre o Fluxo de manhã pergunta "o que eu faço hoje" antes de
       * perguntar "como estão as coisas" — a mesma ordem da tela de Projetos.
       * O painel 03 aqui em cima responde pelo dinheiro: fatura vencida,
       * captura para revisar, meta fora do ritmo. Ele não sabe de tarefa, e
       * sem este quadro o TARS dizia "sem alertas por aqui" com uma entrega
       * vencida esperando.
       *
       * É o mesmo componente do Quadro, com "Feito" virado área de soltura:
       * aqui só entra o que falta, e a coluna do concluído estaria sempre
       * vazia dizendo uma mentira. Some inteiro quando não há nada pendente —
       * cinco colunas vazias são uma forma cara de dizer "nada".
       */}
      {dashboard.openTasks.length ? (
        <section className={styles.projectsSection} aria-labelledby="tars-tasks-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>O QUE PRECISA DE VOCÊ</p>
              <h2 id="tars-tasks-title">Suas pendências</h2>
              <p>{resumoDePrazos(dashboard.openTasks, today)}</p>
            </div>
            <Link href="/projetos/quadro" className={styles.textLink}>
              Abrir o quadro <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <TaskBoard tasks={dashboard.openTasks} dense doneIsDropZone />
        </section>
      ) : null}

      <section className={styles.projectsSection} aria-labelledby="tars-projects-title">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>TRABALHO EM MOVIMENTO</p><h2 id="tars-projects-title">Suas próximas entregas</h2><p>Projetos abertos, começando pelos prazos que pedem atenção.</p></div>
          <Link href="/projetos" className={styles.textLink}>Todos os projetos <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
        {dashboard.openProjects.length ? <div className={styles.projectsGrid}>{dashboard.openProjects.slice(0, 3).map((project) => (
          <Link href={`/projetos/${project.id}`} key={project.id} className={styles.projectCard}>
            <div className={styles.projectTop}><Briefcase size={18} aria-hidden="true" /><span className={project.deadlineStatus === "atrasado" ? styles.negative : undefined}>{project.dueOn ? `Entrega ${relativeDay(project.dueOn, today)}` : "Sem prazo definido"}</span><ArrowUpRight size={16} aria-hidden="true" /></div>
            <h3>{project.name}</h3><p>{project.clientName ?? "Projeto pessoal"}</p>
            <div className={styles.projectBottom}><span>{project.openTasks} tarefa{project.openTasks === 1 ? "" : "s"} em aberto</span><span>{percent(project.percentReceived)} recebido</span></div>
          </Link>
        ))}</div> : <Link href="/projetos" className={styles.projectsEmpty}><Briefcase size={22} aria-hidden="true" /><span><strong>Espaço para o seu próximo projeto</strong><p>Organize entregas, tarefas e recebimentos em um só lugar.</p></span><ArrowRight size={18} aria-hidden="true" /></Link>}
      </section>
    </>
  );
}

/** Quantos dias "esta semana" cobre. Sete, contados de hoje. */
const SEMANA = 7;

/**
 * O subtítulo do quadro conta o **prazo**, e não a situação.
 *
 * "3 a fazer, 1 travada" descreve o quadro, que já está logo abaixo. O que
 * decide o dia é o que venceu e o que vence: é isso que a linha diz.
 */
function resumoDePrazos(tarefas: readonly { dueOn: string | null; isLate: boolean }[], hoje: LocalDate): string {
  const limite = addDays(hoje, SEMANA);
  const atrasadas = tarefas.filter((tarefa) => tarefa.isLate).length;
  const paraHoje = tarefas.filter((tarefa) => tarefa.dueOn === hoje).length;
  const naSemana = tarefas.filter(
    (tarefa) => tarefa.dueOn !== null && tarefa.dueOn > hoje && tarefa.dueOn <= limite,
  ).length;

  const partes: string[] = [];
  if (atrasadas) partes.push(`${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}`);
  if (paraHoje) partes.push(`${paraHoje} para hoje`);
  if (naSemana) partes.push(`${naSemana} nesta semana`);

  // Sem prazo nenhum, o número que ainda diz alguma coisa é o total. Escrever
  // "0 atrasadas" seria contar uma ausência como se fosse notícia.
  if (!partes.length) {
    return `${tarefas.length} em aberto, nenhuma com prazo nos próximos ${SEMANA} dias`;
  }
  return partes.join(" · ");
}

function HudPanel({ number, title, icon: Icon, children }: { number: string; title: string; icon: LucideIcon; children: ReactNode }) {
  return <section id={number === "03" ? "pendencias" : undefined} className={styles.hudPanel}><header className={styles.panelHeader}><span className={styles.panelNumber}>{number}</span><h2>{title}</h2><Icon size={15} strokeWidth={1.5} aria-hidden="true" /></header>{children}</section>;
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.panelLink}>{children}<ArrowUpRight size={14} aria-hidden="true" /></Link>;
}

function QuietState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className={styles.quietState}><Icon size={23} strokeWidth={1.5} aria-hidden="true" /><strong>{title}</strong><p>{description}</p></div>;
}

function QuickAction({ href, icon: Icon, label, detail }: { href: string; icon: LucideIcon; label: string; detail: string }) {
  return <Link href={href} className={styles.quickAction}><Icon size={19} strokeWidth={1.5} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span><ArrowUpRight size={15} aria-hidden="true" /></Link>;
}
