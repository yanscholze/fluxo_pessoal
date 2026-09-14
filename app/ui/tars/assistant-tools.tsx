import { AssistantChat } from "../../(painel)/assistente/assistant-chat.tsx";
import { ReceiptReader } from "../../(painel)/assistente/receipt-reader.tsx";
import { Bot, Camera, Sparkles } from "../icons.tsx";
import { Meter, Panel, PanelHeader } from "../primitives.tsx";
import styles from "./tars.module.css";

type Quota = { readonly remaining: number; readonly limit: number };

export function AssistantTools({ advice, receipt }: { advice: Quota | null; receipt: Quota | null }) {
  const available = advice !== null && receipt !== null;

  return (
    <section id="conversa" className={styles.conversation} aria-labelledby="tars-conversation-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>SEU ASSISTENTE</p>
          <h2 id="tars-conversation-title">Converse com o TARS</h2>
          <p>{available ? "Uma nova perspectiva sobre os seus números." : "Hoje, uma visão do que importa. Em breve, uma conversa sobre o que vem a seguir."}</p>
        </div>
        <span className={styles.modeBadge}>{available ? "Conversas habilitadas" : "IA em preparação"}</span>
      </div>

      {available ? (
        <div className={styles.toolsGrid}>
          <Panel>
            <PanelHeader title="Perguntar ao TARS" icon={Bot} action={<DailyQuota quota={advice} />} />
            <AssistantChat remaining={advice.remaining} />
          </Panel>
          <Panel>
            <PanelHeader title="Ler um cupom" icon={Camera} action={<DailyQuota quota={receipt} />} />
            <ReceiptReader remaining={receipt.remaining} />
          </Panel>
        </div>
      ) : (
        <div className={styles.futureAssistant}>
          <div className={styles.futureIcon}><Sparkles size={23} strokeWidth={1.5} aria-hidden="true" /></div>
          <div>
            <h3>Seu próximo copiloto financeiro</h3>
            <p>A conversa e a leitura de cupons ainda não estão disponíveis nesta instalação. Enquanto isso, o TARS reúne seus dados, destaca pendências e leva você direto ao que precisa resolver.</p>
          </div>
          <span className={styles.futureTag}>EM BREVE</span>
        </div>
      )}
    </section>
  );
}

function DailyQuota({ quota }: { quota: Quota }) {
  return (
    <div className="w-32 text-right">
      <p className="tabular text-caption text-ink-subtle">{quota.remaining} de {quota.limit} hoje</p>
      <Meter className="mt-1" size="sm" value={quota.limit - quota.remaining} total={quota.limit} tone={quota.remaining === 0 ? "negative" : "accent"} label="Cota diária" />
    </div>
  );
}
