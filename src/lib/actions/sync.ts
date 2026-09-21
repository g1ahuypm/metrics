"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "../auth";
import { runSync, type SyncResult, type SyncSource } from "../sync";

export async function triggerSyncAction(source: SyncSource): Promise<SyncResult> {
  await requireEditor();
  const result = await runSync(source);
  revalidatePath("/", "layout");
  return result;
}
