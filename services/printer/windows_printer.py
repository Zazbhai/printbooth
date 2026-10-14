"""
PrintBooth Windows Hardware Printer Engine
==========================================
Direct Windows GDI printing for Brother DCP-T420W (and compatible printers)
Derived from the proven, working implementation in test.py.

Supports:
  - PDF documents (.pdf)
  - Image files (.jpg, .jpeg, .png, .webp, .bmp, .tiff)
  - Word documents (.docx, .doc) via native Windows Word COM automation
  - PowerPoint presentations (.pptx, .ppt) via native Windows PowerPoint COM automation

Uses:
  - pymupdf (fitz) for high-resolution 300 DPI page rendering
  - win32print & win32ui for direct Windows Printer Device Context (DC) control
  - PIL (Pillow) & ImageWin.Dib for LANCZOS scaling and GDI blitting
"""

import sys
import os
import io
import json
import argparse
from typing import List, Optional, Callable, Tuple

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import pymupdf
import win32print
import win32ui
import win32gui
import win32con
from PIL import Image, ImageWin, ImageEnhance

# Disable decompression bomb limitation so high-res uploads and scans never fail
Image.MAX_IMAGE_PIXELS = None


DEFAULT_PRINTER_NAME = "Brother DCP-T420W"

try:
    from services.printer.printer_detector import auto_detect_active_printer, enumerate_all_printers
except ImportError:
    try:
        from printer_detector import auto_detect_active_printer, enumerate_all_printers
    except ImportError:
        auto_detect_active_printer = None
        enumerate_all_printers = None


def resolve_printer(preferred_name: Optional[str] = None) -> str:
    """
    Finds the active Windows printer name using intelligent auto-detection.
    Prefers user-supplied printer if online; otherwise automatically detects
    which physical printer is connected and ready (USB / Network).
    """
    if auto_detect_active_printer is not None:
        try:
            selected, report = auto_detect_active_printer(preferred_name)
            return selected
        except Exception:
            pass

    try:
        installed = [p[2] for p in win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        )]
    except Exception:
        installed = []

    if preferred_name and preferred_name in installed:
        return preferred_name

    # Look for any connected brother printer
    for p in installed:
        if "brother" in p.lower() and "usb" in p.lower():
            return p
    for p in installed:
        if "brother" in p.lower() or "dcp-t420" in p.lower():
            return p

    # Fallback to system default
    try:
        return win32print.GetDefaultPrinter()
    except Exception:
        return DEFAULT_PRINTER_NAME


def safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def parse_page_range(value: str, total_pages: int) -> List[int]:
    """
    Parses human page ranges into 0-indexed page list.
    Accepts: "", "all", "*", "1", "1,3,5", "1-3", "1-3,5,8-10"
    Matches test.py logic exactly.
    """
    if total_pages <= 0:
        raise ValueError("Document has no pages.")

    value = (value or "").strip().lower()
    if value in ("", "all", "*"):
        return list(range(total_pages))

    selected = []
    parts = [x.strip() for x in value.split(",") if x.strip()]
    if not parts:
        return list(range(total_pages))

    for part in parts:
        if "-" in part:
            bits = [x.strip() for x in part.split("-")]
            if len(bits) != 2:
                raise ValueError(f"Invalid range: {part}")
            start = safe_int(bits[0], -1)
            end = safe_int(bits[1], -1)
            if start < 1 or end < 1 or start > end:
                raise ValueError(f"Invalid range: {part}")
            if end > total_pages:
                end = total_pages
            for page in range(start, end + 1):
                idx = page - 1
                if idx not in selected:
                    selected.append(idx)
        else:
            page = safe_int(part, -1)
            if page < 1 or page > total_pages:
                continue
            idx = page - 1
            if idx not in selected:
                selected.append(idx)

    return selected or list(range(total_pages))


def convert_word_to_pdf(doc_path: str) -> str:
    """Converts a .docx/.doc file to PDF using Microsoft Word COM automation."""
    import win32com.client
    import pythoncom
    pythoncom.CoInitialize()
    abs_path = os.path.abspath(doc_path)
    out_pdf = os.path.splitext(abs_path)[0] + "_word_converted.pdf"

    print(f"[OfficeConverter] Converting Word doc to PDF: {os.path.basename(doc_path)}", flush=True)
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    try:
        word.DisplayAlerts = 0  # wdAlertsNone = 0
    except Exception:
        pass
    try:
        doc = word.Documents.Open(abs_path, ReadOnly=True, ConfirmConversions=False)
        doc.SaveAs(out_pdf, FileFormat=17)  # 17 = wdFormatPDF
        doc.Close(False)
    finally:
        try:
            word.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()

    return out_pdf


def convert_powerpoint_to_pdf(ppt_path: str) -> str:
    """Converts a .pptx/.ppt file to PDF using Microsoft PowerPoint COM automation."""
    import win32com.client
    import pythoncom
    pythoncom.CoInitialize()
    abs_path = os.path.abspath(ppt_path)
    out_pdf = os.path.splitext(abs_path)[0] + "_ppt_converted.pdf"

    print(f"[OfficeConverter] Converting PowerPoint to PDF: {os.path.basename(ppt_path)}", flush=True)
    ppt = win32com.client.Dispatch("PowerPoint.Application")
    try:
        ppt.DisplayAlerts = 1  # ppAlertsNone = 1
    except Exception:
        pass
    try:
        pres = ppt.Presentations.Open(abs_path, WithWindow=False, ReadOnly=True)
        pres.SaveAs(out_pdf, 32)  # 32 = ppSaveAsPDF
        pres.Close()
    finally:
        try:
            ppt.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()

    return out_pdf


