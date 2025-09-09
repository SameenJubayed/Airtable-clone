import BaseGrid from "~/app/baseComponents/grid"; 

export default async function TablePage({
  params,
}: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return (
    <>
      <BaseGrid tableId={tableId} />
    </>
  );
}
