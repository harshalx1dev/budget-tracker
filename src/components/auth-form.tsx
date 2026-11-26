"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { hideLoading, showLoading } from "@/lib/loading";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const requested = useSearchParams().get("next");
  const next = requested?.startsWith("/app") ? requested : "/app";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    showLoading();
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    let res;
    try {
      res = signup
        ? await authClient.signUp.email({ name: String(f.get("name")), email, password })
        : await authClient.signIn.email({ email, password });
    } catch {
      setBusy(false); hideLoading();
      return setError("Could not reach the server. Check your connection and try again.");
    }
    if (res.error) { setBusy(false); hideLoading(); return setError(res.error.message ?? "Something went wrong"); }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth-form" aria-busy={busy}>
      <h1>{signup ? "Create your account" : "Welcome back"}</h1>
      {signup && (
        <label className="field"><span className="label">Name</span><input name="name" required autoComplete="name" className="input" /></label>
      )}
      <label className="field"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
      <label className="field"><span className="label">Password</span><input name="password" type="password" required minLength={8} autoComplete={signup ? "new-password" : "current-password"} className="input" /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="btn btn--primary" disabled={busy}>{busy ? "One moment" : signup ? "Sign up" : "Sign in"}</button>
      <p className="label">
        {signup ? "Already have an account? " : "New here? "}
        <Link href={signup ? "/login" : "/signup"} className="link">{signup ? "Sign in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
