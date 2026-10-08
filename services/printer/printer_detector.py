"""
PrintBooth Universal Printer Auto-Detection & Selection Engine
==============================================================
Intelligently discovers all physical and virtual printers on the host system,
identifies active hardware connections (USB, Network/IP, WSD, Bluetooth),
evaluates real-time hardware presence (PnP connection, USB unplugged / Code 45),
network reachability, spooler error flags, and paper/hardware faults.
Guarantees that a disconnected or erroring printer is NEVER reported as online/ready.

Supports:
  - Windows (Native win32print + PnP device interrogation + Network probe)
  - Linux / macOS fallback (CUPS pycups discovery if available)
"""

import sys
import os
import re
import socket
import json
import time
import argparse
import subprocess
from typing import List, Dict, Any, Optional, Tuple

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

PRINTER_STATUS_BITS = {
    0x00000001: "PAUSED",
    0x00000002: "ERROR",
    0x00000004: "PENDING DELETION",
    0x00000008: "PAPER JAM",
    0x00000010: "PAPER OUT",
    0x00000020: "MANUAL FEED",
    0x00000040: "PAPER PROBLEM",
    0x00000080: "OFFLINE",
    0x00000100: "IO ACTIVE",
    0x00000200: "BUSY",
    0x00000400: "PRINTING",
    0x00000800: "OUTPUT BIN FULL",
    0x00001000: "NOT AVAILABLE",
    0x00002000: "WAITING",
    0x00004000: "PROCESSING",
    0x00008000: "INITIALIZING",
    0x00010000: "WARMING UP",
    0x00020000: "TONER LOW",
    0x00040000: "NO TONER",
    0x00080000: "PAGE PUNT",
    0x00100000: "USER INTERVENTION",
    0x00200000: "OUT OF MEMORY",
    0x00400000: "DOOR OPEN",
    0x00800000: "SERVER UNKNOWN",
    0x01000000: "POWER SAVE",
}

# Software and virtual print drivers that should NOT be picked as physical hardware printers
VIRTUAL_PRINTER_PATTERNS = [
    r"microsoft print to pdf",
    r"onenote",
    r"xps document writer",
    r"fax",
    r"anydesk printer",
    r"paperport image printer",
    r"tungsten image printer",
    r"send to onenote",
    r"acrobat\s*distiller",
    r"adobe\s*pdf",
    r"cute\s*pdf",
    r"foxit.*pdf",
    r"nul:",
    r"portprompt:",
    r"file:",
]

# Internal in-process cache for PnP hardware tree
_PNP_CACHE: Dict[str, Any] = {"time": 0.0, "data": {}}


def get_pnp_hardware_devices(cache_ttl: float = 30.0) -> Dict[str, Dict[str, Any]]:
    """
    Retrieves Windows PnP hardware tree status for PrintQueue, USB, and Printer devices.
    Returns mapping of normalized device names to physical hardware state.
    """
    if sys.platform != "win32":
        return {}

    now = time.time()
    if now - _PNP_CACHE["time"] < cache_ttl and _PNP_CACHE["data"]:
        return _PNP_CACHE["data"]

    pnp_map: Dict[str, Dict[str, Any]] = {}
    try:
        ps_cmd = (
            "Get-PnpDevice -Class USB, Printer, Image, PrintQueue "
            "| Select-Object FriendlyName, InstanceId, Class, Status, Present, Problem "
            "| ConvertTo-Json -Compress"
        )
        res = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=5.0
        )
        stdout = res.stdout.strip()
        if stdout:
            items = json.loads(stdout)
            if isinstance(items, dict):
                items = [items]
            for it in items:
                fname = (it.get("FriendlyName") or "").strip()
                if not fname:
                    continue
                norm = fname.lower()
                is_present = bool(it.get("Present"))
                prob = int(it.get("Problem", 0) or 0)
                status_str = str(it.get("Status", ""))

                # If an entry already exists and is active/present with no problem,
                # do NOT overwrite it with an inactive or phantom device.
                if norm in pnp_map and pnp_map[norm]["present"] and pnp_map[norm]["problem"] == 0:
                    if not is_present or prob != 0:
                        continue

                pnp_map[norm] = {
                    "friendly_name": fname,
                    "present": is_present,
                    "status": status_str,
                    "problem": prob,
                    "class": str(it.get("Class", "")),
                    "instance_id": str(it.get("InstanceId", "")),
                }
    except Exception:
        pass

    if pnp_map:
        _PNP_CACHE["time"] = now
        _PNP_CACHE["data"] = pnp_map
    elif _PNP_CACHE["data"]:
        # Keep previous successful data if this query failed or timed out
        pass
    else:
        # Don't cache empty failures; allow immediate retry within 3 seconds
        _PNP_CACHE["time"] = now - cache_ttl + 3.0

    return pnp_map or _PNP_CACHE["data"]


