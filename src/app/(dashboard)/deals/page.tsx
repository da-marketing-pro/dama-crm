import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealsView } from "@/modules/deals/components/DealsView";
import { PipelineWithStages } from "@/modules/deals/types";
import { Role } from "@prisma/client";

export default async function DealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;
  const isAdmin = user.role === Role.ADMIN;

  const dealFilter = isAdmin ? {} : { assignedToId: user.id };

  const [rawPipelines, users, currencySetting] = await Promise.all([
    prisma.pipeline.findMany({
      orderBy: { order: "asc" },
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: {
            deals: {
              where: dealFilter,
              include: {
                contact: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    company: true,
                  },
                },
                assignedTo: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                  },
                },
                stage: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                    type: true,
                    order: true,
                  },
                },
                pipeline: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                payments: {
                  select: {
                    id: true,
                    amount: true,
                    currency: true,
                    amountInBaseCurrency: true,
                    paymentDate: true,
                    comment: true,
                  },
                  orderBy: { paymentDate: "desc" },
                },
                tasks: {
                  select: {
                    id: true,
                    title: true,
                    description: true,
                    taskType: true,
                    dueDate: true,
                    isCompleted: true,
                    completedAt: true,
                    resultComment: true,
                    assignedTo: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                  orderBy: { dueDate: "asc" },
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.currencySetting.findFirst(),
  ]);

  const pipelines: PipelineWithStages[] = rawPipelines as any;

  return (
    <DealsView
      pipelines={pipelines}
      isAdmin={isAdmin}
      currentUserId={user.id}
      users={users}
      currencyRateUsd={currencySetting?.rateUsd || 495.0}
      currencyRateRub={currencySetting?.rateRub || 5.2}
    />
  );
}
