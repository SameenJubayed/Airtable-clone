// server/api/routers/view.ts
import type { Prisma, $Enums } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const FilterZ = z.object({
  columnId: z.string().cuid(),
  op: z.enum(["isEmpty", "isNotEmpty", "contains", "notContains", "eq", "gt", "lt"]),
  value: z.union([z.string(), z.number()]).optional(),
});

const SortZ = z.object({
  columnId: z.string().cuid(),
  type: z.enum(["TEXT", "NUMBER"]),
  dir: z.enum(["asc", "desc"]).default("asc"),
});

const FiltersLogicZ = z.enum(["and", "or"]);

export const viewRouter = createTRPCRouter({
  listByTable: protectedProcedure
    .input(z.object({ tableId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      // ownership check
      await ctx.db.table.findFirstOrThrow({
        where: { id: input.tableId, base: { createdById: ctx.session.user.id } },
        select: { id: true },
      });

      // Return all fields your client uses, including filtersLogic
      return ctx.db.tableView.findMany({
        where: { tableId: input.tableId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          tableId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          search: true,
          filters: true,
          sorts: true,
          hidden: true,
          filtersLogic: true,
        },
      });
    }),

  firstViewForTable: protectedProcedure
    .input(z.object({ tableId: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
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
      return null;
    }),

  create: protectedProcedure
    .input(
      z.object({
        tableId: z.string().cuid(),
        name: z.string().trim().min(1).default("Grid view"),
        search: z.string().optional(),
        filters: z.array(FilterZ).optional(),
        sorts: z.array(SortZ).optional(),
        hidden: z.array(z.string().cuid()).optional(),
        // allow setting on create; DB has default("and") anyway
        filtersLogic: FiltersLogicZ.optional(),
      }),
    )
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
          filtersLogic: (input.filtersLogic as $Enums.FiltersLogic | undefined), 
        },
        select: {
          id: true,
          tableId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          search: true,
          filters: true,
          sorts: true,
          hidden: true,
          filtersLogic: true, 
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
      return ctx.db.tableView.update({
        where: { id: input.viewId },
        data: { name: input.name },
        select: {
          id: true,
          name: true,
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ viewId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.tableView.findFirstOrThrow({
        where: { id: input.viewId, table: { base: { createdById: ctx.session.user.id } } },
        select: {
          id: true,
          tableId: true,
          name: true,
          search: true,
          filters: true,
          sorts: true,
          hidden: true,
          filtersLogic: true, 
        },
      });
    }),

  updateConfig: protectedProcedure
    .input(
      z.object({
        viewId: z.string().cuid(),
        // OPTIONAL: only update keys that are present
        search: z.string().nullable().optional(),
        filters: z.array(FilterZ).optional(),
        sorts: z.array(SortZ).optional(),
        hidden: z.array(z.string().cuid()).optional(),
        filtersLogic: FiltersLogicZ.optional(), 
      }),
    )
    .mutation(async ({ input, ctx }) => {
      console.log('[view.updateConfig] input keys:', Object.keys(input));
      console.log('[view.updateConfig] input.sorts:', JSON.stringify(input.sorts));
      console.log('[view.updateConfig] input.filters:', JSON.stringify(input.filters));
      console.log('[view.updateConfig] input.hidden:', JSON.stringify(input.hidden));
      console.log('[view.updateConfig] input.filtersLogic:', input.filtersLogic);
      await ctx.db.tableView.findFirstOrThrow({
        where: { id: input.viewId, table: { base: { createdById: ctx.session.user.id } } },
        select: { id: true },
      });

      const data: Prisma.TableViewUpdateInput = {};

      if ("sorts" in input && input.sorts !== undefined) data.sorts = input.sorts;
      if ("hidden" in input && input.hidden !== undefined) data.hidden = input.hidden;
      if ("filters" in input && input.filters !== undefined) data.filters = input.filters;
      if ("filtersLogic" in input && input.filtersLogic !== undefined) data.filtersLogic = input.filtersLogic;
      if ("search" in input) data.search = input.search ?? null;

      console.log('[view.updateConfig] writing data:', JSON.stringify(data));

      // RETURN the fields your client relies on (includes filtersLogic)
      const updated =  ctx.db.tableView.update({
        where: { id: input.viewId },
        data,
        select: {
          id: true,
          tableId: true,
          search: true,
          filters: true,
          sorts: true,
          hidden: true,
          filtersLogic: true, 
        },
      });

      console.log('[view.updateConfig] updated result.sorts:', JSON.stringify((await updated).sorts));

      return updated;
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
