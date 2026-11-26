import { redirect } from "next/navigation";

// Plan opens on budgets. Free-to-spend and its working live on the overview; the six-month view lives under Trends.
export default function PlanPage() {
  redirect("/app/plan/budgets");
}
