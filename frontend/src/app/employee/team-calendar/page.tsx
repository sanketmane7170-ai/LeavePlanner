"use client";

import { useState, useEffect } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Users, Briefcase } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { cn } from "@/lib/utils";

interface TeamLeave {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  isHalfDay: boolean;
  totalDays: number;
  employee: {
    id: string;
    fullName: string;
    employeeId: string;
    department: string | null;
  };
}

export default function TeamCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [leaves, setLeaves] = useState<TeamLeave[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaves = async () => {
      setLoading(true);
      try {
        const month = currentDate.getMonth() + 1; // 1-12
        const year = currentDate.getFullYear();
        const res = await api.get(`/team-calendar/leaves?month=${month}&year=${year}`);
        setLeaves(res.data);
      } catch (error) {
        console.error("Failed to fetch team leaves:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaves();
  }, [currentDate]);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const today = () => setCurrentDate(new Date());

  // Calendar logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const dateFormat = "d";
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Helper to get leaves for a specific day
  const getLeavesForDay = (day: Date) => {
    return leaves.filter(leave => {
      const from = new Date(leave.fromDate);
      const to = new Date(leave.toDate);
      
      // Reset times to compare just dates
      const dayTime = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const fromTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
      const toTime = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
      
      return dayTime >= fromTime && dayTime <= toTime;
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="text-primary" size={24} />
            Team Calendar
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            View approved leaves for your team members.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={today}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Calendar Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {format(currentDate, "MMMM yyyy")}
          </h3>
        </div>

        {/* Days of Week */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
          {weekDays.map((day) => (
            <div key={day} className="py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="relative min-h-[400px]">
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
              <WeaveSpinner size={32} className="text-primary" />
              <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading calendar...</p>
            </div>
          )}
          
          <div className="grid grid-cols-7 auto-rows-[minmax(120px,auto)]">
            {days.map((day, idx) => {
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isToday = isSameDay(day, new Date());
              const dayLeaves = getLeavesForDay(day);

              return (
                <div
                  key={day.toString()}
                  className={cn(
                    "border-b border-r border-slate-100 dark:border-slate-800 p-2 transition-colors",
                    !isCurrentMonth && "bg-slate-50/50 dark:bg-slate-900/30",
                    (idx + 1) % 7 === 0 && "border-r-0",
                    "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={cn(
                        "text-sm font-medium h-7 w-7 flex items-center justify-center rounded-full",
                        !isCurrentMonth && "text-slate-400",
                        isToday && "bg-primary text-white shadow-sm"
                      )}
                    >
                      {format(day, dateFormat)}
                    </span>
                    {dayLeaves.length > 0 && (
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                        {dayLeaves.length} {dayLeaves.length === 1 ? 'leave' : 'leaves'}
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-1.5 overflow-y-auto max-h-[100px] scrollbar-thin pr-1">
                    {dayLeaves.map((leave, i) => (
                      <div
                        key={`${leave.id}-${i}`}
                        className={cn(
                          "px-2 py-1.5 rounded-md text-xs truncate border shadow-sm transition-all hover:shadow hover:-translate-y-[1px]",
                          leave.leaveType === 'SICK' 
                            ? "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50" 
                            : leave.leaveType === 'PERSONAL'
                            ? "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50"
                            : "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50"
                        )}
                        title={`${leave.employee.fullName} - ${leave.leaveType}`}
                      >
                        <div className="font-semibold truncate">
                          {leave.employee.fullName.split(' ')[0]}
                          {leave.isHalfDay && " (½)"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-50 border border-red-200 dark:bg-red-950/50 dark:border-red-900"></div>
          Sick Leave
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-50 border border-blue-200 dark:bg-blue-950/50 dark:border-blue-900"></div>
          Personal Leave
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/50 dark:border-amber-900"></div>
          Other
        </div>
      </div>
    </div>
  );
}
