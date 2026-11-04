export interface Notice {
  undecryptable: number;
  stale: number;
  future: number;
}

export function noticeText(n: Notice): string | null {
  const parts: string[] = [];
  if (n.undecryptable > 0) parts.push(`${n.undecryptable} 則無法解密（金鑰不符？）`);
  if (n.stale > 0) parts.push(`${n.stale} 則已超過 7 天`);
  if (n.future > 0) parts.push(`${n.future} 則的時間比現在晚（請檢查電腦或 iPad 的時鐘）`);
  return parts.length > 0 ? parts.join("；") : null;
}
