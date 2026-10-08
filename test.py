import os
import requests
import uuid
import json
from pathlib import Path

# Load variables from .env if present
def load_env():
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

load_env()

API_URL = "https://upiexpress.com/api/create_order"
API_KEY = os.getenv("UPIEXPRESS_API_KEY", "lerEItMzaJvMDvYQZuSDKHfdRZpg4Jt8khFv")
WEBHOOK_URL = (
    os.getenv("UPIEXPRESS_WEBHOOK_URL")
    or os.getenv("UPI_EXPRESS_WEBHOOK_URL")
    or "https://example.com/webhook"
)

# Generate a unique transaction ID
client_txn_id = "PB-" + uuid.uuid4().hex[:20]

payload = {
    "key": API_KEY,
    "client_txn_id": client_txn_id,

    "amount": "1",

    "customer_name": "Test Customer",
    "customer_email": "test@example.com",
    "customer_mobile": "9876543210",

    "redirect_url": "https://example.com/payment",
    "webhook_url": WEBHOOK_URL,

    "note": "PrintBooth Test"
}

try:
    response = requests.post(
        API_URL,
        json=payload,
        timeout=30
    )

    print("HTTP Status:", response.status_code)
    print("\nRaw Response:")
    print(response.text)

    data = response.json()

    print("\nFormatted Response:")
    print(json.dumps(data, indent=4))

    if data.get("status") is True:
        order = data.get("data", {})

        print("\n==============================")
        print("ORDER CREATED")
        print("==============================")
        payment_link = order.get("payment_link") or order.get("payment_url")
        order_id = order.get("orderid") or order.get("order_id")
        print("Order ID:", order_id)
        print("Client Txn ID:", client_txn_id)
        print("Payment URL:", payment_link)

        print("\nOpen this URL to make the payment:")
        print(payment_link)

    else:
        print("\nORDER CREATION FAILED")
        print("Message:", data.get("msg"))

except requests.RequestException as e:
    print("Request error:", e)

except ValueError:
    print("Server returned a non-JSON response.")