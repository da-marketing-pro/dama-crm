import { StageType } from "@prisma/client";
import { GitBranch, ShieldAlert } from "lucide-react";

interface StageData {
  id: string;
  name: string;
  color: string;
  order: number;
  type: StageType;
}

interface PipelineData {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
  stages: StageData[];
}

export function PipelinePreview({ pipelines, isAdmin }: { pipelines: PipelineData[]; isAdmin: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">
              Воронки продаж и этапы
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {pipelines.length} воронки
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Конфигурация этапов в стиле AmoCRM: Неразобранное, квалификация, согласование, успешно (WON) и закрыто (LOST).
          </p>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
          <span>Настройка и добавление воронок и этапов доступны только Администратору системы.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {pipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-slate-900 text-sm">{pipeline.name}</span>
                {pipeline.isDefault && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                    Основная
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">{pipeline.stages.length} этапов</span>
            </div>

            <div className="space-y-1.5">
              {pipeline.stages.map((stage) => {
                let badgeClass = "bg-slate-100 text-slate-700";
                let typeLabel = "В работе";
                if (stage.type === "WON") {
                  badgeClass = "bg-emerald-100 text-emerald-800 font-bold";
                  typeLabel = "Успешно (WON)";
                } else if (stage.type === "LOST") {
                  badgeClass = "bg-rose-100 text-rose-800 font-bold";
                  typeLabel = "Закрыто (LOST)";
                }

                return (
                  <div
                    key={stage.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="font-medium text-slate-800">{stage.name}</span>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] ${badgeClass}`}>
                      {typeLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
