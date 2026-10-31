# Arrow plotting (like MyTargets)

Status: implemented
Date: 2026-10-23
Updated: 2026-10-28

- The end screen shows the chosen target face full width. The archer touches where the arrow hit; while the finger is down, the whole view **zooms** in and a cross a bit above the finger marks the exact spot, and the arrow is set on release. The zoomed view pans so every spot on the face can be reached.
- The score is **computed from the position** using the face's ring radii (an arrow touching a line is placed in the higher ring by the archer, as in WA rules). Tapping outside the face records a miss.
- Placed arrows can be dragged to correct them or deleted. The end's arrows are listed under the face with their scores, sorted high to low.
- Optional: assign the **arrow number** for each shot, to spot a single arrow that groups badly.
- Multi-spot faces (40 cm triple, vertical or triangular) show all spots; each arrow belongs to the spot it was placed on.
- After each end: end total, running total, and the end's group drawn on the face. The session view overlays all arrows with the group centre and spread.
- Built-in faces (`shared/target-faces.json`): WA 122, 80, 60 and 40 cm; WA 60 and 40 cm with the small compound 10; WA 80 cm 6-ring; WA 40 cm triple (vertical and triangle, recurve and compound); WA field 80, 60, 40 and 20 cm; and an unscored "blank" face. The WA Vegas 3-spot looks like the triangle triple, but its dimensions are not confirmed, so it is not listed separately. 3D scoring zones are not built.
- Scoring rules (`server/targets/scoring.py` and `src/lib/scoring.ts`, both tested against the hand-calculated cases in `shared/scoring-vectors.json`): the score comes from the plotted position only, and a position exactly on a line scores the higher value. An arrow that touches a line is dragged by the archer into the higher ring; the app does not model arrow width. The X counts at or inside the X ring. Outside the outermost ring is a miss. The server recomputes every score on upload and stores its own value. `shared/scoring-vectors.json` has vectors for every ring of every scored face, an X where the face has one, and a miss (the first, hand-calculated set did not reach every face; the rest were written from the ring diameters in `target-faces.json`, not from the code). Both test suites fail for a face or ring without a vector, so a new face needs vectors first (#93). Without an account the app is the only scorer.
