"use client";

import { useState, useRef } from "react";
import {
  Send,
  Paperclip,
  Mic,
  Image as ImageIcon,
  FileText,
  X,
  Upload,
} from "lucide-react";
import { WhatsappMessageType } from "@prisma/client";
import { VoiceRecorder } from "./VoiceRecorder";

interface ChatInputProps {
  onSendMessage: (data: {
    messageType: WhatsappMessageType;
    textContent?: string;
    mediaUrl?: string;
    fileName?: string;
  }) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, disabled = false }: ChatInputProps) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Attachment modal / preview state
  const [selectedAttachment, setSelectedAttachment] = useState<{
    type: WhatsappMessageType;
    mediaUrl: string;
    fileName: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (disabled || isSending) return;

    if (selectedAttachment) {
      setIsSending(true);
      await onSendMessage({
        messageType: selectedAttachment.type,
        mediaUrl: selectedAttachment.mediaUrl,
        fileName: selectedAttachment.fileName,
        textContent: text.trim() || undefined,
      });
      setSelectedAttachment(null);
      setText("");
      setIsSending(false);
      return;
    }

    if (!text.trim()) return;

    setIsSending(true);
    await onSendMessage({
      messageType: WhatsappMessageType.TEXT,
      textContent: text.trim(),
    });
    setText("");
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleAudioRecorded = async (base64AudioUrl: string) => {
    setIsRecording(false);
    setIsSending(true);
    await onSendMessage({
      messageType: WhatsappMessageType.AUDIO,
      mediaUrl: base64AudioUrl,
      textContent: "Голосовое сообщение",
    });
    setIsSending(false);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setSelectedAttachment({
        type: isImage ? WhatsappMessageType.IMAGE : WhatsappMessageType.DOCUMENT,
        mediaUrl: dataUrl,
        fileName: file.name,
      });
      setShowAttachMenu(false);
    };
    reader.readAsDataURL(file);

    // reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSelectPresetAttachment = (type: "image" | "pdf") => {
    setShowAttachMenu(false);
    if (type === "image") {
      setSelectedAttachment({
        type: WhatsappMessageType.IMAGE,
        mediaUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800",
        fileName: "Коммерческое_предложение.jpg",
      });
    } else {
      setSelectedAttachment({
        type: WhatsappMessageType.DOCUMENT,
        mediaUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        fileName: "Договор_оферты_AmoCRM.pdf",
      });
    }
  };

  return (
    <div className="p-3 bg-white border-t border-slate-200">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Voice Recorder Active Mode */}
      {isRecording ? (
        <VoiceRecorder
          onAudioRecorded={handleAudioRecorded}
          onCancel={() => setIsRecording(false)}
        />
      ) : (
        <div className="space-y-2">
          {/* Selected Attachment Preview Bar */}
          {selectedAttachment && (
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center gap-2 truncate">
                {selectedAttachment.type === WhatsappMessageType.IMAGE ? (
                  <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="font-semibold text-slate-800 truncate">
                  {selectedAttachment.fileName}
                </span>
                <span className="text-[10px] text-slate-400">
                  {selectedAttachment.type === WhatsappMessageType.IMAGE
                    ? "(Изображение)"
                    : "(Документ PDF)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAttachment(null)}
                className="w-5 h-5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Main Input Row */}
          <div className="flex items-end gap-2 relative">
            {/* Attachment Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className="w-9 h-9 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                title="Прикрепить файл"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Attach Dropdown Menu */}
              {showAttachMenu && (
                <div className="absolute bottom-11 left-0 z-20 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 w-52 space-y-1 animate-in slide-in-from-bottom-2 duration-150">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Загрузить с диска</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPresetAttachment("image")}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <span>Прикрепить фото</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPresetAttachment("pdf")}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-rose-600" />
                    <span>Прикрепить КП (PDF)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Textarea */}
            <div className="flex-1 min-h-[38px] max-h-32 bg-slate-50 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all flex items-center px-3 py-1.5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={
                  selectedAttachment
                    ? "Добавьте комментарий к файлу..."
                    : "Введите сообщение... (Enter для отправки)"
                }
                disabled={disabled || isSending}
                className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none max-h-24 leading-relaxed"
              />
            </div>

            {/* Mic / Voice Recording Button */}
            {!text.trim() && !selectedAttachment ? (
              <button
                type="button"
                onClick={() => setIsRecording(true)}
                className="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-xs"
                title="Записать голосовое сообщение"
              >
                <Mic className="w-4 h-4" />
              </button>
            ) : (
              /* Send Text / Attachment Button */
              <button
                type="button"
                onClick={() => handleSendText()}
                disabled={isSending || disabled}
                className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
                title="Отправить сообщение"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
