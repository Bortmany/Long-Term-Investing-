// Guard against Next.js's Server Action body decoder crashing on a malformed
// request body — pulled out of src/proxy.ts (same pattern as
// src/lib/request-origin.ts) so the check is a plain function against a
// standard Request/Headers, testable without mocking the Edge runtime.
//
// Server Action POSTs get decoded by Next.js's own body decoder
// (react-server-dom's decodeReply / busboy for multipart) BEFORE our action
// function — and its Zod validation — ever runs. A malformed body (garbage
// bytes, a broken multipart boundary) makes that internal decoder throw,
// which surfaces as an unhandled HTTP 500 with no chance for the action to
// return its normal clean `{ ok: false, error }` shape. Reading a CLONE of
// the body here (the original stream still reaches the action handler
// untouched) lets the proxy turn a decode failure into a clean 400 instead,
// before the request ever reaches that internal decoder.

/** The header Next.js's Server Actions runtime uses to identify a "fetch
 * action" POST (see next/dist/server/lib/server-action-request-meta.js). */
export const NEXT_ACTION_HEADER = "next-action";

/**
 * True when `request`'s body can be decoded as whatever its Content-Type
 * claims (multipart/form-data, or anything else as text). False means the
 * body is malformed and would otherwise crash Next's internal decoder.
 */
export async function isActionBodyDecodable(request: Request): Promise<boolean> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.startsWith("multipart/form-data")) {
      await request.clone().formData();
    } else {
      await request.clone().text();
    }
    return true;
  } catch {
    return false;
  }
}
