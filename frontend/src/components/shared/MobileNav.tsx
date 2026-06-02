"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  Home,
  CalendarDays,
  Settings,
  PlusSquare,
  ClipboardList,
  UserCircle,
  LifeBuoy,
  BarChart2,
  Megaphone,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  children?: { href: string; label: string }[];
}

// Full navigation — mirrors the desktop Sidebar so nothing is missing on mobile.
const adminNav: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Employees", icon: Users },
  {
    href: "/admin/policy-manager",
    label: "Policy Manager",
    icon: FileText,
    children: [
      { href: "/admin/policy-manager", label: "Leave Policy" },
      { href: "/admin/wfh-policy", label: "WFH Policy" },
    ],
  },
  {
    href: "/admin/leave-requests",
    label: "Requests",
    icon: CalendarDays,
    children: [
      { href: "/admin/leave-requests/leave", label: "Leave Requests" },
      { href: "/admin/leave-requests/wfh", label: "WFH Requests" },
    ],
  },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    children: [
      { href: "/admin/settings/org", label: "Org Profile" },
      { href: "/admin/settings/holidays", label: "Public Holidays" },
      { href: "/admin/settings/departments", label: "Departments" },
      { href: "/admin/settings/roles", label: "Roles" },
      { href: "/admin/settings/admins", label: "Manage Admins" },
      { href: "/admin/settings/email-templates", label: "Email Templates" },
      { href: "/admin/settings/audit-log", label: "Audit Log" },
    ],
  },
];

const employeeNav: NavItem[] = [
  { href: "/employee/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employee/apply-leave", label: "Apply Leave", icon: PlusSquare },
  { href: "/employee/apply-wfh", label: "Apply WFH", icon: Home },
  { href: "/employee/my-leaves", label: "My Leaves", icon: ClipboardList },
  { href: "/employee/my-policies", label: "My Policies", icon: FileText },
  { href: "/employee/reports", label: "My Reports", icon: BarChart2 },
  { href: "/employee/profile", label: "Profile", icon: UserCircle },
];

interface MobileNavProps {
  role: "admin" | "employee";
  userName?: string;
  userEmail?: string;
  canViewTeamCalendar?: boolean;
}

export function MobileNav({ role, userName, userEmail, canViewTeamCalendar }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Build nav list (inject Team Calendar for permitted employees)
  let navItems = role === "admin" ? [...adminNav] : [...employeeNav];
  if (role === "employee" && canViewTeamCalendar) {
    const idx = navItems.findIndex((n) => n.href === "/employee/profile");
    const item = { href: "/employee/team-calendar", label: "Team Calendar", icon: CalendarDays };
    if (idx > -1) navItems.splice(idx, 0, item);
    else navItems.push(item);
  }

  // Close drawer whenever the route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
      router.push("/login");
    } catch {
      toast.error("Logout failed");
    }
  };

  const isActive = (href: string) =>
    pathname === href ||
    (href !== `/${role}/dashboard` && pathname.startsWith(href));

  const initials = userName
    ? userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <>
      {/* Hamburger — mobile only */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Open menu"
      >
        <Menu size={20} className="text-slate-700 dark:text-slate-200" />
      </button>

      {/* Drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div className="absolute left-0 top-0 h-full w-[280px] max-w-[85%] bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            {/* Brand + close */}
            <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-col leading-tight">
                <span className="font-heading font-extrabold text-[15px] text-orange-500">
                  Innovizia
                </span>
                <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium">
                  Your Ai Partner
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-thin">
              {navItems.map((item) => {
                const parentActive = item.children
                  ? pathname.startsWith(item.href)
                  : isActive(item.href);
                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                        parentActive
                          ? "bg-primary text-white"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      <item.icon size={18} strokeWidth={parentActive ? 2.5 : 2} />
                      {item.label}
                    </Link>
                    {/* Sub-items */}
                    {item.children && (
                      <div className="mt-0.5 ml-4 pl-4 border-l border-slate-200 dark:border-slate-800 space-y-0.5">
                        {item.children.map((child) => {
                          const childActive = pathname === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "block px-3 py-2 rounded-lg text-sm transition-colors",
                                childActive
                                  ? "text-primary font-semibold bg-primary/10"
                                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              )}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Footer: user + sign out */}
            <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 p-3">
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {userName || "User"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {userEmail}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-1 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
