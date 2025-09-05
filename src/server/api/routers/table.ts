// src/server/api/routers/table.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
// import { faker } from "@faker-js/faker";

export const tableRouter = createTRPCRouter({
  listByBase: protectedProcedure
    .input(z.object({ baseId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      // ensure ownership via session id
      await ctx.db.base.findFirstOrThrow({
        where: { id: input.baseId, createdById: ctx.session.user.id },
      });

      return ctx.db.table.findMany({
        where: { baseId: input.baseId },
        orderBy: { position: "asc" },
        select: { id: true, name: true, position: true, createdAt: true },
      });
    }),
  
  createWithDefaults: protectedProcedure
    .input(
      z.object({
        baseId: z.string().cuid(),
        name: z.string().trim().min(1).default("Untitled Table"),
        defaultCols: z.number().int().min(1).max(10).default(6),
        defaultRows: z.number().int().min(0).max(1000).default(3),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // verify base exists logged in user owns it
      const base = await ctx.db.base.findFirstOrThrow({
        where: { id: input.baseId, createdById: ctx.session.user.id },
        select: { id: true },
      });

      // append position for the new table
      const position = await ctx.db.table.count({ where: { baseId: base.id } })

      // create the new Table inside that base
      const table = await ctx.db.table.create({
        data: { baseId: base.id, name: input.name, position },
        select: { id: true },
      });

      // Create default columns (position = left→right)
      const defaultNames = ["Name", "Notes", "Assignee", "Status", "Attachments"]
      await ctx.db.column.createMany({
        data: Array.from({ length: input.defaultCols }).map((_, idx) => ({
          tableId: table.id,
          name: defaultNames[idx] ?? `Column ${idx + 1}`,
          // e.g. column 2 = NUMBER, others = TEXT
          type: idx === 1 ? "NUMBER" : "TEXT",
          position: idx,
        })),
      });

      // Fetch columns once for cell creation
      const columns = await ctx.db.column.findMany({
        where: { tableId: table.id },
        orderBy: { position: "asc" },
      });

      // Create rows **one at a time**, then create cells for that row
      for (let i = 0; i < input.defaultRows; i++) {
        const row = await ctx.db.row.create({
          data: { tableId: table.id, position: i },
          select: { id: true },
        });

        // Create cells for this row
        await ctx.db.cell.createMany({
          data: columns.map((c) => ({
            rowId: row.id,
            columnId: c.id,
            // textValue: c.type === "TEXT" ? faker.word.words({ count: { min: 1, max: 3 } }) : null,
            // numberValue: c.type === "NUMBER" ? faker.number.int({ min: 0, max: 9999 }) : null,
            textValue: null,
            numberValue: null,
          })),
        });
      }

      return { id: table.id };
    }),

    
  rename: protectedProcedure
    .input(z.object({ tableId: z.string().cuid(), name: z.string().trim().min(1) }))
    .mutation(async ({ input, ctx }) => {
      // ownership via join
      await ctx.db.table.findFirstOrThrow({
        where: {
          id: input.tableId,
          base: { createdById: ctx.session.user.id },
        },
      });
      return ctx.db.table.update({
        where: { id: input.tableId },
        data: { name: input.name },
        select: { id: true, name: true, updatedAt: true },
      });
    })

});