import concurrent.futures

_TARGET_CACHE: Dict[str, Tuple[float, Optional[str]]] = {}


def resolve_network_target(port_or_host: str) -> Optional[str]:
    """
    Extracts IP address from a printer port name with in-memory caching.
    Handles standard TCP/IP ports, hostnames, and Windows WSD/IPP ports.
    """
    host = (port_or_host or "").strip()
    now = time.time()
    if host in _TARGET_CACHE and (now - _TARGET_CACHE[host][0]) < 300.0:
        return _TARGET_CACHE[host][1]

    target = None
    if host.startswith("IP_"):
        host = host[3:]
    m = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", host)
    if m:
        target = m.group(1)
    elif host.upper().startswith("WSD-"):
        # WSD devices are managed by Windows spooler state; avoid spawning slow PowerShell
        target = None
    elif re.match(r"^[a-zA-Z0-9_\-]+$", host):
        try:
            target = socket.gethostbyname(host)
        except Exception:
            pass

    _TARGET_CACHE[host] = (now, target)
    return target


def test_network_reachability(port_or_host: str, timeout: float = 0.2) -> bool:
    """
    Tests if a network printer host or IP responds on standard printing ports (631, 9100, 80).
    Uses concurrent thread pool to avoid sequential timeouts.
    Returns False if host cannot be resolved or does not respond.
    """
    ip = resolve_network_target(port_or_host)
    if not ip:
        return False

    def probe_port(p: int) -> bool:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            if s.connect_ex((ip, p)) == 0:
                return True
        except Exception:
            pass
        finally:
            try:
                s.close()
            except Exception:
                pass
        return False

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(probe_port, p) for p in (631, 9100, 80)]
            for fut in concurrent.futures.as_completed(futures, timeout=timeout + 0.1):
                if fut.result():
                    return True
    except Exception:
        pass

    return False


def decode_status_bits(status_code: int) -> List[str]:
    """Decodes Windows printer status bitmask into human-readable flags."""
    if status_code == 0:
        return ["READY"]
    labels = []
    for bit, label in PRINTER_STATUS_BITS.items():
        if status_code & bit:
            labels.append(label)
    return labels or [f"STATUS_{status_code}"]


def is_virtual_printer(name: str, port: str = "", driver: str = "") -> bool:
    """Detects whether a printer is a virtual software driver or a physical hardware device."""
    target = f"{name} {port} {driver}".lower().strip()
    for pattern in VIRTUAL_PRINTER_PATTERNS:
        if re.search(pattern, target, re.IGNORECASE):
            return True
    if port.lower() in ("nul:", "portprompt:", "file:"):
        return True
    return False


def get_connection_type(port: str) -> str:
    """Categorizes the connection type of a printer port."""
    port_clean = port.upper().strip()
    if re.match(r"^USB\d+", port_clean):
        return "USB"
    if re.search(r"\d{1,3}(?:\.\d{1,3}){3}", port_clean) or port_clean.startswith("TCP") or port_clean.startswith("IP_"):
        return "NETWORK_IP"
    if port_clean.startswith("WSD") or port_clean.startswith("BRW") or port_clean.startswith("HP"):
        return "NETWORK_WSD"
    if port_clean.startswith("LPT") or port_clean.startswith("COM"):
        return "SERIAL_PARALLEL"
    if port_clean.startswith("BTH") or "BLUETOOTH" in port_clean:
        return "BLUETOOTH"
    return "LOCAL"


