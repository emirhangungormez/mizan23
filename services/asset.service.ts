/**
 * Asset Search Service
 * Handles searching for all available assets across markets
 */

function getApiBaseUrl() {
    if (typeof window !== "undefined") {
        return window.location.origin;
    }
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
}

export interface AssetSearchResult {
    symbol: string;
    name: string;
    type: 'stock' | 'forex' | 'crypto' | 'commodity' | 'fund' | 'cash';
    market: string;
    sector?: string;
    category?: string;
    unit?: string;
    price?: number;
    change?: number;
    currency?: string;
}

export interface AssetSearchResponse {
    success: boolean;
    query: string;
    type: string;
    count: number;
    results: AssetSearchResult[];
    error?: string;
}

export interface AssetStats {
    initialized: boolean;
    counts: {
        stocks: number;
        forex: number;
        crypto: number;
        commodities: number;
        funds: number;
        total: number;
    };
}

/**
 * Search for assets by symbol or name
 */
export async function searchAssets(
    query: string,
    type: 'all' | 'indices' | 'fx' | 'crypto' | 'commodities' | 'funds' = 'all',
    limit: number = 20
): Promise<AssetSearchResult[]> {
    try {
        const params = new URLSearchParams({
            query,
            type,
            limit: limit.toString()
        });

        const response = await fetch(`${getApiBaseUrl()}/api/assets/search?${params}`);

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }

        const data: AssetSearchResponse = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Search failed');
        }

        return data.results;
    } catch (error) {
        console.error('Asset search error:', error);
        return [];
    }
}

/**
 * Get asset cache statistics
 */
export async function getAssetStats(): Promise<AssetStats | null> {
    try {
        const response = await fetch(`${getApiBaseUrl()}/api/python/assets/stats`);

        if (!response.ok) {
            throw new Error(`Stats fetch failed: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Asset stats error:', error);
        return null;
    }
}

/**
 * Map asset type from frontend to backend format
 */
export function mapAssetTypeToSearch(frontendType: string): string {
    const typeMap: Record<string, string> = {
        'all': 'all',
        'stock': 'indices',
        'fx': 'fx',
        'crypto': 'crypto',
        'commodity': 'commodities',
        'fund': 'funds',
        'cash': 'fx', // Cash uses forex data
    };

    return typeMap[frontendType] || 'all';
}
