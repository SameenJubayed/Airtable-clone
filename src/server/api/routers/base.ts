import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const baseRouter = createTRPCRouter({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.base.findMany({
      where: { createdById: ctx.session.user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, updatedAt: true },
    });
  }),

  create: protectedProcedure.mutation(async ({ ctx }) => {
      return ctx.db.base.create({
        data: {
          name: "Untitled Base",
          createdById: ctx.session.user.id,
        },
        select: { id: true, name: true },
      });
    }),

  rename: protectedProcedure
    .input(z.object({ baseId: z.string().cuid(), name: z.string().trim().min(1) }))
    .mutation(async ({ input, ctx }) => {
      // auth: ensure the user owns the base
      await ctx.db.base.findFirstOrThrow({
        where: { id: input.baseId, createdById: ctx.session.user.id },
        select: { id: true },
      });
      return ctx.db.base.update({
        where: { id: input.baseId },
        data: { name: input.name },
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

});
