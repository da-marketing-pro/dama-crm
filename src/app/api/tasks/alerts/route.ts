import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getLocalTodayInfo, sendDailyTasksDigest } from "@/lib/telegramService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Фоновая проверка утренней Telegram-сводки (в 09:45 Пн–Сб)
    try {
      const { localDate, dayOfWeek } = getLocalTodayInfo();
      if (dayOfWeek !== 0) {
        const hours = localDate.getHours();
        const minutes = localDate.getMinutes();
        if ((hours === 9 && minutes >= 45) || hours > 9) {
          sendDailyTasksDigest().catch(() => {});
        }
      }
    } catch {}

    const user = session.user;
    const isAdmin = user.role === Role.ADMIN;

    const now = new Date();
    // Смотрим задачи с дедлайном от 14 дней назад (просроченные) до +24 часов вперед
    const pastThreshold = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const futureThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const taskFilter = isAdmin
      ? {
          isCompleted: false,
          dueDate: { gte: pastThreshold, lte: futureThreshold },
        }
      : {
          isCompleted: false,
          assignedToId: user.id,
          dueDate: { gte: pastThreshold, lte: futureThreshold },
        };

    const tasks = await prisma.task.findMany({
      where: taskFilter,
      select: {
        id: true,
        title: true,
        taskType: true,
        dueDate: true,
        isCompleted: true,
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, name: true, company: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const mapped = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      taskType: t.taskType,
      dueDate: t.dueDate.toISOString(),
      dealTitle: t.deal?.title || null,
      contactName: t.contact?.name || null,
      assignedName: t.assignedTo?.name || null,
    }));

    return NextResponse.json({ success: true, tasks: mapped });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка получения задач для уведомлений";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
