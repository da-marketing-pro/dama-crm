"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, FastForward } from "lucide-react";

interface VoiceMessagePlayerProps {
  mediaUrl: string;
  fromMe?: boolean;
}

export function VoiceMessagePlayer({ mediaUrl, fromMe = false }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  // Toggle play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.warn("Audio playback error:", err);
      });
    }
    setIsPlaying(!isPlaying);
  };

  // Cycle speed: 1x -> 1.5x -> 2x -> 1x
  const cycleSpeed = () => {
    if (!audioRef.current) return;
    let nextRate = 1;
    if (playbackRate === 1) nextRate = 1.5;
    else if (playbackRate === 1.5) nextRate = 2;
    else nextRate = 1;

    audioRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && !isNaN(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec === 0) return "0:00";
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`p-3 rounded-2xl flex items-center gap-3 min-w-[240px] max-w-xs select-none shadow-xs border ${
        fromMe
          ? "bg-blue-600 text-white border-blue-500"
          : "bg-white text-slate-800 border-slate-200"
      }`}
    >
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={mediaUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Play / Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95 cursor-pointer ${
          fromMe
            ? "bg-white text-blue-600 hover:bg-blue-50"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform Scrubber & Timers */}
      <div className="flex-1 space-y-1 min-w-0">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${
              fromMe ? "bg-blue-400 accent-white" : "bg-slate-200 accent-emerald-600"
            }`}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className={fromMe ? "text-blue-100" : "text-slate-500"}>
            {formatSeconds(currentTime)}
          </span>
          <span className={fromMe ? "text-blue-200" : "text-slate-400"}>
            {duration > 0 ? formatSeconds(duration) : "0:00"}
          </span>
        </div>
      </div>

      {/* Speed Multiplier Button */}
      <button
        type="button"
        onClick={cycleSpeed}
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition-colors shrink-0 cursor-pointer ${
          fromMe
            ? "bg-blue-700/80 hover:bg-blue-700 text-white"
            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
        }`}
        title="Скорость воспроизведения"
      >
        {playbackRate}x
      </button>
    </div>
  );
}
