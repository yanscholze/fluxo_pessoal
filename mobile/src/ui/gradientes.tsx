/**
 * Os gradientes do desenho.
 *
 * O protótipo do Figma define quatro efeitos que o React Native não tem de
 * fábrica: três gradientes de cartão e dois brilhos radiais. Todos saem daqui,
 * desenhados com `react-native-svg`, que já é dependência do aplicativo — a
 * alternativa seria acrescentar `expo-linear-gradient` e com ele um módulo
 * nativo novo, por um efeito que o SVG desenha igual.
 *
 * Os valores são os do desenho, copiados, não interpretados. `135deg` no CSS
 * aponta do canto superior esquerdo para o inferior direito, que em coordenadas
 * de caixa é (0,0) → (1,1) — é por isso que os gradientes lineares daqui usam
 * exatamente esses pontos.
 *
 * Os radiais usam `viewBox="0 0 100 100"` com `preserveAspectRatio="none"`: o
 * círculo se estica junto com a caixa e vira a elipse que o CSS descreve em
 * `radial-gradient(ellipse at …)`. Sem isso o brilho fica redondo no meio de um
 * retângulo largo, que é outra coisa.
 */

import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

/**
 * As três faces de cartão do desenho, na ordem em que ele as define.
 *
 * São escolhidas por posição na carteira, e não pela cor guardada no cartão: o
 * desenho compõe os três juntos, e trocar um deles pela cor que o dono escolheu
 * na tela do site quebraria a harmonia que ele desenhou. A cor do cartão
 * continua servindo para reconhecê-lo nas listas, onde ela não briga com nada.
 */
export const GRADIENTES_DE_CARTAO = [
  ["#7c5cfc", "#4f3db8", "#1a0f4f"],
  ["#1a1a2e", "#16213e", "#0f3460"],
  ["#2d1b69", "#11998e"],
] as const;

export function gradienteDoCartao(indice: number): readonly string[] {
  return GRADIENTES_DE_CARTAO[indice % GRADIENTES_DE_CARTAO.length];
}

/** Preenchimento em 135°, do canto superior esquerdo ao inferior direito. */
export function FundoEmGradiente({
  cores,
  radius,
}: {
  cores: readonly string[];
  radius?: number;
}) {
  const id = `grad-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const parada = (indice: number) =>
    cores.length === 1 ? 0 : indice / (cores.length - 1);

  return (
    <View style={[COBERTURA.tudo, radius ? { borderRadius: radius, overflow: "hidden" } : null]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {cores.map((cor, indice) => (
              <Stop key={cor + indice} offset={parada(indice)} stopColor={cor} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Brilho radial que se estica com a caixa.
 *
 * `cx`, `cy` e `raio` vão em porcentagem da caixa, como no CSS. O desenho usa
 * dois: o lustro do cartão (80%, 20%, raio 60%, branco a 10%) e a aura atrás do
 * "livre para gastar" (50%, 0%, raio 70%, roxo a 20%).
 */
export function BrilhoRadial({
  cor,
  opacidade,
  cx = 50,
  cy = 0,
  raio = 70,
}: {
  cor: string;
  opacidade: number;
  cx?: number;
  cy?: number;
  raio?: number;
}) {
  const id = `brilho-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View style={[COBERTURA.tudo, { opacity: opacidade }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx={`${cx}%`} cy={`${cy}%`} r={`${raio}%`}>
            <Stop offset="0" stopColor={cor} stopOpacity="1" />
            <Stop offset="1" stopColor={cor} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const COBERTURA = StyleSheet.create({
  tudo: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
});
