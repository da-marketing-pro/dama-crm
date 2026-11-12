import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getOrCreateDefaultInstance,
  getPipelinesForChat,
  getWhatsappFilteringData,
} from "@/modules/whatsapp/actions";
import { WhatsappSettingsView } from "@/modules/whatsapp/components/WhatsappSettingsView";
import { WhatsappFilteringData, WhatsappInstanceData } from "@/modules/whatsapp/types";
import {
  DEFAULT_IGNORED_LABEL_NAMES,
  normalizeJsonStringArray,
  normalizeLeadFilterMode,
  resolveEffectiveIgnoredLabels,
} from "@/lib/whatsappFilterUtils";
import { CalloLastWebhookDebug, generateCalloWebhookToken } from "@/lib/calloWebhook";
import { normalizeQuickTemplates } from "@/lib/whatsappTemplates";

export default async function WhatsappSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";
  const instance = await getOrCreateDefaultInstance();

  const [filteringData, pipelines] = isAdmin
    ? await Promise.all([
        getWhatsappFilteringData(instance.id),
        getPipelinesForChat(),
      ])
    : [
        {
          leadFilterMode: normalizeLeadFilterMode(instance.leadFilterMode),
          ignoredLabelNames: [...DEFAULT_IGNORED_LABEL_NAMES],
          leadKeywords: [],
          cachedLabels: [],
          ignoredNumbers: [],
        } satisfies WhatsappFilteringData,
        [],
      ];

  const calloWebhookToken = isAdmin ? generateCalloWebhookToken(instance.id) : "";

  const formattedInstance: WhatsappInstanceData = {
    id: instance.id,
    name: instance.name,
    phoneNumber: instance.phoneNumber,
    status: instance.status,
    apiUrl: instance.apiUrl,
    apiKey: isAdmin ? instance.apiKey : null,
    isDefault: instance.isDefault,
    leadFilterMode: normalizeLeadFilterMode(instance.leadFilterMode),
    ignoredLabelNames: resolveEffectiveIgnoredLabels(instance.ignoredLabelNames),
    leadKeywords: normalizeJsonStringArray(instance.leadKeywords),
    cachedLabels: filteringData.cachedLabels,
    quickTemplates: normalizeQuickTemplates(instance.quickTemplates),
    lastCalloWebhook:
      (instance.lastCalloWebhook as CalloLastWebhookDebug | null | undefined) || null,
    createdAt: instance.createdAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
  };

  return (
    <WhatsappSettingsView
      initialInstance={formattedInstance}
      initialFilteringData={filteringData}
      pipelines={pipelines}
      calloWebhookToken={calloWebhookToken}
      isAdmin={isAdmin}
    />
  );
}
