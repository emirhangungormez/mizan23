"use client";

import * as React from "react";
import { Check, Plus, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFavoritesStore, type FavoriteMarket } from "@/store/favorites-store";
import { useUserStore } from "@/store/user-store";

interface FavoriteListPickerProps {
  symbol: string;
  name?: string;
  market: FavoriteMarket;
  className?: string;
  size?: "icon-sm" | "icon" | "icon-lg";
}

export function FavoriteListPicker({
  symbol,
  name,
  market,
  className,
  size = "icon-sm",
}: FavoriteListPickerProps) {
  const currentUser = useUserStore((state) => state.currentUser);
  const lists = useFavoritesStore((state) => state.lists);
  const createList = useFavoritesStore((state) => state.createList);
  const toggleItemInList = useFavoritesStore((state) => state.toggleItemInList);

  const [newListName, setNewListName] = React.useState("");
  const [error, setError] = React.useState("");

  const userLists = React.useMemo(
    () => lists.filter((list) => list.userId === currentUser?.id),
    [currentUser?.id, lists]
  );

  const containingCount = React.useMemo(
    () => userLists.filter((list) => list.items.some((item) => item.symbol === symbol)).length,
    [symbol, userLists]
  );

  const isInAnyList = containingCount > 0;

  const toggleInList = React.useCallback(
    (listId: string) => {
      const added = toggleItemInList(listId, { symbol, name, market });
      toast.success(
        added ? `${symbol} favori listesine eklendi.` : `${symbol} favori listesinden çıkarıldı.`
      );
    },
    [market, name, symbol, toggleItemInList]
  );

  const handleCreateList = React.useCallback(() => {
    if (!currentUser) return;

    const listId = createList(currentUser.id, newListName);
    if (!listId) {
      setError("Liste adı girin.");
      return;
    }

    toggleItemInList(listId, { symbol, name, market });
    setNewListName("");
    setError("");
    toast.success(`${symbol} için yeni favori listesi oluşturuldu.`);
  }, [createList, currentUser, market, name, newListName, symbol, toggleItemInList]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size}
          className={cn(
            "text-muted-foreground hover:text-amber-500",
            isInAnyList && "text-amber-500",
            className
          )}
          title={isInAnyList ? `${containingCount} listede kayıtlı` : "Favori listesine ekle"}
        >
          <Star className={cn("size-4", isInAnyList && "fill-amber-400 text-amber-500")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Favori listeleri</DropdownMenuLabel>
        {userLists.length > 0 ? (
          <>
            {userLists.map((list) => {
              const checked = list.items.some((item) => item.symbol === symbol);
              return (
                <DropdownMenuCheckboxItem
                  key={list.id}
                  checked={checked}
                  onCheckedChange={() => toggleInList(list.id)}
                  className="flex items-center justify-between"
                >
                  <span className="truncate">{list.name}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {list.items.length}
                  </span>
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        ) : (
          <div className="px-2 py-2 text-sm text-muted-foreground">Henüz favori listesi yok.</div>
        )}

        <div className="space-y-2 px-2 py-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Yeni liste oluştur
          </div>
          <Input
            value={newListName}
            onChange={(event) => {
              setNewListName(event.target.value);
              if (error) setError("");
            }}
            placeholder="Örn. Yakın takip"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleCreateList();
              }
            }}
          />
          {error ? <div className="text-xs text-rose-600">{error}</div> : null}
          <Button type="button" size="sm" className="w-full" onClick={handleCreateList}>
            {userLists.length > 0 ? <Plus className="size-4" /> : <Check className="size-4" />}
            Liste oluştur ve ekle
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
