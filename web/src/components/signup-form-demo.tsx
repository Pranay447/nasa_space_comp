import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function SignupFormDemo({ onDone }: { onDone?: () => void }) {
  const [done, setDone] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.currentTarget.reset();
    setDone(true);
  };

  return (
    <div className="mx-auto w-full max-w-md bg-panel p-4 text-ink md:p-6">
      <h2 id="signup-heading" className="text-xl font-bold text-ink">
        Save your investigations
      </h2>
      <p className="mt-2 text-sm text-dim">
        Accounts are optional. Every dataset and analysis in Trend Atlas works
        without one.
      </p>
      <div
        role="note"
        className="mt-4 rounded-md border border-accent bg-accent/10 p-3 text-sm text-ink"
      >
        Preview only — sign-up is not connected to an account service yet.
        Nothing you type here is sent or stored.
      </div>

      <form className="mt-6" onSubmit={handleSubmit} autoComplete="off">
        <LabelInputContainer className="mb-4">
          <Label htmlFor="signup-name" className="text-ink">Name</Label>
          <Input id="signup-name" name="name" type="text" autoComplete="off" />
        </LabelInputContainer>
        <LabelInputContainer className="mb-4">
          <Label htmlFor="signup-email" className="text-ink">Email</Label>
          <Input id="signup-email" name="email" type="email" autoComplete="off" />
        </LabelInputContainer>
        <LabelInputContainer className="mb-6">
          <Label htmlFor="signup-password" className="text-ink">Password</Label>
          <Input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
          />
        </LabelInputContainer>

        <button
          className="group/btn relative block min-h-11 w-full rounded-md bg-accent font-medium text-on-accent"
          type="submit"
        >
          Try the preview &rarr;
          <BottomGradient />
        </button>
      </form>

      {done && (
        <div className="mt-4 flex flex-col gap-3">
          <p role="status" className="text-sm text-ink">
            Preview complete. No account was created and your input was
            discarded.
          </p>
          <button type="button" className="ta-btn self-start" onClick={onDone}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

const BottomGradient = () => (
  <>
    <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
    <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
  </>
);

const LabelInputContainer = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex w-full flex-col space-y-2", className)}>
    {children}
  </div>
);
