/**
 * Mathematical precision utilities for financial calculations.
 * Avoids common floating-point errors (e.g., 0.1 + 0.2 = 0.30000000000000004).
 */

export const PRECISION = 8;
const SCALE = Math.pow(10, PRECISION);

export const MathUtils = {
    /**
     * Rounds a number to a specific decimal place.
     */
    round(value: number, decimals: number = 2): number {
        const factor = Math.pow(10, decimals);
        return Math.round((value + Number.EPSILON) * factor) / factor;
    },

    /**
     * Precise addition.
     */
    add(a: number, b: number): number {
        return (Math.round(a * SCALE) + Math.round(b * SCALE)) / SCALE;
    },

    /**
     * Precise subtraction.
     */
    sub(a: number, b: number): number {
        return (Math.round(a * SCALE) - Math.round(b * SCALE)) / SCALE;
    },

    /**
     * Precise multiplication.
     */
    mul(a: number, b: number): number {
        return Math.round((a * b) * SCALE) / SCALE;
    },

    /**
     * Precise division.
     */
    div(a: number, b: number): number {
        if (b === 0) return 0;
        return Math.round((a / b) * SCALE) / SCALE;
    },

    /**
     * Calculates total value of assets precisely.
     * @param items Array of { quantity, price }
     */
    sumProducts(items: { quantity: number; price: number }[]): number {
        return items.reduce((acc, item) => {
            const product = this.mul(item.quantity, item.price);
            return this.add(acc, product);
        }, 0);
    },

    /**
     * Financial rounding for money display.
     * Handles different rules for different asset types.
     */
    formatMoney(value: number, currency: string = 'TRY', isCrypto: boolean = false): string {
        const locale = currency === 'USD' ? 'en-US' : 'tr-TR';

        let decimals = 2;
        if (isCrypto) {
            decimals = value < 1 ? 6 : value < 100 ? 4 : 2;
        } else if (currency === 'TRY' && value > 1000) {
            decimals = 0; // Professional BIST look for large TRY amounts
        } else if (currency === 'TRY') {
            decimals = 2;
        }

        return value.toLocaleString(locale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    },

    /**
     * Formats percentages professionally.
     */
    formatPercent(value: number): string {
        const prefix = value > 0 ? '+' : '';
        return `${prefix}${value.toFixed(2)}%`;
    }
};
