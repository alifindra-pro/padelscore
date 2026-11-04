export function isTemporaryLoginEnabled() {
  return (
    process.env.TEMPORARY_BUTTON_LOGIN === "true" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL !== "1"
  );
}
