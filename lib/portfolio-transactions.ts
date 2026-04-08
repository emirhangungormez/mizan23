import type {
  Portfolio,
  PortfolioAsset,
  PortfolioTargetMode,
  PortfolioTargetProfile,
  PortfolioAssetType,
  PortfolioTransactionType,
  Transaction,
} from "@/services/portfolio.service";

const EPSILON = 1e-8;

type CanonicalTransaction = Transaction & {
  type: PortfolioTransactionType;
  price: number;
  date: string;
  currency: string;
  quantity: number;
  asset_type?: PortfolioAssetType;
};

type Lot = {
  quantity: number;
  price: number;
  date: string;
  currency: string;
  assetType?: PortfolioAssetType;
  assetName?: string;
  note?: string;
};

type PositionSeed = {
  symbol: string;
  weight?: number;
  type?: PortfolioAssetType;
  currency?: string;
  name?: string;
  targetProfile?: PortfolioTargetProfile;
  targetMode?: PortfolioTargetMode;
  targetReturnPct?: number;
};

function createId(seed: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `tx_${seed}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortTransactions(transactions: CanonicalTransaction[]): CanonicalTransaction[] {
  return [...transactions].sort((left, right) => {
    const dateDiff = new Date(left.date).getTime() - new Date(right.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    if (left.type === right.type) return left.id.localeCompare(right.id);
    return left.type === "buy" ? -1 : 1;
  });
}

function approxEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function toCanonicalTransaction(
  tx: Transaction,
  fallback?: PositionSeed
): CanonicalTransaction[] {
  if (tx.type && (tx.type === "buy" || tx.type === "sell") && tx.price != null && tx.date) {
    return [
      {
        ...tx,
        id: tx.id || createId(`${tx.symbol}_${tx.type}_${tx.date}`),
        type: tx.type,
        price: tx.price,
        date: tx.date,
        quantity: tx.quantity || 0,
        currency: tx.currency || fallback?.currency || "TRY",
        asset_type: tx.asset_type || fallback?.type,
      },
    ];
  }

  if (tx.sell_price != null && tx.sell_date) {
    const legacyBuyId = tx.linked_transaction_id || `${tx.id}-legacy-buy`;

    return [
      {
        id: legacyBuyId,
        symbol: tx.symbol,
        type: "buy",
        quantity: tx.quantity || 0,
        price: tx.buy_price || 0,
        date: tx.buy_date || tx.sell_date,
        currency: tx.currency || fallback?.currency || "TRY",
        asset_type: tx.asset_type || fallback?.type,
        asset_name: tx.asset_name || fallback?.name,
        hidden: true,
        is_system_generated: true,
        linked_transaction_id: tx.id,
        note: "Migrated opening transaction",
      },
      {
        id: tx.id || createId(`${tx.symbol}_sell_${tx.sell_date}`),
        symbol: tx.symbol,
        type: "sell",
        quantity: tx.quantity || 0,
        price: tx.sell_price,
        date: tx.sell_date,
        currency: tx.currency || fallback?.currency || "TRY",
        asset_type: tx.asset_type || fallback?.type,
        asset_name: tx.asset_name || fallback?.name,
        note: tx.note,
        realized_profit_loss: tx.realized_profit_loss ?? tx.profit_loss ?? null,
        realized_profit_loss_pct: tx.realized_profit_loss_pct ?? tx.profit_loss_pct ?? null,
      },
    ];
  }

  return [];
}

function aggregateOpenLots(transactions: CanonicalTransaction[]): Record<string, { quantity: number }> {
  const lotsBySymbol = new Map<string, Lot[]>();

  for (const tx of sortTransactions(transactions)) {
    const lots = lotsBySymbol.get(tx.symbol) || [];

    if (tx.type === "buy") {
      lots.push({
        quantity: tx.quantity,
        price: tx.price,
        date: tx.date,
        currency: tx.currency,
        assetType: tx.asset_type,
        assetName: tx.asset_name,
        note: tx.note,
      });
      lotsBySymbol.set(tx.symbol, lots);
      continue;
    }

    let remaining = tx.quantity;
    while (remaining > EPSILON && lots.length > 0) {
      const currentLot = lots[0];
      const consumed = Math.min(currentLot.quantity, remaining);

      currentLot.quantity -= consumed;
      remaining -= consumed;

      if (currentLot.quantity <= EPSILON) {
        lots.shift();
      }
    }

    lotsBySymbol.set(tx.symbol, lots);
  }

  const summary: Record<string, { quantity: number }> = {};

  for (const [symbol, lots] of lotsBySymbol.entries()) {
    const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    summary[symbol] = { quantity };
  }

  return summary;
}

function reconcileSnapshotAssets(
  transactions: CanonicalTransaction[],
  assets: PortfolioAsset[]
): CanonicalTransaction[] {
  const symbolsWithTransactions = new Set(
    transactions
      .map((tx) => tx.symbol)
      .filter((symbol): symbol is string => Boolean(symbol))
  );

  const snapshotMap = new Map<string, PositionSeed>(
    assets.map((asset) => [
      asset.symbol,
      {
        symbol: asset.symbol,
        weight: asset.weight,
        type: asset.type,
        currency: asset.currency,
        name: asset.name,
        targetProfile: asset.target_profile,
        targetMode: asset.target_mode,
        targetReturnPct: asset.target_return_pct,
      },
    ])
  );

  const openLots = aggregateOpenLots(transactions);
  const reconciled = [...transactions];

  for (const asset of assets) {
    // Snapshot assets are only a migration/import fallback. Once a symbol has
    // explicit transaction history, that history must be the single source of
    // truth so fully sold positions do not get re-opened from stale asset rows.
    if (symbolsWithTransactions.has(asset.symbol)) {
      continue;
    }

    const liveQuantity = openLots[asset.symbol]?.quantity || 0;
    const diffQuantity = (asset.quantity || 0) - liveQuantity;

    if (diffQuantity > EPSILON) {
      reconciled.push({
        id: `snapshot:${asset.symbol}:${asset.purchase_date || "open"}:buy`,
        symbol: asset.symbol,
        type: "buy",
        quantity: diffQuantity,
        price: asset.avg_price || asset.avgPrice || 0,
        date: asset.purchase_date || new Date().toISOString(),
        currency: asset.currency || "TRY",
        asset_type: asset.type,
        asset_name: asset.name,
        note: "Imported opening transaction",
        is_system_generated: true,
      });
      continue;
    }

    if (diffQuantity < -EPSILON) {
      reconciled.push({
        id: `snapshot:${asset.symbol}:${asset.purchase_date || "open"}:sell`,
        symbol: asset.symbol,
        type: "sell",
        quantity: Math.abs(diffQuantity),
        price: asset.avg_price || asset.avgPrice || 0,
        date: asset.purchase_date || new Date().toISOString(),
        currency: asset.currency || "TRY",
        asset_type: asset.type,
        asset_name: asset.name,
        note: "Imported reconciliation sell",
        hidden: true,
        is_system_generated: true,
      });
    }
  }

  for (const tx of reconciled) {
    const fallback = snapshotMap.get(tx.symbol);
    tx.asset_type ||= fallback?.type;
    tx.currency ||= fallback?.currency || "TRY";
  }

  return reconciled;
}

export function derivePortfolioState(
  transactions: Transaction[],
  fallbackAssets: PortfolioAsset[] = []
): { assets: PortfolioAsset[]; transactions: CanonicalTransaction[] } {
  const snapshotMap = new Map<string, PositionSeed>(
    fallbackAssets.map((asset) => [
      asset.symbol,
      {
        symbol: asset.symbol,
        weight: asset.weight,
        type: asset.type,
        currency: asset.currency,
        name: asset.name,
        targetProfile: asset.target_profile,
        targetMode: asset.target_mode,
        targetReturnPct: asset.target_return_pct,
      },
    ])
  );

  const canonicalBase = transactions.flatMap((tx) => toCanonicalTransaction(tx, snapshotMap.get(tx.symbol)));
  const canonical = reconcileSnapshotAssets(canonicalBase, fallbackAssets);
  const ordered = sortTransactions(canonical);

  const lotsBySymbol = new Map<string, Lot[]>();
  const transactionsWithPnl: CanonicalTransaction[] = [];

  for (const tx of ordered) {
    const lots = lotsBySymbol.get(tx.symbol) || [];

    if (tx.type === "buy") {
      lots.push({
        quantity: tx.quantity,
        price: tx.price,
        date: tx.date,
        currency: tx.currency,
        assetType: tx.asset_type,
        assetName: tx.asset_name,
        note: tx.note,
      });
      lotsBySymbol.set(tx.symbol, lots);
      transactionsWithPnl.push(tx);
      continue;
    }

    let remaining = tx.quantity;
    let consumedQuantity = 0;
    let consumedCost = 0;
    let firstConsumedDate: string | undefined;

    while (remaining > EPSILON && lots.length > 0) {
      const currentLot = lots[0];
      const consumed = Math.min(currentLot.quantity, remaining);

      consumedQuantity += consumed;
      consumedCost += consumed * currentLot.price;
      firstConsumedDate ||= currentLot.date;

      currentLot.quantity -= consumed;
      remaining -= consumed;

      if (currentLot.quantity <= EPSILON) {
        lots.shift();
      }
    }

    const proceeds = tx.quantity * tx.price;
    const computedProfit = consumedQuantity > 0 ? proceeds - consumedCost : null;
    const computedProfitPct = consumedCost > 0 && computedProfit != null ? (computedProfit / consumedCost) * 100 : null;

    lotsBySymbol.set(tx.symbol, lots);
    transactionsWithPnl.push({
      ...tx,
      realized_profit_loss:
        tx.realized_profit_loss ?? tx.profit_loss ?? computedProfit,
      realized_profit_loss_pct:
        tx.realized_profit_loss_pct ?? tx.profit_loss_pct ?? computedProfitPct,
      linked_transaction_id: tx.linked_transaction_id,
      buy_date: tx.buy_date || firstConsumedDate,
      buy_price:
        tx.buy_price ||
        (consumedQuantity > 0 ? consumedCost / consumedQuantity : undefined),
      sell_date: tx.sell_date || tx.date,
      sell_price: tx.sell_price || tx.price,
      profit_loss:
        tx.profit_loss ?? tx.realized_profit_loss ?? computedProfit ?? undefined,
      profit_loss_pct:
        tx.profit_loss_pct ?? tx.realized_profit_loss_pct ?? computedProfitPct ?? undefined,
    });
  }

  const assetList: PortfolioAsset[] = [];

  for (const [symbol, lots] of lotsBySymbol.entries()) {
    const totalQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    if (totalQuantity <= EPSILON) continue;

    const totalCost = lots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
    const latestLot = lots[lots.length - 1];
    const earliestLot = lots[0];
    const snapshot = snapshotMap.get(symbol);

    assetList.push({
      symbol,
      type: latestLot.assetType || snapshot?.type || "stock",
      quantity: totalQuantity,
      avg_price: totalQuantity > 0 ? totalCost / totalQuantity : 0,
      avgPrice: totalQuantity > 0 ? totalCost / totalQuantity : 0,
      purchase_date: earliestLot.date,
      currency: latestLot.currency || snapshot?.currency || "TRY",
      weight: snapshot?.weight,
      name: latestLot.assetName || snapshot?.name,
      asset_type: latestLot.assetType || snapshot?.type || "stock",
      notes: latestLot.note,
      target_profile: snapshot?.targetProfile,
      target_mode: snapshot?.targetMode,
      target_return_pct: snapshot?.targetReturnPct,
    });
  }

  return {
    assets: assetList,
    transactions: transactionsWithPnl,
  };
}

export function normalizePortfolio(portfolio: Portfolio): Portfolio {
  const derived = derivePortfolioState(portfolio.transactions || [], portfolio.assets || []);

  return {
    ...portfolio,
    assets: derived.assets.map((asset) => ({
      ...asset,
      avgPrice: asset.avg_price || asset.avgPrice || 0,
    })),
    transactions: derived.transactions,
  };
}

export function createTransactionInput(input: {
  symbol: string;
  type: PortfolioTransactionType;
  quantity: number;
  price: number;
  date: string;
  currency?: string;
  assetType?: PortfolioAssetType;
  assetName?: string;
  note?: string;
  fee?: number;
  id?: string;
}): CanonicalTransaction {
  return {
    id: input.id || createId(`${input.symbol}_${input.type}_${input.date}`),
    symbol: input.symbol,
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    date: input.date,
    currency: input.currency || "TRY",
    asset_type: input.assetType,
    asset_name: input.assetName,
    note: input.note,
    fee: input.fee,
  };
}

export function deleteSymbolTransactions(
  transactions: Transaction[],
  symbol: string
): Transaction[] {
  return transactions.filter((tx) => tx.symbol !== symbol);
}

export function deleteTransactionById(
  transactions: Transaction[],
  transactionId: string
): Transaction[] {
  return transactions.filter(
    (tx) => tx.id !== transactionId && tx.linked_transaction_id !== transactionId
  );
}

export function upsertTransaction(
  transactions: Transaction[],
  nextTransaction: CanonicalTransaction
): Transaction[] {
  const existingIndex = transactions.findIndex((tx) => tx.id === nextTransaction.id);
  if (existingIndex === -1) return [...transactions, nextTransaction];

  return transactions.map((tx) => (tx.id === nextTransaction.id ? { ...tx, ...nextTransaction } : tx));
}

export function getEarliestTransactionDate(transactions: Transaction[] = []): string | null {
  const visibleDates = transactions
    .filter((tx) => !tx.hidden)
    .map((tx) => tx.date || tx.buy_date || tx.sell_date)
    .filter((value): value is string => Boolean(value))
    .sort();

  return visibleDates[0] || null;
}

export function getTargetWeightMap(assets: PortfolioAsset[]): Record<string, number> {
  const explicitWeights = assets
    .map((asset) => ({ symbol: asset.symbol, weight: asset.weight || 0 }))
    .filter((asset) => asset.weight > 0);

  const totalExplicit = explicitWeights.reduce((sum, asset) => sum + asset.weight, 0);
  if (explicitWeights.length === assets.length && !approxEqual(totalExplicit, 0)) {
    return Object.fromEntries(explicitWeights.map((asset) => [asset.symbol, (asset.weight / totalExplicit) * 100]));
  }

  const equalWeight = assets.length > 0 ? 100 / assets.length : 0;
  return Object.fromEntries(assets.map((asset) => [asset.symbol, equalWeight]));
}
