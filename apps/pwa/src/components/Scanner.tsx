import { useEffect, useRef, useState } from "preact/hooks";
import { keyFromFrame } from "../scan";

const SCAN_INTERVAL_MS = 120;
const MAX_FRAME_WIDTH = 640;

function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "沒有相機權限。請到 iPad 設定允許，或改用貼上配對碼。";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "找不到相機。請改用貼上配對碼。";
  }
  return "無法開啟相機。請改用貼上配對碼。";
}

/** Opens the rear camera and reports the first pairing key it sees. Stops the camera when done. */
export function Scanner({
  onKey,
  onCancel,
}: {
  onKey(master: Uint8Array): void;
  onCancel(): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("這個瀏覽器不支援相機。請改用貼上配對碼。");
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");

    function stop(): void {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    }

    function tick(): void {
      const element = video.current;
      if (stopped || !element) return;
      if (element.readyState >= 2 && element.videoWidth > 0) {
        const scale = Math.min(1, MAX_FRAME_WIDTH / element.videoWidth);
        canvas.width = Math.round(element.videoWidth * scale);
        canvas.height = Math.round(element.videoHeight * scale);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(element, 0, 0, canvas.width, canvas.height);
          const master = keyFromFrame(context.getImageData(0, 0, canvas.width, canvas.height));
          if (master) {
            stop();
            onKey(master);
            return;
          }
        }
      }
      timer = setTimeout(tick, SCAN_INTERVAL_MS);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((opened) => {
        if (stopped) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        const element = video.current;
        if (!element) return;
        element.srcObject = opened;
        void element.play().then(tick, () => setError("無法播放相機畫面。請改用貼上配對碼。"));
      })
      .catch((cause) => setError(describeCameraError(cause)));

    return stop;
  }, []);

  return (
    <section class="scanner">
      {error ? (
        <p class="error">{error}</p>
      ) : (
        <>
          <div class="viewfinder">
            <video ref={video} playsInline muted />
          </div>
          <p>把相機對準電腦畫面上的 QR code。</p>
        </>
      )}
      <button type="button" class="link" onClick={onCancel}>
        取消
      </button>
    </section>
  );
}
