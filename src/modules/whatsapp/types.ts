import { WhatsappMessageType, WhatsappStatus, StageType } from "@prisma/client";

export interface WhatsappInstanceData {
  id: string;
  name: string;
  phoneNumber?: string | null;
  status: WhatsappStatus;
  apiUrl?: string | null;
  apiKey?: string | null;
  isDefault: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
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
