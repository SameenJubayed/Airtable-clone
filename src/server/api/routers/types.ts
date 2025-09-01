// server/api/routers/types.ts
import { z } from "zod";

export const cursorInput = z.object({
  tableId: z.string().cuid(),
  // row.id cursor
  cursor: z.string().nullish(), 
  // TanStack virtualizer friendly
  limit: z.number().int().min(1).max(500).default(100), 
});

export const searchInput = z.object({
  q: z.string().trim().min(1).max(200),
});

// Filter on columns
export const textFilterOps = z.enum(["isEmpty", "notEmpty", "contains", "notContains", "equals"]);
export const numberFilterOps = z.enum(["gt", "lt"]);

export const columnFilter = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    columnId: z.string().cuid(),
    op: textFilterOps,
    value: z.string().optional(),
  }),
  z.object({
    type: z.literal("NUMBER"),
    columnId: z.string().cuid(),
    op: numberFilterOps,
    value: z.number().optional(),
  }),
]);

export const filtersInput = z.object({
  tableId: z.string().cuid(),
  filters: z.array(columnFilter).default([]),
});

export const sortInput = z.object({
  tableId: z.string().cuid(),
  // only one sort at a time (Airtable simple sort)
  sortBy: z.object({
    columnId: z.string().cuid(),
    // TEXT: "asc" (A→Z) | "desc" (Z→A), NUMBER: "asc" | "desc"
    direction: z.enum(["asc", "desc"]),
  }).nullable().default(null),
});

export const viewStateInput = z.object({
  tableId: z.string().cuid(),
  q: z.string().trim().optional(),
  filters: z.array(columnFilter).default([]),
  sortBy: sortInput.shape.sortBy,
  cursor: z.string().nullish(),
  limit: cursorInput.shape.limit,
});
