"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Home } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WeaveSpinner } from "@/components/ui/weave-spinner";

const schema = z.object({
  name:             z.string().min(2, "At least 2 characters"),
  daysAllowed:      z.string().min(1, "Required"),
  probationRule:    z.enum(["NONE", "NO_LEAVES", "UNPAID_ALLOWED"]),
  approvalRequired: z.boolean(),
  halfDayAllowed:   z.boolean(),
  noticeRequired:   z.boolean(),
  minNoticeDays:    z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors select-none"
    >
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-white">{label}</p>
        {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
      <div className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-slate-200 dark:bg-slate-700")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200", checked ? "translate-x-5" : "translate-x-0.5")} />
      </div>
    </div>
  );
}

export default function NewWfhPolicyPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      probationRule:    "NO_LEAVES",
      approvalRequired: true,
      halfDayAllowed:   true,
      noticeRequired:   false,
      minNoticeDays:    "0",
    },
  });

  const watchNotice   = watch("noticeRequired");
  const watchApproval = watch("approvalRequired");
  const watchHalfDay  = watch("halfDayAllowed");

  const onSubmit = async (data: FormValues) => {
    setSaving(true);
    try {
      const res = await api.post("/admin/policies/wfh", {
        ...data,
        daysAllowed:   parseInt(data.daysAllowed, 10),
        minNoticeDays: data.minNoticeDays ? parseInt(data.minNoticeDays, 10) : 0,
      });
      toast.success("WFH policy created — now configure rules, employees and exceptions.");
      router.push(`/admin/wfh-policy/${res.data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create policy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Home size={15} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">New WFH Policy</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">After creating, you can add rules, assign employees and set exceptions</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Basic Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input label="Policy Name *" placeholder="e.g. Standard WFH Policy" error={errors.name?.message} {...register("name")} />
            </div>
            <div className="sm:col-span-2">
              <Input label="Days Allowed / Year *" type="number" min="0" step="1" placeholder="e.g. 24" error={errors.daysAllowed?.message} {...register("daysAllowed")} />
            </div>
            <div className="sm:col-span-2">
              <Select label="Probation Rule" {...register("probationRule")}>
                <option value="NONE">No restriction during probation</option>
                <option value="NO_LEAVES">No WFH allowed during probation</option>
                <option value="UNPAID_ALLOWED">Allow WFH as unpaid (no balance deduction)</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">Behavior</h2>
          <Toggle label="Approval Required" description="WFH requests must be approved by admin" checked={watchApproval} onChange={(v) => setValue("approvalRequired", v)} />
          <Toggle label="Half Day Allowed" description="Employees can apply for first/second half WFH" checked={watchHalfDay} onChange={(v) => setValue("halfDayAllowed", v)} />
          <Toggle label="Advance Notice Required" description="Employees must submit requests ahead of time" checked={watchNotice} onChange={(v) => setValue("noticeRequired", v)} />
          {watchNotice && (
            <div className="pl-2">
              <Input label="Minimum Notice Days" type="number" min="1" placeholder="e.g. 2" error={errors.minNoticeDays?.message} {...register("minNoticeDays")} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/wfh-policy")} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="gap-2 min-w-[140px]">
            {saving && <WeaveSpinner size={14} className="animate-spin" />}
            {saving ? "Creating…" : "Create & Configure →"}
          </Button>
        </div>
      </form>
    </div>
  );
}
