// src/server/api/routers/row.ts
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const ViewFilterZ = z.object({
  columnId: z.string().cuid(),
  op: z.enum(["isEmpty", "isNotEmpty", "contains", "notContains", "eq", "gt", "lt"]),
  value: z.union([z.string(), z.number()]).optional(),
});
type ViewFilter = z.infer<typeof ViewFilterZ>;

const ViewSortZ = z.object({
  columnId: z.string().cuid(),
  type: z.enum(["TEXT", "NUMBER"]),
  dir: z.enum(["asc", "desc"]),
});
type ViewSort = z.infer<typeof ViewSortZ>;

function parseFilters(raw: unknown): ViewFilter[] {
  const arr = Array.isArray(raw) ? raw : [];
  const parsed: ViewFilter[] = [];
  for (const item of arr) {
    const r = ViewFilterZ.safeParse(item);
    if (r.success) parsed.push(r.data);
  }
  return parsed;
}

function parseSorts(raw: unknown): ViewSort[] {
  const arr = Array.isArray(raw) ? raw : [];
  const parsed: ViewSort[] = [];
  for (const item of arr) {
    const r = ViewSortZ.safeParse(item);
    if (r.success) parsed.push(r.data);
  }
  return parsed;
}

export const rowRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        tableId: z.string().cuid(),
        viewId: z.string().cuid().optional(),
        skip: z.number().int().min(0).default(0),
        take: z.number().int().min(1).max(200).default(200),
      }),
    )
    .query(async ({ input, ctx }) => {
      // ownership check
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      const view = input.viewId
        ? await ctx.db.tableView.findFirst({
            where: { id: input.viewId, tableId: input.tableId },
          })
        : null;

      const filters: ViewFilter[] = parseFilters(view?.filters);
      const sorts: ViewSort[] = parseSorts(view?.sorts);

      // Read logic safely, default to "and"
      const logicRaw = (view as { filtersLogic?: unknown } | null)?.filtersLogic;
      const filtersLogic: "and" | "or" = logicRaw === "or" ? "or" : "and";

      // Base WHERE parts
      const where: Prisma.Sql[] = [Prisma.sql`r."tableId" = ${input.tableId}`];

      // Build filter expressions separately, each wrapped in parentheses
      const filterExprs: Prisma.Sql[] = [];

      for (const f of filters) {
        const colId = f.columnId;

        if (f.op === "isEmpty") {
          filterExprs.push(Prisma.sql`
            (
              EXISTS (
                SELECT 1 FROM "Cell" c
                WHERE c."rowId" = r.id AND c."columnId" = ${colId}
                  AND c."textValue" IS NULL AND c."numberValue" IS NULL
              )
            )
          `);
          continue;
        }

        if (f.op === "isNotEmpty") {
          filterExprs.push(Prisma.sql`
            (
              EXISTS (
                SELECT 1 FROM "Cell" c
                WHERE c."rowId" = r.id AND c."columnId" = ${colId}
                  AND (c."textValue" IS NOT NULL OR c."numberValue" IS NOT NULL)
              )
            )
          `);
          continue;
        }

        if (f.op === "contains" || f.op === "notContains") {
          const like = `%${String(f.value ?? "")}%`;
          if (f.op === "contains") {
            filterExprs.push(Prisma.sql`
              (
                EXISTS (
                  SELECT 1 FROM "Cell" c
                  WHERE c."rowId" = r.id AND c."columnId" = ${colId}
                    AND (c."textValue" ILIKE ${like} OR c."numberValue"::text ILIKE ${like})
                )
              )
            `);
          } else {
            filterExprs.push(Prisma.sql`
              (
                EXISTS (
                  SELECT 1 FROM "Cell" c
                  WHERE c."rowId" = r.id AND c."columnId" = ${colId}
                )
                AND NOT EXISTS (
                  SELECT 1 FROM "Cell" c
                  WHERE c."rowId" = r.id AND c."columnId" = ${colId}
                    AND (c."textValue" ILIKE ${like} OR c."numberValue"::text ILIKE ${like})
                )
              )
            `);
          }
          continue;
        }

        if (f.op === "eq") {
          const v = String(f.value ?? "");
          filterExprs.push(Prisma.sql`
            (
              EXISTS (
                SELECT 1 FROM "Cell" c
                WHERE c."rowId" = r.id AND c."columnId" = ${colId}
                  AND (c."textValue" = ${v} OR c."numberValue"::text = ${v})
              )
            )
          `);
          continue;
        }

        if (f.op === "gt" || f.op === "lt") {
          const num = Number(f.value ?? 0);
          const op = f.op === "gt" ? Prisma.raw(">") : Prisma.raw("<");
          filterExprs.push(Prisma.sql`
            (
              EXISTS (
                SELECT 1 FROM "Cell" c
                WHERE c."rowId" = r.id AND c."columnId" = ${colId}
                  AND c."numberValue" ${op} ${num}
              )
            )
          `);
          continue;
        }
      }

      // Join the filter expressions with AND/OR inside one parenthesized group
      if (filterExprs.length) {
        const joiner = filtersLogic === "or" ? " OR " : " AND ";
        where.push(Prisma.sql`(${Prisma.join(filterExprs, joiner)})`);
      }

      // ORDER BY (keep your previous logic)
      let orderBy: Prisma.Sql = Prisma.sql`ORDER BY r."position" ASC`;

      if (sorts.length) {
        const orderByParts: Prisma.Sql[] = [];

        for (const s of sorts) {
          const dir = s.dir === "desc" ? Prisma.raw("DESC") : Prisma.raw("ASC");
          const expr =
            s.type === "NUMBER" ? Prisma.sql`c."numberValue"` : Prisma.sql`c."textValue"`;

          orderByParts.push(Prisma.sql`
            (
              SELECT ${expr}
              FROM "Cell" c
              WHERE c."rowId" = r.id AND c."columnId" = ${s.columnId}
              LIMIT 1
            ) ${dir} NULLS LAST
          `);
        }

        orderBy = Prisma.sql`
          ORDER BY ${Prisma.join(orderByParts, ", ")}, r."position" ASC
        `;
      }

      const rows = await ctx.db.$queryRaw<
        { id: string; position: number; createdAt: Date; updatedAt: Date }[]
      >(Prisma.sql`
        SELECT r.id, r."position", r."createdAt", r."updatedAt"
        FROM "Row" r
        WHERE ${Prisma.join(where, " AND ")}
        ${orderBy}
        OFFSET ${Prisma.raw(String(input.skip))}
        LIMIT  ${Prisma.raw(String(input.take))}
      `);

      if (rows.length === 0) return { rows: [], cells: [] };

      const rowIdsSql = Prisma.join(rows.map((r) => Prisma.sql`${r.id}`));
      const cells = await ctx.db.$queryRaw<
        { rowId: string; columnId: string; textValue: string | null; numberValue: number | null }[]
      >(Prisma.sql`
        SELECT "rowId","columnId","textValue","numberValue"
        FROM "Cell"
        WHERE "rowId" IN (${rowIdsSql})
      `);

      return { rows, cells };
    }),

  /**
   * Insert a row at an exact position (0-based).
   */
  insertAt: protectedProcedure
    .input(
      z.object({
        tableId: z.string().cuid(),
        position: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      await ctx.db.row.updateMany({
        where: { tableId: input.tableId, position: { gte: input.position } },
        data: { position: { increment: 1 } },
      });

      const row = await ctx.db.row.create({
        data: { tableId: input.tableId, position: input.position },
        select: { id: true, position: true, createdAt: true },
      });

      const columns = await ctx.db.column.findMany({
        where: { tableId: input.tableId },
        select: { id: true },
        orderBy: { position: "asc" },
      });

      if (columns.length) {
        await ctx.db.cell.createMany({
          data: columns.map((c) => ({
            rowId: row.id,
            columnId: c.id,
            textValue: null,
            numberValue: null,
          })),
          skipDuplicates: true,
        });
      }

      return row;
    }),

  /**
   * Update a single cell.
   */
  updateCell: protectedProcedure
    .input(
      z.object({
        rowId: z.string().cuid(),
        columnId: z.string().cuid(),
        textValue: z.string().nullable().optional(),
        numberValue: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const cell = await ctx.db.cell.findFirstOrThrow({
        where: {
          rowId: input.rowId,
          columnId: input.columnId,
          row: { table: { base: { createdById: ctx.session.user.id } } },
        },
        select: { rowId: true, columnId: true },
      });

      const column = await ctx.db.column.findFirstOrThrow({
        where: { id: input.columnId },
        select: { type: true },
      });

      if (column.type === "TEXT") {
        return ctx.db.cell.update({
          where: { rowId_columnId: { rowId: cell.rowId, columnId: cell.columnId } },
          data: {
            textValue: input.textValue ?? null,
            numberValue: null,
          },
          select: { rowId: true, columnId: true, textValue: true, numberValue: true },
        });
      } else {
        return ctx.db.cell.update({
          where: { rowId_columnId: { rowId: cell.rowId, columnId: cell.columnId } },
          data: {
            textValue: null,
            numberValue: input.numberValue ?? null,
          },
          select: { rowId: true, columnId: true, textValue: true, numberValue: true },
        });
      }
    }),

  /**
   * Delete a row.
   */
  delete: protectedProcedure
    .input(z.object({ rowId: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.row.findFirstOrThrow({
        where: { id: input.rowId, table: { base: { createdById: ctx.session.user.id } } },
        select: { id: true },
      });

      await ctx.db.row.delete({ where: { id: input.rowId } });
      return { ok: true };
    }),
});
