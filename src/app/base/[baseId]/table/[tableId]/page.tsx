// app/base/[baseId]/table/[tableId]/page.tsx
import BaseGrid from "~/app/baseComponents/grid";

export default async function TablePage({
  params, searchParams,
}: {
  params: Promise<{ tableId: string }>,
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const { tableId } = await params;
  const sp = (await searchParams) ?? {};
  const viewId = sp.viewId ?? null;

  return <BaseGrid tableId={tableId} viewId={viewId} />;
}
