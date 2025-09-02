// app/base/[baseId]/page.tsx
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function BasePage({
  params,
}: {
  params: Promise<{ baseId: string }>;
}) {
  const { baseId } = await params; 
  const session = await auth();
  if (!session?.user) redirect("/login");

  // bump updatedAt so it shows in “Recently opened”
  await api.base.touchOpen({ baseId });

  // minimal placeholder content area for now
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Tables</h1>
      <p className="mt-2 text-sm text-gray-600">
        (This is where the grid/tables UI will live.)
      </p>
    </div>
  );
}
