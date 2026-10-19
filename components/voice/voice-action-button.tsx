import React, { useState } from "react";
import { Mic, Loader2, Volume2, AlertCircle, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

interface VoiceActionButtonProps {
  onTranscript: (text: string) => void;
  language?: string;
  isProcessing?: boolean;
  className?: string;
}

const BENCHMARK_UTTERANCES: Record<string, { label: string; text: string; flag: string }> = {
  pcm: {
    label: "Pidgin (Motor)",
    flag: "🇳🇬",
    text: "Abeg I wan renew my motor insurance for ABC-123-XY sharp sharp.",
  },
  yo: {
    label: "Yorùbá (LACVIS)",
    flag: "🇳🇬",
    text: "Mo fẹ́ ṣe àtúntò ìwé-ẹ̀rí àyẹ̀wò ọkọ̀ mi àti lẹ́sẹ́nsì fún ọdún tuntun.",
  },
  ha: {
    label: "Hausa (FRSC DL)",
    flag: "🇳🇬",
    text: "Ina so in sabunta lasisin tuki na na kasa kafin ya kare a Ikeja.",
  },
  ig: {
    label: "Igbo (NHIA HMO)",
    flag: "🇳🇬",
    text: "Achọrọ m imeghari mkpuchi ahụike NHIA m NHIA-2026-00812 maka Gold tier.",
  },
  "en-NG": {
    label: "English (Camry)",
    flag: "🇳🇬",
    text: "My car insurance expires next week. Check it and renew it for me.",
  },
};

export function VoiceActionButton({
  onTranscript,
  language = "en-NG",
  isProcessing = false,
  className,
}: VoiceActionButtonProps) {
  const [internalState, setInternalState] = useState<VoiceState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  const state: VoiceState = isProcessing ? "processing" : internalState;

  const speakUtterance = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Gracefully ignore audio synthesis errors
      }
    }
  };

  const triggerSimulatedSpeech = (text: string) => {
    setShowVoiceMenu(false);
    setInternalState("speaking");
    speakUtterance(text);

    setTimeout(() => {
      setInternalState("processing");
      setTimeout(() => {
        onTranscript(text);
        setInternalState("idle");
      }, 700);
    }, 1500);
  };

  const startListening = () => {
    setErrorMessage(null);

    // Check Web Speech API availability
    const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {};
    const SpeechRecognitionClass = (win.SpeechRecognition || win.webkitSpeechRecognition) as
      | (new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((event: { results?: Array<Array<{ transcript?: string }>> }) => void) | null;
          onerror: (() => void) | null;
          onend: (() => void) | null;
          start: () => void;
        })
      | undefined;

    const targetUtterance = (BENCHMARK_UTTERANCES[language] || BENCHMARK_UTTERANCES["en-NG"]).text;

    if (!SpeechRecognitionClass) {
      triggerSimulatedSpeech(targetUtterance);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = language === "pcm" ? "en-NG" : language;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setInternalState("listening");

      recognition.onresult = (event: { results?: Array<Array<{ transcript?: string }>> }) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInternalState("processing");
          onTranscript(transcript);
        }
      };

      recognition.onerror = () => {
        triggerSimulatedSpeech(targetUtterance);
      };

      recognition.onend = () => {
        setInternalState((curr) => (curr === "listening" ? "idle" : curr));
      };

      recognition.start();
    } catch {
      triggerSimulatedSpeech(targetUtterance);
    }
  };

  const stopListening = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setInternalState("idle");
  };

  return (
    <div className="relative inline-flex items-center">
      <div className="inline-flex rounded-2xl shadow-md shadow-emerald-950/20 overflow-visible">
        <button
          type="button"
          onClick={state === "listening" ? stopListening : startListening}
          disabled={state === "processing"}
          aria-label="Activate Voice Action"
          className={cn(
            "relative group flex items-center justify-center px-3.5 py-2.5 rounded-l-2xl transition-all duration-300 font-medium cursor-pointer",
            state === "idle" &&
              "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 active:scale-98",
            state === "listening" &&
              "bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-950/70",
            state === "processing" &&
              "bg-amber-600 text-white cursor-wait",
            state === "speaking" &&
              "bg-cyan-600 text-white shadow-lg shadow-cyan-950/50 animate-pulse",
            state === "error" &&
              "bg-red-900 text-red-200 border border-red-700",
            className
          )}
        >
          {state === "idle" && (
            <div className="flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-emerald-100" />
              <span className="text-xs font-bold tracking-wide hidden sm:inline">Voice Action</span>
            </div>
          )}

          {state === "listening" && (
            <div className="flex items-center gap-1.5 px-1">
              <div className="flex items-center gap-0.5 h-4">
                <span className="w-1 h-3 bg-white rounded-full animate-bounce" />
                <span className="w-1 h-4 bg-white rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1 h-2 bg-white rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
              <span className="text-xs font-bold tracking-wide">Listening...</span>
            </div>
          )}

          {state === "processing" && (
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin text-amber-100" />
              <span className="text-xs font-bold tracking-wide">N-ATLAS AI...</span>
            </div>
          )}

          {state === "speaking" && (
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 animate-bounce text-cyan-100" />
              <span className="text-xs font-bold">Speaking Voice...</span>
            </div>
          )}

          {state === "error" && (
            <div className="flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs">Retry</span>
            </div>
          )}
        </button>

        {/* Dropdown toggle for 1-click sovereign language audio samples */}
        <button
          type="button"
          onClick={() => setShowVoiceMenu(!showVoiceMenu)}
          className="px-2 bg-emerald-700 hover:bg-emerald-600 text-white border-l border-emerald-500/40 rounded-r-2xl flex items-center justify-center cursor-pointer transition-colors"
          title="Sovereign Nigerian Voice Samples (Pidgin, Yorùbá, Hausa, Igbo)"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Sovereign Audio Sample Popover Menu */}
      {showVoiceMenu && (
        <div className="absolute right-0 bottom-full mb-2 w-72 rounded-2xl bg-white border border-slate-200 shadow-xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 mb-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              Sovereign Audio Samples
            </span>
            <span className="text-[9px] bg-emerald-50 text-emerald-800 font-mono font-bold px-1.5 py-0.2 rounded border border-emerald-200">
              N-ATLAS
            </span>
          </div>

          <div className="space-y-1">
            {Object.entries(BENCHMARK_UTTERANCES).map(([key, item]) => (
              <button
                key={key}
                type="button"
                onClick={() => triggerSimulatedSpeech(item.text)}
                className="w-full text-left px-2.5 py-2 rounded-xl text-xs hover:bg-emerald-50 hover:text-emerald-900 transition-colors flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span>{item.flag}</span>
                    <span>{item.label}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[210px] mt-0.5 font-medium">
                    &ldquo;{item.text}&rdquo;
                  </div>
                </div>
                <Volume2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {errorMessage && (
        <span className="absolute -bottom-6 text-[10px] text-rose-500 whitespace-nowrap">
          {errorMessage}
        </span>
      )}
    </div>
  );
}

