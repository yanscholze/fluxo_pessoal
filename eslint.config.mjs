import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "mobile/**",
    "next-env.d.ts",
    // Código de protótipo guardado como referência de desenho, não como fonte
    // do produto: não compila aqui e não deve ser corrigido para compilar.
    "docs/**",
  ]),
]);

export default eslintConfig;
