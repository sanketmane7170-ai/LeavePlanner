"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  BarChart2,
  Megaphone,
  SlidersHorizontal,
  ClipboardCheck,
  CalendarClock,
  Sun,
  TrendingUp,
  Sparkles,
  Upload,
  UserCheck,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  children?: { href: string; label: string }[];
}

const adminNav: NavItem[] = [
  { href: "/admin/dashboard",     label: "Dashboard",     icon: LayoutDashboard },
  {
    href: "/admin/employees",
    label: "Employees",
    icon: Users,
    children: [
      { href: "/admin/employees",                label: "All Employees"    },
      { href: "/admin/employees/notice-period",  label: "Notice Period"    },
    ],
  },
  { href: "/admin/team-calendar", label: "Team Calendar", icon: CalendarDays    },
  {
    href: "/admin/policy-manager",
    label: "Policy Manager",
    icon: FileText,
    children: [
      { href: "/admin/policy-manager", label: "Leave Policy" },
      { href: "/admin/wfh-policy",     label: "WFH Policy"   },
    ]
  },
  {
    href: "/admin/leave-requests",
    label: "Requests",
    icon: CalendarDays,
    children: [
      { href: "/admin/leave-requests/leave",  label: "Leave Requests" },
      { href: "/admin/leave-requests/wfh",    label: "WFH Requests"   },
      { href: "/admin/leave-requests/import", label: "Bulk Import"    },
    ]
  },
  { href: "/admin/reports", label: "Reports & Analytics", icon: TrendingUp },
  { href: "/admin/allowance-manager", label: "Allowance Manager", icon: SlidersHorizontal },
  {
    href: "/admin/checkin",
    label: "Live Attendance",
    icon: UserCheck,
    children: [
      { href: "/admin/checkin",          label: "Today's Attendance" },
      { href: "/admin/checkin/settings", label: "Check-In Settings"  },
    ],
  },
  {
    href: "/admin/attendance",
    label: "Attendance",
    icon: ClipboardCheck,
    children: [
      { href: "/admin/attendance/muster",          label: "Muster View"     },
      { href: "/admin/attendance/monthly-summary", label: "Monthly Summary" },
    ],
  },
  { href: "/admin/system-logs",   label: "System Logs",   icon: ClipboardList   },
  { href: "/admin/support",       label: "Support",       icon: LifeBuoy        },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone       },
  { 
    href: "/admin/settings",      
    label: "Settings",      
    icon: Settings,
    children: [
      { href: "/admin/settings/org", label: "Org Profile" },
      { href: "/admin/settings/leave-limits", label: "Leave Limits" },
      { href: "/admin/settings/holidays", label: "Public Holidays" },
      { href: "/admin/settings/departments", label: "Departments" },
      { href: "/admin/settings/roles", label: "Roles" },
      { href: "/admin/settings/admins", label: "Manage Admins" },
      { href: "/admin/settings/email-templates", label: "Email Templates" },
      { href: "/admin/settings/audit-log", label: "Audit Log" },
    ]
  },
];

const employeeNav: NavItem[] = [
  { href: "/employee/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/employee/apply-leave", label: "Apply Leave", icon: PlusSquare      },
  { href: "/employee/apply-wfh",   label: "Apply WFH",   icon: Home            },
  { href: "/employee/my-leaves",   label: "My Leaves",   icon: ClipboardList   },
  { href: "/employee/holidays",    label: "Holidays",    icon: Sun             },
  { href: "/employee/my-schedule", label: "My Schedule", icon: CalendarClock   },
  { href: "/employee/my-policies", label: "My Policies", icon: FileText        },
  { href: "/employee/reports",     label: "My Reports",  icon: BarChart2       },
  { href: "/employee/onboarding",       label: "Onboarding",     icon: Sparkles    },
  { href: "/employee/checkin-history", label: "My Attendance",  icon: History     },
  { href: "/employee/profile",         label: "Profile",        icon: UserCircle  },
];

interface SidebarProps {
  role: "admin" | "employee";
  userName?: string;
  userEmail?: string;
  canViewTeamCalendar?: boolean;
}

