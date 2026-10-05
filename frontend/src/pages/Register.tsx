import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ErrorNote } from "../components/ui";
import { useAuth } from "../lib/auth";
import { AuthLayout } from "./Login";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mirror the backend's own rules so the user learns them before submitting.
  const usernameIssue =
    username.length > 0 && username.length < 3
      ? "At least 3 characters."
      : username.length > 0 && !/^[A-Za-z0-9_.-]+$/.test(username)
        ? "Letters, numbers, dot, dash and underscore only."
        : null;
  const passwordIssue =
    password.length > 0 && password.length < 8 ? "At least 8 characters." : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(username, email, password);
      navigate(`/u/${username}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      subtitle="You will fill in your skills next, so people can find you."
      footer={
        <>
          Already have one?{" "}
          <Link to="/login" className="font-medium text-[var(--color-accent)] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <ErrorNote message={error} />}

        <div>
          <label htmlFor="username" className="field-label">
            Username
          </label>
          <input
            id="username"
            className="field-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            aria-invalid={Boolean(usernameIssue)}
            aria-describedby={usernameIssue ? "username-issue" : undefined}
            autoFocus
            required
          />
          {usernameIssue && (
            <p id="username-issue" className="field-error">
              {usernameIssue}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <p className="field-help">Not shown on your public profile.</p>
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
            autoComplete="new-password"
            aria-invalid={Boolean(passwordIssue)}
            aria-describedby={passwordIssue ? "password-issue" : undefined}
            required
          />
          {passwordIssue && (
            <p id="password-issue" className="field-error">
              {passwordIssue}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={busy || Boolean(usernameIssue) || Boolean(passwordIssue)}
        >
          {busy ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