def enumerate_all_printers() -> List[Dict[str, Any]]:
    """
    Scans host system for all installed printers with true physical connection verification
    and real-time hardware status interrogation.
    """
    printers_info: List[Dict[str, Any]] = []

    if sys.platform != "win32":
        try:
            import cups
            conn = cups.Connection()
            cups_printers = conn.getPrinters()
            default_p = conn.getDefault()
            for name, details in cups_printers.items():
                uri = details.get("device-uri", "")
                state = details.get("printer-state", 3)
                is_usb = "usb" in uri.lower()
                is_online = state in (3, 4)
                printers_info.append({
                    "name": name,
                    "status_code": state,
                    "status_labels": ["READY"] if state == 3 else (["PRINTING"] if state == 4 else ["STOPPED"]),
                    "is_online": is_online,
                    "is_connected": is_online,
                    "port": uri,
                    "driver": details.get("printer-make-and-model", ""),
                    "is_virtual": False,
                    "connection_type": "USB" if is_usb else "NETWORK",
                    "is_default": (name == default_p),
                    "hardware_issue": None if is_online else "CUPS printer stopped or offline",
                })
        except Exception:
            pass
        return printers_info

    import win32print

    default_printer_name = ""
    try:
        default_printer_name = win32print.GetDefaultPrinter()
    except Exception:
        pass

    try:
        raw_list = win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        )
    except Exception:
        return []

    pnp_devices = get_pnp_hardware_devices()

    for flags, desc, name, comment in raw_list:
        try:
            h = win32print.OpenPrinter(name)
            try:
                info = win32print.GetPrinter(h, 2)
                status_code = int(info.get("Status", 0) or 0)
                port = str(info.get("pPortName", "") or "")
                driver = str(info.get("pDriverName", "") or "")
                attributes = int(info.get("Attributes", 0) or 0)
                jobs_count = int(info.get("cJobs", 0) or 0)
                is_default = (name == default_printer_name) or bool(attributes & win32print.PRINTER_ATTRIBUTE_DEFAULT)

                is_virtual = is_virtual_printer(name, port, driver)
                conn_type = get_connection_type(port)

                labels = []
                for bit, label in PRINTER_STATUS_BITS.items():
                    if status_code & bit:
                        labels.append(label)

                is_work_offline = bool(attributes & 0x00000400)
                is_spooler_paused = bool(attributes & 0x00000001)
                if is_work_offline and "WORK_OFFLINE" not in labels:
                    labels.append("WORK_OFFLINE")
                if is_spooler_paused and "PAUSED" not in labels:
                    labels.append("PAUSED")

                is_physically_connected = True
                hardware_issue = None

                if not is_virtual:
                    name_lower = name.lower().strip()

                    # 1. Physical USB Connection Verification via PnP & Windows Spooler
                    if conn_type == "USB" or "usb" in port.lower():
                        matching_pnp = pnp_devices.get(name_lower)
                        if not matching_pnp or not matching_pnp.get("present"):
                            keywords = [k for k in re.split(r"[\s\-_]+", name_lower) if len(k) > 2 and k not in ("printer", "series", "usb")]
                            for pnp_name, dev in pnp_devices.items():
                                if dev.get("present") and dev.get("problem", 0) == 0 and all(kw in pnp_name for kw in keywords):
                                    matching_pnp = dev
                                    break

                        # Also check if PnP has an explicit disconnected device (Code 45) for this model
                        if not matching_pnp:
                            keywords = [k for k in re.split(r"[\s\-_]+", name_lower) if len(k) > 2 and k not in ("printer", "series", "usb")]
                            for pnp_name, dev in pnp_devices.items():
                                if dev.get("problem") == 45 and all(kw in pnp_name for kw in keywords):
                                    matching_pnp = dev
                                    break

                        if matching_pnp:
                            if not matching_pnp.get("present", True) or matching_pnp.get("problem") == 45:
                                is_physically_connected = False
                                hardware_issue = "USB cable is unplugged or printer is turned off (Device Code 45)"
                                if "DISCONNECTED" not in labels:
                                    labels.append("DISCONNECTED")
                                if "USB_UNPLUGGED" not in labels:
                                    labels.append("USB_UNPLUGGED")
                            elif matching_pnp.get("problem", 0) != 0:
                                is_physically_connected = False
                                prob_code = matching_pnp.get("problem")
                                hardware_issue = f"Hardware device error (PnP Code {prob_code})"
                                labels.append(f"DEVICE_PROBLEM_{prob_code}")
                            else:
                                is_physically_connected = True
                        else:
                            # Not found in PnP device tree: fall back to Windows Print Spooler work-offline attribute
                            if is_work_offline:
                                is_physically_connected = False
                                hardware_issue = "USB printer is marked offline in Windows Spooler"
                                if "DISCONNECTED" not in labels:
                                    labels.append("DISCONNECTED")
                            else:
                                # Spooler confirms port is active and printer is online
                                is_physically_connected = True

                    # 2. Network / Wireless WSD Verification
                    elif conn_type in ("NETWORK_IP", "NETWORK_WSD") or port.upper().startswith("BRW") or "WSD" in port.upper():
                        if is_work_offline or (status_code & win32print.PRINTER_STATUS_OFFLINE):
                            is_physically_connected = False
                            hardware_issue = f"Network printer at {port} is marked offline in Windows"
                            if "OFFLINE" not in labels:
                                labels.append("OFFLINE")
                        else:
                            is_reachable = test_network_reachability(port, timeout=0.2)
                            if is_reachable:
                                is_physically_connected = True
                            else:
                                is_physically_connected = False
                                hardware_issue = f"Network printer at {port} is offline or unreachable on LAN"
                                if "OFFLINE" not in labels:
                                    labels.append("OFFLINE")
                                if "NETWORK_UNREACHABLE" not in labels:
                                    labels.append("NETWORK_UNREACHABLE")

                    # 3. Queue Job Fault Inspection
                    if jobs_count > 0:
                        try:
                            jobs = win32print.EnumJobs(h, 0, 20, 2)
                            for j in jobs:
                                j_status = int(j.get("Status", 0) or 0)
                                if j_status & 0x00000040:
                                    if "PAPER_OUT" not in labels:
                                        labels.append("PAPER_OUT")
                                    hardware_issue = "Printer reported out of paper"
                                if j_status & 0x00000020:
                                    if "OFFLINE" not in labels:
                                        labels.append("OFFLINE")
                                    hardware_issue = "Printer reported offline during print job"
                                if j_status & 0x00000002:
                                    # Stuck error job - attempt auto purge if it's blocking
                                    try:
                                        win32print.SetJob(h, j["JobId"], 0, None, win32print.JOB_CONTROL_DELETE)
                                    except Exception:
                                        if "ERROR" not in labels:
                                            labels.append("ERROR")
                                        hardware_issue = "Active print job encountered a hardware error"
                                if j_status & 0x00000200:
                                    if "BLOCKED" not in labels:
                                        labels.append("BLOCKED")
                                    hardware_issue = "Printer device queue is blocked"
                        except Exception:
                            pass

                # 4. Final Online / Error Evaluation
                CRITICAL_STATUS_BITS = (
                    0x00000080 | # OFFLINE
                    0x00000002 | # ERROR
                    0x00000004 | # PENDING DELETION
                    0x00000008 | # PAPER JAM
                    0x00000010 | # PAPER OUT
                    0x00000040 | # PAPER PROBLEM
                    0x00001000 | # NOT AVAILABLE
                    0x00400000 | # DOOR OPEN
                    0x00040000 | # NO TONER / NO INK
                    0x00100000   # USER INTERVENTION
                )

                has_status_error = bool(status_code & CRITICAL_STATUS_BITS)
                has_label_error = any(lbl in (
                    "DISCONNECTED", "USB_UNPLUGGED", "OFFLINE", "WORK_OFFLINE",
                    "PAPER_OUT", "PAPER_JAM", "DOOR_OPEN", "NO_TONER", "ERROR", "NOT_AVAILABLE"
                ) for lbl in labels)

                is_online = (
                    not is_work_offline and
                    not has_status_error and
                    not has_label_error and
                    is_physically_connected
                )

                if not labels:
                    labels = ["READY"] if is_online else ["UNKNOWN"]

                printers_info.append({
                    "name": name,
                    "status_code": status_code,
                    "status_labels": labels,
                    "is_online": is_online,
                    "is_connected": is_physically_connected,
                    "hardware_issue": hardware_issue,
                    "is_virtual": is_virtual,
                    "port": port,
                    "driver": driver,
                    "connection_type": conn_type,
                    "is_default": is_default,
                    "jobs_count": jobs_count,
                    "is_usb": (conn_type == "USB"),
                })
            finally:
                win32print.ClosePrinter(h)
        except Exception:
            continue

    return printers_info


