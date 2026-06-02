"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { ShieldAlert, ArrowLeft, Mail, KeyRound, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { WeaveSpinner } from "@/components/ui/weave-spinner";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const resetSchema = z.object({
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

type EmailFormValues = z.infer<typeof emailSchema>;
type ResetFormValues = z.infer<typeof resetSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const resetForm = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { otp: "", newPassword: "" },
  });

  const onSendOtp = async (data: EmailFormValues) => {
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: data.email });
      setEmail(data.email);
      setStep(2);
      toast.success("OTP sent to your email!");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const onResetPassword = async (data: ResetFormValues) => {
    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        email,
        otp: data.otp,
        newPassword: data.newPassword,
      });
      setStep(3);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      
      {/* Left side styling similar to login page */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-primary/20 blur-[100px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-blue-500/20 blur-[100px] rounded-full mix-blend-screen" />
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 bg-gradient-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <rect width="18" height="18" x="3" y="3" rx="4" />
              <path d="M8 12h8" />
              <path d="M12 8v8" />
            </svg>
          </div>
          <span className="text-2xl font-bold font-heading text-white tracking-tight">Innovizia</span>
        </div>

        <div className="relative z-10 max-w-md">
          <ShieldAlert className="text-primary/80 h-12 w-12 mb-6" />
          <h1 className="text-4xl font-bold text-white font-heading leading-tight mb-4">
            Secure Account Recovery
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Follow the steps to securely verify your identity and reset your password.
          </p>
        </div>
        <div className="relative z-10 text-slate-500 text-sm">
          &copy; {new Date().getFullYear()} Innovizia Leave Planner
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 relative">
        <button
          onClick={() => router.push("/login")}
          className="absolute top-8 left-8 p-2 rounded-xl text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold font-heading text-slate-900 dark:text-white">
              {step === 1 ? "Forgot Password" : step === 2 ? "Verify OTP" : "Success!"}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {step === 1 && "Enter your email to receive a recovery code."}
              {step === 2 && `Enter the code sent to ${email}`}
              {step === 3 && "Your password has been successfully reset."}
            </p>
          </div>

          {step === 1 && (
            <form onSubmit={emailForm.handleSubmit(onSendOtp)} className="space-y-6">
              <div className="space-y-1.5 relative">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    {...emailForm.register("email")}
                    type="email"
                    placeholder="name@innovizia.com"
                    className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
                {emailForm.formState.errors.email && (
                  <p className="text-red-500 text-xs mt-1 ml-1">{emailForm.formState.errors.email.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full h-12 text-base shadow-lg shadow-primary/25" disabled={loading}>
                {loading ? <WeaveSpinner className="animate-spin mr-2" size={18} /> : null}
                Send Recovery Code
              </Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={resetForm.handleSubmit(onResetPassword)} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">6-Digit OTP</label>
                <input
                  {...resetForm.register("otp")}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center tracking-[1em] text-lg font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
                {resetForm.formState.errors.otp && (
                  <p className="text-red-500 text-xs mt-1 ml-1 text-center">{resetForm.formState.errors.otp.message}</p>
                )}
              </div>

              <div className="space-y-1.5 relative">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <KeyRound className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    {...resetForm.register("newPassword")}
                    type="password"
                    placeholder="••••••••"
                    className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
                {resetForm.formState.errors.newPassword && (
                  <p className="text-red-500 text-xs mt-1 ml-1">{resetForm.formState.errors.newPassword.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full h-12 text-base shadow-lg shadow-primary/25" disabled={loading}>
                {loading ? <WeaveSpinner className="animate-spin mr-2" size={18} /> : null}
                Reset Password
              </Button>
            </form>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center space-y-6 py-8">
              <div className="h-20 w-20 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center">
                <CheckCircle2 size={40} />
              </div>
              <Button onClick={() => router.push("/login")} className="w-full h-12 text-base">
                Return to Login
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
