import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { currentUserId } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentUserId())) redirect("/signin");

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-28 pt-[max(16px,env(safe-area-inset-top))]">
      {children}
      <BottomNav />
    </div>
  );
}
