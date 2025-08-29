import Link from "next/link";
import { SignInCard } from "./_components/SignInCard";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { CreateBaseCard } from "./_components/CreateBaseCard";
import Image from "next/image";

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
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <Image src="/airtable-vector.svg" alt="Logo" width={150} height={10}/>
          </div>

          {/* Center search (non-functional for now) */}
          <div className="mx-auto hidden w-full max-w-xl items-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-500 shadow-sm md:flex">
            <span className="select-none opacity-60">Search…</span>
            <span className="ml-auto rounded border px-1.5 py-0.5 text-xs opacity-60">ctrl K</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/api/auth/signout"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Sign out
            </Link>
          </div>
        </header>

        {/* Content */}
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="mb-4 text-2xl font-semibold">Home</h1>

          {/* “Home” area – only one card per your requirement */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CreateBaseCard />
          </section>
        </div>
      </main>
    </HydrateClient>
  );
}