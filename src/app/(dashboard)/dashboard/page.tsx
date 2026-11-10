import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDashboardData } from "@/modules/dashboard/actions";
import { DashboardView } from "@/modules/dashboard/components/DashboardView";

export default async function DashboardAliasPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const data = await getDashboardData({ period: "30d" });

  return (
    <DashboardView
      initialKpis={data.kpis}
      initialWidgets={data.widgets}
      pipelines={data.pipelines}
      initialPeriod={data.period}
      initialPipelineId={data.pipelineId}
      baseCurrency={data.baseCurrency}
      startDate={data.startDate}
      endDate={data.endDate}
    />
  );
}
