import { useEffect, useState } from "react";
import { GithubLogo, GoogleLogo } from "@phosphor-icons/react";

import { api } from "../lib/api";
import type { OAuthProvider } from "../lib/types";

/**
 * OAuth entry points.
 *
 * The server advertises only the providers whose client id/secret are set, so
 * local development without credentials shows nothing instead of dead buttons.
 * OAuth is a full-page redirect: the backend sets the session cookie and
 * bounces the browser back to `next`.
 */
export function OAuthButtons({ next = "/" }: { next?: string }) {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);

  useEffect(() => {
    api
      .oauthProviders()
      .then((r) => setProviders(r.providers))
      .catch(() => setProviders([]));
  }, []);

  if (providers.length === 0) return null;

  return (
    <div className="mt-5 space-y-2">
      <div className="flex items-center gap-3 text-[0.7rem] uppercase tracking-[0.12em] text-faint">
        <span className="h-px flex-1 bg-rule" />
        or continue with
        <span className="h-px flex-1 bg-rule" />
      </div>
      {providers.includes("github") && (
        <a
          href={api.oauthLoginUrl("github", next)}
          className="btn btn-secondary w-full"
        >
          <GithubLogo size={16} weight="fill" />
          Continue with GitHub
        </a>
      )}
      {providers.includes("google") && (
        <a
          href={api.oauthLoginUrl("google", next)}
          className="btn btn-secondary w-full"
        >
          <GoogleLogo size={16} weight="bold" />
          Continue with Google
        </a>
      )}
    </div>
  );
}
