"use client";

import { useState, useRef, useEffect, useId } from "react";
import {
  Filter,
  Tag,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  ShieldBan,
  Sparkles,
  Webhook,
  X,
  UserPlus,
  Briefcase,
} from "lucide-react";
import {
  EvolutionSyncedChatItem,
  WhatsappFilteringData,
  WhatsappLabelItem,
  WhatsappPipelineOption,
} from "../types";
import {
  addIgnoredWhatsappNumbers,
  fetchWhatsappChatsAndLabelsFromGateway,
  getWhatsappFilteringData,
  importWhatsappLeadChatsToCrm,
  removeIgnoredWhatsappNumber,
  syncEvolutionWebhookNow,
  updateWhatsappFilterSettings,
} from "../actions";
import { DEFAULT_IGNORED_LABEL_NAMES, LeadFilterMode } from "@/lib/whatsappFilterUtils";

interface WhatsappFilterSettingsProps {
  instanceId: string;
  initialData: WhatsappFilteringData;
  webhookUrl: string;
  isGatewayConfigured: boolean;
  pipelines?: WhatsappPipelineOption[];
}

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  LABEL: { label: "По ярлыку", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  CHAT_SYNC: { label: "Из чатов WA", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  UI_BUTTON: { label: "Из диалога", cls: "bg-indigo-50 text-indigo-800 border-indigo-200" },
  MANUAL: { label: "Вручную", cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

export function WhatsappFilterSettings({
  instanceId,
  initialData,
  webhookUrl,
  isGatewayConfigured,
  pipelines = [],
}: WhatsappFilterSettingsProps) {
  const formHeadingId = useId();
  const chatModalTitleId = useId();
  const labelInputId = useId();
  const keywordsInputId = useId();
  const bulkPhonesId = useId();
  const bulkReasonId = useId();
  const chatSearchId = useId();

  const [leadFilterMode, setLeadFilterMode] = useState<LeadFilterMode>(initialData.leadFilterMode);
  const [ignoredLabelNames, setIgnoredLabelNames] = useState<string[]>(
    initialData.ignoredLabelNames
  );
  const [keywordsText, setKeywordsText] = useState<string>(initialData.leadKeywords.join(", "));
  const [availableLabels, setAvailableLabels] = useState<WhatsappLabelItem[]>(
    initialData.cachedLabels
  );
  const [customLabelInput, setCustomLabelInput] = useState("");

  const [ignoredNumbers, setIgnoredNumbers] = useState(initialData.ignoredNumbers);
  const [bulkPhonesText, setBulkPhonesText] = useState("");
  const [bulkReasonText, setBulkReasonText] = useState("Текущий клиент / рабочий чат");

  const [isSavingRules, setIsSavingRules] = useState(false);
  const [isSyncingWebhook, setIsSyncingWebhook] = useState(false);
  const [isLoadingGateway, setIsLoadingGateway] = useState(false);
  const [isAddingBulk, setIsAddingBulk] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [ignoredSearch, setIgnoredSearch] = useState("");

  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Modal state for existing WhatsApp chats sync (Вариант 2 + Импорт лидов)
  const chatDialogRef = useRef<HTMLDialogElement | null>(null);
  const [syncedChats, setSyncedChats] = useState<EvolutionSyncedChatItem[]>([]);
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [isAddingSelectedChats, setIsAddingSelectedChats] = useState(false);

  const defaultImportPipeline =
    pipelines.find((p) => p.name.trim().toLowerCase().includes("холодный автообзвон")) ||
    pipelines[0];
  const defaultImportStage =
    defaultImportPipeline?.stages.find((s) => s.name.trim().toLowerCase().includes("неразобран")) ||
    defaultImportPipeline?.stages[0];

  const [chatModalMode, setChatModalMode] = useState<"STOP_LIST" | "IMPORT_LEADS">("STOP_LIST");
  const [chatFilterTab, setChatFilterTab] = useState<string>("ALL");
  const [targetPipelineId, setTargetPipelineId] = useState<string>(
    defaultImportPipeline?.id || ""
  );
  const [targetStageId, setTargetStageId] = useState<string>(defaultImportStage?.id || "");
  const [dealCreationRule, setDealCreationRule] = useState<"LEAD_LABEL_ONLY" | "ALL_SELECTED">(
    "LEAD_LABEL_ONLY"
  );
  const [isImportingLeads, setIsImportingLeads] = useState(false);

  // Progressive fallback for closedby="any" (Safari light-dismiss)
  useEffect(() => {
    const dialog = chatDialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    const onDown = (e: PointerEvent) => {
      pressedOutside = dialog.open && isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && dialog.open && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  const mergeDisplayLabelNames = (): string[] => {
    const map = new Map<string, string>();
    for (const def of DEFAULT_IGNORED_LABEL_NAMES) {
      map.set(def.toLowerCase(), def);
    }
    for (const lbl of availableLabels) {
      if (!map.has(lbl.name.toLowerCase())) map.set(lbl.name.toLowerCase(), lbl.name);
    }
    for (const selected of ignoredLabelNames) {
      if (!map.has(selected.toLowerCase())) map.set(selected.toLowerCase(), selected);
    }
    return Array.from(map.values());
  };

  const toggleIgnoredLabel = (labelName: string) => {
    setIgnoredLabelNames((prev) => {
      const exists = prev.some((x) => x.toLowerCase() === labelName.toLowerCase());
      if (exists) {
        return prev.filter((x) => x.toLowerCase() !== labelName.toLowerCase());
      }
      return [...prev, labelName];
    });
  };

  const handleAddCustomLabel = () => {
    const trimmed = customLabelInput.trim();
    if (!trimmed) return;
    if (!ignoredLabelNames.some((x) => x.toLowerCase() === trimmed.toLowerCase())) {
      setIgnoredLabelNames((prev) => [...prev, trimmed]);
    }
    setCustomLabelInput("");
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingRules(true);
    setFeedback(null);

    const parsedKeywords = keywordsText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await updateWhatsappFilterSettings(instanceId, {
      leadFilterMode,
      ignoredLabelNames,
      leadKeywords: parsedKeywords,
    });

    setIsSavingRules(false);
    if (res.success) {
      setFeedback({ type: "ok", text: "Правила фильтрации лидов и стоп-ярлыки сохранены." });
    } else {
      setFeedback({ type: "err", text: res.error || "Не удалось сохранить правила." });
    }
  };

  const handleSyncWebhookEvents = async () => {
    setIsSyncingWebhook(true);
    setFeedback(null);
    const res = await syncEvolutionWebhookNow(instanceId, webhookUrl);
    setIsSyncingWebhook(false);

    if (res.success) {
      setFeedback({
        type: "ok",
        text: "Webhook на шлюзе Evolution API обновлен: подписка на ярлыки (LABELS_ASSOCIATION) активна.",
      });
    } else {
      setFeedback({ type: "err", text: res.error || "Ошибка синхронизации Webhook." });
    }
  };

  const handleOpenChatsModal = async () => {
    setIsLoadingGateway(true);
    setChatsError(null);
    setFeedback(null);

    const res = await fetchWhatsappChatsAndLabelsFromGateway(instanceId);
    setIsLoadingGateway(false);

    if (res.labels.length > 0) {
      setAvailableLabels(res.labels);
    }

    if (!res.success && res.error) {
      setFeedback({ type: "err", text: res.error });
      return;
    }

    setSyncedChats(res.chats);
    setChatsError(res.chatsError || null);
    setSelectedJids(new Set());
    setChatSearchQuery("");
    setChatFilterTab("ALL");
    if (!targetPipelineId && defaultImportPipeline) {
      setTargetPipelineId(defaultImportPipeline.id);
      setTargetStageId(defaultImportStage?.id || "");
    }
    chatDialogRef.current?.showModal();
  };

  const hasLeadLabel = (chat: EvolutionSyncedChatItem) =>
    chat.labels.some((label) => label.trim().toLowerCase() === "лид");

  const chatLabelsInList = Array.from(
    new Set(
      syncedChats
        .flatMap((c) => c.labels)
        .map((l) => l.trim())
        .filter((l) => Boolean(l) && l.toLowerCase() !== "лид")
    )
  );

  const selectedImportPipeline =
    pipelines.find((p) => p.id === targetPipelineId) || defaultImportPipeline;

  const handleTargetPipelineChange = (newPipelineId: string) => {
    setTargetPipelineId(newPipelineId);
    const nextPipeline = pipelines.find((p) => p.id === newPipelineId);
    const preferredStage =
      nextPipeline?.stages.find((s) => s.name.trim().toLowerCase().includes("неразобран")) ||
      nextPipeline?.stages[0];
    setTargetStageId(preferredStage?.id || "");
  };

  const handleSwitchChatModalMode = (nextMode: "STOP_LIST" | "IMPORT_LEADS") => {
    setChatModalMode(nextMode);
    setSelectedJids(new Set());
    setChatsError(null);
    if (nextMode === "IMPORT_LEADS") {
      setChatFilterTab("NOT_IGNORED");
    } else {
      setChatFilterTab("ALL");
    }
  };

  const handleToggleChatSelection = (jid: string) => {
    setSelectedJids((prev) => {
      const next = new Set(prev);
      if (next.has(jid)) next.delete(jid);
      else next.add(jid);
      return next;
    });
  };

  const filteredModalChats = syncedChats.filter((chat) => {
    if (chatFilterTab === "NOT_IGNORED" && chat.isAlreadyIgnored) return false;
    if (chatFilterTab === "LEAD_LABEL" && (!hasLeadLabel(chat) || chat.isAlreadyIgnored)) {
      return false;
    }
    if (
      chatFilterTab !== "ALL" &&
      chatFilterTab !== "NOT_IGNORED" &&
      chatFilterTab !== "LEAD_LABEL"
    ) {
      if (!chat.labels.some((l) => l.trim().toLowerCase() === chatFilterTab.toLowerCase())) {
        return false;
      }
    }

    const q = chatSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      chat.displayName.toLowerCase().includes(q) ||
      chat.phone.toLowerCase().includes(q) ||
      (chat.lastMessageText || "").toLowerCase().includes(q) ||
      (chat.existingContactName || "").toLowerCase().includes(q) ||
      chat.labels.some((l) => l.toLowerCase().includes(q))
    );
  });

  const handleSelectAllNotIgnoredInModal = () => {
    const selectable = filteredModalChats
      .filter((c) => !c.isAlreadyIgnored)
      .map((c) => c.jid);

    const allSelected = selectable.length > 0 && selectable.every((j) => selectedJids.has(j));
    if (allSelected) {
      setSelectedJids(new Set());
    } else {
      setSelectedJids(new Set(selectable));
    }
  };

  const handleSelectLeadLabelChatsInModal = () => {
    const selectable = syncedChats
      .filter((c) => !c.isAlreadyIgnored && hasLeadLabel(c))
      .map((c) => c.jid);
    if (selectable.length === 0) return;

    const allSelected = selectable.every((j) => selectedJids.has(j));
    if (allSelected) {
      setSelectedJids((prev) => {
        const next = new Set(prev);
        for (const j of selectable) next.delete(j);
        return next;
      });
    } else {
      setSelectedJids((prev) => {
        const next = new Set(prev);
        for (const j of selectable) next.add(j);
        return next;
      });
    }
  };

  const handleImportSelectedChatsToIgnore = async () => {
    const chosen = syncedChats.filter((c) => selectedJids.has(c.jid));
    if (chosen.length === 0) return;

    setIsAddingSelectedChats(true);
    const res = await addIgnoredWhatsappNumbers({
      instanceId,
      items: chosen.map((c) => ({
        phone: c.phone || c.jid,
        displayName: c.displayName,
        reason: c.existingContactName
          ? `Рабочий чат (в CRM: ${c.existingContactName})`
          : "Существующий рабочий чат из WhatsApp",
        source: "CHAT_SYNC",
      })),
    });
    setIsAddingSelectedChats(false);

    if (res.success) {
      // Refresh local list state cleanly
      const updatedKeys = new Set(chosen.map((c) => c.phoneKey));
      setSyncedChats((prev) =>
        prev.map((c) => (updatedKeys.has(c.phoneKey) ? { ...c, isAlreadyIgnored: true } : c))
      );
      setSelectedJids(new Set());
      chatDialogRef.current?.close();
      const fresh = await getWhatsappFilteringData(instanceId);
      setIgnoredNumbers(fresh.ignoredNumbers);
      setFeedback({
        type: "ok",
        text: `В стоп-лист добавлено диалогов: ${res.addedCount || chosen.length}. Новые сообщения от них не будут создавать лиды.`,
      });
    } else {
      setChatsError(res.error || "Не удалось добавить выбранные чаты");
    }
  };

  const handleImportSelectedChatsToCrm = async () => {
    const chosen = syncedChats.filter((c) => selectedJids.has(c.jid) && !c.isAlreadyIgnored);
    if (chosen.length === 0) return;

    setIsImportingLeads(true);
    setChatsError(null);

    const res = await importWhatsappLeadChatsToCrm({
      instanceId,
      chats: chosen.map((c) => ({
        jid: c.jid,
        phone: c.phone || c.jid,
        displayName: c.displayName,
        lastMessageText: c.lastMessageText,
        lastMessageAt: c.lastMessageAt,
        labels: c.labels,
      })),
      targetPipelineId: targetPipelineId || undefined,
      targetStageId: targetStageId || undefined,
      dealCreationRule,
      leadLabelName: "Лид",
    });

    setIsImportingLeads(false);

    if (res.success) {
      const chosenKeys = new Set(chosen.map((c) => c.phoneKey));
      setSyncedChats((prev) =>
        prev.map((c) =>
          chosenKeys.has(c.phoneKey) && !c.existingContactName
            ? { ...c, existingContactName: c.displayName }
            : c
        )
      );
      setSelectedJids(new Set());
      chatDialogRef.current?.close();
      setFeedback({
        type: "ok",
        text: `Импорт завершён: новых контактов ${res.createdContactsCount ?? 0} (уже были в CRM: ${res.existingContactsCount ?? 0}), создано сделок ${res.createdDealsCount ?? 0} в воронку «${res.targetPipelineName || "Холодный автообзвон"}» → «${res.targetStageName || "Неразобранные"}».`,
      });
    } else {
      setChatsError(res.error || "Не удалось импортировать выбранные чаты в CRM");
    }
  };

  const handleAddBulkPhones = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkPhonesText.trim()) return;
    setIsAddingBulk(true);
    setFeedback(null);

    const res = await addIgnoredWhatsappNumbers({
      instanceId,
      rawText: bulkPhonesText,
      reason: bulkReasonText.trim() || "Добавлено вручную",
    });

    setIsAddingBulk(false);
    if (res.success) {
      setBulkPhonesText("");
      const fresh = await getWhatsappFilteringData(instanceId);
      setIgnoredNumbers(fresh.ignoredNumbers);
      setFeedback({
        type: "ok",
        text: `Добавлено номеров в стоп-лист: ${res.addedCount || 0}.`,
      });
    } else {
      setFeedback({ type: "err", text: res.error || "Ошибка добавления номеров" });
    }
  };

  const handleRemoveIgnored = async (id: string) => {
    setRemovingId(id);
    const res = await removeIgnoredWhatsappNumber(id);
    setRemovingId(null);

    if (res.success) {
      setIgnoredNumbers((prev) => prev.filter((item) => item.id !== id));
    } else {
      setFeedback({ type: "err", text: res.error || "Не удалось удалить номер из стоп-листа" });
    }
  };

  const allLabelOptions = mergeDisplayLabelNames();
  const visibleIgnored = ignoredNumbers.filter((item) => {
    const q = ignoredSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      item.rawPhone.toLowerCase().includes(q) ||
      (item.displayName || "").toLowerCase().includes(q) ||
      (item.reason || "").toLowerCase().includes(q) ||
      (item.labelName || "").toLowerCase().includes(q)
    );
  });

  return (
    <section
      aria-labelledby={formHeadingId}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Filter className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 id={formHeadingId} className="text-sm font-bold text-slate-900">
              Фильтрация рабочих чатов и отсев нецелевых лидов
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Настройте стоп-лист текущих клиентов, синхронизацию с ярлыками WhatsApp Business и триггер по рекламе
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSyncWebhookEvents}
            disabled={!isGatewayConfigured || isSyncingWebhook}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Включить приём событий LABELS_ASSOCIATION на шлюзе Evolution без сброса QR-сессии"
          >
            <Webhook className={`w-3.5 h-3.5 ${isSyncingWebhook ? "animate-pulse" : ""}`} />
            <span>{isSyncingWebhook ? "Обновляем..." : "Обновить Webhook (Ярлыки)"}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenChatsModal}
            disabled={!isGatewayConfigured || isLoadingGateway}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isLoadingGateway ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{isLoadingGateway ? "Загрузка чатов..." : "Загрузить текущие чаты из WA"}</span>
          </button>
        </div>
      </div>

      {/* Live AJAX feedback banner */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            feedback.type === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Rules + Labels Form (Вариант 4) */}
      <form
        onSubmit={handleSaveRules}
        aria-labelledby={formHeadingId}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Left: WhatsApp Business Labels */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-bold text-slate-900">
                Ярлыки WhatsApp Business для игнорирования
              </h3>
            </div>
            <span className="text-[11px] font-medium text-slate-500">
              Выбрано: {ignoredLabelNames.length}
            </span>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Когда вы присваиваете контакту в приложении WhatsApp выбранный ярлык, его номер автоматически попадает в стоп-лист, а случайная пустая сделка (без бюджета, созданная &lt; 24ч) удаляется.
          </p>

          <fieldset className="space-y-2">
            <legend className="sr-only">Стоп-ярлыки WhatsApp Business</legend>
            <div className="flex flex-wrap gap-2">
              {allLabelOptions.map((labelName) => {
                const checked = ignoredLabelNames.some(
                  (x) => x.toLowerCase() === labelName.toLowerCase()
                );
                return (
                  <label
                    key={labelName}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors select-none ${
                      checked
                        ? "bg-amber-50 border-amber-300 text-amber-900"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIgnoredLabel(labelName)}
                      className="accent-amber-600 rounded"
                    />
                    <span>{labelName}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex items-center gap-2 pt-1">
            <label htmlFor={labelInputId} className="sr-only">
              Название дополнительного ярлыка WhatsApp
            </label>
            <input
              id={labelInputId}
              name="customLabel"
              type="text"
              value={customLabelInput}
              onChange={(e) => setCustomLabelInput(e.target.value)}
              placeholder="Добавить свой ярлык (точное название из WA)..."
              className="flex-1 text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            <button
              type="button"
              onClick={handleAddCustomLabel}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить</span>
            </button>
          </div>
        </div>

        {/* Right: Incoming Lead Trigger Filter (Ads / Keywords) */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900">
                Правило автосоздания лидов с новых номеров
              </h3>
            </div>

            <fieldset className="space-y-2">
              <legend className="sr-only">Режим создания новых лидов</legend>
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer">
                <input
                  type="radio"
                  name="leadFilterMode"
                  value="ALL_EXCEPT_IGNORED"
                  checked={leadFilterMode === "ALL_EXCEPT_IGNORED"}
                  onChange={() => setLeadFilterMode("ALL_EXCEPT_IGNORED")}
                  className="mt-0.5 accent-emerald-600"
                />
                <span className="text-xs text-slate-800">
                  <strong className="block font-semibold">
                    Все новые номера (кроме стоп-листа и стоп-ярлыков)
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    Подходит при загруженном списке текущих клиентов и настроенных ярлыках
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer">
                <input
                  type="radio"
                  name="leadFilterMode"
                  value="ONLY_ADS_OR_KEYWORDS"
                  checked={leadFilterMode === "ONLY_ADS_OR_KEYWORDS"}
                  onChange={() => setLeadFilterMode("ONLY_ADS_OR_KEYWORDS")}
                  className="mt-0.5 accent-emerald-600"
                />
                <span className="text-xs text-slate-800">
                  <strong className="block font-semibold">
                    Только заявки с рекламы (Click-to-WhatsApp) или по ключевым словам
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    Незнакомые номера без метки рекламы FB/IG и ключевых слов игнорируются; уже существующие контакты CRM продолжают синхронизироваться
                  </span>
                </span>
              </label>
            </fieldset>

            {leadFilterMode === "ONLY_ADS_OR_KEYWORDS" && (
              <div className="space-y-1">
                <label
                  htmlFor={keywordsInputId}
                  className="block text-[11px] font-semibold text-slate-700"
                >
                  Ключевые фразы-триггеры (через запятую)
                </label>
                <input
                  id={keywordsInputId}
                  name="leadKeywords"
                  type="text"
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="прайс, коммерческое, стоимость, таргет, консультация, хочу узнать"
                  className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSavingRules}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {isSavingRules ? "Сохраняем..." : "Сохранить правила и ярлыки"}
            </button>
          </div>
        </div>
      </form>

      {/* Bottom Split: Manual Bulk Add + Active Ignore List Table (Вариант 1) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2 border-t border-slate-100">
        {/* Add numbers manually */}
        <form onSubmit={handleAddBulkPhones} className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldBan className="w-4 h-4 text-rose-600" />
            <h3 className="text-xs font-bold text-slate-900">Добавить номера в стоп-лист</h3>
          </div>

          <div className="space-y-1">
            <label htmlFor={bulkPhonesId} className="block text-[11px] font-semibold text-slate-700">
              Номера телефонов (по одному в строке или через запятую)
            </label>
            <textarea
              id={bulkPhonesId}
              name="bulkPhones"
              rows={4}
              value={bulkPhonesText}
              onChange={(e) => setBulkPhonesText(e.target.value)}
              placeholder={"+7 777 111 22 33\n+7 (701) 555-66-77\n87059990011"}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={bulkReasonId} className="block text-[11px] font-semibold text-slate-700">
              Примечание / причина
            </label>
            <input
              id={bulkReasonId}
              name="bulkReason"
              type="text"
              value={bulkReasonText}
              onChange={(e) => setBulkReasonText(e.target.value)}
              className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <button
            type="submit"
            disabled={isAddingBulk || !bulkPhonesText.trim()}
            className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAddingBulk ? "Добавление..." : "Добавить в игнор-лист"}</span>
          </button>
        </form>

        {/* Ignored Numbers List */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-900">
              Игнорируемые контакты и рабочие чаты ({ignoredNumbers.length})
            </h3>
            <search>
              <label htmlFor="ignored-list-search" className="sr-only">
                Поиск по стоп-листу
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  id="ignored-list-search"
                  type="search"
                  value={ignoredSearch}
                  onChange={(e) => setIgnoredSearch(e.target.value)}
                  placeholder="Поиск по номеру или имени..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-full sm:w-56"
                />
              </div>
            </search>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            {visibleIgnored.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                {ignoredNumbers.length === 0
                  ? "Стоп-лист пока пуст. Загрузите чаты из WhatsApp или добавьте номера слева."
                  : "По вашему запросу совпадений не найдено."}
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th scope="col" className="px-3 py-2">Контакт / Номер</th>
                    <th scope="col" className="px-3 py-2">Источник</th>
                    <th scope="col" className="px-3 py-2 hidden sm:table-cell">Причина</th>
                    <th scope="col" className="px-3 py-2 text-right">Удалить</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleIgnored.map((item) => {
                    const badge = SOURCE_BADGES[item.source] || SOURCE_BADGES.MANUAL;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-800">
                            {item.displayName || item.rawPhone}
                          </div>
                          {item.displayName && (
                            <div className="text-[11px] font-mono text-slate-500">{item.rawPhone}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-semibold ${badge.cls}`}
                          >
                            {item.labelName ? `Ярлык: ${item.labelName}` : badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-500 hidden sm:table-cell">
                          {item.reason || "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveIgnored(item.id)}
                            disabled={removingId === item.id}
                            aria-label={`Удалить ${item.rawPhone} из стоп-листа`}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Native <dialog> Modal for Importing Existing WhatsApp Chats (Стоп-лист + Импорт лидов) */}
      <dialog
        ref={chatDialogRef}
        aria-labelledby={chatModalTitleId}
        {...({ closedby: "any" } as Record<string, string>)}
        className="rounded-2xl max-w-3xl w-[calc(100%-2rem)] p-0 shadow-2xl border border-slate-200 bg-white m-auto overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 id={chatModalTitleId} className="text-sm font-bold text-slate-900">
              Личные диалоги в WhatsApp ({syncedChats.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {chatModalMode === "STOP_LIST"
                ? "Отметьте переписки с текущими клиентами или коллегами, чтобы CRM не создавала по ним лиды"
                : "Загрузите чаты с лидами в Контакты и чаты CRM. Для чатов с ярлыком «Лид» (или всех выбранных) создадутся сделки."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => chatDialogRef.current?.close()}
            aria-label="Закрыть окно выбора чатов"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-5 pt-3 pb-2 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSwitchChatModalMode("STOP_LIST")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              chatModalMode === "STOP_LIST"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <ShieldBan className="w-3.5 h-3.5" />
            В стоп-лист (рабочие чаты)
          </button>
          <button
            type="button"
            onClick={() => handleSwitchChatModalMode("IMPORT_LEADS")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              chatModalMode === "IMPORT_LEADS"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Импорт лидов в CRM
          </button>
        </div>

        <div className="p-5 space-y-3">
          {chatsError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Шлюз вернул предупреждение: {chatsError}</span>
            </div>
          )}

          {chatModalMode === "IMPORT_LEADS" && (
            <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Воронка для новых лидов
                  </label>
                  <select
                    value={targetPipelineId}
                    onChange={(e) => handleTargetPipelineChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Начальный этап воронки
                  </label>
                  <select
                    value={targetStageId}
                    onChange={(e) => setTargetStageId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    {(selectedImportPipeline?.stages || []).map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-700 shrink-0 flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-emerald-700" />
                  Правило сделок:
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                  <input
                    type="radio"
                    name="dealCreationRule"
                    checked={dealCreationRule === "LEAD_LABEL_ONLY"}
                    onChange={() => setDealCreationRule("LEAD_LABEL_ONLY")}
                    className="accent-emerald-600"
                  />
                  Сделки только с ярлыком «Лид» (остальные — только в Контакты)
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                  <input
                    type="radio"
                    name="dealCreationRule"
                    checked={dealCreationRule === "ALL_SELECTED"}
                    onChange={() => setDealCreationRule("ALL_SELECTED")}
                    className="accent-emerald-600"
                  />
                  Сделки для всех выбранных
                </label>
              </div>
            </div>
          )}

          {/* Filter pills by stop-list & WhatsApp labels */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setChatFilterTab("ALL")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                chatFilterTab === "ALL"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Все ({syncedChats.length})
            </button>
            <button
              type="button"
              onClick={() => setChatFilterTab("NOT_IGNORED")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                chatFilterTab === "NOT_IGNORED"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Не в стоп-листе ({syncedChats.filter((c) => !c.isAlreadyIgnored).length})
            </button>
            <button
              type="button"
              onClick={() => setChatFilterTab("LEAD_LABEL")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                chatFilterTab === "LEAD_LABEL"
                  ? "bg-violet-600 text-white"
                  : "bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100"
              }`}
            >
              Ярлык «Лид» (
              {syncedChats.filter((c) => !c.isAlreadyIgnored && hasLeadLabel(c)).length})
            </button>
            {chatLabelsInList.slice(0, 6).map((lbl) => (
              <button
                key={lbl}
                type="button"
                onClick={() => setChatFilterTab(lbl)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                  chatFilterTab === lbl
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <search className="flex-1">
              <label htmlFor={chatSearchId} className="sr-only">
                Поиск среди загруженных чатов WhatsApp
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id={chatSearchId}
                  autoFocus
                  type="search"
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  placeholder="Найти чат по имени, номеру, ярлыку или тексту..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </search>

            <div className="flex items-center gap-1.5 shrink-0">
              {chatModalMode === "IMPORT_LEADS" &&
                syncedChats.some((c) => !c.isAlreadyIgnored && hasLeadLabel(c)) && (
                  <button
                    type="button"
                    onClick={handleSelectLeadLabelChatsInModal}
                    className="px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Выбрать все «Лид»
                  </button>
                )}
              <button
                type="button"
                onClick={handleSelectAllNotIgnoredInModal}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Выбрать / снять все
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {filteredModalChats.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Личные диалоги не найдены (убедитесь, что WhatsApp подключен и история синхронизирована).
              </div>
            ) : (
              filteredModalChats.map((chat) => {
                const isSelected = selectedJids.has(chat.jid);
                return (
                  <label
                    key={chat.jid}
                    className={`flex items-start gap-3 px-4 py-2.5 text-xs transition-colors ${
                      chat.isAlreadyIgnored
                        ? "bg-slate-50/70 opacity-65 cursor-default"
                        : isSelected
                        ? "bg-emerald-50/60 cursor-pointer"
                        : "hover:bg-slate-50 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={chat.isAlreadyIgnored}
                      checked={chat.isAlreadyIgnored || isSelected}
                      onChange={() => handleToggleChatSelection(chat.jid)}
                      className="mt-1 accent-emerald-600 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900 truncate">
                          {chat.displayName}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">{chat.phone}</span>
                        {chat.labels.map((lbl) => (
                          <span
                            key={lbl}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              lbl.trim().toLowerCase() === "лид"
                                ? "bg-violet-100 text-violet-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {lbl}
                          </span>
                        ))}
                        {chat.isAlreadyIgnored && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">
                            Уже в стоп-листе
                          </span>
                        )}
                        {chat.existingContactName && (
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">
                            В CRM: {chat.existingContactName}
                          </span>
                        )}
                      </div>
                      {chat.lastMessageText && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {chat.lastMessageText}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Выбрано чатов: <strong>{selectedJids.size}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => chatDialogRef.current?.close()}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Отмена
            </button>
            {chatModalMode === "STOP_LIST" ? (
              <button
                type="button"
                onClick={handleImportSelectedChatsToIgnore}
                disabled={selectedJids.size === 0 || isAddingSelectedChats}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isAddingSelectedChats
                  ? "Добавляем..."
                  : `Добавить в рабочие (${selectedJids.size})`}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleImportSelectedChatsToCrm}
                disabled={selectedJids.size === 0 || isImportingLeads}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isImportingLeads
                  ? "Импортируем..."
                  : `Импортировать в CRM (${selectedJids.size})`}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </section>
  );
}
