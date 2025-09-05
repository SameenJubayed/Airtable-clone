// app/base/[baseId]/page.tsx
import { redirect } from "next/navigation";
import { api } from "~/trpc/server";

export default async function BasePage({
  params,
}: { params: Promise<{ baseId: string }>;}) {
  const { baseId } = await params; 
  // Get tables for this base
  const tables = await api.table.listByBase({ baseId });
  if (!tables.length) {
    // If no tables yet, create one and go there
    const { id } = await api.table.createWithDefaults({
      baseId,
      name: "Table 1",
      defaultCols: 6,
      defaultRows: 3,
    });
    redirect(`/base/${baseId}/table/${id}`);
  }
  redirect(`/base/${baseId}/table/${tables[0]!.id}`);
}
