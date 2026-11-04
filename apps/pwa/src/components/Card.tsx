import { useState } from "preact/hooks";
import { copyPng, copyText } from "../clipboard";
import type { DisplayItem } from "../open-feed";

// No touch or contextmenu handlers and no custom long-press: iOS must be free to
// start its own text selection and image drag.
export function Card({ item }: { item: DisplayItem }) {
  const [copied, setCopied] = useState(false);

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
        <img src={item.url} width={item.width} height={item.height} alt="截圖" />
      )}
    </article>
  );
}
