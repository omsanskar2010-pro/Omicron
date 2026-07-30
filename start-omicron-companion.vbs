' ═══════════════════════════════════════════════════════════════════
'  OMICRON COMPANION AUTO-START
'  start-omicron-companion.vbs
' ═══════════════════════════════════════════════════════════════════
'
'  WHAT THIS DOES:
'    Silently launches "node companion-server.js" in the background,
'    with NO visible terminal window — so it just quietly runs.
'
'  HOW TO SET IT UP (one-time, ~1 minute):
'    1. Edit the folder path below (COMPANION_FOLDER) to match exactly
'       where your companion-server.js file lives on your computer.
'    2. Press Win + R, type: shell:startup   and press Enter.
'       This opens your Windows Startup folder.
'    3. Copy this .vbs file into that folder.
'    4. Restart your laptop once (or log out and back in) to test it.
'
'  From then on, the companion server starts automatically every time
'  you log into Windows — you never need to open a terminal for it again.
'
'  TO VERIFY IT'S RUNNING:
'    Visit http://localhost:4477/health in any browser — if you see
'    {"ok":true,...}, it's running.
'
'  TO STOP IT PERMANENTLY:
'    Remove this .vbs file from the Startup folder (shell:startup),
'    then restart. To stop it just for right now without removing the
'    file, open Task Manager → find "Node.js JavaScript Runtime" → End Task.

Dim COMPANION_FOLDER
COMPANION_FOLDER = "C:\Users\OM SANSKAR\OneDrive\Desktop\OMICRON"

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d """ & COMPANION_FOLDER & """ && node companion-server.js", 0, False
