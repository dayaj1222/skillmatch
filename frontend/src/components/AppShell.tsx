import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { SignOut } from "@phosphor-icons/react";

import { useAuth } from "../lib/auth";

/**
 * App shell.
 *
 * Navigation is one ruled bar, uppercase, never wraps: it stays on a single
 * line at every width rather than stacking.
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
      "px-2.5 py-1 text-[0.75rem] font-bold uppercase tracking-[0.06em] transition-colors",
      isActive ? "bg-ink text-inverse" : "text-muted hover:bg-ink hover:text-inverse",
    ].join(" ");

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b-3 border-rule bg-paper">
        <div className="mx-auto flex h-[60px] max-w-[1180px] items-center gap-2 px-4 sm:px-6">
          <NavLink to="/" className="mr-4">
            <span className="display text-[1.0625rem]">Skillmatch</span>
          </NavLink>

          <nav className="flex flex-1 items-center gap-1">
            <NavLink to="/search" className={linkClass}>
              Find people
            </NavLink>
            <NavLink to="/projects" className={linkClass}>
              Projects
            </NavLink>
            {user && (
              <NavLink to={`/u/${user.username}`} className={linkClass}>
                {user.username}
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <NavLink to="/projects/new" className="btn btn-primary h-9">
                  New project
                </NavLink>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn btn-secondary h-9 w-9 px-0"
                  aria-label="Sign out"
                  title={`Sign out ${user.username}`}
                >
                  <SignOut size={15} weight="bold" />
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="btn btn-secondary h-9">
                  Sign in
                </NavLink>
                <NavLink to="/register" className="btn btn-primary h-9">
                  Join
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1180px] px-4 pb-12 pt-6 sm:px-6">
        <p className="border-t-3 border-rule pt-4 text-[0.75rem] uppercase tracking-[0.06em] text-faint">
          SkillMatch. A database-systems project: the schema enforces the rules.
        </p>
      </footer>
    </div>
  );
}
