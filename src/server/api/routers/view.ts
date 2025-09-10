// server/api/routers/view.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const FilterZ = z.object({
  columnId: z.string().cuid(),
  op: z.enum(["isEmpty","isNotEmpty","contains","notContains","eq","gt","lt"]),
  value: z.union([z.string(), z.number()]).optional(),
});

const SortZ = z.object({
  columnId: z.string().cuid(),
  type: z.enum(["TEXT","NUMBER"]),
  dir: z.enum(["asc","desc"]).default("asc"),
});

export const viewRouter = createTRPCRouter({
  listByTable: protectedProcedure
    .input(z.object({ tableId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });
      return ctx.db.tableView.findMany({
        where: { tableId: input.tableId },
        orderBy: { createdAt: "asc" },
      });
    }),

  firstViewForTable: protectedProcedure
    .input(z.object({ tableId: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      // ownership check via base → user id
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      const existing = await ctx.db.tableView.findFirst({
        where: { tableId: input.tableId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (existing) return { viewId: existing.id };
    }),

  create: protectedProcedure
    .input(z.object({
      tableId: z.string().cuid(),
      name: z.string().trim().min(1).default("Grid view"),
      search: z.string().optional(),
      filters: z.array(FilterZ).optional(),
      sorts: z.array(SortZ).optional(),
      hidden: z.array(z.string().cuid()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });
      const v = await ctx.db.tableView.create({
        data: {
          tableId: input.tableId,
          name: input.name,
          search: input.search ?? null,
          filters: input.filters ?? [],
          sorts: input.sorts ?? [],
          hidden: input.hidden ?? [],
        },
      });
      return v;
    }),

  rename: protectedProcedure
    .input(z.object({ viewId: z.string().cuid(), name: z.string().trim().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.tableView.findFirstOrThrow({
        where: { id: input.viewId, table: { base: { createdById: ctx.session.user.id } } },
        select: { id: true },
      });
      return ctx.db.tableView.update({ where: { id: input.viewId }, data: { name: input.name } });
    }),

  updateConfig: protectedProcedure
    .input(z.object({
      viewId: z.string().cuid(),
      search: z.string().nullable().optional(),
      filters: z.array(FilterZ).optional(),
      sorts: z.array(SortZ).optional(),
      hidden: z.array(z.string().cuid()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.tableView.findFirstOrThrow({
        where: { id: input.viewId, table: { base: { createdById: ctx.session.user.id } } },
        select: { id: true },
      });
      return ctx.db.tableView.update({
        where: { id: input.viewId },
        data: {
          search: input.search ?? null,
          filters: input.filters ?? [],
          sorts: input.sorts ?? [],
          hidden: input.hidden ?? [],
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ viewId: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.tableView.findFirstOrThrow({
        where: { id: input.viewId, table: { base: { createdById: ctx.session.user.id } } },
        select: { id: true },
      });
      await ctx.db.tableView.delete({ where: { id: input.viewId } });
      return { ok: true };
    }),
});
