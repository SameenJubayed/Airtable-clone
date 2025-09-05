// app/base/[baseId]/page.tsx
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import BaseGrid from "../../baseComponents/grid/index";

export default async function BasePage({
  params,
}: {
  params: Promise<{ baseId: string }>;
}) {
  const { baseId } = await params; 
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Get tables for this base, create one if none
  const tables = await api.table.listByBase({ baseId });
  const tableId =
    tables[0]?.id ??
    (await api.table.createWithDefaults({
      baseId,
      name: "Table 1",
      defaultCols: 6,
      defaultRows: 3,
    })).id;

  // minimal placeholder content area for now
  return (
    <div>
      <BaseGrid tableId={tableId} />
    </div>
  );
}