def auto_detect_active_printer(preferred_name: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    """
    Intelligently detects and selects the active, connected physical printer.
    Guarantees that an unplugged USB printer or unreachable network printer is
    strictly flagged with is_available=False and is_hardware_ready=False.

    Returns:
      (selected_printer_name, detection_report)
    """
    all_printers = enumerate_all_printers()

    if not all_printers:
        fallback = preferred_name or "Brother DCP-T420W"
        return fallback, {
            "selected": fallback,
            "reason": "No printers discovered on host system.",
            "is_available": False,
            "is_hardware_ready": False,
            "has_physical_printer": False,
            "issue_code": "NO_PRINTERS_FOUND",
            "issue_title": "No printer detected on host system",
            "all_printers": [],
            "candidates": [],
        }

    physical_printers = [p for p in all_printers if not p["is_virtual"]]
    has_physical = len(physical_printers) > 0
    online_printers = [p for p in physical_printers if p["is_online"]]

    # Case A: No physical hardware printer is installed at all
    if not has_physical:
        default_p = next((p for p in all_printers if p["is_default"]), all_printers[0])
        return default_p["name"], {
            "selected": default_p["name"],
            "reason": "No physical hardware printer was detected. Only virtual software printer drivers are available.",
            "is_available": False,
            "is_hardware_ready": False,
            "has_physical_printer": False,
            "issue_code": "NO_PHYSICAL_PRINTER",
            "issue_title": "No printer available right now, visit later",
            "details": default_p,
            "all_printers": all_printers,
        }

    # Case B: Online Physical Printer is Found
    # 1. Preferred printer IF online
    if preferred_name:
        for p in online_printers:
            if p["name"].lower() == preferred_name.lower():
                return p["name"], {
                    "selected": p["name"],
                    "reason": f"Preferred printer '{preferred_name}' is connected and ONLINE ({p['port']}).",
                    "is_available": True,
                    "is_hardware_ready": True,
                    "has_physical_printer": True,
                    "issue_code": None,
                    "issue_title": None,
                    "details": p,
                    "all_printers": all_printers,
                }

        # Check for companion port/driver of same model that IS online
        preferred_lower = preferred_name.lower()
        keywords = [k for k in re.split(r"[\s\-_]+", preferred_lower) if len(k) > 2 and k not in ("printer", "series", "usb")]
        for p in online_printers:
            p_name_lower = p["name"].lower()
            matches = sum(1 for kw in keywords if kw in p_name_lower)
            if matches >= 2:
                return p["name"], {
                    "selected": p["name"],
                    "reason": f"Preferred '{preferred_name}' was unavailable, but active companion printer '{p['name']}' was detected on {p['port']}.",
                    "is_available": True,
                    "is_hardware_ready": True,
                    "has_physical_printer": True,
                    "issue_code": None,
                    "issue_title": None,
                    "details": p,
                    "all_printers": all_printers,
                }

    # 2. System Default Physical Printer IF verified ONLINE
    online_default = next((p for p in online_printers if p.get("is_default")), None)
    if online_default:
        return online_default["name"], {
            "selected": online_default["name"],
            "reason": f"Active system default printer '{online_default['name']}' is verified ONLINE ({online_default['port']}).",
            "is_available": True,
            "is_hardware_ready": True,
            "has_physical_printer": True,
            "issue_code": None,
            "issue_title": None,
            "details": online_default,
            "all_printers": all_printers,
        }

    # 3. Verified Online Network Printers with Active LAN Reachability
    online_net_active = [
        p for p in online_printers
        if p["connection_type"] in ("NETWORK_IP", "NETWORK_WSD")
        and test_network_reachability(p["port"], timeout=0.3)
    ]
    if online_net_active:
        chosen = next((p for p in online_net_active if p["is_default"]), online_net_active[0])
        return chosen["name"], {
            "selected": chosen["name"],
            "reason": f"Auto-detected verified active network printer '{chosen['name']}' on {chosen['port']}.",
            "is_available": True,
            "is_hardware_ready": True,
            "has_physical_printer": True,
            "issue_code": None,
            "issue_title": None,
            "details": chosen,
            "all_printers": all_printers,
        }

    # 4. Online USB Printers
    online_usb = [p for p in online_printers if p["is_usb"]]
    if online_usb:
        chosen = next((p for p in online_usb if p["is_default"]), online_usb[0])
        return chosen["name"], {
            "selected": chosen["name"],
            "reason": f"Auto-detected active USB connected printer '{chosen['name']}' on {chosen['port']}.",
            "is_available": True,
            "is_hardware_ready": True,
            "has_physical_printer": True,
            "issue_code": None,
            "issue_title": None,
            "details": chosen,
            "all_printers": all_printers,
        }

    pnp_devices = get_pnp_hardware_devices()

    # 3. Online Network Printers — but ONLY if no USB twin is offline
    # Windows creates WSD ghost entries for USB printers that appear "online"
    # in the spooler even when the physical hardware is off/disconnected.
    # If a USB version of the same printer model is WORK_OFFLINE and the network
    # device is NOT confirmed present in PnP, it is treated as a phantom.
    # However, if PnP explicitly confirms the network printer is Present with no problem,
    # it is a verified active wireless printer and MUST be used!
    online_net = [p for p in online_printers if p["connection_type"] in ("NETWORK_IP", "NETWORK_WSD")]
    
    def _has_usb_twin_offline(net_printer: dict) -> bool:
        net_name_lower = net_printer["name"].lower().strip()
        exact_pnp = pnp_devices.get(net_name_lower)
        if exact_pnp and exact_pnp.get("present") and exact_pnp.get("problem", 0) == 0:
            return False  # Real, active PnP verified wireless printer!

        for pnp_name, dev in pnp_devices.items():
            if dev.get("present") and dev.get("problem", 0) == 0 and net_name_lower in pnp_name:
                return False

        kws = [k for k in re.split(r"[\s\-_]+", net_printer["name"].lower())
               if len(k) > 2 and k not in ("printer", "series", "usb")]
        for p in physical_printers:
            if p["is_usb"] and not p["is_online"]:
                p_lower = p["name"].lower()
                if sum(1 for kw in kws if kw in p_lower) >= 2:
                    return True
        return False

    valid_net = [p for p in online_net if not _has_usb_twin_offline(p)]
    if valid_net:
        chosen = next((p for p in valid_net if p["is_default"]), valid_net[0])
        return chosen["name"], {
            "selected": chosen["name"],
            "reason": f"Auto-detected active Network printer '{chosen['name']}' on {chosen['port']}.",
            "is_available": True,
            "is_hardware_ready": True,
            "has_physical_printer": True,
            "issue_code": None,
            "issue_title": None,
            "details": chosen,
            "all_printers": all_printers,
        }

    # WSD ghost detected — report the USB offline twin's status
    if online_net and not valid_net:
        # Find the offline USB twin to report its actual error
        ghost = online_net[0]
        kws = [k for k in re.split(r"[\s\-_]+", ghost["name"].lower())
               if len(k) > 2 and k not in ("printer", "series", "usb")]
        usb_twin = next(
            (p for p in physical_printers if p["is_usb"] and not p["is_online"]
             and sum(1 for kw in kws if kw in p["name"].lower()) >= 2),
            None
        )
        target_p = usb_twin or ghost
        labels = target_p.get("status_labels", ["OFFLINE"])
        return target_p["name"], {
            "selected": target_p["name"],
            "reason": f"Physical printer '{target_p['name']}' is offline (USB disconnected or powered off). WSD network entry is a phantom queue.",
            "is_available": False,
            "is_hardware_ready": False,
            "has_physical_printer": True,
            "issue_code": "PRINTER_OFFLINE",
            "issue_title": "Printer is offline right now, visit later",
            "details": target_p,
            "all_printers": all_printers,
        }

    # 4. Any Online Physical Printer
    if online_printers:
        chosen = online_printers[0]
        return chosen["name"], {
            "selected": chosen["name"],
            "reason": f"Auto-detected online physical printer '{chosen['name']}' on {chosen['port']}.",
            "is_available": True,
            "is_hardware_ready": True,
            "has_physical_printer": True,
            "issue_code": None,
            "issue_title": None,
            "details": chosen,
            "all_printers": all_printers,
        }

    # Case C: Physical Printers Exist, but NONE are reporting Online / Connected!
    # Pick the best candidate to diagnose and display exact error
    target_p = None
    if preferred_name:
        target_p = next((p for p in physical_printers if p["name"].lower() == preferred_name.lower()), None)
    if not target_p:
        usb_candidates = [p for p in physical_printers if p["is_usb"]]
        target_p = usb_candidates[0] if usb_candidates else physical_printers[0]

    labels = target_p.get("status_labels", ["OFFLINE"])
    labels_str = ", ".join(labels)
    hardware_issue = target_p.get("hardware_issue")

    if not target_p.get("is_connected", True) or "DISCONNECTED" in labels or "USB_UNPLUGGED" in labels:
        issue_code = "PRINTER_DISCONNECTED"
        issue_title = "Printer is disconnected / unplugged"
        reason = f"Physical printer '{target_p['name']}' is disconnected: {hardware_issue or 'USB cable is unplugged or printer is turned off'}."
    elif "NETWORK_UNREACHABLE" in labels or "OFFLINE" in labels:
        issue_code = "PRINTER_OFFLINE"
        issue_title = "Printer is offline right now, visit later"
        reason = f"Physical printer '{target_p['name']}' is offline: {hardware_issue or 'Unreachable on network or powered off'}."
    elif "PAPER_OUT" in labels or "PAPER JAM" in labels or "DOOR OPEN" in labels:
        issue_code = "PRINTER_HARDWARE_FAULT"
        issue_title = f"Printer Alert: {labels_str}"
        reason = f"Physical printer '{target_p['name']}' reported hardware condition: {labels_str}."
    else:
        issue_code = "PRINTER_ERROR"
        issue_title = f"Printer not available ({labels_str})"
        reason = f"Physical printer '{target_p['name']}' is not ready: {labels_str}."

    return target_p["name"], {
        "selected": target_p["name"],
        "reason": reason,
        "is_available": False,
        "is_hardware_ready": False,
        "has_physical_printer": True,
        "issue_code": issue_code,
        "issue_title": issue_title,
        "details": target_p,
        "all_printers": all_printers,
    }


def main():
    parser = argparse.ArgumentParser(description="PrintBooth Printer Auto-Detection System")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    parser.add_argument("--preferred", type=str, default=None, help="Preferred printer name")
    parser.add_argument("--name-only", action="store_true", help="Print only the selected printer name")
    args = parser.parse_args()

    selected_name, report = auto_detect_active_printer(args.preferred)

    if args.name_only:
        print(selected_name)
        return

    if args.json:
        output_data = {
            "success": True,
            "selectedPrinter": selected_name,
            "is_available": report.get("is_available", False),
            "is_hardware_ready": report.get("is_hardware_ready", False),
            "has_physical_printer": report.get("has_physical_printer", True),
            "issue_code": report.get("issue_code"),
            "issue_title": report.get("issue_title"),
            "reason": report.get("reason"),
            "details": report.get("details"),
            "printers": report.get("all_printers", []),
        }
        print(json.dumps(output_data, indent=2))
        return

    print("=" * 70)
    print(" 🖨  PRINTBOOTH HARDWARE PRINTER AUTO-DETECTOR")
    print("=" * 70)

    if report.get("is_available") and report.get("is_hardware_ready"):
        print(f"\n[Auto-Selected Printer]:  👉  {selected_name} (ONLINE & READY)")
        print(f"[Selection Reason]:       {report['reason']}\n")
    else:
        print(f"\n[Status]:                 ⚠️ NO HARDWARE PRINTER READY")
        print(f"[Target Printer]:         {selected_name}")
        print(f"[Issue Code]:             {report.get('issue_code')}")
        print(f"[Issue Title]:            {report.get('issue_title')}")
        print(f"[Diagnostic Reason]:      {report.get('reason')}\n")

    print("-" * 70)
    print(f"{'STATUS':<14} {'TYPE':<10} {'PORT':<16} {'PRINTER NAME'}")
    print("-" * 70)

    for p in report.get("all_printers", []):
        labels = p.get("status_labels", [])
        if p["is_online"]:
            status_text = "ONLINE"
        elif "DISCONNECTED" in labels or "USB_UNPLUGGED" in labels:
            status_text = "DISCONNECTED"
        elif not p.get("is_connected", True):
            status_text = "DISCONNECTED"
        else:
            status_text = "OFFLINE"

        ptype = "VIRTUAL" if p["is_virtual"] else p["connection_type"]
        marker = "👉 " if p["name"] == selected_name else "   "
        lbl_str = f"({', '.join(labels)})" if not p["is_online"] else ""
        print(f"{marker}{status_text:<11} {ptype:<10} {p['port']:<16} {p['name']} {lbl_str}")

    print("-" * 70)


if __name__ == "__main__":
    main()
