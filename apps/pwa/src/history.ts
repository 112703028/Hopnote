import { HISTORY_MAX_LIMIT } from "@hopnote/protocol";

// The first open takes the default newest page. Catching up after an absence asks
// for the maximum page: the relay returns the newest N after `since`, so a small
// page would leave a gap that lastSeq then skips over.
export function historyQuery(lastSeq: number): string {
  return lastSeq > 0 ? `since=${lastSeq}&limit=${HISTORY_MAX_LIMIT}` : "since=0";
}
