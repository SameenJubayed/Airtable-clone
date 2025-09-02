// src/server/api/routers/base.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

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

  create: protectedProcedure.mutation(async ({ ctx }) => {
      return ctx.db.base.create({
        data: {
          name: "Untitled Base",
          createdById: ctx.session.user.id,
          lastOpenedAt: new Date(),
        },
        select: { id: true, name: true },
      });
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
