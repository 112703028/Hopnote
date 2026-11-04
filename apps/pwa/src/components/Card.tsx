import { useEffect, useState } from "preact/hooks";
import { copyPng, copyText } from "../clipboard";
import type { DisplayItem } from "../open-feed";

// The card that shows an image owns its object URL and revokes it when the card goes away
// (dropped by the cap, a new key, a re-pair), so a long session does not pile up Blobs.
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob]);
  return url;
}

// No touch or contextmenu handlers and no custom long-press: iOS must be free to
// start its own text selection and image drag.
export function Card({ item }: { item: DisplayItem }) {
  const [copied, setCopied] = useState(false);
  const imageUrl = useObjectUrl(item.kind === "image" ? item.blob : null);

  async function copy(): Promise<void> {
    try {
      // copyPng must be called before any await so the write stays in the tap gesture.
      await (item.kind === "text" ? copyText(item.text) : copyPng(item.blob));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied; the user can still select the text or drag the image.
    }
  }

  return (
    <article class="card" onClick={copy}>
      <time>{new Date(item.ts).toLocaleTimeString()}</time>
      {copied && <span class="copied">已複製</span>}
      {item.kind === "text" ? (
        <p class="text">{item.text}</p>
      ) : (
        imageUrl && <img src={imageUrl} width={item.width} height={item.height} alt="截圖" />
      )}
    </article>
  );
}
