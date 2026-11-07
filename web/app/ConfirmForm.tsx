"use client";

// Formulaire d'action serveur avec confirmation avant envoi : utilisé pour
// « Exclure » (quasi définitif) afin d'éviter les clics malheureux.
export function ConfirmForm({
  action,
  confirmText,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmText: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
