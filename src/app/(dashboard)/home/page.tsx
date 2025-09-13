// app/(dashboard)/home/page.tsx
import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { api } from "~/trpc/server";
import { CreateBaseCard } from "../../_components/CreateBaseCard";
import UserBases from "./Bases"; 

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // prefetch bases so the client hook is instant
  void api.base.listMine.prefetch();

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Home</h1>
      <section className="gap-4 mb-8">
        <CreateBaseCard />
      </section>
      <UserBases />
    </>
  );
}
