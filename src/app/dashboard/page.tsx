import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Header } from "../_components/Header";
import { CreateBaseCard } from "../_components/CreateBaseCard";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <HydrateClient>
      <main className="min-h-screen bg-[#f6f7f9] text-gray-900">
        <Header />
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="mb-4 text-2xl font-semibold">Home</h1>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CreateBaseCard />
          </section>
        </div>
      </main>
    </HydrateClient>
  );
}
