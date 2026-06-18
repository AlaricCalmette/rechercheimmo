"use client";

import { useState, useTransition } from "react";
import { updateListingNotes } from "./actions";

// Notes d'une annonce, éditables en place depuis le site. En lecture : affiche
// « ce qui me plaît » / « ce qui ne me plaît pas » + un bouton pour passer en
// édition. En édition : deux zones de texte enregistrées via l'action serveur,
// puis retour automatique en lecture.
export function NotesEditor({
  id,
  notes,
  dislikes,
}: {
  id: string;
  notes: string | null;
  dislikes: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="notes-view">
        {notes && <div className="note">{notes}</div>}
        {dislikes && <div className="note note-neg">{dislikes}</div>}
        <button
          type="button"
          className="note-edit-btn"
          onClick={() => setEditing(true)}
        >
          {notes || dislikes ? "Modifier les notes" : "Ajouter des notes"}
        </button>
      </div>
    );
  }

  return (
    <form
      className="notes-edit"
      action={(formData) => {
        startTransition(async () => {
          await updateListingNotes(formData);
          setEditing(false);
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <label className="notes-edit-field">
        <span>Ce qui me plaît</span>
        <textarea name="notes" defaultValue={notes ?? ""} rows={3} />
      </label>
      <label className="notes-edit-field neg">
        <span>Ce qui ne me plaît pas</span>
        <textarea name="dislikes" defaultValue={dislikes ?? ""} rows={2} />
      </label>
      <div className="notes-edit-actions">
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
