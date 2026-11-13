import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TasksView } from "@/modules/tasks/components/TasksView";
import { Role } from "@prisma/client";

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;
  const isAdmin = user.role === Role.ADMIN;

  // RBAC filter: MANAGER sees only their own assigned tasks
  const taskFilter = isAdmin ? {} : { assignedToId: user.id };

  const [rawTasks, users, rawDeals, rawContacts] = await Promise.all([
    prisma.task.findMany({
      where: taskFilter,
      include: {
        deal: {
          select: {
            id: true,
            title: true,
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
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.deal.findMany({
      where: isAdmin ? {} : { assignedToId: user.id },
      select: { id: true, title: true, contactId: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.findMany({
      where: isAdmin ? {} : { assignedToId: user.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <TasksView
      tasks={rawTasks as any}
      isAdmin={isAdmin}
      currentUserId={user.id}
      users={users}
      deals={rawDeals}
      contacts={rawContacts}
    />
  );
}
