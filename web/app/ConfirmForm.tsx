"use client";

import { useRef } from "react";

// Formulaire d'action serveur avec confirmation avant envoi : utilisé pour
// « Exclure » (quasi définitif) afin d'éviter les clics malheureux.
// Avec `askReason`, la confirmation demande aussi pourquoi (facultatif) ; la
// réponse part dans le champ `reason`, que la routine lit pour apprendre.
export function ConfirmForm({
  action,
  confirmText,
  askReason = false,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmText: string;
  askReason?: boolean;
  children: React.ReactNode;
}) {
  const reasonRef = useRef<HTMLInputElement>(null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!askReason) {
          if (!window.confirm(confirmText)) e.preventDefault();
          return;
        }
        const reason = window.prompt(
          `${confirmText}\n\nPourquoi ? (facultatif, aide la routine à apprendre ce que tu n'aimes pas)`,
          ""
        );
        if (reason === null) {
          e.preventDefault();
          return;
        }
        if (reasonRef.current) reasonRef.current.value = reason;
      }}
    >
      {askReason && <input ref={reasonRef} type="hidden" name="reason" defaultValue="" />}
      {children}
    </form>
  );
}
