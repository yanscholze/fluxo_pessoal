/**
 * Ponto de entrada.
 *
 * `./src/polyfills.ts` vem primeiro e não é decorativo — ver o comentário lá.
 */

import "./src/polyfills.ts";

import { registerRootComponent } from "expo";

import App from "./App.tsx";

registerRootComponent(App);
