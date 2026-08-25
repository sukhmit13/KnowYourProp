import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Pop-up notice shown to team members after they sign in.
 *
 * Audience: every team account (any @test.com email — single-report and
 * unlimited subscription alike) EXCEPT the owner, test@test.com.
 * Runs in both development and production (no environment gate).
 *
 * To revise the message: edit MESSAGE below and bump MESSAGE_VERSION so
 * everyone sees the new text once, even if they dismissed the old one.
 */
const MESSAGE_VERSION = 1;
const MESSAGE_TITLE = "A note from Sukhmit";
const MESSAGE = `Sukhmit has decided to redesign the site again, capital AGAIN!

I appreciate your help and will reach back out for your feedback as soon as it's ready.`;

const OWNER_EMAIL = "test@test.com";
const DISMISS_KEY = "kyp_team_notice_v";

function isTeamViewer(email: string | undefined | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.endsWith("@test.com") && lower !== OWNER_EMAIL;
}

export default function TeamLoginNotice() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isTeamViewer(user?.email)) { setOpen(false); return; }
    let dismissed: string | null = null;
    try { dismissed = localStorage.getItem(`${DISMISS_KEY}:${user!.email.toLowerCase()}`); } catch {}
    setOpen(dismissed !== String(MESSAGE_VERSION));
  }, [user?.email]);

  if (!open || !user) return null;

  const dismiss = () => {
    try { localStorage.setItem(`${DISMISS_KEY}:${user.email.toLowerCase()}`, String(MESSAGE_VERSION)); } catch {}
    setOpen(false);
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 no-print"
      onClick={dismiss}
      data-testid="modal-team-notice"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={MESSAGE_TITLE}
        className="relative w-full max-w-md rounded-[14px] bg-white p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          data-testid="button-close-team-notice"
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4"><Logo /></div>
        <div className="mb-3 text-[15px] font-semibold text-gray-900">{MESSAGE_TITLE}</div>
        <div className="whitespace-pre-line text-[14px] leading-relaxed text-gray-700">{MESSAGE}</div>
        <button
          onClick={dismiss}
          data-testid="button-ack-team-notice"
          className="mt-6 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
