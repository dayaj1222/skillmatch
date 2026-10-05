import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { MagnifyingGlass, FolderOpen, User, SignOut } from "@phosphor-icons/react";

import { useAuth } from "../lib/auth";

/**
 * App shell.
 *
 * Nav is a single row at desktop and collapses labels (keeps icons) below md,
 * so it never wraps to two lines. Height is 60px, under the 80px cap.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors",
      isActive
        ? "bg-[var(--color-sunken)] text-[var(--color-ink)]"
        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
    ].join(" ");

  return (
    <div className="min-h-[100dvh] bg-[var(--color-paper)]">
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--color-paper)]/92 backdrop-blur-sm">
        <div className="mx-auto flex h-[60px] max-w-[1120px] items-center gap-1 px-4 sm:px-6">
          <NavLink to="/" className="mr-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--color-accent)] text-[11px] font-bold text-white">
              SM
            </span>
            <span className="hidden text-[0.9375rem] font-semibold tracking-[-0.01em] text-[var(--color-ink)] sm:inline">
              SkillMatch
            </span>
          </NavLink>

          <nav className="flex flex-1 items-center gap-0.5">
            <NavLink to="/search" className={linkClass}>
              <MagnifyingGlass size={15} weight="regular" />
              <span className="hidden md:inline">Find people</span>
            </NavLink>
            <NavLink to="/projects" className={linkClass}>
              <FolderOpen size={15} weight="regular" />
              <span className="hidden md:inline">Projects</span>
            </NavLink>
            {user && (
              <NavLink to={`/u/${user.username}`} className={linkClass}>
                <User size={15} weight="regular" />
                <span className="hidden md:inline">My profile</span>
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-1.5">
            {user ? (
              <>
                <NavLink
                  to="/projects/new"
                  className="btn btn-primary h-8 px-3 text-[0.8125rem]"
                >
                  New project
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn btn-ghost h-8 w-8 px-0"
                  title={`Sign out ${user.username}`}
                  aria-label="Sign out"
                >
                  <SignOut size={15} weight="regular" />
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="btn btn-ghost h-8">
                  Sign in
                </NavLink>
                <NavLink to="/register" className="btn btn-primary h-8 px-3">
                  Join
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1120px] px-4 pb-10 pt-4 sm:px-6">
        <p className="text-[0.75rem] text-[var(--color-ink-faint)]">
          SkillMatch. A database-systems project: the schema enforces the rules.
        </p>
      </footer>
    </div>
  );
}
