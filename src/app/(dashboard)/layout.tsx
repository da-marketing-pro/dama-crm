import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { prisma } from "@/lib/prisma";
import { TaskAlertsProvider } from "@/contexts/TaskAlertsContext";
import { MobileNavProvider } from "@/contexts/MobileNavContext";

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
      <MobileNavProvider>
        <div className="min-h-screen bg-slate-100 flex overflow-x-hidden">
          {/* Responsive Sidebar (fixed on desktop, overlay drawer on mobile) */}
          <Sidebar />

          {/* Main Content Area (ml-0 on mobile, ml-64 on desktop) */}
          <div className="flex-1 ml-0 md:ml-64 flex flex-col min-h-screen min-w-0 max-w-full md:max-w-[calc(100vw-16rem)] overflow-x-hidden pb-16 md:pb-0">
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
            <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto overflow-x-hidden min-w-0 max-w-full">
              {children}
            </main>
          </div>

          {/* Native-like Mobile Bottom Navigation Bar */}
          <MobileBottomNav />
        </div>
      </MobileNavProvider>
    </TaskAlertsProvider>
  );
}
