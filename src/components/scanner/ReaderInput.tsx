"use client";

import { useEffect, useRef, useState } from "react";
import type { ScanResult } from "@/lib/barcode/types";

const IDLE_MS = 500; // fin de lectura tras 500 ms sin teclas

// Captura global del teclado mientras está activo: la pistola no puede
// escribir en otros campos aunque envíe Tab o Enter.
export default function ReaderInput({
  onResult,
  onClose,
}: {
  onResult: (r: ScanResult) => void;
  onClose: () => void;
}) {
  const buf = useRef("");
  const timer = useRef<number | undefined>(undefined);
  const cbRef = useRef(onResult);
  const [count, setCount] = useState(0);

  useEffect(() => {
    cbRef.current = onResult;
  });

  useEffect(() => {
    const flush = () => {
      const raw = buf.current;
      buf.current = "";
      setCount(0);
      if (raw.replace(/\|/g, "").trim().length >= 6) {
        cbRef.current({ raw, format: "lector", source: "lector" });
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"].includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") return onClose();

      if (e.key === "Tab" || e.key === "Enter" || e.key === "Unidentified" || (e.ctrlKey && !e.altKey)) {
        buf.current += "|";
      } else if (e.key.length === 1) {
        buf.current += e.key;
      }

      setCount(buf.current.length);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, IDLE_MS);
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(timer.current);
    };
  }, [onClose]);

  return (
    <div className="space-y-2 rounded-lg border-2 border-dashed border-brand bg-brand/5 p-4 text-center">
      <p className="animate-pulse font-semibold text-brand">Esperando lectura de la pistola…</p>
      <p className="text-xs text-black/60">
        Dispara al código del reverso de la cédula. {count > 0 && <b>Recibiendo ({count})…</b>}
      </p>
      <button type="button" onClick={onClose} className="text-sm text-danger hover:underline">
        Cancelar (Esc)
      </button>
    </div>
  );
}