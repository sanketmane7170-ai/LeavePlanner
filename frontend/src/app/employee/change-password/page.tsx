"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Eye, EyeOff, CheckCircle2, Circle, Loader2 } from "lucide-react";
import api from "@/lib/api";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Temporary password is required"),
    newPassword: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "One uppercase letter required")
      .regex(/[0-9]/, "One number required"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ chars", ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /[0-9]/.test(password) },
  ];
  return (
    <div className="flex gap-3 mt-1.5 flex-wrap">
      {checks.map((c) => (
        <span key={c.label} className={`flex items-center gap-1 text-xs transition-colors ${c.ok ? "text-emerald-600" : "text-slate-400"}`}>
          {c.ok ? <CheckCircle2 size={11} /> : <Circle size={11} />}
          {c.label}
        </span>
      ))}
    </div>
  );
}

function PwInput({
  label,
  placeholder,
  error,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <input
          {...rest}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          className={`w-full h-11 px-4 pr-10 rounded-xl border text-sm bg-white transition-all outline-none
            focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
            ${error ? "border-red-400 bg-red-50" : "border-slate-200"}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const newPw = watch("newPassword", "");

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      await api.patch("/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      // Backend issues a fresh JWT — session continues uninterrupted, no logout needed
      setDone(true);
      setTimeout(() => router.replace("/employee/onboarding"), 1400);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Full-screen overlay covers sidebar + header completely */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f0fdf4 100%)" }}>

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, #c7d2fe 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative w-full max-w-[420px]">
        {/* Brand mark */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <span className="text-[11px] font-black text-white tracking-tight">In</span>
            </div>
            <span className="font-bold text-slate-700 text-base tracking-tight">Innovizia</span>
          </div>
        </div>

        {done ? (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-10 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Password set!</h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Your account is secured. Taking you to setup…
            </p>
            <div className="mt-5 flex justify-center">
              <Loader2 size={18} className="animate-spin text-indigo-500" />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            {/* Card header with gradient */}
            <div className="px-8 py-7" style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)" }}>
              <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center mb-4">
                <ShieldCheck size={22} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-white leading-snug">Set your password</h1>
              <p className="text-indigo-200 text-sm mt-1 leading-relaxed">
                First login — replace your temporary password to continue.
              </p>
            </div>

            {/* Form body */}
            <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-7 space-y-5">
              <PwInput
                label="Temporary Password"
                placeholder="The password we sent you"
                error={errors.currentPassword?.message}
                {...register("currentPassword")}
              />

              <div>
                <PwInput
                  label="New Password"
                  placeholder="Create a strong password"
                  error={errors.newPassword?.message}
                  {...register("newPassword")}
                />
                {newPw.length > 0 && <PasswordStrength password={newPw} />}
              </div>

              <PwInput
                label="Confirm New Password"
                placeholder="Type it once more"
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-sm font-semibold transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-1"
              >
                {loading ? (
                  <><Loader2 size={15} className="animate-spin" /> Setting password…</>
                ) : (
                  "Set Password & Continue"
                )}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-5">
          Innovizia LeavePlanner · Your session is secure
        </p>
      </div>
    </div>
  );
}
