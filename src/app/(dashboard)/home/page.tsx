import { auth } from "~/server/auth";
import { CreateBaseCard } from "../../_components/CreateBaseCard";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Home</h1>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <CreateBaseCard />
      </section>
      <h1 className="mb-4 text-lg font-semibold">Recently Opened</h1>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {/* Base cards */}
      </section>
    </>
  );
}
