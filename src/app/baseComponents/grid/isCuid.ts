// app/baseComponents/grid/isCuid.ts
export function isCuid(id: string) {
  // very small check; good enough for gating queries
  return /^[a-z0-9]+$/i.test(id) && !id.startsWith("optimistic-");
}