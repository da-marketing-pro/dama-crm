import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealsView } from "@/modules/deals/components/DealsView";
import { PipelineWithStages } from "@/modules/deals/types";
import { buildDealSourceOptions, resolveDealSource } from "@/lib/dealSource";
import { Role } from "@prisma/client";

function parseFieldOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || "").trim()).filter(Boolean);
      }
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export default async function DealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;
  const isAdmin = user.role === Role.ADMIN;

  const dealFilter = isAdmin ? {} : { assignedToId: user.id };

  const [rawPipelines, users, currencySetting, sourceFieldDefs] = await Promise.all([
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
                    customFields: true,
                    notes: {
                      select: { content: true },
                      orderBy: { createdAt: "desc" },
                      take: 5,
                    },
                  },
                },
                whatsappMessages: {
                  select: { textContent: true },
                  orderBy: { timestamp: "desc" },
                  take: 3,
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
    prisma.customFieldDefinition.findMany({
      where: {
        name: {
          contains: "источник",
          mode: "insensitive",
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const dbSourceOptions = sourceFieldDefs.flatMap((def) =>
    parseFieldOptions(def.options)
  );
  const sourceOptions = buildDealSourceOptions(dbSourceOptions);

  const pipelines: PipelineWithStages[] = rawPipelines.map((pipeline) => ({
    ...pipeline,
    stages: pipeline.stages.map((stage) => ({
      ...stage,
      deals: stage.deals.map((deal) => ({
        ...deal,
        source: resolveDealSource(deal),
        customFields:
          (deal.customFields as Record<string, unknown> | null) || {},
        contact: {
          id: deal.contact.id,
          name: deal.contact.name,
          phone: deal.contact.phone,
          company: deal.contact.company,
        },
      })),
    })),
  }));

  return (
    <DealsView
      pipelines={pipelines}
      isAdmin={isAdmin}
      currentUserId={user.id}
      users={users}
      sourceOptions={sourceOptions}
      currencyRateUsd={currencySetting?.rateUsd || 495.0}
      currencyRateRub={currencySetting?.rateRub || 5.2}
    />
  );
}
