import { auth } from "~/server/auth";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Shared</h1>
    </>
  );
}
