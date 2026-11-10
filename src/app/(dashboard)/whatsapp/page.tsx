import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getChatConversations, getPipelinesForChat } from "@/modules/whatsapp/actions";
import { WhatsappChatView } from "@/modules/whatsapp/components/WhatsappChatView";

export default async function WhatsappPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";

  const [conversations, pipelines] = await Promise.all([
    getChatConversations(),
    getPipelinesForChat(),
  ]);

  return (
    <WhatsappChatView
      initialConversations={conversations}
      pipelines={pipelines}
      isAdmin={isAdmin}
    />
  );
}
