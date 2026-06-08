"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import api from "@/lib/api";
import { Sidebar } from "@/components/shared/Sidebar";
import { Header } from "@/components/shared/Header";
import { BottomNav } from "@/components/shared/BottomNav";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



interface AuthUser {
  id: string;
  email: string;
  role: string;
  isFirstLogin: boolean;
  employee: { fullName: string; employeeId: string; canViewTeamCalendar?: boolean } | null;
}

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/auth/me");
        const u: AuthUser = res.data.user;
        if (u.role !== "EMPLOYEE") {
          router.replace("/admin/dashboard");
          return;
        }
        if (u.isFirstLogin && pathname !== "/employee/change-password") {
          router.replace("/employee/change-password");
          return;
        }
        // After first login is cleared, show onboarding if not yet completed
        if (!u.isFirstLogin && pathname !== "/employee/onboarding" && pathname !== "/employee/change-password") {
          try {
            const ob = await api.get("/employee/portal/onboarding");
            if (!(ob.data as any)?.steps?.onboardingCompleted) {
              const flagKey = `onboarding_redirected_${u.id}`;
              if (!sessionStorage.getItem(flagKey)) {
                sessionStorage.setItem(flagKey, "1");
                router.replace("/employee/onboarding");
                return;
              }
            }
          } catch {
            // ignore onboarding check errors — never block login
          }
        }
        setUser(u);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router, pathname]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <WeaveSpinner className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar
        role="employee"
        userName={user.employee?.fullName || user.email}
        userEmail={user.email}
        canViewTeamCalendar={user.employee?.canViewTeamCalendar}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          userName={user.employee?.fullName || user.email}
          userEmail={user.email}
          role={user.role}
          canViewTeamCalendar={user.employee?.canViewTeamCalendar}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 scrollbar-thin">
          {children}
        </main>
      </div>
      <BottomNav role="employee" />
    </div>
  );
}
