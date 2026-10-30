# Program files and saved positions: dev.59

Saved positions belong to the current program. **Save program** includes every
position's name and six joint measurements, even if no block uses that position.
The browser retains a working copy to help with accidental reloads, but the
downloaded program file is the portable copy to keep and move between computers.
There are no accounts or uploads. Shared-browser working copies remain visible
to other users of that browser profile.

Dev.60 also saves inline comment blocks wherever they appear in the code, including
event stacks and My Blocks. They are plain text for readers and are skipped during
execution. Use dev.60 or newer to load a program containing comment blocks.

Dev.61 saves `move to Home` as a dedicated instruction, not a recorded position.
Its fixed destination comes from the app's established Home definition, so it
needs no saved-position entry. Use dev.61 or newer to load a file with Home blocks.

## Save and switch programs

1. Name the project above the code, then choose **File → Save program**.
   The downloaded JSON contains the code, My Blocks, event stacks and complete
   saved-position list, including unused positions. Initial assignments are
   saved; live variable values, USB connections and holding state are not.
2. **New empty program** clears blocks, functions, variables and all saved
   positions, including the browser's position working copy. Save first if you
   want to keep them. New does not send robot movement or change servo holding.
3. **Load program** replaces the code and position list with the file's contents.
   It does not merge another program's positions. Loaded positions appear in
   Positions and in block dropdowns; Add to code, Delete and Move to position
   work as usual. Loading itself never connects or moves the robot.
4. An invalid file leaves the existing program, project name and positions intact.
   A failed browser-cache write leaves the loaded positions usable in memory and
   displays Memory only; save the program before closing or reloading.

Loading a supplied example also starts with that example's position list (empty
for the current examples). Clearing or deleting a position used in code makes
that block invalid until you choose a valid position; the deleted position does
not survive in a separate hidden file library.

## Older files and existing browser positions

The existing browser working copy is kept when upgrading/opening the app. Save
your current program before choosing New or loading another file to include all
of those positions in the new format.

New program downloads use **format 5**. Files from formats 1-4 still load. Older
files contain only position snapshots used by their blocks, so those snapshots
become the loaded program's visible position list. Unused positions omitted from
an old file cannot be recovered from that file. Old snapshots without a capture
timestamp use an epoch placeholder for unknown capture time; it is not a new
measurement. If old snapshots share a name or ID but contain different targets,
the importer gives them distinct names/IDs while preserving all six target values.
Older app builds cannot open format 5.

Up to 32 positions may be stored per program. File size, measured-value validation,
joint target checks and motion policy remain in effect. An endpoint does not
establish a collision-free route. The separate **Export saved positions** tool
still downloads a positions-only backup; use Save program for a complete project.
