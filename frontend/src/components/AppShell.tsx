import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { SignOut } from "@phosphor-icons/react";

import { useAuth } from "../lib/auth";

/**
 * App shell.
 *
 * Navigation is one quiet bar, sentence case, never wraps: it stays on a
 * single line at every width rather than stacking. The active item is marked
 * with an underline in the signal colour, not a filled block — the bar should
 * recede so the content carries the page.
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
      "relative px-3 py-1.5 text-[0.875rem] font-medium transition-colors",
      isActive ? "text-ink" : "text-muted hover:text-ink",
    ].join(" ");

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex h-[60px] max-w-[1600px] items-center gap-2 px-4 sm:px-8">
          <NavLink to="/" className="mr-5 flex items-baseline gap-1.5">
            <span className="display text-[1.1875rem]">SkillMatch</span>
          </NavLink>

          <nav className="flex flex-1 items-center gap-0.5">
            <NavLink to="/search" className={linkClass}>
              {({ isActive }) => (
                <>
                  Find people
                  {isActive && <NavUnderline />}
                </>
              )}
            </NavLink>
            <NavLink to="/projects" className={linkClass}>
              {({ isActive }) => (
                <>
                  Projects
                  {isActive && <NavUnderline />}
                </>
              )}
            </NavLink>
            {user && (
              <NavLink to={`/u/${user.username}`} className={linkClass}>
                {({ isActive }) => (
                  <>
                    {user.username}
                    {isActive && <NavUnderline />}
                  </>
                )}
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

      <main className="mx-auto max-w-[1600px] px-4 py-10 sm:px-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-12 pt-6 sm:px-8">
        <p className="border-t border-rule pt-5 text-[0.8125rem] text-faint">
          SkillMatch — a team-finder for small projects.
        </p>
      </footer>
    </div>
  );
}

/** The active-tab marker: a short rule sitting on the bar's baseline. */
function NavUnderline() {
  return (
    <span className="pointer-events-none absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-signal" />
  );
}
