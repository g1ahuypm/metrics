"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "../auth";
import { runSync, type SyncResult, type SyncSource } from "../sync";

export async function triggerSyncAction(source: SyncSource, opts: { full?: boolean } = {}): Promise<SyncResult> {
  await requireEditor();
  const result = await runSync(source, opts);
  revalidatePath("/", "layout");
  return result;
}
