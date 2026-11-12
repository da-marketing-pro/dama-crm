import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getOrCreateDefaultInstance,
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

export default async function WhatsappSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "ADMIN";
  const instance = await getOrCreateDefaultInstance();

  const filteringData: WhatsappFilteringData = isAdmin
    ? await getWhatsappFilteringData(instance.id)
    : {
        leadFilterMode: normalizeLeadFilterMode(instance.leadFilterMode),
        ignoredLabelNames: [...DEFAULT_IGNORED_LABEL_NAMES],
        leadKeywords: [],
        cachedLabels: [],
        ignoredNumbers: [],
      };

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
    createdAt: instance.createdAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
  };

  return (
    <WhatsappSettingsView
      initialInstance={formattedInstance}
      initialFilteringData={filteringData}
      isAdmin={isAdmin}
    />
  );
}
