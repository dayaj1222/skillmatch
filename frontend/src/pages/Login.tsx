import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ErrorNote } from "../components/ui";
import { useAuth } from "../lib/auth";

/** Auth pages share a centred card and the same field markup. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-paper)] px-4 py-10">
      <div className="w-full max-w-[380px]">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[var(--color-accent)] text-[12px] font-bold text-white">
            SM
          </span>
          <span className="text-base font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
            SkillMatch
          </span>
        </Link>

        <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{subtitle}</p>

        <div className="mt-6">{children}</div>
        <div className="mt-5 text-sm text-[var(--color-ink-muted)]">{footer}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(identifier, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use your username or email."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-medium text-[var(--color-accent)] hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorNote message={error} />}

        <div>
          <label htmlFor="identifier" className="field-label">
            Username or email
          </label>
          <input
            id="identifier"
            className="field-input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