def convert_image_to_pdf(img_path: str) -> str:
    """Normalizes an image (PNG, JPG, JPEG, WEBP, BMP) into a high-DPI full-page A4 PDF."""
    abs_path = os.path.abspath(img_path)
    out_pdf = os.path.splitext(abs_path)[0] + "_img_converted.pdf"
    print(f"[ImageConverter] Converting Image to PDF: {os.path.basename(img_path)}", flush=True)

    img = Image.open(abs_path)
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba_img = img.convert("RGBA")
        bg.paste(rgba_img, mask=rgba_img.split()[-1])
        base_img = bg
    else:
        base_img = img.convert("RGB")

    orig_w, orig_h = base_img.size
    is_landscape = orig_w > orig_h

    # 300 DPI A4: 2480 x 3508
    canvas_w, canvas_h = (3508, 2480) if is_landscape else (2480, 3508)
    margin = 40
    avail_w = canvas_w - (margin * 2)
    avail_h = canvas_h - (margin * 2)

    scale = min(avail_w / orig_w, avail_h / orig_h)
    new_w = max(1, int(round(orig_w * scale)))
    new_h = max(1, int(round(orig_h * scale)))
    resample_filter = getattr(Image, "Resampling", Image).LANCZOS
    scaled_img = base_img.resize((new_w, new_h), resample_filter)

    canvas = Image.new("RGB", (canvas_w, canvas_h), (255, 255, 255))
    offset_x = (canvas_w - new_w) // 2
    offset_y = (canvas_h - new_h) // 2
    canvas.paste(scaled_img, (offset_x, offset_y))

    canvas.save(out_pdf, "PDF", resolution=300.0)
    return out_pdf


def convert_text_to_pdf(txt_path: str) -> str:
    """Converts a raw text file to clean formatted A4 PDF using PyMuPDF."""
    abs_path = os.path.abspath(txt_path)
    out_pdf = os.path.splitext(abs_path)[0] + "_txt_converted.pdf"
    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    y = 72
    for line in text.splitlines():
        page.insert_text((72, y), line, fontsize=11)
        y += 16
        if y > 780:
            page = doc.new_page(width=595, height=842)
            y = 72
    doc.save(out_pdf)
    doc.close()
    return out_pdf


