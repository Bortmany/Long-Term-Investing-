// Plain-English billing sentences, whole strings in one place (easy to
// translate later, easy for tests to assert word for word).

export const BILLING_OFF_MESSAGE = "Payments aren't turned on yet.";

export const CHECKOUT_FAILED_MESSAGE =
  "We couldn't open checkout. Nothing was charged. Please try again in a minute.";

export const PORTAL_FAILED_MESSAGE =
  "We couldn't open the billing page. Please try again in a minute.";

export const ALREADY_PRO_MESSAGE =
  "You're already on Pro. Use Manage billing to change or cancel it.";

export const NO_BILLING_ACCOUNT_MESSAGE =
  "There's no billing account to manage yet. Payments you make through Upgrade will show up here.";

export function cancelBeforeDeleteFailedMessage(contactEmail: string): string {
  return (
    "We couldn't cancel your subscription, so we haven't deleted your account yet. " +
    `Try again, or contact ${contactEmail}.`
  );
}

export const WEBHOOK_DORMANT_MESSAGE =
  "Payments are turned off on this server (billing is dormant), so billing events are not accepted.";