export function Sidebar({ role, userName, userEmail, canViewTeamCalendar }: SidebarProps) {
  const pathname = usePathname();
  let navItems = role === "admin" ? adminNav : [...employeeNav];

  if (role === "employee" && canViewTeamCalendar) {
    const profileIndex = navItems.findIndex(n => n.href === "/employee/profile");
    if (profileIndex > -1) {
      navItems.splice(profileIndex, 0, { href: "/employee/team-calendar", label: "Team Calendar", icon: CalendarDays });
    } else {
      navItems.push({ href: "/employee/team-calendar", label: "Team Calendar", icon: CalendarDays });
    }
  }

  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  // Auto-expand menus if active route is a child
  useEffect(() => {
    if (collapsed) return;
    const newOpens = { ...openMenus };
    let changed = false;
    navItems.forEach(item => {
      if (item.children && pathname.startsWith(item.href)) {
        if (!newOpens[item.href]) {
          newOpens[item.href] = true;
          changed = true;
        }
      }
    });
    if (changed) setOpenMenus(newOpens);
  }, [pathname, navItems, collapsed]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  const toggleMenu = (href: string) => {
    if (collapsed) {
      setCollapsed(false);
      localStorage.setItem("sidebar-collapsed", "false");
      setOpenMenus(prev => ({ ...prev, [href]: true }));
    } else {
      setOpenMenus(prev => ({ ...prev, [href]: !prev[href] }));
    }
  };

  const initials = userName
    ? userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 h-full",
        "bg-white dark:bg-[#0f172a]",
        "border-r border-slate-200/80 dark:border-slate-800",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-[250px]"
      )}
    >
      {/* ── Brand header ──────────────────────────────────────────────────── */}
      <div
        className={cn(
          "h-16 shrink-0 relative flex items-center",
          "border-b border-slate-200/80 dark:border-slate-800",
          collapsed ? "justify-center px-2" : "justify-center px-4"
        )}
      >
        {/* Centered brand */}
        {!collapsed ? (
          <div className="flex flex-col items-center leading-tight">
            <p className="font-heading font-extrabold text-[15px] tracking-tight text-orange-500">
              Innovizia
            </p>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium tracking-wide">
              Your Ai Partner
            </p>
          </div>
        ) : (
          <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-extrabold text-orange-500 tracking-tight">In</span>
          </div>
        )}

        {/* Collapse / expand button — pinned to the right edge */}
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "absolute right-2 h-6 w-6 rounded-md flex items-center justify-center",
            "text-slate-400 dark:text-slate-500",
            "hover:bg-slate-100 dark:hover:bg-slate-800",
            "hover:text-slate-700 dark:hover:text-slate-300",
            "transition-colors focus:outline-none"
          )}
        >
          {collapsed
            ? <ChevronRight size={13} strokeWidth={2.5} />
            : <ChevronLeft size={13} strokeWidth={2.5} />}
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav
        className={cn(
          "flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden scrollbar-thin",
          collapsed ? "px-2" : "px-3"
        )}
      >
        {navItems.map((item) => {
          const isParentActive = item.children
            ? pathname.startsWith(item.href)
            : pathname === item.href || (item.href !== `/${role}/dashboard` && pathname.startsWith(item.href));
          
          const isOpen = openMenus[item.href];

          return (
            <div key={item.href}>
              {item.children ? (
                <button
                  onClick={() => toggleMenu(item.href)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-xl text-sm font-medium transition-all duration-150 w-full",
                    collapsed
                      ? "justify-center h-10"
                      : "px-3 py-2.5",
                    isParentActive && !isOpen
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
                    <item.icon
                      size={19}
                      strokeWidth={isParentActive ? 2.5 : 2}
                      className="shrink-0 transition-none"
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!collapsed && (
                    <ChevronRight 
                      size={14} 
                      className={cn("transition-transform", isOpen && "rotate-90")} 
                    />
                  )}
                </button>
              ) : (
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded-xl text-sm font-medium transition-all duration-150",
                    collapsed
                      ? "justify-center w-full h-10"
                      : "gap-3 px-3 py-2.5",
                    isParentActive
                      ? "bg-primary text-white shadow-sm shadow-primary/25"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <item.icon
                    size={19}
                    strokeWidth={isParentActive ? 2.5 : 2}
                    className="shrink-0 transition-none"
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              )}

              {/* Children */}
              {item.children && isOpen && !collapsed && (
                <div className="mt-1 mb-2 ml-4 pl-4 border-l-2 border-slate-100 dark:border-slate-800 space-y-0.5">
                  {item.children.map(child => {
                    const isChildActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block px-3 py-2 text-[13px] rounded-lg font-medium transition-colors",
                          isChildActive
                            ? "bg-primary text-white shadow-sm shadow-primary/20"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
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

      {/* ── User footer ────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "border-t border-slate-200/80 dark:border-slate-800 shrink-0",
          collapsed ? "px-2 py-3 flex justify-center" : "p-3"
        )}
      >
        {collapsed ? (
          <div
            title={userName}
            className="h-9 w-9 rounded-full bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center text-xs font-bold cursor-default"
          >
            {initials}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-default">
            <div className="h-8 w-8 rounded-full bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate leading-tight">
                {userName || "User"}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {userEmail || role}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
