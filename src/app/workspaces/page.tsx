import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { HydrateClient } from "~/trpc/server";
import { DashboardShell } from "../_components/DashboardShell";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <HydrateClient>
      <DashboardShell>
        <h1 className="mb-4 text-2xl font-semibold">Workshops</h1>
      </DashboardShell>
    </HydrateClient>
  );
}
