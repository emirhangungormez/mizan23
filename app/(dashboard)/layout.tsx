"use client";

import { useEffect } from "react";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useUserStore } from "@/store/user-store";
import { ProfileSelector } from "@/components/user/profile-selector";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { currentUser, hasHydrated, initialize } = useUserStore();

    useEffect(() => {
        void initialize();
    }, [initialize]);

    if (!hasHydrated) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="mx-auto size-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                </div>
            </div>
        );
    }

    if (!currentUser) {
        return <ProfileSelector />;
    }

    return (
        <SidebarProvider className="bg-sidebar">
            <DashboardSidebar />
            <div className="h-svh overflow-hidden lg:p-2 w-full">
                <div className="lg:border lg:rounded-md overflow-hidden flex flex-col justify-start bg-background h-full w-full">
                    <DashboardHeader />
                    <div className="flex-1 overflow-auto bg-background/50 relative">
                        {children}
                    </div>
                </div>
            </div>
        </SidebarProvider>
    );
}
