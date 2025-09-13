// src/server/api/routers/row.ts
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { faker } from "@faker-js/faker";
import cuid from "cuid";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

// ---------------- FOR BULK INSERTING (100k holy moly) ----------------

async function runBulkInsertWorker(opts: {
  prisma: PrismaClient;
  jobId: string;
  tableId: string;
  total: number;          // e.g., 100_000
  batchSize?: number;     // e.g., 10_000
}) {
  const { prisma, jobId, tableId, total, batchSize = 10_000 } = opts;

  try {
    // mark running
    await prisma.bulkJob.update({ where: { id: jobId }, data: { status: "running" } });

    // gather columns once
    const cols = await prisma.column.findMany({
      where: { tableId },
      select: { id: true, type: true },
      orderBy: { position: "asc" },
    });

    // find current max position to keep ordering stable
    const agg = await prisma.row.aggregate({
      where: { tableId },
      _max: { position: true },
    });
    let nextPos = (agg._max.position ?? -1) + 1;

    let inserted = 0;

    while (inserted < total) {
      const size = Math.min(batchSize, total - inserted);

      // Pre-generate row ids so we can bulk-create cells without extra reads
      const now = new Date();
      const rowIds: string[] = Array.from({ length: size }, () => cuid());

      // 1) create rows in one batch
      await prisma.row.createMany({
        data: rowIds.map((id, k) => ({
          id,
          tableId,
          position: nextPos + k,
          createdAt: now,
          updatedAt: now,
        })),
        skipDuplicates: true,
      });

      // 2) create cells in chunks to keep payloads reasonable
      if (cols.length > 0) {
        const perChunk = 25_000; 
        const allCells = new Array<{ 
          rowId: string; 
          columnId: string; 
          textValue: string | null; 
          numberValue: number | null; 
          createdAt: Date; 
          updatedAt: Date; 
        }>(rowIds.length * cols.length);
        let i = 0;

        for (const rowId of rowIds) {
          for (const c of cols) {
            // fake data per column type
            const text = c.type === "TEXT" ? faker.person.fullName() : null;
            const num  = c.type === "NUMBER" ? faker.number.float({ min: 0, max: 100_000, fractionDigits: 2 }) : null;
            allCells[i++] = {
              rowId, columnId: c.id,
              textValue: text, numberValue: num,
              createdAt: now, updatedAt: now,
            };
          }
        }

        for (let start = 0; start < allCells.length; start += perChunk) {
          const slice = allCells.slice(start, start + perChunk);
          await prisma.cell.createMany({ data: slice, skipDuplicates: true });
        }
      }

      // advance counters
      nextPos += size;
      inserted += size;

      await prisma.bulkJob.update({
        where: { id: jobId },
        data: { inserted },
      });
    }

    await prisma.bulkJob.update({
      where: { id: jobId },
      data: { status: "done", finishedAt: new Date() },
    });
  } catch (err) {
    await prisma.bulkJob.update({
      where: { id: jobId },
      data: { status: "error", error: String(err) },
    });
  }
}

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
        cursor: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(500).default(200),
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
      
      const skip = input.cursor ?? input.skip ?? 0;

      const rows = await ctx.db.$queryRaw<
        { id: string; position: number; createdAt: Date; updatedAt: Date }[]
      >(Prisma.sql`
        SELECT r.id, r."position", r."createdAt", r."updatedAt"
        FROM "Row" r
        WHERE ${Prisma.join(where, " AND ")}
        ${orderBy}
        OFFSET ${Prisma.raw(String(skip))}
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


      if (rows.length === 0) {
        return { rows: [], cells: [], hasMore: false, nextSkip: skip };
      }
      const hasMore = rows.length === input.take;

      return { rows, cells, hasMore, nextSkip: skip + rows.length };
    }),
  
  searchMatches: protectedProcedure
    .input(
      z.object({
        tableId: z.string().cuid(),
        q: z.string().trim().min(1),
        rowIds: z.array(z.string().cuid()).min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      // ownership check
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      const like = `%${input.q}%`;
      const rowIdsSql = Prisma.join(input.rowIds.map((id) => Prisma.sql`${id}`));

      // constrain by table to avoid cross-table leakage
      const matches = await ctx.db.$queryRaw<
        { rowId: string; columnId: string }[]
      >(Prisma.sql`
        SELECT c."rowId", c."columnId"
        FROM "Cell" c
        JOIN "Row" r ON r.id = c."rowId"
        WHERE r."tableId" = ${input.tableId}
          AND r.id IN (${rowIdsSql})
          AND (
            c."textValue" ILIKE ${like}
            OR (c."numberValue"::text) ILIKE ${like}
          )
      `);

      return { matches };
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

  /**
   * FOR BULK INSERTING 100k ROWS
   */
  startBulkInsert: protectedProcedure
    .input(z.object({
      tableId: z.string().cuid(),
      total: z.number().int().positive().default(100_000),
      batchSize: z.number().int().positive().max(50_000).default(10_000),
    }))
    .mutation(async ({ ctx, input }) => {
      // ownership check
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      const job = await ctx.db.bulkJob.create({
        data: {
          tableId: input.tableId,
          total: input.total,
          status: "pending",
        },
        select: { id: true },
      });

      // fire-and-forget worker
      void runBulkInsertWorker({
        prisma: ctx.db,
        jobId: job.id,
        tableId: input.tableId,
        total: input.total,
        batchSize: input.batchSize,
      });

      return { jobId: job.id };
    }),

  getBulkJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.bulkJob.findUnique({
        where: { id: input.jobId },
        select: { status: true, inserted: true, total: true, error: true },
      });
      if (!job) return { status: "error", inserted: 0, total: 0, error: "not found" };
      return job;
    }),
});
