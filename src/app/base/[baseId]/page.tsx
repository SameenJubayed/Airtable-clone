// app/base/[baseId]/page.tsx
import { redirect } from "next/navigation";
import { api } from "~/trpc/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BasePage({ params }: { params: { baseId: string } }) {
  const { baseId } = params;
  const tables = await api.table.listByBase({ baseId });
  if (tables.length === 0) {
    // fallback in case of error
    redirect(`/`);
  }
  redirect(`/base/${baseId}/table/${tables[0]!.id}`);
}