"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Camera, X, AlertTriangle, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";

interface CameraQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

const SAMPLE_QR_FIXTURES = [
  {
    label: "Windshield E-Sticker (Camry)",
    code: "https://niid.nigeriainsurers.org/verify?cert=NAICOM-STK-2026-ABC123XY&plate=ABC-123-XY",
    id: "ABC-123-XY",
    type: "motor",
  },
  {
    label: "LACVIS Roadworthiness Inspection",
    code: "https://mvaa.lagosstate.gov.ng/verify?plate=LND-452-AA&cert=LACVIS-2026-99120",
    id: "LND-452-AA",
    type: "vehicle_license",
  },
  {
    label: "NHIA Digital Health ID",
    code: "https://nhia.gov.ng/verify?enrollee=NHIA-2026-00812",
    id: "NHIA-2026-00812",
    type: "hmo",
  },
  {
    label: "FRSC Driver's License Registry",
    code: "https://nvis.frsc.gov.ng/verify-dl?dl=ABC12345678",
    id: "ABC12345678",
    type: "driver_license",
  },
  {
    label: "FRSC Stolen Flag Vehicle Alert",
    code: "https://nvis.frsc.gov.ng/stolen-alert?plate=STOLEN-999-XX",
    id: "STOLEN-999-XX",
    type: "stolen",
  },
];

export function CameraQrScannerModal({
  isOpen,
  onClose,
  onScan,
}: CameraQrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedResult, setDetectedResult] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  const extractIdentifier = useCallback((code: string): string => {
    try {
      const url = new URL(code);
      const id =
        url.searchParams.get("cert") ||
        url.searchParams.get("plate") ||
        url.searchParams.get("id") ||
        url.searchParams.get("enrollee") ||
        url.searchParams.get("dl") ||
        url.searchParams.get("license");
      if (id) return id;
    } catch {
      // not a standard URL, treat raw
    }
    return code;
  }, []);

  const handleCodeDetected = useCallback(
    (rawCode: string) => {
      const extracted = extractIdentifier(rawCode);
      setDetectedResult(extracted);
      stopCamera();

      // Trigger audio chime if Web Audio API available
      try {
        if (typeof window !== "undefined" && window.AudioContext) {
          const ctx = new window.AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch {
        // audio optional
      }

      setTimeout(() => {
        onScan(extracted);
        onClose();
      }, 700);
    },
    [extractIdentifier, stopCamera, onScan, onClose]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsScanning(true);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera hardware access is not supported by this browser environment.");
      setIsScanning(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play().catch(() => {});
      }

      // BarcodeDetector API detection loop
      const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {};
      const BarcodeDetectorClass = win.BarcodeDetector as
        | (new (options?: { formats: string[] }) => {
            detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
          })
        | undefined;

      if (BarcodeDetectorClass) {
        const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
        let active = true;

        const scanFrame = async () => {
          if (!active || !videoRef.current) return;
          try {
            if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0]?.rawValue) {
                const raw = barcodes[0].rawValue;
                handleCodeDetected(raw);
                active = false;
                return;
              }
            }
          } catch {
            // Frame detection error handled gracefully
          }
          if (active) {
            requestAnimationFrame(scanFrame);
          }
        };

        requestAnimationFrame(scanFrame);
      }
    } catch {
      setCameraError("Camera access was restricted or is unavailable. You can use 1-click test simulation fixtures below.");
      setIsScanning(false);
    }
  }, [handleCodeDetected]);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | undefined;

    if (isOpen) {
      timer = setTimeout(() => {
        if (!cancelled) {
          startCamera();
        }
      }, 0);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-slate-100 space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Officer Camera QR Scanner
              </h3>
              <p className="text-xs text-slate-400">
                FRSC &amp; VIO Field Enforcement &bull; Windshield E-Stickers
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Scanner Viewport */}
        <div className="relative aspect-4/3 w-full overflow-hidden rounded-2xl bg-black border border-slate-800 flex items-center justify-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Scanner Reticle Overlay */}
          {isScanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-56 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                {/* Corner Accents */}
                <span className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <span className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                {/* Animated Scan Line */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-300 to-transparent animate-pulse [animation-duration:1.5s]" />
              </div>
            </div>
          )}

          {/* Detected Success State */}
          {detectedResult && (
            <div className="absolute inset-0 bg-emerald-950/90 flex flex-col items-center justify-center gap-2 p-4 text-center animate-in zoom-in-95">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
              <div className="text-sm font-black text-white">QR Code Verified!</div>
              <div className="text-xs font-mono font-bold bg-slate-900 text-emerald-300 px-3 py-1 rounded-lg border border-emerald-500/40">
                {detectedResult}
              </div>
              <p className="text-[11px] text-emerald-200/80">Resolving statutory record...</p>
            </div>
          )}

          {/* Camera Error Message */}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/90 p-4 flex flex-col items-center justify-center text-center gap-2">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <div className="text-xs font-semibold text-slate-300 max-w-xs">
                {cameraError}
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="mt-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white border border-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Camera
              </button>
            </div>
          )}
        </div>

        {/* 1-Click Simulation Shortcuts for Judges */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Simulate Field Camera Scan (1-Click)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">ENFORCEMENT DEMO</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SAMPLE_QR_FIXTURES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleCodeDetected(item.code)}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-emerald-950/60 border border-slate-700 hover:border-emerald-500/50 text-left transition-all group cursor-pointer"
              >
                <div className="text-xs font-bold text-white group-hover:text-emerald-300 flex items-center justify-between">
                  <span>{item.label}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-400">
                    {item.id}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  {item.code}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
