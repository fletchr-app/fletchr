import type { WhatsNewEntry } from '@/lib/whats-new';

// What changed for the people using the app, per version, in English and German. Shown once after an update and under
// Settings, "What's new". Only app changes, no server or operator notes (those are in CHANGELOG.md). Short points,
// du in German. A release adds its entry here (specs/steering/releasing.md).
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '0.31.0',
    en: [
      'Ends one after the other: confirming an end opens the next one straight away. The back arrow leads to the session.',
      'The arrow buttons at the bottom of the end screen step through the ends of the session. Changes to an end are saved with the check mark, Undo takes them back.',
      'The session page shows the plots and the list of ends; tap an end to change it. Finish and New end are at the bottom.',
      'Finishing a session asks first, and you stay on the session afterwards.',
      'On tall faces (3 spots on top of each other) you can start placing an arrow beside the face.',
      'This list of changes appears after an update, and under Settings, "What\'s new".',
    ],
    de: [
      'Passen nacheinander: Nach dem Bestätigen öffnet sich gleich die nächste Passe. Der Pfeil oben links führt zum Training.',
      'Mit den Pfeiltasten unten auf dem Passen-Bildschirm blätterst du durch die Passen des Trainings. Änderungen an einer Passe speicherst du mit dem Haken, Rückgängig nimmt sie zurück.',
      'Die Seite des Trainings zeigt die Trefferbilder und die Liste der Passen; tippe auf eine Passe, um sie zu ändern. Beenden und Neue Passe sind unten.',
      'Beim Beenden eines Trainings wird erst nachgefragt, danach bleibst du auf dem Training.',
      'Auf hohen Scheiben (3 Spots übereinander) kannst du einen Pfeil auch neben der Scheibe ansetzen.',
      'Diese Liste der Neuerungen erscheint nach einem Update, und unter Einstellungen, „Neuigkeiten“.',
    ],
  },
];
