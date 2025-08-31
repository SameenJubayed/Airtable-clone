import { SignInCard } from "../_components/SignInCard";
import { auth } from "~/server/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/home");
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignInCard />
    </main>
  );
}
