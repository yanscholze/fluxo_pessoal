/**
 * Classificação de categoria a partir do estabelecimento.
 *
 * Uma sugestão de captura sem categoria transfere para o usuário o trabalho
 * que a automação existia para tirar dele: ele confirma o lançamento e depois
 * precisa abrir de novo para categorizar. Aqui o palpite vem junto.
 *
 * **É palpite, e a tela precisa dizer isso.** O nome que chega numa notificação
 * é o do adquirente, não o do negócio — "PAG*JOAODASILVA" pode ser qualquer
 * coisa. Por isso a função devolve confiança, e a interface mostra a categoria
 * como pré-seleção editável, nunca como fato.
 *
 * O domínio não conhece o identificador da categoria do usuário: ele devolve
 * um **rótulo canônico**, e quem faz a ponte para a categoria cadastrada é o
 * serviço. Fazer o contrário obrigaria a passar o catálogo inteiro para dentro
 * de uma regra pura.
 */

import { normalize } from "./notification.ts";

/**
 * Rótulos canônicos.
 *
 * Correspondem às categorias que o Fluxo cria por padrão. Um usuário que
 * renomeou "Alimentação" para "Comida" continua recebendo palpite: a ponte é
 * por correspondência de nome normalizado, e o serviço cai fora em silêncio
 * quando não acha equivalente.
 */
export type CategoryLabel =
  | "Alimentação"
  | "Transporte"
  | "Moradia"
  | "Saúde"
  | "Lazer"
  | "Compras"
  | "Assinaturas";

type Regra = {
  readonly label: CategoryLabel;
  /** Termos já normalizados: minúsculos e sem acento. */
  readonly termos: readonly string[];
  /**
   * Confiança do acerto. Marca conhecida é alta; palavra genérica é média,
   * porque "mercado" também aparece em "Mercado Livre", que é compra.
   */
  readonly confianca: number;
};

/**
 * A ordem importa: a primeira regra que casar vence.
 *
 * As marcas vêm antes dos genéricos de propósito — "raia drogasil" precisa
 * bater em Saúde antes que "drog" bata em qualquer coisa, e "mercado livre"
 * precisa bater em Compras antes que "mercado" bata em Alimentação.
 */
