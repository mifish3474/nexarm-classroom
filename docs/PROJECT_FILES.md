# Program files, automatic saving and saved positions: dev.69

Saved positions belong to the current program. **Save program** includes every
position's name and XYZ/P/R/C measurements, even if no block uses that position.
Older six-joint positions remain in the file as explicitly labeled legacy data.
In Chrome or Edge, a user-selected JSON file is the working document. After the
first Save, changes to code, project name, My Blocks and saved positions
update that same file automatically after a short pause. The browser position
cache remains a recovery aid, not a separate project library. There are no
accounts or uploads. Shared-browser cache data remains visible to other users of
that browser profile.

Dev.60 also saves inline comment blocks wherever they appear in the code, including
event stacks and My Blocks. They are plain text for readers and are skipped during
execution. Use dev.60 or newer to load a program containing comment blocks.

Dev.61 saves `move to Home` as a dedicated instruction, not a recorded position.
Its fixed destination comes from the app's established Home definition, so it
needs no saved-position entry. Use dev.61 or newer to load a file with Home blocks.

## Save and switch programs

1. Name the project above the code, then choose **File → Save program**. Chrome
   or Edge asks for a filename and location the first time. The filename becomes
   the project name shown above the canvas, without `.json`. A status pill beside
   it reports Saving and Saved; the footer provides details. Later edits update that file without
   another click. **Save as new file** changes the active file; **Download copy**
   creates an independent backup that is not updated. The JSON contains the code,
   My Blocks, event stacks and complete saved-position list, including unused
   positions. Initial assignments are saved; live variable values, USB
   connections and holding state are not.
2. **New empty program** clears blocks, functions, variables and all saved
   positions, including the browser's position working copy. Save first if you
   want to keep them. New does not send robot movement or change servo holding.
3. **Load program** replaces the code and position list with the file's contents.
   In Chrome or Edge, the chosen file becomes the active automatically saved file.
   It does not merge another program's positions. Loaded positions appear in
   Positions and in block dropdowns; Add to code, Delete and Move to position
   work as usual. Loading itself never connects or moves the robot.
4. An invalid file leaves the existing program, project name and positions intact.
   A failed browser-cache write leaves the loaded positions usable in memory and
   displays Memory only; save the program before closing or reloading.

Direct file access is browser-controlled. After closing or reopening the site,
choose Load program again to reconnect the local file. If the browser does not
support writable file pickers, Save program downloads a new copy and Load program
uses ordinary upload selection. Unfinished Blockly arrangements are saved too.
Loose stacks, partially assembled expressions and unassigned event blocks remain
in their canvas positions when the file is reopened. Saving a draft does not make
it runnable: **Run program** still requires executable stack structure and applies
all existing program and movement checks.

Loading a supplied example also starts with that example's position list (empty
for the current examples). Clearing or deleting a position used in code makes
that block invalid until you choose a valid position; the deleted position does
not survive in a separate hidden file library.

## Older files and existing browser positions

The existing browser working copy is kept when upgrading/opening the app. Save
your current program before choosing New or loading another file to include all
of those positions in the new format.

Newly saved programs use **format 6**, which adds the complete Blockly workspace.
Files from formats 1-5 still load. Older
files contain only position snapshots used by their blocks, so those snapshots
become the loaded program's visible position list. Unused positions omitted from
an old file cannot be recovered from that file. Old snapshots without a capture
timestamp use an epoch placeholder for unknown capture time; it is not a new
measurement. If old snapshots share a name or ID but contain different targets,
the importer gives them distinct names/IDs while preserving all six target values.
Older app builds cannot open format 6.

Up to 32 positions may be stored per program. File size, measured-value validation,
calculated joint target checks and motion policy remain in effect. A coordinate
endpoint does not by itself establish a collision-free route; dev.68 preflights
bounded straight-line calculation samples, then executes one smooth joint-space
move to the accepted endpoint. The separate **Export saved positions** tool
still downloads a positions-only backup; use Save program for a complete project.
