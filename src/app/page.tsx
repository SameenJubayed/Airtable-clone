import { SignInCard } from "./_components/SignInCard";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { CreateBaseCard } from "./_components/CreateBaseCard";
import { Header } from "./_components/Header";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <SignInCard />
      </main>
    );
  }

  return (
    <HydrateClient>
      <main className="min-h-screen bg-[#f6f7f9] text-gray-900">
        {/* Top nav */}
        <Header />

        {/* Content */}
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="mb-4 text-2xl font-semibold">Home</h1>

          {/* “Home” area  */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CreateBaseCard />
          </section>
        </div>
      </main>
    </HydrateClient>
  );
}