"use client";

import { Badge } from "@/components/ui/badge";

export interface AssetInfo {
    name?: string;
    longName?: string;
    market?: string;
    exchange?: string;
    sector?: string;
    industry?: string;
}

interface AssetHeaderProps {
    info: AssetInfo | null;
    symbol: string;
}

export function AssetHeader({ info, symbol }: AssetHeaderProps) {
    const name = info?.name || info?.longName || symbol;
    const market = info?.market || info?.exchange || "BIST";

    return (
        <div className="flex flex-col">
            <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">{name}</h1>
                <Badge variant="outline" className="font-mono bg-muted/50 text-[10px] h-5 px-1.5">
                    {symbol}
                </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 font-medium">
                <span>{market}</span>
                <span>•</span>
                <span className="text-primary">{info?.sector || info?.industry || "Piyasa Verisi"}</span>
            </div>
        </div>
    );
}
