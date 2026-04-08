"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Check, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useUserStore, type User } from "@/store/user-store";

const ROLE_LABELS: Record<User["role"], string> = {
  admin: "Yönetici",
  user: "Yatırımcı",
  guest: "Misafir",
};

export function ProfileSelector() {
  const { users, selectUser, addUser, removeUser } = useUserStore();
  const [isManaging, setIsManaging] = React.useState(false);
  const [isAdding, setIsAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [error, setError] = React.useState("");

  const handleCreateUser = React.useCallback(() => {
    const trimmedName = newName.trim();

    if (!trimmedName) {
      setError("Yeni yatırımcı için bir isim yazın.");
      return;
    }

    const duplicate = users.some(
      (user) => user.name.trim().toLocaleLowerCase("tr-TR") === trimmedName.toLocaleLowerCase("tr-TR")
    );

    if (duplicate) {
      setError("Bu isimde bir profil zaten var.");
      return;
    }

    addUser(trimmedName);
    setNewName("");
    setError("");
    setIsAdding(false);
  }, [addUser, newName, users]);

  const handleDeleteUser = React.useCallback((userId: string) => {
    removeUser(userId);
  }, [removeUser]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background animate-in fade-in duration-500">
      <div className="w-full max-w-5xl px-6">
        <div className="text-center space-y-10">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Kim İşlem Yapıyor?</h1>
            <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">
              İşleme başlayacak profili seçin. İsterseniz bu ekrandan yeni yatırımcı ekleyebilir ya da
              yönetim modunda mevcut profilleri silebilirsiniz.
            </p>
          </div>

          <div className="flex flex-wrap items-start justify-center gap-6 md:gap-10">
            {users.map((user) => (
              <motion.div
                key={user.id}
                whileHover={{ scale: isManaging ? 1 : 1.06 }}
                whileTap={{ scale: isManaging ? 1 : 0.97 }}
                className="relative"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!isManaging) {
                      selectUser(user.id);
                    }
                  }}
                  className={cn(
                    "group flex flex-col items-center gap-4 outline-none",
                    isManaging ? "cursor-default" : "cursor-pointer"
                  )}
                >
                  <div
                    className={cn(
                      "relative flex size-24 items-center justify-center rounded-lg border-2 border-transparent bg-muted transition-all duration-300 md:size-32",
                      isManaging
                        ? "border-border/70 bg-muted/70"
                        : "group-hover:border-primary group-hover:bg-primary/10"
                    )}
                  >
                    {user.avatar ? (
                      <Image
                        src={user.avatar}
                        alt={user.name}
                        width={128}
                        height={128}
                        className="size-full rounded-lg object-cover"
                      />
                    ) : (
                      <span
                        className={cn(
                          "text-4xl font-bold text-muted-foreground transition-colors",
                          isManaging ? "text-foreground" : "group-hover:text-primary"
                        )}
                      >
                        {user.name.substring(0, 1).toLocaleUpperCase("tr-TR")}
                      </span>
                    )}

                    {isManaging && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteUser(user.id);
                        }}
                        disabled={users.length <= 1}
                        className="absolute -right-2 -top-2 inline-flex size-8 items-center justify-center rounded-full border border-rose-200 bg-background text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title={users.length <= 1 ? "En az bir profil kalmalı" : `${user.name} profilini sil`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1 text-center">
                    <div className="text-xl font-medium text-foreground md:text-2xl">{user.name}</div>
                    <div className="text-sm text-muted-foreground">{ROLE_LABELS[user.role]}</div>
                  </div>
                </button>
              </motion.div>
            ))}

            <motion.button
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.97 }}
              className="group flex flex-col items-center gap-4 outline-none"
              onClick={() => {
                setIsAdding(true);
                setError("");
              }}
            >
              <div className="flex size-24 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-transparent transition-all duration-300 group-hover:border-primary group-hover:bg-primary/5 md:size-32">
                <Plus className="size-10 text-muted-foreground/50 transition-colors group-hover:text-primary" />
              </div>
              <span className="text-xl font-medium text-muted-foreground/70 transition-colors group-hover:text-foreground md:text-2xl">
                Profil Ekle
              </span>
            </motion.button>
          </div>

          {(isAdding || isManaging) && (
            <div className="mx-auto w-full max-w-xl rounded-2xl border bg-card/70 p-5 text-left shadow-sm backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <label htmlFor="new-profile-name" className="text-sm font-medium text-foreground">
                    Yeni yatırımcı adı
                  </label>
                  <Input
                    id="new-profile-name"
                    value={newName}
                    onChange={(event) => {
                      setNewName(event.target.value);
                      if (error) setError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleCreateUser();
                      }
                    }}
                    placeholder="Örn. Uzun Vade Portföyü"
                    autoFocus={isAdding}
                  />
                  {error ? (
                    <p className="text-sm text-rose-600">{error}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Her profil ayrı tercih ve işlem akışı için kullanılabilir.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" onClick={handleCreateUser}>
                    <Check className="size-4" />
                    Ekle
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAdding(false);
                      setNewName("");
                      setError("");
                    }}
                  >
                    <X className="size-4" />
                    Vazgeç
                  </Button>
                </div>
              </div>

              {isManaging && (
                <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                  Yönetim modu açık. Profil kutularındaki çöp kutusu ile yatırımcı silebilirsiniz.
                  En az bir profil sistemde kalmalıdır.
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              type="button"
              variant={isManaging ? "default" : "outline"}
              onClick={() => setIsManaging((current) => !current)}
            >
              {isManaging ? "Yönetimi Bitir" : "Profilleri Yönet"}
            </Button>

            {!isAdding && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsAdding(true);
                  setError("");
                }}
              >
                Yeni Yatırımcı Ekle
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
