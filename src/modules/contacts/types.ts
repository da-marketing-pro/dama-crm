import { Currency, FieldType, Role, StageType } from "@prisma/client";

export interface CustomFieldDef {
  id: string;
  name: string;
  fieldType: FieldType;
  options: any; // string[] or stringified JSON
  isRequired: boolean;
  createdAt: Date | string;
}

export interface ContactPaymentItem {
  id: string;
  amount: number;
  currency: Currency;
  amountInBaseCurrency: number;
  paymentDate: Date | string;
  comment?: string | null;
  deal?: {
    id: string;
    title: string;
  } | null;
}

export interface ContactDealItem {
  id: string;
  title: string;
  totalBudget: number;
  currency: Currency;
  createdAt: Date | string;
  pipeline: {
    id: string;
    name: string;
  };
  stage: {
    id: string;
    name: string;
    color: string;
    type: StageType;
  };
  assignedTo?: {
    id: string;
    name: string;
  } | null;
  payments?: {
    id: string;
    amount: number;
    currency: Currency;
    amountInBaseCurrency: number;
  }[];
}

export interface ContactNoteItem {
  id: string;
  content: string;
  createdAt: Date | string;
  author: {
    id: string;
    name: string;
    role: Role;
  };
}

export interface ContactTaskItem {
  id: string;
  title: string;
  dueDate: Date | string;
  isCompleted: boolean;
  resultComment?: string | null;
  assignedTo: {
    id: string;
    name: string;
  };
}

export interface ContactDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  assignedToId: string | null;
  customFields: Record<string, any> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  assignedTo?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  deals: ContactDealItem[];
  payments: ContactPaymentItem[];
  notes: ContactNoteItem[];
  tasks: ContactTaskItem[];
  totalPaidBaseCurrency: number;
}
