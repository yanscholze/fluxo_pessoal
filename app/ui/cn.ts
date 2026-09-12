/**
 * `cn`, o nome que o ecossistema shadcn usa para juntar classes.
 *
 * Existe só como ponte: `components.json` aponta o alias `utils` para cá, e
 * todo componente trazido de um registro importa `cn` daqui. Sem isso, cada
 * componente baixado chegaria com um import quebrado.
 *
 * É um reexporte do `join` que este projeto já usa — **não** uma segunda
 * implementação. Duas funções de juntar classe divergem: uma ganha suporte a
 * objeto, a outra não, e a diferença aparece como classe faltando numa tela.
 *
 * Uma diferença real em relação ao `cn` canônico do shadcn, que vale saber
 * antes de colar um componente: aquele passa por `tailwind-merge`, que desfaz
 * conflito entre utilitários — `px-2 px-4` vira `px-4`. Este apenas concatena.
 * Na prática isso significa que sobrescrever uma classe de um componente
 * baixado passando `className` pode não funcionar como você espera: as duas
 * ficam, e quem vence é a ordem do CSS gerado, não a sua intenção.
 */

export { join as cn } from "./primitives.tsx";
