import { signOut } from "@/auth";
import { BucketsEditor } from "@/components/BucketsEditor";
import { ExportPanel } from "@/components/ExportPanel";

export default function SettingsPage() {
  return (
    <section className="mx-auto max-w-md pt-6">
      <h1 className="text-[28px] font-semibold">Settings</h1>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-ink-2">Buckets</h2>
      <BucketsEditor />

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-ink-2">
        Google Calendar
      </h2>
      <p className="glass mt-3 p-5 text-ink-2">Work and Personal calendar sync ships in phase 5.</p>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-ink-2">Export</h2>
      <ExportPanel />

      <form
        className="mt-10"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button type="submit" className="glass min-h-12 w-full px-5 text-ink">
          Sign out
        </button>
      </form>
    </section>
  );
}
