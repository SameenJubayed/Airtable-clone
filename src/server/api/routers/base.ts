// src/server/api/routers/base.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { viewRouter } from "./view";

export const baseRouter = createTRPCRouter({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.base.findMany({
      where: { createdById: ctx.session.user.id },
      orderBy: { lastOpenedAt: "desc" },
      select: { id: true, name: true, lastOpenedAt: true, starred: true },
    });
  }),

  // Starred page
  listStarred: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.base.findMany({
      where: { createdById: ctx.session.user.id, starred: true },
      orderBy: [{ starredAt: "desc" }, { lastOpenedAt: "desc" }],
      select: { id: true, name: true, lastOpenedAt: true, starred: true, starredAt: true},
    });
  }),

  createWithDefaults: protectedProcedure
  .input(z.object({ name: z.string().optional() }))
  .mutation(async ({ ctx }) => {

    // create base
    const base = await ctx.db.base.create({
      data: {
        name: "Untitled Base",
        createdById: ctx.session.user.id,
        lastOpenedAt: new Date(),
      },
    });

    // Create first table with default columns + rows
    const table = await ctx.db.table.create({
      data: {
        baseId: base.id,
        name: "Table 1",
        position: 0,
        columns: {
          createMany: {
            data: [
              { name: "Name", type: "TEXT", position: 0 },
              { name: "Notes", type: "TEXT", position: 1 },
              { name: "Assignee", type: "TEXT", position: 2 },
              { name: "Status", type: "TEXT", position: 3 },
              { name: "Attachments", type: "TEXT", position: 4 },
            ],
          },
        },
        rows: {
          createMany: {
            data: Array.from({ length: 3 }).map((_, i) => ({ position: i })),
          },
        },
      },
    });

    // Create cells for every (row × column)
    const [cols, rows] = await Promise.all([
      ctx.db.column.findMany({ where: { tableId: table.id }, select: { id: true } }),
      ctx.db.row.findMany({ where: { tableId: table.id }, select: { id: true } }),
    ]);

    if (cols.length && rows.length) {
      await ctx.db.cell.createMany({
        data: rows.flatMap((r) =>
          cols.map((c) => ({
            rowId: r.id,
            columnId: c.id,
            textValue: null,
            numberValue: null,
          }))
        ),
        skipDuplicates: true,
      });
    }

    // Seed the default view so the sidebar has something to show
    const view = await ctx.db.tableView.create({
      data: {
        tableId: table.id,
        name: "Grid view",
        search: null,
        filters: [],
        sorts: [],
        hidden: [],
      },
    });

    return { baseId: base.id, tableId: table.id, viewId: view.id };
  }),

  // Toggle star
  setStarred: protectedProcedure
    .input(z.object({ baseId: z.string().cuid(), starred: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const prev = await ctx.db.base.findFirstOrThrow({
        where: { id: input.baseId, createdById: ctx.session.user.id },
        select: { updatedAt: true },
      });

      return ctx.db.base.update({
        where: { id: input.baseId },
        data: {
          starred: input.starred,
          starredAt: input.starred ? new Date() : null,
          // prevent reshuffling in "Recently opened"
          updatedAt: prev.updatedAt,
        },
        select: { id: true, starred: true, starredAt: true },
      });
    }),

  rename: protectedProcedure
    .input(z.object({ baseId: z.string().cuid(), name: z.string().trim().min(1) }))
    .mutation(async ({ input, ctx }) => {
      // auth: ensure the user owns the base
      const prev = await ctx.db.base.findFirstOrThrow({
        where: { id: input.baseId, createdById: ctx.session.user.id },
        select: { updatedAt: true },
      });

      return ctx.db.base.update({
        where: { id: input.baseId },
        data: { 
          name: input.name, 
          // prevent reshuffling in "Recently opened"
          updatedAt: prev.updatedAt 
        },
        select: { id: true, name: true, updatedAt: true },
      });
    }),

  // Delete a base (and everything under it via FK cascade).
  delete: protectedProcedure
    .input(z.object({ baseId: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      // Ownership check
      await ctx.db.base.findFirstOrThrow({
        where: { id: input.baseId, createdById: ctx.session.user.id },
        select: { id: true },
      });

      await ctx.db.base.delete({ where: { id: input.baseId } });
      return { ok: true };
    }),
  
  get: protectedProcedure
    .input(z.object({ baseId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.base.findFirstOrThrow({
        where: { id: input.baseId, createdById: ctx.session.user.id },
        select: { id: true, name: true, starred: true, lastOpenedAt: true },
      });
    }),

  // when visiting a base, we mark it opened so it floats to top of “recently opened”
  touchOpen: protectedProcedure
    .input(z.object({ baseId: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.base.findFirstOrThrow({
        where: { id: input.baseId, createdById: ctx.session.user.id },
        select: { id: true },
      });
      await ctx.db.base.update({
        where: { id: input.baseId },
        data: { lastOpenedAt: new Date() },
      });
      return { ok: true };
    }),
});
