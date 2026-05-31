"use client";

import { useEffect, useRef } from "react";

type QrScannerProps = {
  /** QRコードのデコードに成功したときに一度だけ呼ばれる（読み取り値を渡す） */
  onDecode: (text: string) => void;
  /** カメラ起動失敗・権限拒否などのときに呼ばれる */
  onError: (message: string) => void;
};

// html5-qrcode はブラウザ専用のため、動的 import してクライアントでのみ読み込む。
const SCANNER_ELEMENT_ID = "handover-qr-reader";

export default function QrScanner({ onDecode, onError }: QrScannerProps) {
  const scannerRef = useRef<any>(null);
  const decodedRef = useRef(false);
  // 最新のコールバックを参照する（依存配列を空に保ち、再起動によるカメラのちらつきを防ぐ）
  const onDecodeRef = useRef(onDecode);
  const onErrorRef = useRef(onError);
  onDecodeRef.current = onDecode;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    const stopScanner = async () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      // 実行中でない場合 stop() は reject するが、無視して片付ける。
      try {
        await scanner.stop();
      } catch {
        // 既に停止済みなどは無視
      }
      try {
        scanner.clear();
      } catch {
        // 無視
      }
    };

    const start = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false } as any);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            // 二重発火を防ぐため、先にカメラを止めてからコールバック
            void stopScanner().finally(() => onDecodeRef.current(decodedText));
          },
          () => {
            // フレーム単位のデコード失敗は無視（連続して呼ばれる）
          }
        );
      } catch (err: any) {
        if (cancelled) return;
        const name = err?.name || "";
        const message =
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "カメラの使用が許可されていません。ブラウザの設定でカメラを許可してください。"
            : "カメラを起動できませんでした。";
        onErrorRef.current(message);
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, []);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
      <div id={SCANNER_ELEMENT_ID} className="absolute inset-0" />
      {/* 読み取り枠ガイド */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-3/5 w-3/5 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
    </div>
  );
}
