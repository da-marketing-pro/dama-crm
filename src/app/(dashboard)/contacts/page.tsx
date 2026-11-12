import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ContactsView } from "@/modules/contacts/components/ContactsView";
import { ContactDetail, CustomFieldDef } from "@/modules/contacts/types";
import { Role } from "@prisma/client";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: { contactId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;
  const isAdmin = user.role === Role.ADMIN;

  // RBAC filter: MANAGER sees only their own assigned contacts
  const contactFilter = isAdmin ? {} : { assignedToId: user.id };

  const [rawContacts, users, fieldDefs, pipelines] = await Promise.all([
    prisma.contact.findMany({
      where: contactFilter,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        deals: {
          include: {
            pipeline: {
              select: {
                id: true,
                name: true,
              },
            },
            stage: {
              select: {
                id: true,
                name: true,
                color: true,
                type: true,
              },
            },
            assignedTo: {
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
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        payments: {
          include: {
            deal: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: { paymentDate: "desc" },
        },
        notes: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        tasks: {
          include: {
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
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.customFieldDefinition.findMany({
      where: { entityType: "CONTACT" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pipeline.findMany({
      orderBy: { order: "asc" },
      include: {
        stages: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            color: true,
            type: true,
          },
        },
      },
    }),
  ]);

  // Transform contacts to include totalPaidBaseCurrency
  const contacts: ContactDetail[] = rawContacts.map((c) => {
    // Total sum of all payments across all deals for this contact in base currency (₸)
    const totalPaid = c.payments.reduce(
      (acc, p) => acc + (p.amountInBaseCurrency || 0),
      0
    );

    return {
      ...c,
      customFields: (c.customFields as Record<string, any>) || {},
      totalPaidBaseCurrency: totalPaid,
    };
  });

  const parsedFieldDefs: CustomFieldDef[] = fieldDefs.map((fd) => ({
    id: fd.id,
    name: fd.name,
    fieldType: fd.fieldType,
    options: fd.options,
    isRequired: fd.isRequired,
    createdAt: fd.createdAt,
  }));

  return (
    <ContactsView
      contacts={contacts}
      isAdmin={isAdmin}
      currentUserId={user?.id || ""}
      users={users}
      customFieldDefs={parsedFieldDefs}
      pipelines={pipelines}
      initialSelectedContactId={searchParams?.contactId}
    />
  );
}
