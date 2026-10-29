export function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// iOS only accepts image/png here, and the write must start inside the tap
// gesture: build the Blob synchronously instead of passing a pending promise.
export async function copyPng(data: string): Promise<void> {
  const blob = base64ToBlob(data, "image/png");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
