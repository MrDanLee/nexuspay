import { Money } from '../../../src/domain/Money';

describe('Money', () => {
  describe('creation', () => {
    it('should create from number', () => {
      const money = Money.of(10.5, 'USD');
      expect(money.toFixed()).toBe('10.50');
      expect(money.currency).toBe('USD');
    });

    it('should create from string', () => {
      const money = Money.of('99.99', 'EUR');
      expect(money.toFixed()).toBe('99.99');
      expect(money.currency).toBe('EUR');
    });

    it('should uppercase currency', () => {
      const money = Money.of(10, 'usd');
      expect(money.currency).toBe('USD');
    });

    it('should create zero', () => {
      const money = Money.zero('USD');
      expect(money.isZero()).toBe(true);
    });

    it('should throw for invalid currency code', () => {
      expect(() => Money.of(10, 'US')).toThrow('Invalid currency code');
      expect(() => Money.of(10, '')).toThrow('Invalid currency code');
      expect(() => Money.of(10, 'USDX')).toThrow('Invalid currency code');
    });

    it('should throw for NaN amount', () => {
      expect(() => Money.of(NaN, 'USD')).toThrow('Invalid monetary amount');
    });
  });

  describe('arithmetic', () => {
    it('should add two amounts correctly', () => {
      const a = Money.of(0.1, 'USD');
      const b = Money.of(0.2, 'USD');
      const result = a.add(b);

      expect(result.toFixed()).toBe('0.30');
    });

    it('should subtract correctly', () => {
      const a = Money.of(100, 'USD');
      const b = Money.of(30.5, 'USD');
      const result = a.subtract(b);

      expect(result.toFixed()).toBe('69.50');
    });

    it('should multiply by quantity', () => {
      const price = Money.of(29.99, 'USD');
      const total = price.multiply(3);

      expect(total.toFixed()).toBe('89.97');
    });

    it('should throw on currency mismatch for add', () => {
      const usd = Money.of(10, 'USD');
      const eur = Money.of(10, 'EUR');

      expect(() => usd.add(eur)).toThrow('Currency mismatch');
    });

    it('should throw on currency mismatch for subtract', () => {
      const usd = Money.of(10, 'USD');
      const eur = Money.of(10, 'EUR');

      expect(() => usd.subtract(eur)).toThrow('Currency mismatch');
    });

    it('should not mutate original instances', () => {
      const a = Money.of(10, 'USD');
      const b = Money.of(5, 'USD');
      const result = a.add(b);

      expect(a.toFixed()).toBe('10.00');
      expect(b.toFixed()).toBe('5.00');
      expect(result.toFixed()).toBe('15.00');
    });
  });

  describe('comparisons', () => {
    it('should check equality', () => {
      const a = Money.of(10, 'USD');
      const b = Money.of(10, 'USD');
      const c = Money.of(20, 'USD');

      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });

    it('should check greaterThan', () => {
      const a = Money.of(20, 'USD');
      const b = Money.of(10, 'USD');

      expect(a.greaterThan(b)).toBe(true);
      expect(b.greaterThan(a)).toBe(false);
    });

    it('should check lessThan', () => {
      const a = Money.of(5, 'USD');
      const b = Money.of(10, 'USD');

      expect(a.lessThan(b)).toBe(true);
      expect(b.lessThan(a)).toBe(false);
    });

    it('should check positive and negative', () => {
      expect(Money.of(10, 'USD').isPositive()).toBe(true);
      expect(Money.of(-5, 'USD').isNegative()).toBe(true);
      expect(Money.of(0, 'USD').isPositive()).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const money = Money.of(49.99, 'USD');
      expect(money.toJSON()).toEqual({ amount: '49.99', currency: 'USD' });
    });

    it('should deserialize from JSON', () => {
      const json = { amount: '49.99', currency: 'USD' };
      const money = Money.fromJSON(json);

      expect(money.toFixed()).toBe('49.99');
      expect(money.currency).toBe('USD');
    });

    it('should produce readable toString', () => {
      const money = Money.of(1299.99, 'EUR');
      expect(money.toString()).toBe('EUR 1299.99');
    });

    it('should survive JSON round-trip without precision loss', () => {
      const original = Money.of('0.1', 'USD').add(Money.of('0.2', 'USD'));
      const json = original.toJSON();
      const restored = Money.fromJSON(json);

      expect(restored.equals(original)).toBe(true);
    });
  });
});