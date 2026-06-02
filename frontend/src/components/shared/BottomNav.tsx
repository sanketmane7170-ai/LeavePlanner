"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Settings,
  PlusSquare,
  ClipboardList,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const adminNav: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Employees", icon: Users },
  { href: "/admin/leave-requests", label: "Leaves", icon: CalendarDays },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

const employeeNav: NavItem[] = [
  { href: "/employee/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employee/apply-leave", label: "Apply", icon: PlusSquare },
  { href: "/employee/my-leaves", label: "My Leaves", icon: ClipboardList },
  { href: "/employee/profile", label: "Profile", icon: UserCircle },
];

interface BottomNavProps {
  role: "admin" | "employee";
}

export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const navItems = role === "admin" ? adminNav : employeeNav;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex h-16">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== `/${role}/dashboard` && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
