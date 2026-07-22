export function databaseNameFor(userId: string) {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) hash = Math.imul(hash ^ userId.charCodeAt(index), 16777619);
  return `fluxo-${(hash >>> 0).toString(16)}.db`;
}
