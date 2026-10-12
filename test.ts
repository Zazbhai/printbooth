import "dotenv/config";

import axios from "axios";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exec } from "node:child_process";

const API_URL = "https://upiexpress.com/api/create_order";
const API_KEY = process.env.UPIEXPRESS_API_KEY?.trim() || "lerEItMzaJvMDvYQZuSDKHfdRZpg4Jt8khFv";

const WEBHOOK_URL =
  process.env.UPIEXPRESS_WEBHOOK_URL?.trim() || "https://eca6-2401-4900-8967-26d8-80c1-870e-c1d8-175.ngrok-free.app/api/upiexpress/webhook";

const REDIRECT_URL = "https://printbooth.co.in/payment";

const OUTPUT_FILE = path.resolve(
  process.cwd(),
  "upi_intent_qr.png"
);

const TIMEOUT_MS = 30_000;

interface CreateOrderResponse {
  status: boolean;
  msg?: string;
  message?: string;
  data?: {
    payment_link?: string;
    client_txn_id?: string;
    txn_id?: string;
    orderid?: string;
    amount?: number | string;
    convenience_fee?: number | string;
    total?: number | string;
    upiintent?: string;
  };
}

interface PaymentOrder {
  payment_link?: string;
  client_txn_id?: string;
  txn_id?: string;
  orderid?: string;
  amount?: number | string;
  convenience_fee?: number | string;
  total?: number | string;
  upiintent?: string;
}

function toPaise(value: number | string): number {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid amount returned: ${value}`);
  }

  return Math.round(amount * 100);
}

// =====================================================
// CREATE PAYMENT ORDER
// =====================================================

export async function createOrder(
  amountPaise: number
): Promise<{ order: PaymentOrder; clientTxnId: string }> {
  const clientTxnId = `PB-${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  const amount = (amountPaise / 100).toFixed(2);

  const payload: Record<string, string> = {
    key: API_KEY,
    client_txn_id: clientTxnId,
    amount,
    customer_name: "PrintBooth Customer",
    customer_email: "customer@example.com",
    customer_mobile: "9876543210",
    redirect_url: REDIRECT_URL,
    note: "PrintBooth Test",
  };

  if (WEBHOOK_URL) {
    payload.webhook_url = WEBHOOK_URL;
  }

  console.log("\nCreating UPIExpress order...");
  console.log("Client transaction ID:", clientTxnId);
  console.log("Requested amount: INR", amount);

  let response;

  try {
    response = await axios.post<CreateOrderResponse>(
      API_URL,
      payload,
      {
        timeout: TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Network error: ${error.message}`
      );
    }

    throw error;
  }

  console.log("\nHTTP Status:", response.status);

  const result = response.data;

  if (response.status < 200 || response.status >= 300) {
    console.error(
      "API error response:",
      JSON.stringify(result, null, 2)
    );

    throw new Error(
      result?.msg ??
      result?.message ??
      `HTTP ${response.status}`
    );
  }

  if (result?.status !== true || !result.data) {
    throw new Error(
      result?.msg ??
      result?.message ??
      "Order creation failed."
    );
  }

  console.log("\nOrder created successfully.");
  console.log("Order ID:", result.data.orderid);
  console.log("Provider transaction ID:", result.data.txn_id);
  console.log("Payment link:", result.data.payment_link);

  return {
    order: result.data,
    clientTxnId,
  };
}

// =====================================================
// VALIDATE AMOUNT AND UPI INTENT
// =====================================================

export function validateAmount(
  order: PaymentOrder,
  requestedPaise: number
): string {
  const intent = order.upiintent;

  if (!intent || !intent.startsWith("upi://pay?")) {
    throw new Error(
      "No valid generic UPI Intent URI was returned."
    );
  }

  const parsedUrl = new URL(intent);
  const intentAmount = parsedUrl.searchParams.get("am");

  if (!intentAmount) {
    throw new Error(
      "UPI Intent URI does not contain an amount."
    );
  }

  const intentPaise = toPaise(intentAmount);

  console.log("\n========== AMOUNT CHECK ==========");
  console.log(
    "Requested amount: INR",
    (requestedPaise / 100).toFixed(2)
  );
  console.log("API amount:", order.amount ?? "Not returned");
  console.log(
    "Convenience fee:",
    order.convenience_fee ?? "Not returned"
  );
  console.log("API total:", order.total ?? "Not returned");
  console.log("UPI Intent amount:", intentAmount);
  console.log("==================================");

  if (order.total !== undefined) {
    const totalPaise = toPaise(order.total);

    if (totalPaise !== requestedPaise) {
      throw new Error(
        `Amount mismatch: requested INR ${(requestedPaise / 100).toFixed(2)}, ` +
        `but provider total is INR ${(totalPaise / 100).toFixed(2)}. ` +
        "QR generation stopped."
      );
    }
  }

  if (intentPaise !== requestedPaise) {
    throw new Error(
      `Amount mismatch: requested INR ${(requestedPaise / 100).toFixed(2)}, ` +
      `but UPI Intent contains INR ${(intentPaise / 100).toFixed(2)}. ` +
      "QR generation stopped."
    );
  }

  console.log("Amount validation passed.");

  return intent;
}

// =====================================================
// GENERATE QR IMAGE
// =====================================================

export async function generateQr(upiUri: string, outputPath: string = OUTPUT_FILE): Promise<string> {
  await QRCode.toFile(outputPath, upiUri, {
    type: "png",
    errorCorrectionLevel: "M",
    width: 600,
    margin: 4,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  console.log("\nQR code generated successfully.");
  console.log("Saved to:", outputPath);

  // Open the QR image on Windows if executed directly.
  if (process.platform === "win32" && process.env.NODE_ENV !== "test") {
    try {
      exec(`start "" "${outputPath}"`);
    } catch {}
  }

  return outputPath;
}

// =====================================================
// MAIN (CLI ENTRYPOINT)
// =====================================================

async function main(): Promise<void> {
  if (!API_KEY) {
    throw new Error(
      "Missing UPIEXPRESS_API_KEY. Configure it in .env."
    );
  }

  if (!WEBHOOK_URL) {
    console.warn(
      "Warning: UPIEXPRESS_WEBHOOK_URL is not configured."
    );
  }

  // Support command-line argument: e.g. npx tsx test.ts 2
  const argAmount = process.argv[2];
  let input = argAmount?.trim();

  if (!input) {
    input = await new Promise<string>((resolve) => {
      process.stdout.write("Enter payment amount in INR: ");
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (data) => resolve(data.trim()));
    });
  }

  if (!/^\d+(\.\d{1,2})?$/.test(input)) {
    throw new Error(
      "Enter a valid amount, e.g. 2 or 10.50."
    );
  }

  const requestedPaise = toPaise(input);

  if (requestedPaise <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  const { order, clientTxnId } =
    await createOrder(requestedPaise);

  const upiUri = validateAmount(order, requestedPaise);

  await generateQr(upiUri);

  console.log("\n========== PAYMENT DETAILS ==========");
  console.log("Client transaction ID:", clientTxnId);
  console.log("Order ID:", order.orderid);
  console.log(
    "Amount: INR",
    (requestedPaise / 100).toFixed(2)
  );
  console.log("Webhook:", WEBHOOK_URL || "Not configured");
  console.log("QR file:", OUTPUT_FILE);
  console.log("=====================================");
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('test.ts')) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error("\nERROR:", message);
    process.exitCode = 1;
  });
}
