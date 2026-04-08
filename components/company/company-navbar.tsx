"use client";

import * as React from "react";
import { BarChart3, ChevronDown, ChevronRight, FileText, Sparkles, Table } from "lucide-react";

import { cn } from "@/lib/utils";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  children?: NavItem[];
}

export const COMPANY_NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Özet", icon: FileText },
  { id: "chart", label: "Grafik Merkezi", icon: BarChart3 },
  { id: "score", label: "Skor Motoru", icon: Sparkles },
  { id: "financials", label: "Finansallar", icon: Table },
];

interface CompanyNavbarProps {
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  className?: string;
}

function NavItemButton({
  item,
  isActive,
  onClick,
  level = 0,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
  level?: number;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const Icon = item.icon;

  const handleClick = () => {
    if (hasChildren) {
      setIsExpanded((current) => !current);
      return;
    }

    onClick();
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-all",
          "hover:bg-muted/50",
          isActive && !hasChildren && "bg-primary/10 font-medium text-primary",
          level > 0 && "pl-8",
        )}
      >
        <Icon className="size-4 shrink-0 opacity-60" />
        <span className="flex-1 truncate text-left">{item.label}</span>
        {item.badge ? (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">
            {item.badge}
          </span>
        ) : null}
        {hasChildren ? (
          <span className="text-muted-foreground">
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </span>
        ) : null}
      </button>

      {hasChildren && isExpanded ? (
        <div className="mt-1 space-y-0.5">
          {item.children!.map((child) => (
            <NavItemButton
              key={child.id}
              item={child}
              isActive={false}
              onClick={() => onClick()}
              level={level + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CompanyNavbar({ activeSection, onSectionChange, className }: CompanyNavbarProps) {
  return (
    <nav className={cn("h-full overflow-y-auto", className)}>
      <div className="space-y-0.5 p-2">
        {COMPANY_NAV_ITEMS.map((item) => (
          <NavItemButton
            key={item.id}
            item={item}
            isActive={activeSection === item.id}
            onClick={() => onSectionChange(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}
