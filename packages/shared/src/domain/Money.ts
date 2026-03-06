import Decimal from 'decimal.js';

/**
 * Value object representing a monetary amount with currency.
 *
 * Uses Decimal.js to avoid floating-point arithmetic errors
 * that are unacceptable in financial calculations.
 *
 * Example:
 *   0.1 + 0.2 === 0.30000000000000004  // JavaScript float
 *   Money.of(0.1, 'USD').add(Money.of(0.2, 'USD')).amount  // "0.30"
 *
 * Money is immutable — all operations return new instances.
 */
export class Money {
  readonly amount: Decimal;
  readonly currency: string;

  private constructor(amount: Decimal, currency: string) {
    this.amount = amount;
    this.currency = currency.toUpperCase();
  }

  /**
   * Create a Money instance.
   * @param amount - Numeric value (number, string, or Decimal)
   * @param currency - ISO 4217 currency code (e.g., "USD", "EUR")
   */
  static of(amount: number | string | Decimal, currency: string): Money {
    if (!currency || currency.length !== 3) {
      throw new Error(`Invalid currency code: "${currency}". Must be 3-letter ISO 4217.`);
    }

    const decimal = new Decimal(amount);

    if (decimal.isNaN()) {
      throw new Error(`Invalid monetary amount: "${amount}"`);
    }

    return new Money(decimal, currency);
  }

  /** Create zero amount in the given currency */
  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  /** Add two monetary amounts (must be same currency) */
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  /** Subtract a monetary amount (must be same currency) */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  /** Multiply by a quantity (e.g., unit price × quantity) */
  multiply(factor: number | string | Decimal): Money {
    return new Money(this.amount.times(new Decimal(factor)), this.currency);
  }

  /** Check if amount is zero */
  isZero(): boolean {
    return this.amount.isZero();
  }

  /** Check if amount is positive */
  isPositive(): boolean {
    return this.amount.greaterThan(0);
  }

  /** Check if amount is negative */
  isNegative(): boolean {
    return this.amount.lessThan(0);
  }

  /** Check equality (amount and currency) */
  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  /** Check if this amount is greater than another */
  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThan(other.amount);
  }

  /** Check if this amount is less than another */
  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lessThan(other.amount);
  }

  /**
   * Convert to a fixed decimal string suitable for database storage.
   * Default 2 decimal places for most currencies.
   */
  toFixed(decimals = 2): string {
    return this.amount.toFixed(decimals);
  }

  /** Convert to number (use with caution — only for display/serialization) */
  toNumber(): number {
    return this.amount.toNumber();
  }

  /** Serialize for JSON/database storage */
  toJSON(): { amount: string; currency: string } {
    return {
      amount: this.toFixed(),
      currency: this.currency,
    };
  }

  /** Human-readable string representation */
  toString(): string {
    return `${this.currency} ${this.toFixed()}`;
  }

  /** Reconstruct from JSON */
  static fromJSON(json: { amount: string; currency: string }): Money {
    return Money.of(json.amount, json.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: cannot operate on ${this.currency} and ${other.currency}`,
      );
    }
  }
}