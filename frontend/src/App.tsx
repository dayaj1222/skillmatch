import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { AppShell } from "./components/AppShell";
import { SkeletonRows } from "./components/ui";
import { useAuth } from "./lib/auth";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { SearchPage } from "./pages/Search";
import { ProfilePage } from "./pages/Profile";
import { ProjectsPage } from "./pages/Projects";
import { ProjectDetailPage } from "./pages/ProjectDetail";
import { ProjectFormPage } from "./pages/ProjectForm";
import { NotFoundPage } from "./pages/NotFound";

/** Gate a route behind auth without flashing the login screen on first load. */
function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="mx-auto max-w-[640px] pt-8">
        <SkeletonRows rows={3} />
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<SearchPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="people" element={<SearchPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<ProjectFormPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="projects/:id/edit" element={<ProjectFormPage />} />
        <Route
          path="u/:username"
          element={
            <Protected>
              <ProfilePage />
            </Protected>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Auth pages sit outside the shell: no nav competing with the form. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Routes>
  );
}
