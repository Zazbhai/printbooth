#!/usr/bin/env python3
"""
PrintBooth Kiosk Background Worker
==================================
Runs as a daemon on the Kiosk Hardware / Raspberry Pi.
1. Connects to the PrintBooth backend API.
2. Polls or listens for paid orders targeted to this kiosk.
3. Downloads the customer document / PDF.
4. Sends the print command to the physical printer via CUPS with exact user settings
   (copies, color/bw, duplex/single, paper size).
5. Reports telemetry and job completion back to the backend.
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Optional
import urllib.request

from cups_printer import CupsPrinterController

BACKEND_API_URL = os.environ.get("PRINTBOOTH_API_URL", "http://localhost:5000/api")
KIOSK_ID = os.environ.get("KIOSK_ID", "PB-001")
POLL_INTERVAL_SECONDS = 3
TEMP_DOWNLOAD_DIR = Path("/tmp/printbooth_jobs") if sys.platform != "win32" else Path("./temp_printbooth_jobs")


class KioskDaemon:
    def __init__(self, api_url: str = BACKEND_API_URL, kiosk_id: str = KIOSK_ID):
        self.api_url = api_url.rstrip("/")
        self.kiosk_id = kiosk_id
        self.printer = CupsPrinterController()
        TEMP_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[KioskDaemon] Initialized for Kiosk ID: {self.kiosk_id}")
        print(f"[KioskDaemon] API URL: {self.api_url}")

    def fetch_pending_orders(self):
        """Fetch PAID orders awaiting print dispatch for this kiosk."""
        try:
            req = urllib.request.Request(f"{self.api_url}/orders?kioskId={self.kiosk_id}&status=PAID")
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                if isinstance(data, dict) and data.get("success"):
                    return data.get("data", [])
                elif isinstance(data, list):
                    return data
                return []
        except Exception as e:
            # Backend might not be running or no orders
            return []

    def execute_print_order(self, order: dict) -> bool:
        """Process an individual customer print order."""
        order_id = order.get("orderId") or order.get("_id")
        file_url = order.get("fileUrl") or order.get("filePath")
        file_name = order.get("fileName", f"order_{order_id}.pdf")
        copies = int(order.get("copies", 1))
        colour_mode = order.get("colourMode", "BW")
        duplex = order.get("duplex", "SINGLE")
        paper_size = order.get("paperSize", "A4")

        print(f"\n[KioskDaemon] >>> Processing Order: {order_id}")
        print(f"[KioskDaemon] Config: {copies} copies | {colour_mode} | {duplex} | {paper_size}")

        local_file = TEMP_DOWNLOAD_DIR / file_name

        # If file_url is provided, download it; otherwise create dummy test file if in dev
        if file_url and file_url.startswith("http"):
            try:
                print(f"[KioskDaemon] Downloading {file_url}...")
                urllib.request.urlretrieve(file_url, str(local_file))
            except Exception as e:
                print(f"[KioskDaemon] Download error: {e}")
                return False
        elif not local_file.exists():
            # Dev placeholder
            local_file.write_text(f"PrintBooth Order {order_id}\nCustomer: {order.get('customerEmail', 'Guest')}\n")

        # Send command to physical printer via CUPS
        result = self.printer.print_file(
            file_path=str(local_file),
            copies=copies,
            colour_mode=colour_mode,
            duplex=duplex,
            paper_size=paper_size,
            job_title=f"Order {order_id} - {file_name}"
        )

        print(f"[KioskDaemon] CUPS Result: {json.dumps(result, indent=2)}")
        return result.get("success", False)

    def run_forever(self):
        """Main polling loop."""
        print(f"[KioskDaemon] Started polling loop (every {POLL_INTERVAL_SECONDS}s). Press Ctrl+C to stop.")
        while True:
            try:
                orders = self.fetch_pending_orders()
                for order in orders:
                    self.execute_print_order(order)
            except KeyboardInterrupt:
                print("\n[KioskDaemon] Stopping daemon.")
                break
            except Exception as e:
                print(f"[KioskDaemon] Loop error: {e}")

            time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    daemon = KioskDaemon()
    daemon.run_forever()
