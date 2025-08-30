import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";

export const baseRouter = createTRPCRouter({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return db.base.findMany({
      where: { createdById: ctx.userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, updatedAt: true },
    });
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).default("Untitled Base") }))
    .mutation(async ({ input, ctx }) => {
      return db.base.create({
        data: {
          name: input.name || "Untitled Base",
          createdById: ctx.userId,
        },
        select: { id: true, name: true },
      });
    }),
});
