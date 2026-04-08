"use client";

import { useParams } from "next/navigation";
import { PortfolioWorkspace } from "@/components/portfolio/portfolio-workspace";

export default function PortfolioItemPage() {
  const params = useParams<{ id: string }>();
  return <PortfolioWorkspace portfolioId={params.id} />;
}
