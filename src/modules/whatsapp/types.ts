import { WhatsappMessageType, WhatsappStatus, StageType } from "@prisma/client";
import type { LeadFilterMode } from "@/lib/whatsappFilterUtils";

export interface WhatsappLabelItem {
  id: string;
  name: string;
  color?: string;
}

export interface WhatsappPipelineOption {
  id: string;
  name: string;
  stages: {
    id: string;
    name: string;
    color: string;
    type: string;
  }[];
}

export interface WhatsappInstanceData {
  id: string;
  name: string;
  phoneNumber?: string | null;
  status: WhatsappStatus;
  apiUrl?: string | null;
  apiKey?: string | null;
  isDefault: boolean;
  leadFilterMode: LeadFilterMode;
  ignoredLabelNames: string[];
  leadKeywords: string[];
  cachedLabels: WhatsappLabelItem[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface WhatsappIgnoredNumberItem {
  id: string;
  phoneKey: string;
  rawPhone: string;
  displayName?: string | null;
  reason?: string | null;
  source: string;
  labelId?: string | null;
  labelName?: string | null;
  createdAt: string;
}

export interface EvolutionSyncedChatItem {
  jid: string;
  phone: string;
  phoneKey: string;
  displayName: string;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  archived: boolean;
  labels: string[];
  isAlreadyIgnored: boolean;
  existingContactName?: string | null;
}

export interface WhatsappFilteringData {
  leadFilterMode: LeadFilterMode;
  ignoredLabelNames: string[];
  leadKeywords: string[];
  cachedLabels: WhatsappLabelItem[];
  ignoredNumbers: WhatsappIgnoredNumberItem[];
}

export interface WhatsappMessageItem {
  id: string;
  instanceId: string;
  contactId?: string | null;
  dealId?: string | null;
  remoteJid: string;
  fromMe: boolean;
  senderName?: string | null;
  messageType: WhatsappMessageType;
  textContent?: string | null;
  mediaUrl?: string | null;
  fileName?: string | null;
  timestamp: Date | string;
  createdAt: Date | string;
}

export interface ChatConversation {
  remoteJid: string;
  contactId?: string | null;
  contactName: string;
  contactPhone: string;
  company?: string | null;
  lastMessage: {
    textContent?: string | null;
    messageType: WhatsappMessageType;
    fromMe: boolean;
    timestamp: Date | string;
  };
  unreadCount: number;
  deal?: {
    id: string;
    title: string;
    pipelineId: string;
    stageId: string;
    stageName: string;
    stageColor: string;
    stageType: StageType;
    totalBudget: number;
    currency: string;
  } | null;
}
