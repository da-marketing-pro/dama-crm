import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { prisma } from "@/lib/prisma";

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
    <div className="min-h-screen bg-slate-100 flex">
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main Content Area (shifted by 64 = 256px) */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
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
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
