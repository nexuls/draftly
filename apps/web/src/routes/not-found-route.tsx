import { Link } from "react-router";
import { Wordmark } from "@/components/wordmark";

/**
 * Catch-all route.
 *
 * An empty screen is an invitation to act, so this one names the two places there are to
 * go rather than dressing up the status code.
 *
 * @returns The not-found element
 */
export function NotFoundRoute() {
  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="measure text-center">
        <Wordmark className="text-2xl" />
        <p className="text-foreground mt-8 text-xl">There is nothing at this address.</p>
        <p className="text-muted-foreground mt-3 text-base">
          Two things exist here: the{" "}
          <Link to="/" className="text-pencil-blue underline underline-offset-4">
            front page
          </Link>{" "}
          and the{" "}
          <Link to="/playground" className="text-pencil-blue underline underline-offset-4">
            playground
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
