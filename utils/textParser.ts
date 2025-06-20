export interface LineItem {
  name: string;
  amount: number;
}

export interface ReceiptTransaction {
  merchant: string;
  amount: number;
  date: string;
  source: "receipt";
  lineItems: LineItem[];
}

export function parseRawText(rawText: string): ReceiptTransaction {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const merchant = lines[0] || "Unknown";

  // Date extraction
  const dateRegex = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](\d{2,4}))\b/;
  const dateLine = lines.find((line) => dateRegex.test(line));
  const dateMatch = dateLine?.match(dateRegex);
  const date = dateMatch?.[0] || new Date().toISOString();

  // Total extraction
  const totalKeywords = ["total", "amount due", "balance due"];
  let amount = 0;
  for (const line of lines) {
    if (totalKeywords.some((keyword) => line.toLowerCase().includes(keyword))) {
      const priceMatch = line.match(/\d+[\.,]?\d{0,2}/);
      if (priceMatch) {
        amount = parseFloat(priceMatch[0].replace(",", "."));
        break;
      }
    }
  }

  // Line items
  const priceRegex = /\$?\d+[\.,]?\d{0,2}/;
  const skipKeywords = /total|tax|change|subtotal/i;
  const lineItems: LineItem[] = [];

  for (const line of lines) {
    if (priceRegex.test(line) && !skipKeywords.test(line)) {
      const parts = line.split(/\s{2,}|\t+/); // tab or multi-space
      const last = parts[parts.length - 1];
      const name = parts.slice(0, parts.length - 1).join(" ");
      const priceMatch = last.match(priceRegex);
      if (priceMatch) {
        lineItems.push({
          name: name.trim(),
          amount: parseFloat(priceMatch[0].replace("$", "").replace(",", ".")),
        });
      }
    }
  }

  return {
    merchant,
    amount,
    date,
    source: "receipt",
    lineItems,
  };
}
