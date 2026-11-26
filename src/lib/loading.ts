/** Put the full-screen loader up for something that is not a link click (sign in, sign out, the command palette). */
export function showLoading() {
  document.documentElement.dataset.loading = "1"; // up on this very frame, before React renders
  window.dispatchEvent(new Event("budggyy:loading"));
}
/** Take it down at once, for when the thing failed and the user stays on the page. */
export function hideLoading() {
  window.dispatchEvent(new Event("budggyy:loading-end"));
}
