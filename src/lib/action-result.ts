// Shared result shape for server actions — the same honest two-branch style
// as the data layer's DataResult: either it worked and here is the data, or
// it did not and here is a plain-English sentence the UI can show as-is.
//
// A failure may also carry a short machine-readable `code` (for example
// "AI_LIMIT_FREE_DAILY" or "PRO_REQUIRED") so a button can pick the right
// calm notice instead of a red error, and — only when the server decided an
// upgrade is genuinely on offer — an `upgradeHref` for the "Upgrade to Pro"
// link. The sentence in `error` is always complete on its own.

export type ActionErrorCode =
  | "AI_LIMIT_FREE_DAILY"
  | "AI_LIMIT_PRO_DAILY"
  | "AI_LIMIT_PRO_MONTHLY"
  | "AI_LIMIT_GLOBAL_DAILY"
  | "PRO_REQUIRED";

export type ActionFailure = {
  ok: false;
  error: string;
  code?: ActionErrorCode;
  upgradeHref?: string;
};

export type ActionResult<T = null> = { ok: true; data: T } | ActionFailure;

export function actionError(
  message: string,
  extra?: { code?: ActionErrorCode; upgradeHref?: string },
): ActionFailure {
  const failure: ActionFailure = { ok: false, error: message };
  if (extra?.code) failure.code = extra.code;
  if (extra?.upgradeHref) failure.upgradeHref = extra.upgradeHref;
  return failure;
}

export function actionOk<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/**
 * Turn a failed AI run (runAnalysis / runCommittee / the weekly review) into
 * an action failure, keeping the limit code and upgrade link when the run was
 * refused by a spend limit. Other failures stay a plain sentence.
 */
export function aiRunError(result: {
  message: string;
  limit?: { code: ActionErrorCode; upgradeHref?: string };
}): ActionFailure {
  return actionError(result.message, result.limit);
}

export const NOT_SIGNED_IN_ERROR =
  "You need to be signed in to do that. Please sign in and try again.";
