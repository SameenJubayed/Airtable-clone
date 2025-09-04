// app/baseComponents/BaseSideBar.tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import KeyboardBackspaceIcon from '@mui/icons-material/KeyboardBackspace';
import { api } from "~/trpc/react";

export default function BaseSidebar({ baseId }: { baseId: string }) {
  const router = useRouter();
  const utils = api.useUtils();

  const touch = api.base.touchOpen.useMutation({
    onSuccess: async () => {
      // make Home’s RecentlyOpened refetch immediately
      await utils.base.listMine.invalidate();
      router.push("/home");
    },
  });

  const handleBack = () => {
    // trigger the update
    touch.mutate({ baseId });
  };

  return (
    <aside
      className="group fixed left-0 top-0 z-30 w-14 border-r border-gray-200 bg-white"
      style={{ height: "100vh" }}
    >
      {/* Top button area (logo → back on hover) */}
      <button
        title="Back to home"
        onClick={handleBack}
        className="relative flex h-14 w-full items-center justify-center"
      >
        <Image
          src="/airtable_bw.svg"
          alt="Airtable"
          width={25}
          height={25}
          className="opacity-100 transition-opacity group-hover:opacity-0"
          priority
        />

        {/* Hover: Chevron left */}
        <KeyboardBackspaceIcon
          className="absolute opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>

      {/* Rest of the rail (future nav/icons)
      <div className="px-2 pt-2" /> */}
    </aside>
  );
}
