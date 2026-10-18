"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import { requireEditor } from "../auth";

/** Links a campaign to the product it sells (null = not linked). */
export async function setCampaignProductAction(campaignId: string, productId: string | null): Promise<void> {
  await requireEditor();
  await db.campaign.update({ where: { id: campaignId }, data: { productId } });
  revalidatePath("/", "layout");
}
