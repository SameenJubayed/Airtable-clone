import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const rowRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        tableId: z.string().cuid(),
        skip: z.number().int().min(0).default(0),
        take: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input, ctx }) => {
      // ensure user owns table via base
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });
      

      const rows = await ctx.db.row.findMany({
        where: { tableId: input.tableId },
        orderBy: { position: "asc" },
        skip: input.skip,
        take: input.take,
        select: { id: true, position: true, createdAt: true, updatedAt: true },
      });

      if (rows.length === 0) {
        return { rows: [], cells: [] as Array<{ rowId: string; columnId: string; textValue: string | null; numberValue: number | null }> };
      }

      const rowIds = rows.map((r) => r.id);

      const cells = await ctx.db.cell.findMany({
        where: { rowId: { in: rowIds } },
        select: { rowId: true, columnId: true, textValue: true, numberValue: true },
      });

      return { rows, cells };
    }),

    /**
   * Create a single row, appended to the end,
   * and initialize cells (null values) for all existing columns.
   */
  create: protectedProcedure
    .input(z.object({tableId: z.string().cuid(),}),)
    .mutation(async ({ input, ctx }) => {
      // ensure user owns table via base
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      // new row position = current count (append)
      const position = await ctx.db.row.count({ where: { tableId: input.tableId } });

      const row = await ctx.db.row.create({
        data: { tableId: input.tableId, position },
        select: { id: true, position: true, createdAt: true },
      });

      // initialize cells for existing columns
      const cols = await ctx.db.column.findMany({
        where: { tableId: input.tableId },
        select: { id: true },
        orderBy: { position: "asc" },
      });

      if (cols.length) {
        await ctx.db.cell.createMany({
          data: cols.map((c) => ({
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
   * We check the column type and write to the correct field,
   * nulling the other to keep the DB consistent.
   */
  updateCell: protectedProcedure
    .input(
      z.object({
        rowId: z.string().cuid(),
        columnId: z.string().cuid(),
        // pass exactly one of these (UI should enforce)
        textValue: z.string().nullable().optional(),
        numberValue: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // auth + ensure (row, column) are in user's base
      const cell = await ctx.db.cell.findFirstOrThrow({
        where: {
          rowId: input.rowId,
          columnId: input.columnId,
          row: { table: { base: { createdById: ctx.session.user.id } } },
        },
        select: { rowId: true, columnId: true },
      });

      // determine column type
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
   * Cells are removed via onDelete: Cascade in your Prisma schema.
   */
  delete: protectedProcedure
    .input(z.object({rowId: z.string().cuid(),}),)
    .mutation(async ({ input, ctx }) => {
      // ensure row belongs to user's base
      await ctx.db.row.findFirstOrThrow({
        where: { id: input.rowId, table: { base: { createdById: ctx.session.user.id } } },
        select: { id: true },
      });

      await ctx.db.row.delete({ where: { id: input.rowId } });
      return { ok: true };
    }),

});