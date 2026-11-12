import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrCreateDefaultInstance } from "@/modules/whatsapp/actions";
import { WhatsappSettingsView } from "@/modules/whatsapp/components/WhatsappSettingsView";
import { WhatsappInstanceData } from "@/modules/whatsapp/types";

export default async function WhatsappSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";
  const instance = await getOrCreateDefaultInstance();

  const formattedInstance: WhatsappInstanceData = {
    id: instance.id,
    name: instance.name,
    phoneNumber: instance.phoneNumber,
    status: instance.status,
    apiUrl: instance.apiUrl,
    apiKey: isAdmin ? instance.apiKey : null,
    isDefault: instance.isDefault,
    createdAt: instance.createdAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
  };

  return <WhatsappSettingsView initialInstance={formattedInstance} isAdmin={isAdmin} />;
}
