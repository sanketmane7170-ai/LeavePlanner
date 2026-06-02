"use client";

import { usePathname, useRouter } from "next/navigation";
import { Briefcase, LogOut, ChevronDown } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ThemeToggle } from "./ThemeToggle";
import api from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { NotificationBell } from "./NotificationBell";

const pageTitles: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/employees": "Employees",
  "/admin/policy-manager": "Policy Manager",
  "/admin/wfh-policy": "WFH Policy",
  "/admin/leave-requests": "Leave Requests",
  "/admin/announcements": "Announcements",
  "/admin/settings": "Settings",
  "/employee/dashboard": "Dashboard",
  "/employee/apply-leave": "Apply Leave",
  "/employee/apply-wfh": "Apply WFH",
  "/employee/my-leaves": "My Leaves",
  "/employee/profile": "Profile",
  "/employee/change-password": "Change Password",
};

interface HeaderProps {
  userName?: string;
  userEmail?: string;
  role?: string;
}

export function Header({ userName, userEmail, role }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const pageTitle =
    Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1] ||
    "Innovizia";

  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
      router.push("/login");
    } catch {
      toast.error("Logout failed");
    }
  };

  return (
    <header className="h-16 flex items-center px-4 md:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 gap-4">
      {/* Mobile logo */}
      <div className="md:hidden flex items-center gap-2">
        <div className="h-7 w-7 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <Briefcase size={14} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="font-heading font-bold text-sm text-slate-900 dark:text-white">
          Innovizia
        </span>
      </div>

      {/* Desktop page title */}
      <h1 className="hidden md:block font-heading font-semibold text-lg text-slate-900 dark:text-white">
        {pageTitle}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <ThemeToggle />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50">
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {initials}
              </div>
              <div className="hidden sm:block text-left min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white leading-none truncate max-w-[120px]">
                  {userName || "User"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-none mt-0.5 truncate max-w-[120px]">
                  {role === "ADMIN" ? "Admin" : "Employee"}
                </p>
              </div>
              <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className={cn(
                "z-50 min-w-[180px] rounded-xl border border-slate-200 dark:border-slate-800",
                "bg-white dark:bg-slate-900 shadow-lg p-1",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
              )}
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {userName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {userEmail}
                </p>
              </div>
              <DropdownMenu.Item
                onSelect={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer focus:outline-none focus:bg-red-50 dark:focus:bg-red-900/20"
              >
                <LogOut size={15} />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