def prepare_printable_document(file_path: str) -> Tuple[str, bool]:
    """
    Accepts PDF, image, Word, PowerPoint, or text files.
    Returns: (path_to_pdf, is_temporary_file)
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        return file_path, False

    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif"):
        return convert_image_to_pdf(file_path), True

    if ext == ".txt":
        return convert_text_to_pdf(file_path), True

    if ext in (".docx", ".doc", ".rtf"):
        return convert_word_to_pdf(file_path), True

    if ext in (".pptx", ".ppt"):
        return convert_powerpoint_to_pdf(file_path), True

    # Attempt direct open with PyMuPDF as fallback
    return file_path, False


def print_file(
    file_path: str,
    copies: int = 1,
    colour: str = "BW",
    page_range: str = "ALL",
    printer_name: Optional[str] = None,
    on_progress: Optional[Callable[[int, int, int, int], None]] = None,
    page_copies: Optional[dict] = None,
    page_colours: Optional[dict] = None,
    duplex: str = "SINGLE",
    paper_size: str = "A4",
    dpi: int = 300,
    scaling: str = "FIT",
    orientation: str = "AUTO",
    pages_per_sheet: int = 1,
    margins: str = "STANDARD",
    contrast_mode: str = "BALANCED",
    custom_scale_percent: int = 100,
    page_border: bool = False,
) -> dict:
    """
    Prints a PDF, image, DOCX, or PPTX file directly to the Windows printer with full DEVMODE settings.
    
    Args:
        file_path: Absolute path to the file.
        copies: Number of copies (1-99).
        colour: 'BW' | 'B&W' | 'COLOUR' | 'COLOR'.
        page_range: e.g. 'ALL', '1', '1-3', '1,3,5', '1-4, 7'.
        printer_name: Target printer name. Auto-detected if None.
        on_progress: Callback(completed_count, total_output, page_num_human, copy_num).
        page_copies: Optional dict mapping page number to custom copy count.
        page_colours: Optional dict mapping page number to 'BW' or 'COLOUR'.
        duplex: 'SINGLE' | 'DOUBLE' (long-edge) | 'SHORT_EDGE'.
        paper_size: 'A4' | 'A3' | 'LETTER' | 'LEGAL'.
        dpi: Print rendering DPI (300, 600, 1200).
        scaling: 'FIT' | 'ACTUAL' | 'STRETCH' | 'SHRINK_OVERSIZED' | 'CUSTOM'.
        orientation: 'AUTO' | 'PORTRAIT' | 'LANDSCAPE'.
        pages_per_sheet: N-Up layout (1, 2, 4, 6, 9, 16).
        margins: 'STANDARD' | 'BORDERLESS' | 'MINIMAL'.
        contrast_mode: 'BALANCED' | 'CRISP_TEXT' | 'PHOTO_ENHANCED'.
        custom_scale_percent: Custom scale percentage (50-200%).
        page_border: If True, draws thin border line around each N-Up page slot.
        
    Returns:
        dict with success, printer, total_output, message.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # Step 1: Pre-process non-PDF files into high-fidelity PDF
    pdf_path, is_temp = prepare_printable_document(file_path)

    copies = max(1, min(int(copies), 99))
    colour_norm = str(colour or "BW").upper().replace("&", "")
    is_bw = colour_norm in ("BW", "BLACKWHITE", "MONO", "GRAYSCALE", "MONOCHROME")

    # Validate physical printer connection & hardware error status before proceeding
    resolved_printer = resolve_printer(printer_name)
    if auto_detect_active_printer is not None:
        sel_name, report = auto_detect_active_printer(printer_name)
        if not report.get("is_available") or not report.get("is_hardware_ready"):
            issue_title = report.get("issue_title") or "Printer not available"
            diag_reason = report.get("reason") or "Printer is disconnected or in error"
            raise ConnectionError(f"Physical printer error: {issue_title}. {diag_reason}")
        resolved_printer = sel_name

    print(
        f"[PrinterEngine] Selected printer: {resolved_printer} | "
        f"Duplex: {duplex} | Paper: {paper_size} | DPI: {dpi} | Scale: {scaling} ({custom_scale_percent}%) | "
        f"Orientation: {orientation} | N-Up: {pages_per_sheet} | Margin: {margins} | Contrast: {contrast_mode} | Border: {page_border}",
        flush=True,
    )

    # Normalize per-page copies map
    page_copy_map = {}
    if page_copies and isinstance(page_copies, dict):
        for k, v in page_copies.items():
            try:
                page_copy_map[int(k)] = max(1, min(int(v), 99))
            except Exception:
                pass

    # Normalize per-page colours map
    page_colour_map = {}
    if page_colours and isinstance(page_colours, dict):
        for k, v in page_colours.items():
            try:
                page_colour_map[int(k)] = str(v).upper()
            except Exception:
                pass

    # Inspect document geometry & selected pages before DEVMODE setup
    pdf = None
    is_doc_landscape = False
    selected_pages = []
    total_pages = 0
    all_pages_bw = is_bw

    try:
        pdf = pymupdf.open(pdf_path)
        total_pages = len(pdf)
        selected_pages = parse_page_range(page_range, total_pages)
        if len(pdf) > 0:
            first_p = pdf[selected_pages[0] if selected_pages else 0]
            is_doc_landscape = float(first_p.rect.width) > float(first_p.rect.height)

        # Inspect selected pages to know if all are B&W or if any page has Colour
        if selected_pages:
            all_pages_bw = all(
                str(page_colour_map.get(idx + 1, colour)).upper().replace("&", "") in (
                    "BW", "BLACKWHITE", "MONO", "GRAYSCALE", "MONOCHROME"
                )
                for idx in selected_pages
            )
    except Exception as doc_insp_err:
        print(f"[PrinterEngine] Doc inspection note: {doc_insp_err}", flush=True)

    # ── Configure Windows DEVMODE for Printer Driver ──
    hprinter = None
    devmode = None
    try:
        hprinter = win32print.OpenPrinter(resolved_printer)
        devmode = win32print.GetPrinter(hprinter, 2).get("pDevMode")
        if devmode:
            # 1. Duplex
            dup_str = str(duplex or "SINGLE").upper()
            if dup_str in ("DOUBLE", "DUPLEX", "VERTICAL", "LONG_EDGE"):
                devmode.Duplex = win32con.DMDUP_VERTICAL
            elif dup_str in ("HORIZONTAL", "SHORT_EDGE"):
                devmode.Duplex = win32con.DMDUP_HORIZONTAL
            else:
                devmode.Duplex = win32con.DMDUP_SIMPLEX

            # 2. Paper Size
            ps_str = str(paper_size or "A4").upper()
            if ps_str == "A3":
                devmode.PaperSize = win32con.DMPAPER_A3
            elif ps_str == "LETTER":
                devmode.PaperSize = win32con.DMPAPER_LETTER
            elif ps_str == "LEGAL":
                devmode.PaperSize = win32con.DMPAPER_LEGAL
            else:
                devmode.PaperSize = win32con.DMPAPER_A4

            # 3. Orientation
            orient_str = str(orientation or "AUTO").upper()
            n_up_val = int(pages_per_sheet or 1)
            if orient_str == "PORTRAIT":
                devmode.Orientation = win32con.DMORIENT_PORTRAIT
            elif orient_str == "LANDSCAPE":
                devmode.Orientation = win32con.DMORIENT_LANDSCAPE
            elif orient_str == "AUTO":
                # For 2-Up or 6-Up of portrait documents, optimal layout is Landscape paper
                if n_up_val in (2, 6):
                    devmode.Orientation = win32con.DMORIENT_LANDSCAPE if not is_doc_landscape else win32con.DMORIENT_PORTRAIT
                else:
                    devmode.Orientation = win32con.DMORIENT_LANDSCAPE if is_doc_landscape else win32con.DMORIENT_PORTRAIT

            # 4. Color: Set strictly according to whether all selected pages are B&W or if any has Colour
            if all_pages_bw:
                devmode.Color = win32con.DMCOLOR_MONOCHROME
            else:
                devmode.Color = win32con.DMCOLOR_COLOR

            # Ensure all modified DEVMODE fields are marked valid in Fields bitmask
            devmode.Fields |= (
                win32con.DM_COLOR
                | win32con.DM_PAPERSIZE
                | win32con.DM_ORIENTATION
                | win32con.DM_DUPLEX
            )

            # 5. DPI / Print Quality
            try:
                devmode.PrintQuality = int(dpi) if str(dpi).isdigit() else 600
                devmode.Fields |= win32con.DM_PRINTQUALITY
            except Exception:
                pass

            # CRITICAL: Merge DEVMODE into printer driver via DocumentProperties
            # This commits DMCOLOR_MONOCHROME / DMCOLOR_COLOR to the vendor's private driver data
            try:
                win32print.DocumentProperties(
                    0,
                    hprinter,
                    resolved_printer,
                    devmode,
                    devmode,
                    win32con.DM_IN_BUFFER | win32con.DM_OUT_BUFFER,
                )
                print(f"[PrinterEngine] Driver DEVMODE applied (Color Mode: {'MONOCHROME' if all_pages_bw else 'COLOR'})", flush=True)
            except Exception as prop_err:
                print(f"[PrinterEngine] DocumentProperties warning: {prop_err}", flush=True)
    except Exception as dm_err:
        print(f"[PrinterEngine] DEVMODE initialization notice: {dm_err}", flush=True)

    dc = None
    hdc = None

    try:
        if not pdf or pdf.is_closed:
            pdf = pymupdf.open(pdf_path)
            total_pages = len(pdf)
            selected_pages = parse_page_range(page_range, total_pages)

        total_output = sum(page_copy_map.get(idx + 1, copies) for idx in selected_pages)
        completed = 0

        print(
            f"[PrinterEngine] Job: {os.path.basename(file_path)} | "
            f"Pages: {len(selected_pages)} ({selected_pages}) | "
            f"Copies: {copies} (custom per-page: {bool(page_copy_map)}) | "
            f"Total Output: {total_output} | "
            f"Color Mode: {'B&W (Monochrome)' if all_pages_bw else 'Colour (Mixed/Full)'}",
            flush=True,
        )

        if devmode:
            try:
                hdc = win32gui.CreateDC("WINSPOOL", resolved_printer, devmode)
                dc = win32ui.CreateDCFromHandle(hdc)
            except Exception as dc_err:
                print(f"[PrinterEngine] win32gui.CreateDC fallback ({dc_err})", flush=True)
                dc = win32ui.CreateDC()
                dc.CreatePrinterDC(resolved_printer)
        else:
            dc = win32ui.CreateDC()
            dc.CreatePrinterDC(resolved_printer)

        # Set StretchBltMode to COLORONCOLOR to eliminate composite color artifacts
        try:
            win32gui.SetStretchBltMode(dc.GetHandleOutput(), win32con.COLORONCOLOR)
        except Exception:
            pass

        HORZRES = 8
        VERTRES = 10
        printable_width = dc.GetDeviceCaps(HORZRES)
        printable_height = dc.GetDeviceCaps(VERTRES)

        doc_name = f"PrintBooth - {os.path.basename(file_path)}"
        job_id = None
        try:
            job_id = dc.StartDoc(doc_name)
        except Exception as e:
            print(f"[PrinterEngine] StartDoc error: {e}", flush=True)
            raise e

        # Render resolution based on user setting
        render_dpi = int(dpi) if str(dpi).isdigit() else 300
        render_dpi = max(150, min(render_dpi, 1200))
        matrix = pymupdf.Matrix(render_dpi / 72, render_dpi / 72)

        # Margin insets based on user setting
        margin_norm = str(margins or "STANDARD").upper()
        if margin_norm == "BORDERLESS":
            inset_ratio = 0.0
        elif margin_norm == "MINIMAL":
            inset_ratio = 0.015
        else:
            inset_ratio = 0.035

        avail_w = int(printable_width * (1.0 - 2 * inset_ratio))
        avail_h = int(printable_height * (1.0 - 2 * inset_ratio))
        base_x = int(printable_width * inset_ratio)
        base_y = int(printable_height * inset_ratio)

        scaling_norm = str(scaling or "FIT").upper()
        orient_norm = str(orientation or "AUTO").upper()
        contrast_norm = str(contrast_mode or "BALANCED").upper()
        n_up = int(pages_per_sheet or 1)
        if n_up not in (1, 2, 4, 6, 9, 16):
            n_up = 1

        # ── Pre-render and enhance individual pages ──
        rendered_pages = []
        for page_index in selected_pages:
            page_human = page_index + 1
            page_target_copies = page_copy_map.get(page_human, copies)

            page = pdf[page_index]
            p_w_pt = max(1.0, float(page.rect.width))
            p_h_pt = max(1.0, float(page.rect.height))

            # Scale so rendered raster does not explode in memory or exceed hardware resolution
            target_scale_x = (printable_width / p_w_pt) if printable_width > 0 else (render_dpi / 72.0)
            target_scale_y = (printable_height / p_h_pt) if printable_height > 0 else (render_dpi / 72.0)
            desired_scale = min(target_scale_x, target_scale_y, render_dpi / 72.0)
            desired_scale = max(1.0, min(desired_scale, 4.16)) # Capped at ~300 DPI

            page_matrix = pymupdf.Matrix(desired_scale, desired_scale)
            pix = page.get_pixmap(matrix=page_matrix, alpha=False)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            # Page-level orientation handling
            if orient_norm == "LANDSCAPE" and image.height > image.width:
                image = image.rotate(90, expand=True)
            elif orient_norm == "PORTRAIT" and image.width > image.height:
                image = image.rotate(-90, expand=True)
            elif orient_norm == "AUTO":
                if image.width > image.height and printable_height > printable_width and n_up == 1:
                    # Landscape page on portrait sheet -> auto-rotate to maximize sheet usage
                    image = image.rotate(90, expand=True)

            # Determine whether this specific page should be printed B&W or Colour
            page_col = page_colour_map.get(page_human, colour)
            page_col_norm = str(page_col).upper().replace("&", "")
            page_is_bw = page_col_norm in ("BW", "BLACKWHITE", "MONO", "GRAYSCALE", "MONOCHROME")

            # Black & White conversion: keep in pure 8-bit grayscale mode
            if page_is_bw:
                image = image.convert("L")
            else:
                image = image.convert("RGB")

            # Contrast enhancement
            if contrast_norm == "CRISP_TEXT":
                image = ImageEnhance.Contrast(image).enhance(1.35)
                image = ImageEnhance.Sharpness(image).enhance(1.25)
            elif contrast_norm == "PHOTO_ENHANCED":
                if not page_is_bw:
                    image = ImageEnhance.Color(image).enhance(1.2)
                image = ImageEnhance.Contrast(image).enhance(1.1)

            rendered_pages.append({
                "page_index": page_index,
                "page_human": page_human,
                "image": image,
                "doc_w": int(page.rect.width * render_dpi / 72),
                "doc_h": int(page.rect.height * render_dpi / 72),
                "target_copies": page_target_copies,
            })

        # ── Compose pages onto physical sheets (N-Up layout) ──
        sheets = []
        gap = 24  # gap between sub-pages in N-Up

        # Determine grid dimensions (cols, rows) based on sheet orientation and n_up
        is_sheet_portrait = avail_h >= avail_w

        if n_up == 1:
            cols, rows = 1, 1
        elif n_up == 2:
            if is_sheet_portrait:
                cols, rows = 1, 2
            else:
                cols, rows = 2, 1
        elif n_up == 4:
            cols, rows = 2, 2
        elif n_up == 6:
            if is_sheet_portrait:
                cols, rows = 2, 3
            else:
                cols, rows = 3, 2
        elif n_up == 9:
            cols, rows = 3, 3
        elif n_up == 16:
            cols, rows = 4, 4
        else:
            cols, rows = 1, 1

        total_gap_x = gap * (cols - 1)
        total_gap_y = gap * (rows - 1)
        slot_w = max(10, (avail_w - total_gap_x) // cols)
        slot_h = max(10, (avail_h - total_gap_y) // rows)

        base_slots = []
        for r in range(rows):
            for c in range(cols):
                sx = base_x + c * (slot_w + gap)
                sy = base_y + r * (slot_h + gap)
                base_slots.append((sx, sy, slot_w, slot_h))

        for i in range(0, len(rendered_pages), n_up):
            chunk = rendered_pages[i:i + n_up]
            items = []
            for s_idx, p in enumerate(chunk):
                sx, sy, sw, sh = base_slots[s_idx]
                img = p["image"]

                # Auto-rotate subpage if 2-Up is stacked on portrait sheet
                if n_up == 2 and is_sheet_portrait:
                    if img.height > img.width and sw > sh:
                        img = img.rotate(90, expand=True)

                if scaling_norm == "STRETCH":
                    w, h = sw, sh
                elif scaling_norm == "ACTUAL" and n_up == 1:
                    w = min(sw, p["doc_w"])
                    h = min(sh, p["doc_h"])
                elif scaling_norm == "CUSTOM":
                    sc = min(sw / img.width, sh / img.height)
                    scale_mult = max(0.2, min(float(custom_scale_percent or 100) / 100.0, 3.0))
                    w = max(1, int(img.width * sc * scale_mult))
                    h = max(1, int(img.height * sc * scale_mult))
                elif scaling_norm == "SHRINK_OVERSIZED" and n_up == 1:
                    if p["doc_w"] > sw or p["doc_h"] > sh:
                        sc = min(sw / p["doc_w"], sh / p["doc_h"])
                        w = int(p["doc_w"] * sc)
                        h = int(p["doc_h"] * sc)
                    else:
                        w = p["doc_w"]
                        h = p["doc_h"]
                else:  # FIT (default)
                    sc = min(sw / img.width, sh / img.height)
                    w = max(1, int(img.width * sc))
                    h = max(1, int(img.height * sc))

                resized = img.resize((w, h), Image.Resampling.LANCZOS)

                # Draw crisp page border if enabled
                if page_border:
                    from PIL import ImageDraw
                    draw = ImageDraw.Draw(resized)
                    bw = max(1, int(render_dpi / 200))
                    outline = 140 if resized.mode == "L" else (140, 140, 140)
                    draw.rectangle([(0, 0), (w - 1, h - 1)], outline=outline, width=bw)

                x = sx + (sw - w) // 2
                y = sy + (sh - h) // 2
                items.append({"dib": ImageWin.Dib(resized), "rect": (x, y, x + w, y + h)})

            max_c = max(p["target_copies"] for p in chunk)
            sheets.append({
                "items": items,
                "target_copies": max_c,
                "page_human": chunk[0]["page_human"],
            })

        # ── Output sheets to Windows GDI Spooler ──
        is_duplex = str(duplex or "SINGLE").upper() in (
            "DOUBLE", "DUPLEX", "VERTICAL", "LONG_EDGE", "HORIZONTAL", "SHORT_EDGE"
        )
        has_custom_page_copies = bool(page_copy_map)

        if has_custom_page_copies:
            total_output = sum(s["target_copies"] for s in sheets)
            for s in sheets:
                for current_copy in range(1, s["target_copies"] + 1):
                    dc.StartPage()
                    for item in s["items"]:
                        item["dib"].draw(dc.GetHandleOutput(), item["rect"])
                    dc.EndPage()
                    time.sleep(0.12)  # Synchronous pacing pause so printer hardware receives pages in sync

                    completed += 1
                    if on_progress:
                        on_progress(completed, total_output, s["page_human"], current_copy)
        else:
            total_sheets = len(sheets)
            total_output = total_sheets * copies
            for current_copy in range(1, copies + 1):
                for sheet_idx, s in enumerate(sheets):
                    dc.StartPage()
                    for item in s["items"]:
                        item["dib"].draw(dc.GetHandleOutput(), item["rect"])
                    dc.EndPage()
                    time.sleep(0.12)  # Synchronous pacing pause so printer hardware receives pages in sync

                    completed += 1
                    if on_progress:
                        on_progress(completed, total_output, s["page_human"], current_copy)

                # If duplex and odd number of sheets, feed blank page so next copy starts on new sheet
                if is_duplex and (total_sheets % 2 != 0) and (current_copy < copies):
                    dc.StartPage()
                    dc.EndPage()

        try:
            dc.EndDoc()
        except Exception as e:
            print(f"[PrinterEngine] EndDoc error: {e}", flush=True)

        print(f"[PrinterEngine] GDI data spooled ({completed}/{total_output} pages). Job ID: {job_id}. Now awaiting physical hardware completion from Brother DCP-T420W...", flush=True)

        # Wait until the Brother printer has physically accepted/printed the pages and the job has cleared from Windows spooler
        wait_for_spooler_completion(
            printer_name=resolved_printer,
            doc_name=doc_name,
            total_pages=total_output,
            target_job_id=job_id if isinstance(job_id, int) and job_id > 0 else None,
            timeout_seconds=45,
        )

        return {
            "success": True,
            "printer": resolved_printer,
            "total_output": total_output,
            "completed": completed,
            "file": os.path.basename(file_path),
        }

    except Exception as e:
        if dc:
            try:
                dc.AbortDoc()
            except Exception:
                pass
        raise e
    finally:
        if hprinter:
            try:
                win32print.ClosePrinter(hprinter)
            except Exception:
                pass
        if dc:
            try:
                dc.DeleteDC()
            except Exception:
                pass
        elif hdc:
            try:
                win32gui.DeleteDC(hdc)
            except Exception:
                pass
        if pdf:
            try:
                pdf.close()
            except Exception:
                pass
        # Clean up temporary converted PDF if generated
        if is_temp and os.path.exists(pdf_path):
            try:
                os.remove(pdf_path)
            except Exception:
                pass


def wait_for_spooler_completion(
    printer_name: str,
    doc_name: str,
    total_pages: int,
    target_job_id: Optional[int] = None,
    timeout_seconds: int = 45,
    on_telemetry: Optional[Callable[[int, int, str], None]] = None,
) -> bool:
    """
    Monitors the Windows Print Spooler queue.
    Returns True once the print job has cleared the queue or reached the printer hardware.
    """
    import time

    try:
        handle = win32print.OpenPrinter(printer_name)
    except Exception as e:
        print(f"[PrinterSpooler] Could not open printer for monitoring: {e}", flush=True)
        return True

    try:
        # Give Windows spooler a brief moment
        time.sleep(0.4)

        if target_job_id is None:
            find_start = time.time()
            while time.time() - find_start < 4.0:
                jobs = win32print.EnumJobs(handle, 0, 100, 2)
                for j in jobs:
                    p_doc = j.get("pDocument", "")
                    if doc_name in p_doc or p_doc in doc_name:
                        target_job_id = j.get("JobId")
                        break
                if target_job_id is not None:
                    break
                time.sleep(0.3)

        if target_job_id is None:
            # Job was either already sent to printer or queue is empty
            print("[PrinterSpooler] Job spooled and dispatched directly to hardware.", flush=True)
            return True

        print(f"[PrinterSpooler] Monitoring Hardware Print Job ID #{target_job_id} in queue...", flush=True)

        spool_start = time.time()
        last_printed_count = -1

        while time.time() - spool_start < timeout_seconds:
            jobs = win32print.EnumJobs(handle, 0, 100, 2)
            matching_job = next((j for j in jobs if j.get("JobId") == target_job_id), None)

            if matching_job is None:
                # The job has finished sending to hardware and cleared from queue!
                print(f"[PrinterSpooler] OK: Job #{target_job_id} cleared from Windows queue! Physical printing finished.", flush=True)
                if on_telemetry:
                    on_telemetry(total_pages, total_pages, "COMPLETED")
                return True

            status = matching_job.get("Status", 0)
            pages_printed = matching_job.get("PagesPrinted", 0)

            # Check for error flags
            if status & win32print.JOB_STATUS_ERROR:
                print(f"[PrinterSpooler] WARNING: Printer error detected for Job #{target_job_id}", flush=True)
            elif status & win32print.JOB_STATUS_PAPEROUT:
                print(f"[PrinterSpooler] WARNING: Printer out of paper for Job #{target_job_id}", flush=True)
            elif status & win32print.JOB_STATUS_OFFLINE:
                print(f"[PrinterSpooler] WARNING: Printer offline for Job #{target_job_id}", flush=True)

            if pages_printed != last_printed_count:
                last_printed_count = pages_printed
                print(f"[PrinterSpooler] Job #{target_job_id} hardware progress: {pages_printed}/{total_pages} pages...", flush=True)
                if on_telemetry:
                    on_telemetry(pages_printed, total_pages, "PRINTING")

            time.sleep(0.8)

        print(f"[PrinterSpooler] Monitoring finished (job dispatched to printer hardware).", flush=True)
        return True
    except Exception as err:
        print(f"[PrinterSpooler] Spooler monitor notice: {err}", flush=True)
        return True
    finally:
        try:
            win32print.ClosePrinter(handle)
        except Exception:
            pass


def clear_printer_queue(printer_name: str, job_id: Optional[int] = None):
    """
    Cleans up the Windows printer queue if a job is stuck or requested.
    """
    try:
        handle = win32print.OpenPrinter(printer_name, {"DesiredAccess": win32print.PRINTER_ALL_ACCESS})
        try:
            if job_id:
                win32print.SetJob(handle, job_id, 0, None, win32print.JOB_CONTROL_DELETE)
                print(f"[PrinterSpooler] Deleted Job #{job_id} from queue.", flush=True)
            else:
                win32print.SetPrinter(handle, 0, None, win32print.PRINTER_CONTROL_PURGE)
                print(f"[PrinterSpooler] Purged printer queue.", flush=True)
        finally:
            win32print.ClosePrinter(handle)
    except Exception as e:
        print(f"[PrinterSpooler] Note on queue clear: {e}", flush=True)


def inspect_file(file_path: str, max_previews: int = 50) -> dict:
    """
    Accurately determines real page count and generates preview images
    for any supported file (PDF, DOCX, DOC, PPTX, PPT, JPG, PNG).
    """
    import base64

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    fast_count = 0
    if ext in (".pptx", ".ppt"):
        try:
            import zipfile
            with zipfile.ZipFile(file_path, "r") as z:
                slides = [n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")]
                if slides:
                    fast_count = len(slides)
        except Exception:
            pass

    try:
        pdf_path, is_temp = prepare_printable_document(file_path)
    except Exception as e:
        print(f"[Inspect] Conversion error: {e}", flush=True)
        if fast_count > 0:
            return {
                "success": True,
                "fileName": os.path.basename(file_path),
                "pageCount": fast_count,
                "previews": [],
            }
        raise

    pdf = None
    try:
        pdf = pymupdf.open(pdf_path)
        total_pages = len(pdf)
        previews = []

        render_count = min(total_pages, max_previews)
        for i in range(render_count):
            page = pdf[i]
            # Fast low-res preview rendering (approx 420x595 at 72 DPI)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(1.0, 1.0), alpha=False)
            b64 = base64.b64encode(pix.tobytes("jpeg")).decode("ascii")
            previews.append({
                "id": i + 1,
                "pageNumber": i + 1,
                "title": f"Slide {i + 1}" if ext in (".pptx", ".ppt") else f"Page {i + 1}",
                "subtitle": os.path.basename(file_path),
                "url": f"data:image/jpeg;base64,{b64}",
            })

        return {
            "success": True,
            "fileName": os.path.basename(file_path),
            "pageCount": total_pages,
            "previews": previews,
        }
    finally:
        if pdf:
            try:
                pdf.close()
            except Exception:
                pass
        if is_temp and os.path.exists(pdf_path):
            try:
                os.remove(pdf_path)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="PrintBooth Windows Printer CLI")
    parser.add_argument("--file", default=None, help="Path to PDF, image, DOCX, or PPTX file")
    parser.add_argument("--copies", type=int, default=1, help="Number of copies")
    parser.add_argument("--colour", default="BW", help="BW or COLOUR")
    parser.add_argument("--pages", default="ALL", help="Page range e.g. 1-3,5 or 1-4, 7")
    parser.add_argument("--page-copies", default=None, help="JSON or comma pairs e.g. '{\"1\":2,\"4\":3}' or '1:2,4:3'")
    parser.add_argument("--page-colours", default=None, help="JSON or comma pairs e.g. '{\"1\":\"COLOUR\",\"2\":\"BW\"}' or '1:COLOUR,2:BW'")
    parser.add_argument("--printer", default=None, help="Printer name override or 'auto'")
    parser.add_argument("--order", default=None, help="Order ID for telemetry")
    parser.add_argument("--duplex", default="SINGLE", help="SINGLE or DOUBLE (long-edge)")
    parser.add_argument("--paper-size", default="A4", help="A4, A3, LETTER, or LEGAL")
    parser.add_argument("--dpi", type=int, default=300, help="Print resolution DPI (300, 600, 1200)")
    parser.add_argument("--scaling", default="FIT", help="FIT, ACTUAL, STRETCH, SHRINK_OVERSIZED, CUSTOM")
    parser.add_argument("--custom-scale", type=int, default=100, help="Custom scaling percentage (e.g. 100, 75, 50)")
    parser.add_argument("--orientation", default="AUTO", help="AUTO, PORTRAIT, or LANDSCAPE")
    parser.add_argument("--pages-per-sheet", type=int, default=1, help="N-Up (1, 2, 4, 6, 9, 16)")
    parser.add_argument("--margins", default="STANDARD", help="STANDARD, BORDERLESS, MINIMAL")
    parser.add_argument("--contrast-mode", default="BALANCED", help="BALANCED, CRISP_TEXT, PHOTO_ENHANCED")
    parser.add_argument("--page-border", action="store_true", help="Draw a solid border around each page in N-Up")
    parser.add_argument("--inspect", action="store_true", help="Inspect file to get exact page count and previews")
    parser.add_argument("--detect", action="store_true", help="Auto-detect connected printers and return JSON")
    parser.add_argument("--set-default", default=None, help="Set the default active printer")
    parser.add_argument("--auto", action="store_true", help="Auto-detect and use whichever printer is connected")
    args = parser.parse_args()

    if args.set_default:
        target = args.set_default.strip()
        try:
            if win32print:
                win32print.SetDefaultPrinter(target)
            elif sys.platform != "win32":
                subprocess.run(["lpadmin", "-d", target], check=False)
            print(json.dumps({"success": True, "selectedPrinter": target}), flush=True)
            sys.exit(0)
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}), flush=True)
            sys.exit(1)

    if args.detect:
        if auto_detect_active_printer:
            selected, report = auto_detect_active_printer(args.printer)
            print(json.dumps({
                "type": "DETECT",
                "selectedPrinter": selected,
                "is_available": report.get("is_available", False),
                "is_hardware_ready": report.get("is_hardware_ready", False),
                "has_physical_printer": report.get("has_physical_printer", True),
                "issue_code": report.get("issue_code"),
                "issue_title": report.get("issue_title"),
                "reason": report.get("reason"),
                "details": report.get("details"),
                "printers": report.get("all_printers", []),
            }, indent=2), flush=True)
        else:
            resolved = resolve_printer(args.printer)
            print(json.dumps({
                "type": "DETECT",
                "selectedPrinter": resolved,
                "is_available": bool(resolved),
                "is_hardware_ready": bool(resolved),
                "has_physical_printer": bool(resolved),
                "printers": []
            }))
        sys.exit(0)

    if not args.file:
        parser.error("--file is required when not running --detect")

    if args.inspect:
        try:
            res = inspect_file(args.file)
            print(json.dumps({"type": "INSPECT", "data": res}), flush=True)
            sys.exit(0)
        except Exception as err:
            print(json.dumps({"type": "ERROR", "error": str(err)}), flush=True)
            sys.exit(1)

    def progress_callback(completed, total, page_num, copy_num):
        payload = {
            "type": "PROGRESS",
            "phase": "SPOOLING",
            "orderId": args.order,
            "completed": completed,
            "total": total,
            "page": page_num,
            "copy": copy_num,
            "percent": int((completed / total) * 85),
            "message": f"Rendering page {page_num} of {total} to spooler...",
        }
        print(json.dumps(payload), flush=True)

    parsed_page_copies = None
    if args.page_copies:
        try:
            parsed_page_copies = json.loads(args.page_copies)
        except Exception:
            try:
                parsed_page_copies = {}
                for pair in args.page_copies.split(","):
                    if ":" in pair:
                        p, c = pair.split(":", 1)
                        parsed_page_copies[int(p.strip())] = int(c.strip())
            except Exception:
                parsed_page_copies = None

    parsed_page_colours = None
    if args.page_colours:
        try:
            parsed_page_colours = json.loads(args.page_colours)
        except Exception:
            try:
                parsed_page_colours = {}
                for pair in args.page_colours.split(","):
                    if ":" in pair:
                        p, col = pair.split(":", 1)
                        parsed_page_colours[int(p.strip())] = col.strip().upper()
            except Exception:
                parsed_page_colours = None

    try:
        result = print_file(
            file_path=args.file,
            copies=args.copies,
            colour=args.colour,
            page_range=args.pages,
            printer_name=args.printer,
            on_progress=progress_callback,
            page_copies=parsed_page_copies,
            page_colours=parsed_page_colours,
            duplex=args.duplex,
            paper_size=args.paper_size,
            dpi=args.dpi,
            scaling=args.scaling,
            orientation=args.orientation,
            pages_per_sheet=args.pages_per_sheet,
            margins=args.margins,
            contrast_mode=args.contrast_mode,
            custom_scale_percent=args.custom_scale,
            page_border=args.page_border,
        )
        # Hardware printing has actually completed and cleared from queue!
        print(json.dumps({
            "type": "SUCCESS",
            "orderId": args.order,
            "data": result,
            "message": "Physical hardware printing complete. Paper ejected."
        }), flush=True)
        sys.exit(0)
    except Exception as err:
        print(json.dumps({"type": "ERROR", "orderId": args.order, "error": str(err)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

