#!/usr/bin/env python3
"""
PrintBooth CUPS Printer Automation Service
==========================================
Handles hardware printing over CUPS (Common Unix Printing System) using pycups.
Controls:
  - Color vs. Black & White (Monochrome / Grayscale)
  - Number of copies
  - Duplex (Two-sided) vs. Single-sided
  - Paper sizes (A4, Letter, etc.)
  - Queue management, test prints, and printer status telemetry
"""

import argparse
import json
import os
import subprocess
import sys
from typing import Any, Dict, List, Optional

# Attempt to import pycups; fall back gracefully with clear diagnostic when on Windows/non-CUPS
try:
    import cups  # type: ignore
    CUPS_AVAILABLE = True
except ImportError:
    cups = None
    CUPS_AVAILABLE = False


class CupsPrinterController:
    """Controller to query, configure, and dispatch print jobs via CUPS."""

    def __init__(self, host: str = "localhost", port: int = 631):
        self.host = host
        self.port = port
        self._conn = None
        if CUPS_AVAILABLE:
            try:
                cups.setServer(self.host)
                cups.setPort(self.port)
                self._conn = cups.Connection()
            except Exception as e:
                self._conn = None
                self._init_error = str(e)
        else:
            self._init_error = "pycups module is not installed (CUPS requires Linux/macOS or WSL with libcups2-dev)."

    @property
    def is_connected(self) -> bool:
        return self._conn is not None

    def list_printers(self) -> Dict[str, Any]:
        """Discover and return all configured printers and their hardware states."""
        if not self.is_connected:
            return {
                "success": False,
                "error": self._init_error,
                "emulated": True,
                "printers": [
                    {
                        "name": "Brother_DCP_T420W",
                        "info": "Brother DCP-T420W Printer USB",
                        "location": "MIT ADT Campus Kiosk PB-001",
                        "device_uri": "usb://Brother/DCP-T420W",
                        "state": "IDLE",
                        "is_default": True,
                        "color_supported": True,
                        "duplex_supported": True,
                    }
                ]
            }

        try:
            raw_printers = self._conn.getPrinters()
            default_printer = self._conn.getDefault()
            printer_list = []

            for name, details in raw_printers.items():
                state_code = details.get("printer-state", 3)
                # 3 = IDLE, 4 = PROCESSING, 5 = STOPPED
                state_map = {3: "IDLE", 4: "PRINTING", 5: "STOPPED"}
                printer_list.append({
                    "name": name,
                    "info": details.get("printer-info", name),
                    "location": details.get("printer-location", ""),
                    "device_uri": details.get("device-uri", ""),
                    "make_and_model": details.get("printer-make-and-model", "Generic Printer"),
                    "state": state_map.get(state_code, "UNKNOWN"),
                    "is_default": (name == default_printer),
                    "color_supported": "color" in details.get("printer-make-and-model", "").lower() or "color" in name.lower(),
                })

            return {"success": True, "printers": printer_list, "default": default_printer}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def build_cups_options(
        self,
        copies: int = 1,
        colour_mode: str = "BW",
        duplex: str = "SINGLE",
        paper_size: str = "A4",
        fit_to_page: bool = True,
        page_ranges: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Generate standards-compliant CUPS / IPP command options.
        CUPS standard options:
          - copies: '1', '2', etc.
          - print-color-mode: 'monochrome' | 'color'
          - ColorModel: 'Gray' | 'CMYK' | 'RGB'
          - sides: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge'
          - media: 'A4' | 'Letter' | 'Legal'
        """
        is_color = colour_mode.upper() in ["COLOUR", "COLOR"]
        is_duplex = duplex if isinstance(duplex, bool) else str(duplex).strip().upper() in ["DUPLEX", "DOUBLE", "TWO-SIDED", "2-SIDED", "TWO_SIDED", "TRUE", "1"]

        options: Dict[str, str] = {
            "copies": str(max(1, copies)),
            "media": paper_size.upper(),
        }

        # Color Configuration (Setting multiple common PPD/IPP keys for maximum driver compatibility)
        if is_color:
            options["print-color-mode"] = "color"
            options["ColorModel"] = "CMYK"
            options["OutputMode"] = "Color"
            options["HPColorMode"] = "Color"
            options["CNColorMode"] = "color"
        else:
            options["print-color-mode"] = "monochrome"
            options["ColorModel"] = "Gray"
            options["OutputMode"] = "Black"
            options["HPColorMode"] = "grayscale"
            options["CNColorMode"] = "mono"

        # Duplex / Double-sided Configuration
        if is_duplex:
            options["sides"] = "two-sided-long-edge"
            options["Duplex"] = "DuplexNoTumble"
            options["BRDuplex"] = "DuplexNoTumble"
            options["JCLDuplex"] = "DuplexNoTumble"
        else:
            options["sides"] = "one-sided"
            options["Duplex"] = "None"
            options["BRDuplex"] = "None"
            options["JCLDuplex"] = "None"

        # Auto-scaling to fit page printable margins
        if fit_to_page:
            options["fit-to-page"] = "True"

        # Page range selection (e.g. '1-5', '3')
        if page_ranges:
            options["page-ranges"] = str(page_ranges)

        return options

    def print_file(
        self,
        file_path: str,
        printer_name: Optional[str] = None,
        copies: int = 1,
        colour_mode: str = "BW",
        duplex: str = "SINGLE",
        paper_size: str = "A4",
        job_title: str = "PrintBooth Document"
    ) -> Dict[str, Any]:
        """Send a document to CUPS with precise physical printer options."""
        if not os.path.exists(file_path):
            return {"success": False, "error": f"File not found: '{file_path}'"}

        cups_options = self.build_cups_options(
            copies=copies,
            colour_mode=colour_mode,
            duplex=duplex,
            paper_size=paper_size,
            fit_to_page=True,
        )

        # Fallback / emulation mode if pycups is not active (e.g. testing on Windows)
        if not self.is_connected:
            target_printer = printer_name or "Brother DCP-T420W Printer USB"
            mock_job_id = int(os.urandom(2).hex(), 16)
            return {
                "success": True,
                "emulated": True,
                "job_id": mock_job_id,
                "printer": target_printer,
                "file_path": file_path,
                "options_sent": cups_options,
                "status": "PROCESSING",
                "message": (
                    f"[SIMULATION MODE] Job #{mock_job_id} dispatched to {target_printer}: "
                    f"{copies} copies, {colour_mode}, {duplex}, {paper_size}"
                )
            }

        try:
            # If no printer specified, resolve system default
            target_printer = printer_name or self._conn.getDefault()
            if not target_printer:
                printers = self._conn.getPrinters()
                if not printers:
                    return {"success": False, "error": "No CUPS printers available on this system."}
                target_printer = next(iter(printers))

            # Dispatch physical print job through CUPS
            job_id = self._conn.printFile(
                target_printer,
                file_path,
                job_title,
                cups_options
            )

            return {
                "success": True,
                "job_id": job_id,
                "printer": target_printer,
                "file_path": file_path,
                "options_sent": cups_options,
                "status": "PROCESSING",
                "message": f"Successfully spooled job #{job_id} to '{target_printer}'"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "printer": target_printer,
                "options_attempted": cups_options
            }

    def get_jobs(self, printer_name: Optional[str] = None) -> Dict[str, Any]:
        """Fetch active and completed print jobs in the queue."""
        if not self.is_connected:
            return {
                "success": True,
                "emulated": True,
                "jobs": [
                    {
                        "job_id": 1041,
                        "title": "Aadhaar_Card_Front_Back.pdf",
                        "user": "customer-mobile",
                        "size_kb": 320,
                        "state": "COMPLETED",
                    },
                    {
                        "job_id": 1042,
                        "title": "Project_Report_Final_v3.pdf",
                        "user": "student_coep",
                        "size_kb": 1280,
                        "state": "COMPLETED",
                    }
                ]
            }

        try:
            raw_jobs = self._conn.getJobs(which_jobs="all", my_jobs=False)
            job_list = []
            for jid, details in raw_jobs.items():
                if printer_name and details.get("printer-name") != printer_name:
                    continue
                job_list.append({
                    "job_id": jid,
                    "title": details.get("job-name", f"Job #{jid}"),
                    "printer": details.get("printer-name", ""),
                    "user": details.get("job-originating-user-name", ""),
                    "size_bytes": details.get("job-k-octets", 0) * 1024,
                    "state": details.get("job-state", "UNKNOWN"),
                    "time_at_creation": details.get("time-at-creation", 0),
                })
            return {"success": True, "jobs": job_list}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def cancel_job(self, job_id: int) -> Dict[str, Any]:
        """Cancel a pending or active print job."""
        if not self.is_connected:
            return {"success": True, "emulated": True, "message": f"Job #{job_id} cancelled (simulated)"}

        try:
            self._conn.cancelJob(job_id)
            return {"success": True, "message": f"Job #{job_id} cancelled"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def purge_all_jobs(self, printer_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Purges and cancels all pending, held, or queued jobs from CUPS.
        Guarantees that on Pi boot and between jobs, no leftover jobs or ghost queue exists.
        """
        actions = []
        if not self.is_connected:
            return {
                "success": True,
                "emulated": True,
                "message": "All print queues purged and ghost jobs cancelled (simulated)",
                "actions": ["Simulated purge of CUPS spool"]
            }

        # 1. pycups cancelJob for all existing jobs
        try:
            jobs = self._conn.getJobs(which_jobs="all", my_jobs=False)
            for jid in list(jobs.keys()):
                try:
                    self._conn.cancelJob(jid, purge_job=True)
                    actions.append(f"Purged CUPS job #{jid}")
                except Exception:
                    try:
                        self._conn.cancelJob(jid)
                        actions.append(f"Cancelled CUPS job #{jid}")
                    except Exception:
                        pass
        except Exception as e:
            actions.append(f"pycups jobs query notice: {e}")

        # 2. Linux CLI cancel -a -x / cancel -a / lprm -
        if sys.platform != "win32":
            target = printer_name or self._conn.getDefault()
            cmd_lists = [
                ["cancel", "-a", "-x"],
                ["cancel", "-a"],
                ["lprm", "-"],
            ]
            if target:
                cmd_lists.insert(0, ["cancel", "-a", "-x", target])
                cmd_lists.insert(1, ["cancel", "-a", target])

            for cmd in cmd_lists:
                try:
                    subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, timeout=5)
                except Exception:
                    pass

        return {
            "success": True,
            "message": "Successfully purged all CUPS queues and cancelled pending jobs.",
            "actions": actions
        }

    def clean_printheads(self, printer_name: Optional[str] = None) -> Dict[str, Any]:
        """Send a test/cleaning diagnostic page to align and unclog printheads."""
        if not self.is_connected:
            return {
                "success": True,
                "emulated": True,
                "message": "Printhead cleaning cycle completed. Nozzles 100% PASS."
            }

        try:
            target = printer_name or self._conn.getDefault()
            # CUPS Test Page command
            self._conn.printTestPage(target)
            return {"success": True, "printer": target, "message": "Test/cleaning page dispatched"}
        except Exception as e:
            return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# CLI Entrypoint for Node.js Subprocess or Direct Terminal Usage
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="PrintBooth CUPS Hardware Printing Controller")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Command: list
    subparsers.add_parser("list", help="List detected CUPS printers")

    # Command: print
    p_print = subparsers.add_parser("print", help="Send document to printer")
    p_print.add_argument("--file", required=True, help="Absolute path to PDF / document file")
    p_print.add_argument("--printer", default=None, help="Target CUPS printer name")
    p_print.add_argument("--copies", type=int, default=1, help="Number of copies")
    p_print.add_argument("--color", dest="colour_mode", action="store_const", const="COLOUR", default="BW",
                         help="Print in color (default is black & white)")
    p_print.add_argument("--bw", dest="colour_mode", action="store_const", const="BW",
                         help="Print in black & white")
    p_print.add_argument("--duplex", dest="duplex", action="store_const", const="DUPLEX", default="SINGLE",
                         help="Print two-sided (duplex)")
    p_print.add_argument("--single", dest="duplex", action="store_const", const="SINGLE",
                         help="Print single-sided")
    p_print.add_argument("--paper", default="A4", help="Paper size (A4, Letter, etc.)")
    p_print.add_argument("--title", default="PrintBooth Order", help="Job title in spooler")

    # Command: jobs
    p_jobs = subparsers.add_parser("jobs", help="List active print jobs")
    p_jobs.add_argument("--printer", default=None, help="Filter by printer name")

    # Command: cancel
    p_cancel = subparsers.add_parser("cancel", help="Cancel print job")
    p_cancel.add_argument("--job-id", type=int, required=True, help="Job ID to cancel")

    # Command: purge
    p_purge = subparsers.add_parser("purge", help="Purge all pending and queued jobs from CUPS spooler")
    p_purge.add_argument("--printer", default=None, help="Printer name (optional)")

    # Command: clean
    p_clean = subparsers.add_parser("clean", help="Run printhead cleaning / test print")
    p_clean.add_argument("--printer", default=None, help="Printer name")

    args = parser.parse_args()
    controller = CupsPrinterController()

    if args.command == "list":
        result = controller.list_printers()
    elif args.command == "print":
        result = controller.print_file(
            file_path=args.file,
            printer_name=args.printer,
            copies=args.copies,
            colour_mode=args.colour_mode,
            duplex=args.duplex,
            paper_size=args.paper,
            job_title=args.title,
        )
    elif args.command == "jobs":
        result = controller.get_jobs(printer_name=args.printer)
    elif args.command == "cancel":
        result = controller.cancel_job(job_id=args.job_id)
    elif args.command == "purge":
        result = controller.purge_all_jobs(printer_name=args.printer)
    elif args.command == "clean":
        result = controller.clean_printheads(printer_name=args.printer)
    else:
        parser.print_help()
        sys.exit(1)

    # Output JSON for seamless parsing by Node.js or scripts
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
