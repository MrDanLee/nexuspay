import { InventoryRepository } from '../ports/InventoryRepository';

export interface StockLevel {
  sku: string;
  availableQty: number;
  reservedQty: number;
  found: boolean;
}

/**
 * Bulk stock availability query.
 *
 * Accepts a list of SKUs and returns the available/reserved quantities
 * for each, preserving the requested order. Unknown SKUs are reported
 * with found=false and zero quantities rather than being omitted, so the
 * caller can rely on a one-to-one mapping with its request.
 */
export class CheckStockHandler {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async execute(skus: string[]): Promise<StockLevel[]> {
    const found = await this.inventoryRepository.findBySkus(skus);
    const bySku = new Map(found.map((inv) => [inv.sku, inv]));

    return skus.map((sku) => {
      const inv = bySku.get(sku);
      return {
        sku,
        availableQty: inv?.availableQty ?? 0,
        reservedQty: inv?.reservedQty ?? 0,
        found: inv !== undefined,
      };
    });
  }
}
