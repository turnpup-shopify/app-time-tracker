import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { currentUserId } from "@/lib/session";

export default async function SignInPage() {
  if (await currentUserId()) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <div>
        <h1 className="text-[28px] font-semibold">Time Tracker</h1>
        <p className="mt-2 text-ink-2">Two taps to log a block. Every day on record.</p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="glass min-h-12 w-full px-5 font-medium text-ink press"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
