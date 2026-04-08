"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Trophy, Star, User, MoreHorizontal, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Mock performers based on market data
const topPerformers = [
    { id: "1", name: "THYAO", score: 98, avatar: "https://api.dicebear.com/9.x/initials/svg?seed=TH", trend: "+4.2%" },
    { id: "2", name: "EREGL", score: 85, avatar: "https://api.dicebear.com/9.x/initials/svg?seed=ER", trend: "+2.1%" },
    { id: "3", name: "SISE", score: 72, avatar: "https://api.dicebear.com/9.x/initials/svg?seed=SI", trend: "-0.5%" },
    { id: "4", name: "KCHOL", score: 68, avatar: "https://api.dicebear.com/9.x/initials/svg?seed=KC", trend: "+1.8%" },
    { id: "5", name: "ASELS", score: 64, avatar: "https://api.dicebear.com/9.x/initials/svg?seed=AS", trend: "+0.9%" },
];

const barStyles = [
    {
        borderColor: "border-pink-500",
        bgGradient: "bg-linear-to-r from-pink-500/40 via-pink-500/20 to-transparent",
        isDashed: false,
    },
    {
        borderColor: "border-cyan-400",
        bgGradient: "bg-linear-to-r from-cyan-400/30 via-cyan-400/15 to-transparent",
        isDashed: true,
    },
    {
        borderColor: "border-green-400",
        bgGradient: "bg-linear-to-r from-green-400/30 via-green-400/15 to-transparent",
        isDashed: true,
    },
    {
        borderColor: "border-amber-400",
        bgGradient: "bg-linear-to-r from-amber-400/30 via-amber-400/15 to-transparent",
        isDashed: true,
    },
    {
        borderColor: "border-purple-400",
        bgGradient: "bg-linear-to-r from-purple-400/30 via-purple-400/15 to-transparent",
        isDashed: true,
    },
];

export function TopPerformers() {
    const maxScore = 100;

    return (
        <div className="bg-card text-card-foreground rounded-lg border w-full lg:w-[332px] shrink-0">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <Trophy className="size-4 text-primary" />
                    <h3 className="font-medium text-sm sm:text-base uppercase tracking-widest text-[11px]">En İyi Varlıklar</h3>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 text-xs font-normal">
                        <DropdownMenuItem>Tümünü Gör</DropdownMenuItem>
                        <DropdownMenuItem>Skora Göre Sırala</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Ayarlar</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="p-4 space-y-4">
                {topPerformers.map((performer, index) => {
                    const style = barStyles[index % barStyles.length];
                    const progressWidth = (performer.score / maxScore) * 100;
                    const isFirst = index === 0;

                    return (
                        <div key={performer.id} className="flex items-center gap-3">
                            <Avatar className="size-10 border border-border/50">
                                <AvatarImage src={performer.avatar} />
                                <AvatarFallback className="text-[10px] uppercase font-bold">
                                    {performer.name.substring(0, 2)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 relative">
                                <div
                                    className={cn(
                                        "relative h-[42px] rounded-lg border overflow-hidden",
                                        style.borderColor,
                                        style.isDashed ? "border-dashed" : "border-solid"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "absolute inset-0 transition-all duration-300",
                                            style.bgGradient
                                        )}
                                        style={{
                                            width: `${Math.max(progressWidth, 30)}%`,
                                        }}
                                    />
                                    <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-between w-full pr-4">
                                        <div className="flex items-center gap-2 bg-card/90 dark:bg-neutral-900/90 border border-border rounded-md px-2 py-1">
                                            {isFirst ? (
                                                <Star className="size-3 text-amber-400 fill-amber-400" />
                                            ) : (
                                                <TrendingUp className="size-3 text-muted-foreground" />
                                            )}
                                            <span
                                                className={cn(
                                                    "text-xs font-mono",
                                                    isFirst ? "text-foreground" : "text-muted-foreground"
                                                )}
                                            >
                                                {performer.score}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-bold font-mono text-muted-foreground/50">{performer.name}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
