import { ChartType, Currency } from "@prisma/client";

export type PeriodOption = "7d" | "30d" | "custom";

export type MetricType = "REVENUE" | "LEADS" | "DEALS_BY_STAGE" | "DEALS_BY_MANAGER";

export interface KpiMetrics {
  totalRevenue: number;
  baseCurrency: Currency;
  newLeadsCount: number;
  leadsInWorkCount: number;
  wonDealsCount: number;
  clientsInProjectsCount: number;
}

export interface PipelineFilterOption {
  id: string;
  name: string;
  isDefault: boolean;
  stages: {
    id: string;
    name: string;
    color: string;
    type: string;
  }[];
}

export interface DashboardWidgetConfig {
  pipelineId?: string | null;
  period?: PeriodOption;
  color?: string;
  description?: string;
}

export interface DashboardWidgetData {
  id: string;
  userId: string;
  title: string;
  metricType: MetricType;
  chartType: ChartType;
  config: DashboardWidgetConfig;
  order: number;
  data: any[];
  totalValue?: number;
  secondaryValue?: string;
  baseCurrency?: Currency;
}

export interface CreateWidgetInput {
  title: string;
  metricType: MetricType;
  chartType: ChartType;
  pipelineId?: string | null;
  order?: number;
}

export interface UpdateWidgetInput {
  id: string;
  title?: string;
  metricType?: MetricType;
  chartType?: ChartType;
  pipelineId?: string | null;
  order?: number;
}
