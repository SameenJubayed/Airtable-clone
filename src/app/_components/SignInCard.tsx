"use client";

import { signIn } from "next-auth/react";
import Image from "next/image";

export function SignInCard() {
  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
        {/* tiny “database” icon */}
        <Image src="/airtable.svg" alt="Logo" width={100} height={100} />
      </div>

      <h1 className="text-center text-2xl font-semibold text-gray-900">
        Airtable Clone
      </h1>
      <p className="mt-2 text-center text-sm text-gray-500">
        Create powerful business apps with ease
      </p>

      <button
        onClick={() => signIn("google", { callbackUrl: "/home", redirect: true })}
        className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
      >
        <Image src="/google.svg" alt="Logo" width={22} height={22} className="mr-3"/>
        Continue with Google
      </button>
    </div>
  );
}
