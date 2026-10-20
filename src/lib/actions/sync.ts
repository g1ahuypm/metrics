"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "../auth";
import { runSync, type SyncResult, type SyncTarget } from "../sync";

export async function triggerSyncAction(target: SyncTarget, opts: { full?: boolean } = {}): Promise<SyncResult> {
  await requireEditor();
  const result = await runSync(target, opts);
  revalidatePath("/", "layout");
  return result;
}
