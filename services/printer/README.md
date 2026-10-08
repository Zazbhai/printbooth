# PrintBooth CUPS Printer Automation Service

Physical printer controller and background daemon for **PrintBooth** self-service kiosks.

Handles real CUPS hardware commands for:
- **Color vs. Black & White** (`monochrome` / `color`, `Gray` / `CMYK`)
- **Copies** (`1`, `2`, `3`…)
- **Duplex** (`two-sided-long-edge` vs `one-sided`)
- **Paper Size** (`A4`, `Letter`, `Legal`)
- **Queue telemetry & test prints**

---

## 1. Raspberry Pi / Linux Hardware Setup

To allow Python to talk directly to your physical printer via CUPS, install the system CUPS packages:

```bash
# 1. Install CUPS daemon and development headers
sudo apt-get update
sudo apt-get install -y cups libcups2-dev gcc python3-dev

# 2. Add your kiosk user to the lpadmin group
sudo usermod -aG lpadmin $USER

# 3. Enable and start CUPS
sudo systemctl enable cups
sudo systemctl start cups

# 4. Install Python dependencies
pip install -r requirements.txt
```

---

## 2. Testing the Controller via CLI

### Discover Printers
```bash
python cups_printer.py list
```

### Print Document with Custom Options
```bash
# Print 3 copies in Black & White, Double-sided (Duplex) on A4:
python cups_printer.py print --file /path/to/doc.pdf --copies 3 --bw --duplex --paper A4

# Print 1 copy in Full Color, Single-sided:
python cups_printer.py print --file /path/to/doc.pdf --copies 1 --color --single --paper A4
```

### Check Active Jobs & Spooler
```bash
python cups_printer.py jobs
```

### Cancel a Job
```bash
python cups_printer.py cancel --job-id 1045
```

### Run Printhead Diagnostic / Cleaning
```bash
python cups_printer.py clean
```

---

## 3. Running as a Background Kiosk Daemon

The daemon continuously listens for customer orders paid on the Web/Kiosk interface and sends them to the local printer:

```bash
export PRINTBOOTH_API_URL="http://localhost:5000/api"
export KIOSK_ID="PB-002"

python kiosk_daemon.py
```

### Running as a `systemd` service on Raspberry Pi:
Create `/etc/systemd/system/printbooth-printer.service`:
```ini
[Unit]
Description=PrintBooth CUPS Printer Daemon
After=network.target cups.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/printer_automation/services/printer
ExecStart=/usr/bin/python3 kiosk_daemon.py
Restart=always
RestartSec=5
Environment=PRINTBOOTH_API_URL=http://localhost:5000/api
Environment=KIOSK_ID=PB-002

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable printbooth-printer
sudo systemctl start printbooth-printer
```
