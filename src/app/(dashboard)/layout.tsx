import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { prisma } from "@/lib/prisma";
import { TaskAlertsProvider } from "@/contexts/TaskAlertsContext";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const currencySetting = await prisma.currencySetting.findFirst();

  return (
    <TaskAlertsProvider>
      <div className="min-h-screen bg-slate-100 flex overflow-x-hidden">
        {/* Fixed Sidebar */}
        <Sidebar />

        {/* Main Content Area (shifted by 64 = 256px, strictly constrained to viewport) */}
        <div className="flex-1 ml-64 flex flex-col min-h-screen min-w-0 max-w-[calc(100vw-16rem)] overflow-x-hidden">
          <Header
            currencyRates={
              currencySetting
                ? {
                    baseCurrency: currencySetting.baseCurrency,
                    rateUsd: currencySetting.rateUsd,
                    rateRub: currencySetting.rateRub,
                  }
                : null
            }
          />
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden min-w-0 max-w-full">
            {children}
          </main>
        </div>
      </div>
    </TaskAlertsProvider>
  );
}
