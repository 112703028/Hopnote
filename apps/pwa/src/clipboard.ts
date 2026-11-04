export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// iOS only accepts image/png here, and the write must start inside the tap gesture:
// the Blob already exists, so nothing is awaited before navigator.clipboard.write.
export async function copyPng(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
