import { notFound } from "next/navigation";

/** Any path under a locale that no route claims → the locale's own 404 page, not the framework default. */
export default function CatchAll() {
  notFound();
}
