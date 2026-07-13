// Shared result shape for server actions — the same honest two-branch style
// as the data layer's DataResult: either it worked and here is the data, or
// it did not and here is a plain-English sentence the UI can show as-is.

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function actionError(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

export function actionOk<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export const NOT_SIGNED_IN_ERROR =
  "You need to be signed in to do that. Please sign in and try again.";
