import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { sendOtp, verifyOtp } from "../lib/auth.js";
import { z } from "zod";
import { useToast } from "../components/Toast.jsx";
import { Button, Card } from "../components/ui.jsx";

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"));

export default function Login() {
  // Redeploy trigger: ensure OTP verify step renders after Send OTP.
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [referral, setReferral] = useState((searchParams.get("ref") || "").toUpperCase());
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp(e) {
    e.preventDefault();
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    setBusy(true);
    try {
      const result = await sendOtp(parsed.data);
      if (result.devOtp) {
        setDevOtp(result.devOtp);
      } else {
        toast.success("OTP sent");
      }
      setStep("verify");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function doVerify(e) {
    e.preventDefault();
    if (otp.length !== 6) return toast.error("Enter a valid 6-digit OTP");

    setBusy(true);
    try {
      await verifyOtp({ phone, otp, referralCode: referral || undefined });
      toast.success("Welcome to Proboss Ludo!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#10001f] px-4 py-8 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-pulse rounded-full bg-[#a82978]/25 blur-3xl motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -right-24 h-80 w-80 animate-pulse rounded-full bg-[#1689ff]/20 blur-3xl motion-reduce:animate-none"
      />

      <Card className="login-card relative z-10 flex w-full max-w-[430px] flex-col gap-6 border border-[#f41468]/70 bg-[#160522]/95 p-6 shadow-[0_18px_60px_rgba(0,0,0,.42),0_0_28px_rgba(244,20,104,.12)] backdrop-blur-md transition duration-300 hover:border-[#ff3c91] hover:shadow-[0_18px_65px_rgba(0,0,0,.5),0_0_36px_rgba(244,20,104,.22)] sm:gap-7 sm:p-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="group relative flex h-24 w-24 items-center justify-center transition-transform duration-300 hover:scale-105">
            <img
              src="/logo.png"
              alt="Proboss Ludo"
              className="h-20 w-20 object-contain drop-shadow-[0_0_16px_rgba(255,255,255,0.35)]"
            />
          </div>

          <div>
            <h1 className="text-xl font-black tracking-wide text-white sm:text-2xl">
              WELCOME <span className="text-[#55baff]">TO</span>{" "}
              <span className="bg-gradient-to-r from-[#ff4eaa] to-[#55baff] bg-clip-text text-transparent">
                PROBOSS LUDO
              </span>
            </h1>
            <p className="mt-2 text-xs font-semibold text-[#cdb9da] sm:text-sm">
              Sign in securely with your mobile number
            </p>
          </div>
        </header>

        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#f41468] to-transparent" />

        <section key={step} className="animate-rise">
          {step === "phone" ? (
            <form onSubmit={requestOtp} className="flex flex-col gap-4">
              <div className="flex items-center rounded-xl border border-[#6d245e] bg-[#10001f] px-3.5 transition-all focus-within:border-[#55baff] focus-within:ring-2 focus-within:ring-[#1689ff]/25">
                <span className="border-r border-[#6d245e] py-3 pr-3 text-sm font-bold text-white">+91</span>
                <input
                  id="login-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  placeholder="Enter mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm text-white outline-none placeholder:text-[#b69bc4]"
                />
              </div>
              <Button
                type="submit"
                className="mt-1 w-full bg-gradient-to-r from-[#f41468] via-[#a82978] to-[#1689ff] py-3 text-sm uppercase tracking-wide text-white shadow-[0_8px_24px_rgba(20,145,255,.24)] hover:brightness-110 disabled:opacity-55"
                loading={busy}
                disabled={busy || phone.length !== 10}
              >
                Send OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={doVerify} className="flex flex-col gap-4">
              <div className="text-center">
                <p className="text-sm font-bold text-white">Verify your mobile number</p>
                <p className="mt-1 text-xs font-semibold text-[#cdb9da]">
                  OTP sent to <span className="text-[#55baff]">+91 {phone}</span>
                </p>
              </div>
              {devOtp && (
                <p className="rounded-lg border border-[#55baff]/30 bg-[#1689ff]/10 px-3 py-2 text-center text-xs font-bold text-[#8cddff]">
                  Local development OTP: {devOtp}
                </p>
              )}
              <label htmlFor="login-otp" className="sr-only">6-digit OTP</label>
              <input
                id="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-xl border border-[#6d245e] bg-[#10001f] px-3.5 py-3 text-center text-xl font-bold tracking-[0.4em] text-white outline-none transition-all placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#b69bc4] focus:border-[#55baff] focus:ring-2 focus:ring-[#1689ff]/25"
              />
              <label htmlFor="login-referral" className="sr-only">Referral code (optional)</label>
              <input
                id="login-referral"
                type="text"
                autoComplete="off"
                placeholder="Referral code (optional)"
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-[#6d245e] bg-[#10001f] px-3.5 py-3 text-sm text-white outline-none transition-all placeholder:text-[#b69bc4] focus:border-[#55baff] focus:ring-2 focus:ring-[#1689ff]/25"
              />
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-[#f41468] via-[#a82978] to-[#1689ff] py-3 text-sm uppercase tracking-wide text-white shadow-[0_8px_24px_rgba(20,145,255,.24)] hover:brightness-110 disabled:opacity-55"
                loading={busy}
                disabled={busy || otp.length !== 6}
              >
                Verify &amp; play
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                  setDevOtp("");
                }}
                className="py-1 text-center text-xs font-bold text-[#55baff] transition-colors hover:text-white"
              >
                Change mobile number
              </button>
            </form>
          )}
        </section>
      </Card>

      <p className="relative z-10 mt-5 max-w-[380px] px-2 text-center text-[11px] font-semibold text-[#cdb9da]">
        By continuing, you confirm that you are 18+ and agree to our{" "}
        <span className="text-white">Terms &amp; Conditions</span> and{" "}
        <span className="text-white">Privacy Policy</span>.
      </p>
    </main>
  );
}
