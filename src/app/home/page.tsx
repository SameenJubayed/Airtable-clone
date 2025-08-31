import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { DashboardShell } from "../_components/DashboardShell";
import { CreateBaseCard } from "../_components/CreateBaseCard";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <HydrateClient>
      <DashboardShell>
        <h1 className="mb-4 text-2xl font-semibold">Home</h1>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CreateBaseCard />
        </section>
      </DashboardShell>
    </HydrateClient>
  );
}
