"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function getAuthUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Требуется авторизация в системе");
  }
  return session.user;
}

// 1. Создание задачи
export async function createTask(data: {
  title: string;
  description?: string;
  taskType?: string;
  dueDate: Date | string;
  dealId?: string;
  contactId?: string;
  assignedToId?: string;
}) {
  try {
    const user = await getAuthUser();

    if (!data.title?.trim() || !data.dueDate) {
      return { success: false, error: "Укажите название задачи и срок выполнения" };
    }

    // Если сделка указана, а контакт нет — подтягиваем контакт из сделки
    let contactId = data.contactId;
    if (data.dealId && !contactId) {
      const deal = await prisma.deal.findUnique({
        where: { id: data.dealId },
        select: { contactId: true },
      });
      if (deal) contactId = deal.contactId;
    }

    const task = await prisma.task.create({
      data: {
        title: data.title.trim(),
        description: data.description?.trim() || null,
        taskType: data.taskType || "CALL",
        dueDate: new Date(data.dueDate),
        dealId: data.dealId || null,
        contactId: contactId || null,
        assignedToId: data.assignedToId || user.id,
        createdById: user.id,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");
    return { success: true, taskId: task.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка создания задачи";
    return { success: false, error: message };
  }
}

// 2. Завершение задачи с комментарием результата
export async function completeTask(taskId: string, resultComment?: string) {
  try {
    const user = await getAuthUser();

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return { success: false, error: "Задача не найдена" };
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        resultComment: resultComment?.trim() || null,
      },
    });

    // Если к задаче привязан контакт — добавляем запись в ленту
    if (task.contactId) {
      await prisma.contactNote.create({
        data: {
          contactId: task.contactId,
          authorId: user.id,
          content: `Завершена задача «${task.title}»${resultComment ? ` с результатом: ${resultComment}` : ""}`,
        },
      });
    }

    revalidatePath("/tasks");
    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка завершения задачи";
    return { success: false, error: message };
  }
}

// 3. Удаление задачи
export async function deleteTask(taskId: string) {
  try {
    await getAuthUser();

    await prisma.task.delete({
      where: { id: taskId },
    });

    revalidatePath("/tasks");
    revalidatePath("/deals");
    revalidatePath("/contacts");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Ошибка удаления задачи";
    return { success: false, error: message };
  }
}
