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
  total: number;      
  batchSize?: number;    
}) {
  const { prisma, jobId, tableId, total, batchSize = 10_000 } = opts;

  // ARRAY[...]::type[] helpers that keep values parameterized (safe & fast)
  const arrayText = (xs: string[]) =>
    Prisma.sql`ARRAY[${Prisma.join(xs.map(x => Prisma.sql`${x}`))}]::text[]`;

  const arrayTextNullable = (xs: (string | null)[]) =>
    Prisma.sql`ARRAY[${Prisma.join(xs.map(x => Prisma.sql`${x}`))}]::text[]`;

  const arrayFloatNullable = (xs: (number | null)[]) =>
    Prisma.sql`ARRAY[${Prisma.join(xs.map(x => Prisma.sql`${x}`))}]::double precision[]`;

  try {
    // mark running
    await prisma.bulkJob.update({ where: { id: jobId }, data: { status: "running" } });

    const cols = await prisma.column.findMany({
      where: { tableId },
      select: { id: true, type: true },
      orderBy: { position: "asc" },
    });

    // current max position
    const agg = await prisma.row.aggregate({
      where: { tableId },
      _max: { position: true },
    });
    let nextPos = (agg._max.position ?? -1) + 1;

    let inserted = 0;

    while (inserted < total) {
      const size = Math.min(batchSize, total - inserted);

      // Pre-generate row ids for this batch
      const rowIds: string[] = Array.from({ length: size }, () => cuid());

      // Build cell payloads in memory for this batch
      // NOTE: rows * columns items. Keep batchSize reasonable for big tables.
      const cellRowIds: string[] = [];
      const cellColumnIds: string[] = [];
      const cellTextValues: (string | null)[] = [];
      const cellNumberValues: (number | null)[] = [];

      if (cols.length > 0) {
        for (const rid of rowIds) {
          for (const col of cols) {
            cellRowIds.push(rid);
            cellColumnIds.push(col.id);
            if (col.type === "TEXT") {
              cellTextValues.push(faker.person.fullName());
              cellNumberValues.push(null);
            } else {
              // 2-decimal float in a range
              const n = faker.number.float({ min: 0, max: 10_000, fractionDigits: 2 });
              cellTextValues.push(null);
              cellNumberValues.push(n);
            }
          }
        }
      }

      await prisma.$transaction(async (tx) => {
        // 1) Insert rows (one SQL)
        // Use WITH ORDINALITY to produce 1..N and set position + orderKey = nextPos + ord - 1
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "Row" ("id","tableId","position","orderKey","createdAt","updatedAt")
          SELECT r.rid, ${tableId}, ${nextPos} + r.ord - 1, ${nextPos} + r.ord - 1, NOW(), NOW()
          FROM unnest(${arrayText(rowIds)}) WITH ORDINALITY AS r(rid, ord)
        `);

        // 2) Insert cells (one SQL) with faker-generated values
        if (cols.length > 0 && cellRowIds.length > 0) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "Cell" ("rowId","columnId","textValue","numberValue","createdAt","updatedAt")
            SELECT rid, cid, txt, num, NOW(), NOW()
            FROM unnest(
              ${arrayText(cellRowIds)},
              ${arrayText(cellColumnIds)},
              ${arrayTextNullable(cellTextValues)},
              ${arrayFloatNullable(cellNumberValues)}
            ) AS t(rid, cid, txt, num)
          `);
        }
      });

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
      const baseOrder = Prisma.sql`COALESCE(r."orderKey", r."position") ASC`;

      let orderForWindow: Prisma.Sql = baseOrder; // used inside ROW_NUMBER()
      let orderForSelect: Prisma.Sql = Prisma.sql`ORDER BY ${baseOrder}`; // final ORDER BY

      if (sorts.length) {
        const orderByParts: Prisma.Sql[] = [];

        for (const s of sorts) {
          const dir = s.dir === "desc" ? Prisma.raw("DESC") : Prisma.raw("ASC");
          const expr =
            s.type === "NUMBER" ? Prisma.sql`c."numberValue"` : Prisma.sql`c."textValue"`;

          // same expression usable in both window order and final order
          orderByParts.push(Prisma.sql`
            (
              SELECT ${expr}
              FROM "Cell" c
              WHERE c."rowId" = r.id AND c."columnId" = ${s.columnId}
              LIMIT 1
            ) ${dir} NULLS LAST
          `);
        }

        // window + final order both include your sorts then fall back to dense key
        orderForWindow = Prisma.sql`${Prisma.join(orderByParts, `, `)}, ${baseOrder}`;
        orderForSelect = Prisma.sql`ORDER BY ${Prisma.join(orderByParts, `, `)}, ${baseOrder}`;
      }

      const skip = input.cursor ?? input.skip ?? 0;

      const rows = await ctx.db.$queryRaw<
        { id: string; position: number; createdAt: Date; updatedAt: Date }[]
      >(Prisma.sql`
        SELECT
          r.id,
          -- zero-based "position" synthesized from the same ORDER BY the page uses
          ((ROW_NUMBER() OVER (ORDER BY ${orderForWindow}))::int - 1) AS "position",
          r."createdAt",
          r."updatedAt"
        FROM "Row" r
        WHERE ${Prisma.join(where, " AND ")}
        ${orderForSelect}
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
    .input(z.object({
      tableId: z.string().cuid(),
      position: z.number().int().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      // auth
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      // Neighbor keys (orderKey or legacy position) at position-1 and position
      const leftRes = await ctx.db.$queryRaw<{ k: Prisma.Decimal | null }[]>(Prisma.sql`
        SELECT COALESCE("orderKey","position") AS k
        FROM "Row"
        WHERE "tableId" = ${input.tableId}
        ORDER BY COALESCE("orderKey","position") ASC
        OFFSET ${Prisma.raw(String(Math.max(0, input.position - 1)))} LIMIT 1
      `);

      const rightRes = await ctx.db.$queryRaw<{ k: Prisma.Decimal | null }[]>(Prisma.sql`
        SELECT COALESCE("orderKey","position") AS k
        FROM "Row"
        WHERE "tableId" = ${input.tableId}
        ORDER BY COALESCE("orderKey","position") ASC
        OFFSET ${Prisma.raw(String(input.position))} LIMIT 1
      `);

      const leftK  = leftRes[0]?.k ?? null;
      const rightK = rightRes[0]?.k ?? null;

      // pick a new key between neighbors
      const GAP = new Prisma.Decimal(1024);
      let orderKey: Prisma.Decimal;

      if (!leftK && !rightK) {
        orderKey = new Prisma.Decimal(1_000_000);        // empty table
      } else if (leftK && !rightK) {
        orderKey = leftK.plus(GAP);   // append
      } else if (!leftK && rightK) {
        orderKey = rightK.minus(GAP); // prepend
      } else {
        orderKey = (leftK!).plus(rightK!).dividedBy(2); // midpoint
      }

      // Create the row + empty cells (single txn)
      const row = await ctx.db.$transaction(async (tx) => {
        const created = await tx.row.create({
          data: {
            tableId: input.tableId,
            position: 0,       // legacy, no longer used for ordering
            orderKey,          // NEW
          },
          select: { id: true, createdAt: true, position: true },
        });

        const columns = await tx.column.findMany({
          where: { tableId: input.tableId },
          select: { id: true },
          orderBy: { position: "asc" },
        });

        if (columns.length) {
          await tx.cell.createMany({
            data: columns.map((c) => ({
              rowId: created.id,
              columnId: c.id,
              textValue: null,
              numberValue: null,
            })),
            skipDuplicates: true,
          });
        }

        return created;
      });

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
