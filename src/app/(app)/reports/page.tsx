import { ReportsView, type View } from "@/components/ReportsView";

const VIEWS: View[] = ["day", "week", "month"];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { view, date } = await searchParams;
  const initialView = VIEWS.includes(view as View) ? (view as View) : "day";
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return <ReportsView initialView={initialView} initialDate={initialDate} />;
}
