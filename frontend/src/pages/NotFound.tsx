import { Link } from "react-router-dom";

/** 404. Plain, gives a way out, no joke copy. */
export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-[480px] py-16 text-center">
      <p className="tnum text-[0.8125rem] text-faint">404</p>
      <h1 className="display mt-2 text-[1.5rem]">That page does not exist</h1>
      <p className="mt-2 text-sm text-muted">
        The link may be old, or the thing it pointed at was deleted.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/projects" className="btn btn-primary">
          Browse projects
        </Link>
        <Link to="/search" className="btn btn-secondary">
          Find people
        </Link>
      </div>
    </div>
  );
}
