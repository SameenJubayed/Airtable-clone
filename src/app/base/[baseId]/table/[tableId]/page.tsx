import BaseGrid from "../../../../baseComponents/grid"; 
import TableTabs from "./tabs";

export default async function TablePage({
  params,
}: { params: Promise<{ baseId: string; tableId: string }> }) {
  const { baseId, tableId } = await params;
  return (
    <>
      <TableTabs baseId={baseId} activeTableId={tableId} />
      <BaseGrid tableId={tableId} />
    </>
  );
}
