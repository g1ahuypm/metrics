/** /products/15229049339979 for gid://shopify/Product/15229049339979 */
export function productHref(productId: string): string {
  return `/products/${productId.split("/").pop()}`;
}

export function productIdFromParam(param: string): string | null {
  return /^\d+$/.test(param) ? `gid://shopify/Product/${param}` : null;
}
