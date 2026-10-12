
import os
import uuid
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import requests
import qrcode


# =========================================================
# CONFIGURATION — EDIT THESE VALUES
# =========================================================

API_URL = "https://upiexpress.com/api/create_order"

# Dummy placeholder: replace with your rotated API key.
API_KEY = "lerEItMzaJvMDvYQZuSDKHfdRZpg4Jt8khFv"

# Must be a real, publicly accessible HTTPS webhook endpoint.
WEBHOOK_URL = (
    "https://eca6-2401-4900-8967-26d8-80c1-870e-c1d8-175.ngrok-free.app/api/upiexpress/webhook"
)

REDIRECT_URL = "https://printbooth.co.in/payment"

OUTPUT_FILE = (
    Path(__file__).resolve().parent / "upi_intent_qr.png"
)

TIMEOUT_SECONDS = 30


# =========================================================
# CREATE PAYMENT ORDER
# =========================================================

def create_order(amount):
    client_txn_id = "PB-" + uuid.uuid4().hex[:20]

    payload = {
        "key": API_KEY,
        "client_txn_id": client_txn_id,
        "amount": f"{amount:.2f}",
        "customer_name": "PrintBooth Customer",
        "customer_email": "customer@example.com",
        "customer_mobile": "9876543210",
        "redirect_url": REDIRECT_URL,
        "webhook_url": WEBHOOK_URL,
        "note": "PrintBooth Test",
    }

    print("\nCreating UPIExpress order...")
    print("Transaction ID:", client_txn_id)
    print("Requested amount: INR", f"{amount:.2f}")

    try:
        response = requests.post(
            API_URL,
            json=payload,
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"API request failed: {exc}") from exc

    print("\nHTTP Status:", response.status_code)

    try:
        result = response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"API returned non-JSON response: {response.text[:1000]}"
        ) from exc

    if not response.ok:
        print("API error response:")
        print(json.dumps(result, indent=2))

        raise RuntimeError(
            result.get("msg")
            or result.get("message")
            or f"HTTP {response.status_code}"
        )

    if result.get("status") is not True:
        raise RuntimeError(
            result.get("msg")
            or result.get("message")
            or "Order creation failed."
        )

    order = result.get("data") or {}

    print("\nOrder created successfully.")
    print("Order ID:", order.get("orderid", order.get("order_id")))
    print("Provider transaction ID:", order.get("txn_id"))
    print("Payment link:", order.get("payment_link"))

    return order, client_txn_id


# =========================================================
# VALIDATE THE PROVIDER'S AMOUNT
# =========================================================

def validate_amount(order, requested_amount):
    """
    Validate provider's order amount and check for convenience fee differences.
    """

    intent = order.get("upiintent")

    if not isinstance(intent, str) or not intent.startswith("upi://pay?"):
        raise RuntimeError(
            "No valid generic UPI Intent URI was returned."
        )

    requested_amount = Decimal(str(requested_amount))
    api_amount = Decimal(str(order.get("amount", "0")))
    api_total = Decimal(str(order.get("total", api_amount)))

    print("\n========== AMOUNT CHECK ==========")
    print(f"Requested amount: ₹{requested_amount:.2f}")
    print(f"API amount:       ₹{api_amount:.2f}")
    print(f"Convenience fee:  ₹{order.get('convenience_fee', 0)}")
    print(f"API total:        ₹{api_total:.2f}")
    print("UPI Intent:", order.get("upiintent"))
    print("==================================")

    if api_total != requested_amount:
        print(
            "\nWARNING: The provider's total differs from "
            "the requested amount. Enforcing exact requested amount on QR intent..."
        )
        import re
        formatted = f"{requested_amount:.2f}"
        if re.search(r"[?&]am=[^&]*", intent):
            intent = re.sub(r"([?&]am=)[^&]*", rf"\g<1>{formatted}", intent)
        elif "?" in intent:
            intent += f"&am={formatted}"
        else:
            intent += f"?am={formatted}"
        print(f"Sanitized UPI Intent: {intent}")

    return intent


# =========================================================
# GENERATE QR IMAGE
# =========================================================

def generate_qr(upi_uri):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=12,
        border=4,
    )

    qr.add_data(upi_uri)
    qr.make(fit=True)

    image = qr.make_image(
        fill_color="black",
        back_color="white",
    )

    image.save(OUTPUT_FILE)

    print("\nQR generated successfully.")
    print("Saved to:", OUTPUT_FILE.resolve())

    # Open image on Windows.
    try:
        os.startfile(str(OUTPUT_FILE))
    except (AttributeError, OSError):
        pass


# =========================================================
# MAIN
# =========================================================

def main():
    if not API_KEY or API_KEY == "YOUR_DUMMY_UPIEXPRESS_API_KEY":
        print("Configure API_KEY before running.")
        return

    if "YOUR-PUBLIC-DOMAIN" in WEBHOOK_URL:
        print("Configure WEBHOOK_URL with your real public HTTPS endpoint.")
        return

    raw_amount = input("Enter payment amount in INR: ").strip()

    try:
        amount = Decimal(raw_amount)

        if not amount.is_finite() or amount <= 0:
            raise InvalidOperation

        amount = amount.quantize(Decimal("0.01"))

    except InvalidOperation:
        print("Enter a valid positive amount, such as 2 or 10.50.")
        return

    try:
        order, client_txn_id = create_order(amount)

        # Never rewrite the provider's URI to force a different amount.
        upi_uri = validate_amount(order, amount)

        generate_qr(upi_uri)

        print("\n========== PAYMENT DETAILS ==========")
        print("Client transaction ID:", client_txn_id)
        print("Order ID:", order.get("orderid", order.get("order_id")))
        print("Amount: INR", f"{amount:.2f}")
        print("Webhook:", WEBHOOK_URL)
        print("QR file:", OUTPUT_FILE.resolve())
        print("=====================================")

    except (RuntimeError, ValueError) as exc:
        print("\nERROR:", exc)
        print(
            "\nIf the provider changed the amount, contact UPIExpress "
            "support to resolve the fee or total calculation."
        )


if __name__ == "__main__":
    main()