const REGRAS: readonly Regra[] = [
  // --- Marcas que enganariam um genérico -----------------------------------
  { label: "Compras", termos: ["mercado livre", "mercadolivre", "mercado pago", "mercadopago"], confianca: 0.9 },
  { label: "Transporte", termos: ["mercado envios"], confianca: 0.8 },

  // --- Assinaturas ---------------------------------------------------------
  {
    label: "Assinaturas",
    termos: [
      "netflix", "spotify", "disney", "hbo", "max ", "prime video", "amazon prime", "globoplay",
      "deezer", "youtube premium", "apple.com/bill", "apple com bill", "itunes", "google one",
      "icloud", "dropbox", "adobe", "microsoft 365", "office 365", "canva", "notion", "chatgpt",
      "openai", "paramount", "crunchyroll", "kindle unlimited", "star plus", "starplus",
    ],
    confianca: 0.92,
  },

  // --- Saúde ---------------------------------------------------------------
  {
    label: "Saúde",
    termos: [
      "drogaria", "drogasil", "droga raia", "raia", "pacheco", "pague menos", "farmacia",
      "farmácia", "panvel", "venancio", "unimed", "amil", "hapvida", "sulamerica saude",
      "bradesco saude", "laboratorio", "labi", "fleury", "sabin", "hermes pardini", "clinica",
      "hospital", "odonto", "dentista", "psicolog", "veterinar",
    ],
    confianca: 0.85,
  },

  // --- Transporte ----------------------------------------------------------
  {
    label: "Transporte",
    termos: [
      "uber", "99app", "99 pop", "99pop", "cabify", "indriver", "posto", "ipiranga", "shell",
      "petrobras", "br mania", "ale combust", "gasolina", "combustivel", "estacionamento",
      "estapar", "zona azul", "parking", "sem parar", "conectcar", "veloe", "pedagio",
      "localiza", "movida", "unidas", "latam", "gol linhas", "azul linhas", "smiles",
      "riachuelo mobilidade", "metro", "metrô", "bilhete unico", "sptrans", "brt", "rodoviaria",
    ],
    confianca: 0.85,
  },

  // --- Alimentação ---------------------------------------------------------
  {
    label: "Alimentação",
    termos: [
      "ifood", "rappi", "uber eats", "zé delivery", "ze delivery", "aiqfome", "delivery much",
      "supermercado", "supermerc", "hipermercado", "atacadao", "assai", "carrefour", "extra",
      "pao de acucar", "pão de açúcar", "angeloni", "big bompreco", "bompreco", "sonda",
      "st marche", "zona sul", "hortifruti", "sacolao", "acougue", "padaria", "panificadora",
      "confeitaria", "cafeteria", "starbucks", "kopenhagen", "restaurante", "churrascaria",
      "pizzaria", "hamburgueria", "burger", "mcdonald", "bk ", "burger king", "subway",
      "outback", "madero", "habibs", "bobs", "spoleto", "china in box", "sushi", "bar e ",
      "lanchonete", "mercearia", "empório", "emporio", "adega",
    ],
    confianca: 0.85,
  },

  // --- Moradia -------------------------------------------------------------
  {
    label: "Moradia",
    termos: [
      "aluguel", "condominio", "condomínio", "imobiliaria", "enel", "cemig", "copel", "cpfl",
      "light servicos", "energisa", "equatorial", "neoenergia", "celesc", "sabesp", "copasa",
      "sanepar", "casan", "cedae", "embasa", "comgas", "naturgy", "iptu", "vivo fibra",
      "claro net", "net servicos", "oi fibra", "tim live", "algar", "internet", "gas natural",
      "leroy merlin", "telhanorte", "c&c casa", "obramax",
    ],
    confianca: 0.85,
  },

  // --- Lazer ---------------------------------------------------------------
  {
    label: "Lazer",
    termos: [
      "cinemark", "cinepolis", "uci cinemas", "kinoplex", "ingresso.com", "ingressorapido",
      "sympla", "eventim", "ticketmaster", "steam", "playstation", "xbox", "nintendo",
      "epic games", "riot games", "smart fit", "bluefit", "bodytech", "academia", "gympass",
      "totalpass", "parque", "clube", "hotel", "pousada", "airbnb", "booking", "decolar",
    ],
    confianca: 0.8,
  },

  // --- Compras -------------------------------------------------------------
  {
    label: "Compras",
    termos: [
      "amazon", "magazine luiza", "magalu", "americanas", "submarino", "shopee", "aliexpress",
      "shein", "casas bahia", "ponto frio", "fast shop", "kabum", "pichau", "terabyte",
      "renner", "riachuelo", "c&a", "zara", "hering", "centauro", "netshoes", "nike", "adidas",
      "decathlon", "havan", "shopping", "loja", "boticario", "boticário", "natura", "avon",
      "sephora", "epoca cosmeticos",
    ],
    confianca: 0.8,
  },
];

export type CategoryGuess = {
  readonly label: CategoryLabel;
  /** 0 a 1. Multiplicada pela confiança da própria captura no serviço. */
  readonly confidence: number;
  /** O termo que casou. Serve para a tela explicar de onde veio o palpite. */
  readonly matched: string;
};

/**
 * Adivinha a categoria de uma compra a partir do texto da notificação.
 *
 * Recebe o estabelecimento **e** o texto bruto: quando o estabelecimento não
 * foi isolado, o nome da loja em geral ainda está no texto completo, e desistir
 * ali desperdiçaria o palpite fácil.
 *
 * Devolve `null` quando nada casa — o que é a resposta certa e comum. Chutar
 * "Outros" seria pior do que não chutar: o usuário confirmaria sem perceber e
 * o relatório de categorias encheria de lixo.
 */
export function guessCategory(merchant: string | null, rawText = ""): CategoryGuess | null {
  const alvo = normalize(`${merchant ?? ""} ${rawText}`);
  if (!alvo.trim()) return null;

  for (const regra of REGRAS) {
    for (const termo of regra.termos) {
      if (!alvo.includes(termo)) continue;

      // Casar no nome do estabelecimento vale mais do que casar no texto
      // inteiro: o texto traz palavras do banco que não descrevem a compra.
      const noEstabelecimento = merchant ? normalize(merchant).includes(termo) : false;
      return {
        label: regra.label,
        confidence: noEstabelecimento ? regra.confianca : Math.max(0.5, regra.confianca - 0.2),
        matched: termo.trim(),
      };
    }
  }

  return null;
}
