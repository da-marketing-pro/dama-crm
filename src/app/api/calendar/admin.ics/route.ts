import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTasksIcsFeed } from "@/lib/calendarService";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const isPublic = host && !host.includes("0.0.0.0") && !host.includes("localhost") && !host.includes("127.0.0.1");
    const origin = isPublic ? `https://${host}` : "https://crm.da-marketing.pro";

    // Ищем задачи, назначенные администратору (Admin) или всем активным пользователям
    const tasks = await prisma.task.findMany({
      where: {
        isCompleted: false,
        OR: [
          { assignedTo: { role: Role.ADMIN } },
          { assignedTo: { name: { contains: "Admin", mode: "insensitive" } } },
          { assignedTo: { name: { contains: "Админ", mode: "insensitive" } } },
        ],
      },
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            contact: { select: { phone: true } },
          },
        },
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
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 200,
    });

    const icsContent = generateTasksIcsFeed(
      tasks,
      "Задачи DAMA CRM (Admin)",
      origin
    );

    return new Response(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="dama-crm-tasks-admin.ics"',
        "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка генерации календаря";
    console.error("[Calendar ICS Error]:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
