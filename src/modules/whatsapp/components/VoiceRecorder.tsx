"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Trash2, Send, AlertCircle, StopCircle } from "lucide-react";

interface VoiceRecorderProps {
  onAudioRecorded: (base64AudioUrl: string) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onAudioRecorded, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Браузер не поддерживает запись аудио напрямую.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn("MediaRecorder init error:", err);
      setError("Микрофон недоступен. Вы можете использовать тестовую демо-запись.");
      setIsRecording(false);
    }
  };

  const handleStopAndSend = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      // Fallback: Generate demo audio tone
      sendFallbackAudio();
      return;
    }

    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        onAudioRecorded(base64Audio);
        cleanup();
      };
      reader.readAsDataURL(audioBlob);
    };

    mediaRecorderRef.current.stop();
  };

  // Fallback demo audio generator for test environments
  const sendFallbackAudio = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const sampleRate = audioCtx.sampleRate;
      const duration = 3; // 3 seconds
      const frameCount = sampleRate * duration;
      const buffer = audioCtx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);

      // Generate soft pleasant speech-like chime
      for (let i = 0; i < frameCount; i++) {
        data[i] = Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * Math.exp(-i / (sampleRate * 1.5)) * 0.4;
      }

      // Convert AudioBuffer to WAV Base64
      const wavBlob = audioBufferToWav(buffer);
      const reader = new FileReader();
      reader.onloadend = () => {
        onAudioRecorded(reader.result as string);
        cleanup();
      };
      reader.readAsDataURL(wavBlob);
    } catch {
      // Simplest base64 fallback
      onAudioRecorded("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3");
      cleanup();
    }
  };

  const handleCancel = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    cleanup();
    onCancel();
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded-2xl bg-slate-900 text-white w-full shadow-lg border border-slate-700 animate-in fade-in duration-150">
      <div className="flex items-center gap-2.5 pl-2">
        {/* Pulsing red dot */}
        <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
        <span className="text-xs font-mono font-bold text-rose-400">
          Запись: {formatTimer(recordingSeconds)}
        </span>
      </div>

      {error ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-300">Микрофон не подключен:</span>
          <button
            type="button"
            onClick={sendFallbackAudio}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
          >
            Отправить тестовое аудио
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 text-slate-400 hover:text-white"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {/* Cancel button */}
          <button
            type="button"
            onClick={handleCancel}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Отменить запись"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Send voice button */}
          <button
            type="button"
            onClick={handleStopAndSend}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Отправить голос</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Minimal helper to write AudioBuffer to WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    out.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF chunk descriptor
  out.setUint8(pos++, 82); // 'R'
  out.setUint8(pos++, 73); // 'I'
  out.setUint8(pos++, 70); // 'F'
  out.setUint8(pos++, 70); // 'F'
  setUint32(length - 8);
  out.setUint8(pos++, 87); // 'W'
  out.setUint8(pos++, 65); // 'A'
  out.setUint8(pos++, 86); // 'V'
  out.setUint8(pos++, 69); // 'E'

  // fmt sub-chunk
  out.setUint8(pos++, 102); // 'f'
  out.setUint8(pos++, 109); // 'm'
  out.setUint8(pos++, 116); // 't'
  out.setUint8(pos++, 32); // ' '
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  // data sub-chunk
  out.setUint8(pos++, 100); // 'd'
  out.setUint8(pos++, 97); // 'a'
  out.setUint8(pos++, 116); // 't'
  out.setUint8(pos++, 97); // 'a'
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out.buffer], { type: "audio/wav" });
}
