/**
 * Configuração de ambiente.
 *
 * O endereço do servidor **não** é constante no código: o mesmo binário
 * precisa apontar para o servidor local durante o desenvolvimento e para o de
 * produção depois, e chumbar um valor obrigaria a recompilar para trocar.
 *
 * A ordem é: o que o usuário salvou no aparelho > `EXPO_PUBLIC_API_BASE_URL`
 * do momento do build > vazio, e aí a tela de conexão pergunta.
 *
 * `EXPO_PUBLIC_*` é a única forma de variável que o Expo injeta no bundle, e
 * por isso só serve para valor não secreto — endereço é; token não é, e por
 * isso vive no armazenamento seguro (ver `src/session/credentials.ts`).
 */

/** Qualquer esquema de URL: `https:`, `file:`, `javascript:`. */
const SCHEME = /^[a-z][a-z\d+\-.]*:/i;

/**
 * Normaliza o que o usuário digitou: sem barra final, com esquema.
 *
 * Só completa com `https://` quando **não** há esquema nenhum. Completar
 * cegamente transformaria `file:///etc/passwd` em um endereço de aparência
 * válida (`https://file///etc/passwd`) em vez de recusar a entrada.
 */
export function normalizeBaseUrl(input: string): string | null {
  const limpo = input.trim();
  if (!limpo) return null;

  const comEsquema = SCHEME.test(limpo) ? limpo : `https://${limpo}`;

  try {
    const url = new URL(comEsquema);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** Sugestão inicial para a tela de conexão. Pode ser vazia. */
export function suggestedBaseUrl(): string {
  return normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? "") ?? "";
}
