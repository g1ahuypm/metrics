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

/**
 * Links unassigned campaigns whose name mentions a product title.
 * Matches on the longest product title found inside the campaign name.
 */
export async function autoMatchCampaignsAction(): Promise<{ matched: number }> {
  await requireEditor();
  const [campaigns, variants] = await Promise.all([
    db.campaign.findMany({ where: { productId: null } }),
    db.productVariant.findMany({ select: { productId: true, productTitle: true }, distinct: ["productId"] }),
  ]);
  const products = variants
    .filter((v) => v.productId)
    .map((v) => ({ id: v.productId!, title: v.productTitle, norm: normalize(v.productTitle) }))
    .sort((a, b) => b.norm.length - a.norm.length);

  let matched = 0;
  for (const c of campaigns) {
    const name = normalize(c.name);
    const hit = products.find((p) => p.norm.length >= 4 && name.includes(p.norm)) ?? products.find((p) => wordsOverlap(name, p.norm));
    if (hit) {
      await db.campaign.update({ where: { id: c.id }, data: { productId: hit.id } });
      matched++;
    }
  }
  revalidatePath("/", "layout");
  return { matched };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["the", "a", "an", "of", "and", "for", "to", "book", "guide", "digital", "ebook", "e", "kit", "pack"]);

/** True when the significant words of the product title all appear in the campaign name. */
function wordsOverlap(name: string, title: string): boolean {
  const words = title.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  if (words.length === 0) return false;
  const nameWords = new Set(name.split(" "));
  return words.every((w) => nameWords.has(w));
}
