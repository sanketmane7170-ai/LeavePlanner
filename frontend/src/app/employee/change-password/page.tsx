"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock,  ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { WeaveSpinner } from "@/components/ui/weave-spinner";



const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      await api.patch("/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      // Changing the password invalidates the current session (tokenVersion bumped),
      // so clear the cookie and send the user to log in again with the new password.
      try { await api.post("/auth/logout"); } catch { /* ignore */ }
      toast.success("Password changed! Please log in with your new password.");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheck size={28} />
          </div>
          <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
            Set your password
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center">
            This is your first login. Please set a new password to secure your account.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Current (Temporary) Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="password"
                placeholder="Enter your temporary password"
                {...register("currentPassword")}
                className={`w-full pl-9 pr-4 h-10 rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                  errors.currentPassword
                    ? "border-red-500"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              />
            </div>
            {errors.currentPassword && (
              <p className="text-red-500 text-xs">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              New Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="password"
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                {...register("newPassword")}
                className={`w-full pl-9 pr-4 h-10 rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                  errors.newPassword
                    ? "border-red-500"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              />
            </div>
            {errors.newPassword && (
              <p className="text-red-500 text-xs">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="password"
                placeholder="Re-enter new password"
                {...register("confirmPassword")}
                className={`w-full pl-9 pr-4 h-10 rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                  errors.confirmPassword
                    ? "border-red-500"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              />
            </div>
            {errors.confirmPassword && (
              <p className="text-red-500 text-xs">{errors.confirmPassword.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-white font-medium h-11 rounded-xl transition-all shadow-md shadow-primary/20 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <WeaveSpinner className="animate-spin mr-2" size={18} />
            ) : (
              "Set Password & Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
