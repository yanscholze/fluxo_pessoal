"use client";

/**
 * O gráfico de som do centro do orbe.
 *
 * Parado, é o desenho de sempre — treze barras de alturas fixas. Ele só se
 * mexe quando o TARS tem o que dizer, e é essa a diferença entre um indicador
 * e uma decoração: barra que pulsa o tempo todo não avisa nada quando começa a
 * pulsar de verdade.
 *
 * O atraso de cada barra é negativo de propósito. Com atraso positivo, todas
 * começariam achatadas juntas e a onda levaria um segundo para se formar; com
 * atraso negativo, a animação já entra no meio do ciclo e a primeira barra que
 * aparece já está numa altura diferente da vizinha.
 */

import styles from "./tars.module.css";
import { useVozDoTars } from "./voice.ts";

const ALTURAS = [7, 13, 9, 23, 17, 30, 20, 12, 25, 16, 9, 18, 7];

export function Waveform({ compact = false }: { compact?: boolean }) {
  const voz = useVozDoTars();
  const movimento =
    voz === "pensando" ? styles.waveThinking : voz === "falando" ? styles.waveSpeaking : "";

  // `span`, e não `div`: a versão compacta vive dentro de um parágrafo, ao lado
  // do texto de situação. `display: flex` continua valendo — ele é de bloco.
  return (
    <span
      className={[styles.waveform, compact ? styles.waveformCompact : "", movimento]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {ALTURAS.map((altura, indice) => (
        <span key={indice} style={{ height: altura, animationDelay: `${indice * -80}ms` }} />
      ))}
    </span>
  );
}
