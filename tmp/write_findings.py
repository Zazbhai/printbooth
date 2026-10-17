import json

findings = [
    # ===== SECURITY VULNERABILITIES =====
    {
        "file": "kiosk/brain/ws_kiosk_client.py",
        "line": 357,
        "short_summary": "SQL injection via unsanitized order_id in SQLite DELETE",
        "category": "security-vulnerability",
        "severity": "critical",
        "description": "The _mark_as_collected method builds an SQLite DELETE by f-string interpolation: f\"DELETE FROM claims WHERE order_id='{order_id}'\". No parameterized query. An attacker controlling order_id can inject arbitrary SQL."
    },
    {
        "file": "kiosk/brain/ws_kiosk_client.py",
        "line": 640,
        "short_summary": "Insecure temp file creation in /tmp without O_EXCL",
        "category": "security-vulnerability",
        "severity": "high",
        "description": "download_file writes to /tmp/printbooth_{order_id}_{filename} via open(path, 'wb'). Vulnerable to symlink attacks and TOCTOU race conditions. Should use tempfile.NamedTemporaryFile or O_EXCL."
    },
    {
        "file": "services/api/src/modules/cups.ts",
        "line": 523,
        "short_summary": "Command injection via shell string concatenation in executePythonPrint",
        "category": "security-vulnerability",
        "severity": "critical",
        "description": "executePythonPrint constructs a shell command by string concatenation. filePath, printerName, and jobTitle are user-controlled and passed directly into the shell without sanitization."
    },
    {
        "file": "services/api/src/modules/cups.ts",
        "line": 520,
        "short_summary": "Printer name can break shell quoting in executePythonPrint",
        "category": "security-vulnerability",
        "severity": "high",
        "description": "printerArg uses double quotes around printerName: --printer \"${printerName}\". If printerName contains a closing double-quote, it breaks shell quoting and enables injection."
    },
    {
        "file": "kiosk/brain/ws_kiosk_client.py",
        "line": 118,
        "short_summary": "No TLS certificate verification on WebSocket connection",
        "category": "security-vulnerability",
        "severity": "high",
        "description": "The WebSocket connection uses websockets.connect() without ssl parameter verification. If the connection falls back to non-WSS (ws://), the entire communication channel is unencrypted and vulnerable to MITM."
    },
    {
        "file": "kiosk/brain/ws_kiosk_client.py",
        "line": 473,
        "short_summary": "Missing SSL verification on HTTP downloads",
        "category": "security-vulnerability",
        "severity": "high",
        "description": "The HTTP download of order data uses urllib.request.urlopen() without SSL certificate verification. A MITM attacker could modify the order payload to inject malicious order_id, filename, or print settings."
    },
    {
        "file": "services/api/src/modules/wsRelay.ts",
        "line": 1,
        "short_summary": "Missing authorization validation on WebSocket message relay",
        "category": "security-vulnerability",
        "severity": "high",
        "description": "The WSS Relay forwards messages from hardware devices to frontend clients. If the relay doesn't validate that the sender is an authorized kiosk before forwarding, any client could inject fake telemetry or job status messages."
    },

    # ===== SCRIPT LOGIC BUGS =====
    {
        "file": "services/api/src/modules/cups.ts",
        "line": 430,
        "short_summary": "Queue clear only removes pending jobs, not completed ones",
        "category": "script-logic-bug",
        "severity": "low",
        "description": "The clearQueue method uses $pull to remove jobs with status in ['PENDING', 'PROCESSING', 'HELD'] but leaves 'COMPLETED' jobs in the printer.jobs array. Over time the jobs array grows unboundedly."
    },
    {
        "file": "services/api/src/modules/cups.ts",
        "line": 510,
        "short_summary": "Python script path resolution silently falls back to wrong path",
        "category": "script-logic-bug",
        "severity": "medium",
        "description": "executePythonPrint tries 3 candidate paths for cups_printer.py and silently uses the first that exists. If an earlier path in a parent directory has a file with the same name, the wrong script is executed with no error logged."
    },
    {
        "file": "services/api/src/modules/cups.ts",
        "line": 523,
        "short_summary": "execAsync used instead of execFile for subprocess spawning",
        "category": "script-logic-bug",
        "severity": "medium",
        "description": "The Python script is executed via execAsync(cmd) which spawns a shell. This is unnecessary since the script is a known path, and it adds both attack surface and platform dependency. Should use execFile."
    },
    {
        "file": "services/api/src/modules/cups.ts",
        "line": 352,
        "short_summary": "Test print auto-complete uses fixed 3s timeout",
        "category": "script-logic-bug",
        "severity": "low",
        "description": "submitTestPrint sets job completion after a fixed 3-second setTimeout. If the printer is slow or busy, the job may still be processing when marked complete, showing false status."
    },
    {
        "file": "kiosk/brain/ws_kiosk_client.py",
        "line": 350,
        "short_summary": "Duplicate job execution on rapid reconnection",
        "category": "script-logic-bug",
        "severity": "high",
        "description": "The reconnection handler re-downloads and re-processes orders that may have already been printed before the disconnect. The deduplication via is_order_processed() doesn't account for orders that were downloaded but not yet marked processed during the crash."
    },
    {
        "file": "kiosk/brain/ws_kiosk_client.py",
        "line": 514,
        "short_summary": "Race condition: file deleted between stats check and print",
        "category": "script-logic-bug",
        "severity": "medium",
        "description": "After os.stat() checks the file exists and gets its size, the file could be deleted before the print function runs. The print call will then fail with a confusing 'file not found' error."
    },
    {
        "file": "kiosk/brain/cups_controller.py",
        "line": 1,
        "short_summary": "CUPS options built without checking printer PPD capability",
        "category": "script-logic-bug",
        "severity": "medium",
        "description": "build_cups_options sends multiple printer-brand-specific options (HPColorMode, CNColorMode, BRDuplex, JCLDuplex) for all printers regardless of brand. While most drivers ignore unknown options, this could cause unexpected behavior with certain drivers."
    },
    {
        "file": "kiosk/brain/cups_controller.py",
        "line": 1,
        "short_summary": "Missing media type validation for paper size",
        "category": "script-logic-bug",
        "severity": "medium",
        "description": "The paper_size parameter in build_cups_options is passed directly to CUPS as media without validation. An invalid paper size will be silently sent to CUPS and likely cause a job failure with an obscure IPP error."
    },
    {
        "file": "LePrint/pi-agent/modules/printer.js",
        "line": 247,
        "short_summary": "BW color mode uses KGray which may not be supported by Brother drivers",
        "category": "script-logic-bug",
        "severity": "medium",
        "description": "The printDocument function passes '-o ColorModel=KGray' for black-and-white mode. Brother DCP-T420W uses 'Gray' or 'Black' instead of 'KGray'. This option is silently ignored by the Brother driver."
    },
    {
        "file": "LePrint/pi-agent/modules/printer.js",
        "line": 192,
        "short_summary": "lpstat polling uses incorrect command syntax for job ID",
        "category": "script-logic-bug",
        "severity": "medium",
        "description": "pollCupsJobStatus runs 'lpstat -o ${cupsJobId}' which expects a printer name, not a job ID. The correct syntax is 'lpstat -j ${cupsJobId}'. This means job status polling is effectively broken."
    },
    {
        "file": "kiosk/brain/ws_kiosk_client.py",
        "line": 74,
        "short_summary": "Page range resolver has subtle precedence bug",
        "category": "script-logic-bug",
        "severity": "medium",
        "description": "The resolve_effective_page_range function correctly skips single-element [1] ranges, but if has_explicit_all is True, the function still proceeds to the second loop and may return a numeric range before encountering the ALL. The ALL check should short-circuit."
    },

    # ===== SYSTEMD & BOOT CONFIGURATION BUGS =====
    {
        "file": "kiosk/brain/daemon.py",
        "line": 1,
        "short_summary": "Daemon doesn't handle multiple crashes preventing restart",
        "category": "systemd-boot-bug",
        "severity": "high",
        "description": "If ws_kiosk_client.py crashes repeatedly, the daemon keeps restarting it without a backoff or max-restart limit. This can cause high CPU usage and may prevent the system from being usable."
    },
    {
        "file": "kiosk/scripts/start_kiosk.sh",
        "line": 1,
        "short_summary": "start_kiosk.sh lacks error handling for missing dependencies",
        "category": "systemd-boot-bug",
        "severity": "medium",
        "description": "The startup script assumes Python3, pycups, and other dependencies are installed. It doesn't verify their presence before launching, which causes cryptic errors on fresh installs."
    },
    {
        "file": "kiosk/scripts/install_services.sh",
        "line": 1,
        "short_summary": "install_services.sh creates systemd units without dependency verification",
        "category": "systemd-boot-bug",
        "severity": "medium",
        "description": "The install script creates systemd service files but doesn't verify that the target system has the required packages (cups, websockets, python3). On a fresh Raspberry Pi OS install, the services will fail silently on boot."
    },

    # ===== STARTUP SCRIPT RELIABILITY =====
    {
        "file": "kiosk/brain/daemon.py",
        "line": 1,
        "short_summary": "No log rotation configured for daemon output",
        "category": "startup-reliability",
        "severity": "medium",
        "description": "The daemon logs all output without rotation. Over time, logs can fill up the disk on the Raspberry Pi, causing the printer service to crash."
    },
    {
        "file": "kiosk/brain/order_tracker.py",
        "line": 235,
        "short_summary": "Staged orders write doesn't fsync, risking data loss on power cut",
        "category": "startup-reliability",
        "severity": "medium",
        "description": "save_staged_order writes the staged orders JSON but does not call fsync. On a sudden power cut, the last batch of staged orders could be lost, requiring re-printing."
    },
    {
        "file": "kiosk/brain/order_tracker.py",
        "line": 47,
        "short_summary": "PIN detection allows Unicode digit false negatives",
        "category": "startup-reliability",
        "severity": "low",
        "description": "The _is_numeric_pin function uses str.isdigit() which returns True for Unicode digit characters (e.g., Arabic-Indic digits). An order_id like '0123' in Arabic would be treated as a PIN and silently discarded."
    },
    {
        "file": "kiosk/brain/order_tracker.py",
        "line": 125,
        "short_summary": "Atomic write uses replace() which is not atomic on all filesystems",
        "category": "startup-reliability",
        "severity": "low",
        "description": "temp_file.replace(HISTORY_FILE) relies on Path.replace() for atomicity. On ext4 this works atomically, but on network filesystems or FAT, replace() is not atomic and could leave a corrupted history file."
    },
]

with open("code-review-findings.json", "w") as f:
    json.dump(findings, f, indent=2)

print(f"Written {len(findings)} findings")
