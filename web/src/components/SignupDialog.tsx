import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import SignupFormDemo from "@/components/signup-form-demo";

export function SignupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handle = () => onClose();
    d.addEventListener("close", handle);
    return () => d.removeEventListener("close", handle);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="signup-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[28rem] rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/60"
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Close sign-up preview"
          onClick={() => ref.current?.close()}
          className="absolute top-1 right-1 flex h-11 w-11 items-center justify-center rounded-md text-dim hover:text-ink"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        {open && <SignupFormDemo onDone={() => ref.current?.close()} />}
      </div>
    </dialog>
  );
}
