"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { usePortfolioStore } from "@/store/portfolio-store";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreatePortfolioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePortfolioModal({ open, onOpenChange }: CreatePortfolioModalProps) {
  const createPortfolio = usePortfolioStore((state) => state.createPortfolio);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await createPortfolio(name.trim());
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create portfolio:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-[1.75rem] border bg-card p-0 shadow-none sm:max-w-[480px]">
        <div className="p-6 sm:p-7">
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Yeni Sepet</div>
            <DialogTitle className="mt-2 text-2xl font-medium tracking-tight">Sepet oluştur</DialogTitle>
            <DialogDescription className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Varlıklarını ayrı bir strateji veya tema altında toplamak için yeni sepet tanımla.
            </DialogDescription>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Sepet adı
              </Label>
              <Input
                id="name"
                placeholder="Örn: Temettü Sepeti"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 rounded-2xl border bg-background px-4 text-sm"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Açıklama
              </Label>
              <Input
                id="description"
                placeholder="İstersen kısa bir not ekleyebilirsin"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="h-12 rounded-2xl border bg-background px-4 text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 flex-1 rounded-2xl">
                Vazgeç
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="h-11 flex-[1.4] rounded-2xl border border-border/70 bg-background text-foreground shadow-none hover:bg-muted/40"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    <span>Oluşturuluyor</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Plus className="size-4" />
                    <span>Sepet oluştur</span>
                  </div>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
