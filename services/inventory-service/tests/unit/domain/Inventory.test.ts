import { ValidationError, ConflictError } from '@nexuspay/shared';

import { Inventory } from '../../../src/domain/entities/Inventory';

const createInventory = (overrides = {}) =>
  new Inventory({
    productId: 'prod-1',
    sku: 'LAPTOP-PRO-15',
    availableQty: 10,
    reservedQty: 0,
    ...overrides,
  });

describe('Inventory', () => {
  describe('creation', () => {
    it('creates with available and reserved counters', () => {
      const inv = createInventory({ availableQty: 5, reservedQty: 2 });
      expect(inv.availableQty).toBe(5);
      expect(inv.reservedQty).toBe(2);
      expect(inv.totalQty).toBe(7);
      expect(inv.version).toBe(1);
    });

    it('defaults reservedQty to zero', () => {
      const inv = new Inventory({ productId: 'p', sku: 'S', availableQty: 3 });
      expect(inv.reservedQty).toBe(0);
    });

    it('throws when availableQty is negative', () => {
      expect(() => createInventory({ availableQty: -1 })).toThrow(ValidationError);
    });

    it('throws when availableQty is not an integer', () => {
      expect(() => createInventory({ availableQty: 1.5 })).toThrow(ValidationError);
    });

    it('throws when SKU is missing', () => {
      expect(() => createInventory({ sku: '' })).toThrow(ValidationError);
    });
  });

  describe('reserve', () => {
    it('reserves when stock is sufficient', () => {
      const inv = createInventory({ availableQty: 10 });
      inv.reserve(3);

      expect(inv.availableQty).toBe(7);
      expect(inv.reservedQty).toBe(3);
      expect(inv.version).toBe(2);
    });

    it('reserves the exact remaining stock', () => {
      const inv = createInventory({ availableQty: 4 });
      inv.reserve(4);

      expect(inv.availableQty).toBe(0);
      expect(inv.reservedQty).toBe(4);
    });

    it('throws ConflictError when stock is insufficient', () => {
      const inv = createInventory({ availableQty: 2 });
      expect(() => inv.reserve(3)).toThrow(ConflictError);
    });

    it('does not mutate counters on a failed reserve', () => {
      const inv = createInventory({ availableQty: 2 });
      expect(() => inv.reserve(3)).toThrow();
      expect(inv.availableQty).toBe(2);
      expect(inv.reservedQty).toBe(0);
    });

    it('throws ValidationError for non-positive quantity', () => {
      const inv = createInventory();
      expect(() => inv.reserve(0)).toThrow(ValidationError);
      expect(() => inv.reserve(-1)).toThrow(ValidationError);
    });
  });

  describe('release', () => {
    it('restores available quantity', () => {
      const inv = createInventory({ availableQty: 6, reservedQty: 4 });
      inv.release(3);

      expect(inv.availableQty).toBe(9);
      expect(inv.reservedQty).toBe(1);
      expect(inv.version).toBe(2);
    });

    it('reserve then release returns to the original state', () => {
      const inv = createInventory({ availableQty: 10 });
      inv.reserve(5);
      inv.release(5);

      expect(inv.availableQty).toBe(10);
      expect(inv.reservedQty).toBe(0);
    });

    it('throws when releasing more than is reserved', () => {
      const inv = createInventory({ availableQty: 6, reservedQty: 2 });
      expect(() => inv.release(3)).toThrow(ValidationError);
    });

    it('throws ValidationError for non-positive quantity', () => {
      const inv = createInventory({ reservedQty: 5 });
      expect(() => inv.release(0)).toThrow(ValidationError);
      expect(() => inv.release(-2)).toThrow(ValidationError);
    });
  });
});
