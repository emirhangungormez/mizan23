"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Wallet,
  Plus,
  ChevronsUpDown,
  Settings,
  LogOut,
  Target,
  TrendingUp,
  Building2,
  Bitcoin,
  Package,
  Landmark,
  Star,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortfolioStore } from "@/store/portfolio-store";
import { usePathname } from "next/navigation";
import { useUserStore } from "@/store/user-store";
import { cn } from "@/lib/utils";

const mainNav = [
  { title: "Anasayfa", icon: LayoutDashboard, href: "/" },
  { title: "Analiz & Tavsiye", icon: Target, href: "/analysis" },
  { title: "Sepet Yönetimi", icon: Wallet, href: "/portfolio" },
  { title: "Favoriler Yönetimi", icon: Star, href: "/favorites" },
];

const marketNav = [
  {
    title: "Borsa İstanbul",
    shortName: "BIST",
    icon: TrendingUp,
    href: "/markets/bist",
    color: "text-red-500",
    bgColor: "bg-red-500/10"
  },
  {
    title: "ABD Piyasaları",
    shortName: "ABD",
    icon: Building2,
    href: "/markets/us",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10"
  },
  {
    title: "Kripto Paralar",
    shortName: "Kripto",
    icon: Bitcoin,
    href: "/markets/crypto",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10"
  },
  {
    title: "Emtia & Madenler",
    shortName: "Emtia",
    icon: Package,
    href: "/markets/commodities",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10"
  },
  {
    title: "Yatırım Fonları",
    shortName: "Fonlar",
    icon: Landmark,
    href: "/markets/funds",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10"
  },
];

export function DashboardSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { portfolios } = usePortfolioStore();
  const { currentUser, logout } = useUserStore();
  const pathname = usePathname();
  const [marketsOpen, setMarketsOpen] = React.useState(true);

  return (
    <Sidebar className="lg:border-r-0!" collapsible="icon" {...props}>
      <SidebarHeader className="px-2.5 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div role="button" tabIndex={0} className="flex items-center gap-2.5 w-full hover:bg-sidebar-accent rounded-md p-1 -m-1 transition-colors shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0 overflow-hidden">
                {currentUser?.avatar ? (
                  <img src={currentUser.avatar} alt={currentUser.name} className="size-full object-cover" />
                ) : (
                  <span className="text-sm font-bold">{currentUser?.name?.substring(0, 1) || "T"}</span>
                )}
              </div>
              <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden min-w-0">
                <span className="text-sm font-semibold tracking-tight truncate">{currentUser?.name || "Trade Intel"}</span>
                <ChevronsUpDown className="size-3 text-muted-foreground ml-auto" />
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={logout}>
              <Settings className="size-4 mr-2" />
              <span>Profil Değiştir</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-rose-500" onClick={logout}>
              <LogOut className="size-4 mr-2" />
              <span>Çıkış Yap</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="px-2.5">
        {/* Ana Menü */}
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="flex items-center justify-between px-0 h-6">
            <span className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground/60 uppercase">
              Ana Menü
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    className="h-9"
                  >
                    <Link href={item.href || "#"}>
                      <item.icon className="size-4" />
                      <span className="text-sm">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Piyasalar */}
        <SidebarGroup className="p-0 mt-6">
          <Collapsible open={marketsOpen} onOpenChange={setMarketsOpen}>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="flex items-center justify-between px-0 h-6 cursor-pointer hover:bg-muted/50 rounded -mx-1 px-1 transition-colors">
                <span className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground/60 uppercase">
                  Piyasalar
                </span>
                <ChevronRight className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  marketsOpen && "rotate-90"
                )} />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu className="mt-1">
                  {marketNav.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={cn(
                            "h-10 transition-all",
                            isActive && "bg-primary text-primary-foreground hover:bg-primary/90"
                          )}
                        >
                          <Link href={item.href} className="flex items-center gap-3">
                            <div className={cn(
                              "size-6 rounded-md flex items-center justify-center transition-colors",
                              isActive ? "bg-white/20" : item.bgColor
                            )}>
                              <item.icon className={cn(
                                "size-3.5",
                                isActive ? "text-white" : item.color
                              )} />
                            </div>
                            <span className="text-sm font-medium">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Sepetlerim */}
        <SidebarGroup className="p-0 mt-6">
          <SidebarGroupLabel className="flex items-center justify-between px-0 h-6">
            <span className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground/60 uppercase">
              Sepetlerim
            </span>
            <Link href="/portfolio">
              <Plus className="size-3.5 text-muted-foreground hover:text-primary transition-colors" />
            </Link>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {portfolios.map((portfolio) => (
                <SidebarMenuItem key={portfolio.id}>
                  <SidebarMenuButton
                    asChild
                    className="h-9"
                    isActive={pathname === `/portfolio/${portfolio.id}`}
                  >
                    <Link href={`/portfolio/${portfolio.id}`}>
                      <Wallet className="size-4" />
                      <span className="text-sm truncate">{portfolio.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {portfolios.length === 0 && (
                <div className="px-3 py-2 text-[10px] text-muted-foreground/50 uppercase tracking-widest italic">
                  Henüz portföy yok
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

    </Sidebar>
  );
}
