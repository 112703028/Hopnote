import { useState } from "preact/hooks";
import { decodePayload, type StoredItem } from "@hopnote/protocol";
import { copyPng, copyText } from "../clipboard";

// No touch or contextmenu handlers and no custom long-press: iOS must be free to
// start its own text selection and image drag.
export function Card({ item }: { item: StoredItem }) {
  const [copied, setCopied] = useState(false);
  const payload = decodePayload(item.kind, item.payload);
  if (!payload) return null;

  async function copy(): Promise<void> {
    if (!payload) return;
    try {
      // copyPng must be called before any await so the write stays in the tap gesture.
      await ("text" in payload ? copyText(payload.text) : copyPng(payload.data));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied; the user can still select the text or drag the image.
    }
  }

  return (
    <article class="card" onClick={copy}>
      <time>{new Date(item.receivedAt).toLocaleTimeString()}</time>
      {copied && <span class="copied">已複製</span>}
      {"text" in payload ? (
        <p class="text">{payload.text}</p>
      ) : (
        <img
          src={`data:image/png;base64,${payload.data}`}
          width={payload.width}
          height={payload.height}
          alt="截圖"
        />
      )}
    </article>
  );
}
