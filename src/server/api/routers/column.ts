// server/api/routers/column.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { FieldType } from "@prisma/client";

export const columnRouter = createTRPCRouter({
  listByTable: protectedProcedure
    .input(z.object({ tableId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });
      return ctx.db.column.findMany({
        where: { tableId: input.tableId },
        orderBy: { position: "asc" },
        select: { id: true, name: true, type: true, position: true, width: true },
      });
    }),
    
  add: protectedProcedure
    .input(
      z.object({
        tableId: z.string().cuid(),
        name: z.string().trim().min(1),
        type: z.nativeEnum(FieldType).default("TEXT"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // ensure user owns table via base
      const table = await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      // Compute append position (end of list)
      const position = await ctx.db.column.count({ where: { tableId: table.id } });

      const result = await ctx.db.$transaction(async (tx) => {
        // create the column at the end
        const column = await tx.column.create({
          data: {
            tableId: table.id,
            name: input.name,
            type: input.type,
            position, // append
          },
          select: { id: true, name: true, type: true, position: true },
        });

        // Create cells for existing rows only (no new rows)
        const rows = await tx.row.findMany({
          where: { tableId: table.id },
          select: { id: true },
        });

        if (rows.length) {
          // create max 1000 rows at a time
          const BATCH = 1000;
          for (let i = 0; i < rows.length; i += BATCH) {
            await tx.cell.createMany({
              data: rows.slice(i, i + BATCH).map((r) => ({
                rowId: r.id,
                columnId: column.id,
                textValue: null,
                numberValue: null,
              })),
              skipDuplicates: true, // safe on retries
            });
          }
        }

        return column;
      });

      return result;
    }),

  // Rename a column 
  rename: protectedProcedure
    .input(z.object({ columnId: z.string().cuid(), name: z.string().trim().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.column.findFirstOrThrow({
        where: { id: input.columnId, table: { base: { createdById: ctx.session.user.id } } },
      });
      return ctx.db.column.update({
        where: { id: input.columnId },
        data: { name: input.name },
        select: { id: true, name: true },
      });
    }),

  /**
   * Change column type (TEXT <-> NUMBER).
   * Clears the incompatible value in cells for that column to keep DB clean.
   */
  changeType: protectedProcedure
    .input(z.object({ columnId: z.string().cuid(), type: z.nativeEnum(FieldType) }))
    .mutation(async ({ input, ctx }) => {
      const col = await ctx.db.column.findFirstOrThrow({
        where: { id: input.columnId, table: { base: { createdById: ctx.session.user.id } } },
      });

      await ctx.db.$transaction(async (tx) => {
        await tx.column.update({ where: { id: col.id }, data: { type: input.type } });
        if (input.type === "TEXT") {
          await tx.cell.updateMany({
            where: { columnId: col.id },
            data: { numberValue: null },
          });
        } else {
          await tx.cell.updateMany({
            where: { columnId: col.id },
            data: { textValue: null },
          });
        }
      });

      return { id: col.id, type: input.type };
    }),
  
  setWidth: protectedProcedure
    .input(z.object({
      columnId: z.string().cuid(),
      width: z.number().int().min(60).max(1000),
    }))
    .mutation(async ({ input, ctx }) => {
      // auth via join
      await ctx.db.column.findFirstOrThrow({
        where: { id: input.columnId, table: { base: { createdById: ctx.session.user.id } } },
        select: { id: true },
      });
      const updated = await ctx.db.column.update({
        where: { id: input.columnId },
        data: { width: input.width },
        select: { id: true, width: true },
      });
      return updated;
    }),

  reorder: protectedProcedure
    .input(
      z.object({
        tableId: z.string().cuid(),
        order: z.array(z.object({ columnId: z.string().cuid(), position: z.number().int().min(0) })),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
      });
      await ctx.db.$transaction(
        input.order.map((o) =>
          ctx.db.column.update({ where: { id: o.columnId }, data: { position: o.position } }),
        ),
      );
      return { ok: true };
    }),


  /**
   * Delete a column.
   * Cells referencing this column are removed via FK cascade (from your Prisma schema).
   */
  delete: protectedProcedure
    .input(z.object({ columnId: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      // Ensure column belongs to a table the user owns
      const col = await ctx.db.column.findFirstOrThrow({
        where: { id: input.columnId, table: { base: { createdById: ctx.session.user.id } } },
        select: { id: true, tableId: true, position: true },
      });

      // Delete column (cells cascade because of onDelete: Cascade on Cell.column relation)
      await ctx.db.column.delete({ where: { id: col.id } });

      // Re-densify positions so there are no gaps after deletion
      // This keeps left→right order stable if you rely on `position`
      const cols = await ctx.db.column.findMany({
        where: { tableId: col.tableId },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      await ctx.db.$transaction(
        cols.map((c, idx) =>
          ctx.db.column.update({ where: { id: c.id }, data: { position: idx } }),
        ),
      );

      return { ok: true };
    }),
});