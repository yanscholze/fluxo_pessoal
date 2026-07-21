import type { FinanceCard } from "./finance-types";

export function sortFinanceCards(cards: FinanceCard[]) {
  return [...cards].sort((a, b) => {
    if (Boolean(a.favorite) !== Boolean(b.favorite)) return a.favorite ? -1 : 1;
    const order = (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);
    if (order) return order;
    if (a.kind !== b.kind) return a.kind === "credit" ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

export function normalizeCardOrder(cards: FinanceCard[], ids: string[], favoriteId?: string) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const orderedIds = [...new Set(ids)].filter((id) => byId.has(id));
  cards.forEach((card) => { if (!orderedIds.includes(card.id)) orderedIds.push(card.id); });
  const resolvedFavorite = favoriteId && byId.has(favoriteId) ? favoriteId : cards.find((card) => card.favorite)?.id;
  const normalized = orderedIds.map((id, sortOrder) => ({ ...byId.get(id)!, favorite: id === resolvedFavorite, sortOrder }));
  return sortFinanceCards(normalized);
}
