import { Currency, Role, StageType } from "@prisma/client";

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  taskType: string;
  dueDate: Date | string;
  isCompleted: boolean;
  completedAt?: Date | string | null;
  resultComment?: string | null;
  assignedTo: {
    id: string;
    name: string;
  };
}

export interface PaymentItem {
  id: string;
  amount: number;
  currency: Currency;
  amountInBaseCurrency: number;
  paymentDate: Date | string;
  comment?: string | null;
}

export interface DealItem {
  id: string;
  title: string;
  totalBudget: number;
  currency: Currency;
  exchangeRateAtCreation: number;
  createdAt: Date | string;
  closedAt?: Date | string | null;
  contactId: string;
  pipelineId: string;
  stageId: string;
  assignedToId?: string | null;
  contact: {
    id: string;
    name: string;
    phone: string;
    company?: string | null;
  };
  assignedTo?: {
    id: string;
    name: string;
    role: Role;
  } | null;
  stage: {
    id: string;
    name: string;
    color: string;
    type: StageType;
    order: number;
  };
  pipeline: {
    id: string;
    name: string;
  };
  payments: PaymentItem[];
  tasks: TaskItem[];
}

export interface StageWithDeals {
  id: string;
  name: string;
  color: string;
  order: number;
  type: StageType;
  pipelineId: string;
  deals: DealItem[];
}

export interface PipelineWithStages {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
  stages: StageWithDeals[];
}
