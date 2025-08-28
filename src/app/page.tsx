import Link from "next/link";

import { LatestPost } from "~/app/_components/post";
import { SignInCard } from "./_components/SignInCard";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    void api.post.getLatest.prefetch();
  }

  return (
    <HydrateClient>
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        {!session?.user ? (
          <SignInCard />
        ) : (
          <div className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              Welcome, {session.user.name ?? "there"} 👋
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              You’re logged in. Jump into your bases.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href="/app" 
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open App
              </Link>
              <Link
                href="/api/auth/signout"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </Link>
            </div>
          </div>
        )}
      </main>
    </HydrateClient>
  );
}