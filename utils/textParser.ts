import type { ParsedReceipt, ReceiptItem } from "./parseReceiptText";

export function parseRawText(rawText: string): ParsedReceipt {
  try {
    const lines = rawText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    console.log("💬 Raw lines to be parsed:", lines);

    // ✅ Merchant detection (known keywords)
    const merchantIndex = lines.findIndex((line) =>
      /target|walmart|costco|whole\s?foods|aldi|trader joe's/i.test(line)
    );
    const merchant = merchantIndex !== -1 ? lines[merchantIndex] : "Unknown";

    // ✅ Date detection
    const dateRegex = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](\d{2,4}))\b/;
    const dateIndex = lines.findIndex((line) => dateRegex.test(line));
    const dateMatch =
      dateIndex !== -1 ? lines[dateIndex].match(dateRegex) : null;
    const date = dateMatch?.[0] || new Date().toISOString();

    // ✅ Address = lines between merchant and date
    let address = "";
    if (merchantIndex !== -1 && dateIndex !== -1 && merchantIndex < dateIndex) {
      const addressLines = lines
        .slice(merchantIndex + 1, dateIndex)
        .filter(
          (line) =>
            !dateRegex.test(line) &&
            !/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(line)
        );
      address = addressLines.join(", ");
    }

    // ✅ Total detection (same or next line)
    const totalKeywords = ["total", "amount due", "balance due"];
    let total = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      if (totalKeywords.some((keyword) => line.includes(keyword))) {
        const currentMatch = lines[i].match(/\d+[\.,]?\d{0,2}/);
        const nextMatch = lines[i + 1]?.match(/\d+[\.,]?\d{0,2}/);
        if (currentMatch) {
          total = parseFloat(currentMatch[0].replace(",", "."));
          break;
        } else if (nextMatch) {
          total = parseFloat(nextMatch[0].replace(",", "."));
          break;
        }
      }
    }

    // ✅ Tax detection
    let tax = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/tax/i.test(lines[i])) {
        const currentMatch = lines[i].match(/\d+[\.,]?\d{0,2}/);
        const nextMatch = lines[i + 1]?.match(/\d+[\.,]?\d{0,2}/);
        if (currentMatch) {
          tax = parseFloat(currentMatch[0].replace(",", "."));
          break;
        } else if (nextMatch) {
          tax = parseFloat(nextMatch[0].replace(",", "."));
          break;
        }
      }
    }

    // ✅ Item parsing after the date
    const priceRegex = /\$?\d+[\.,]?\d{0,2}/;
    const skipKeywords = /total|tax|change|subtotal/i;
    const linesAfterDate =
      dateIndex !== -1 ? lines.slice(dateIndex + 1) : lines;
    const items: ReceiptItem[] = [];

    let skipNextLine = false;
    for (const line of linesAfterDate) {
      const lowerLine = line.toLowerCase();

      if (skipNextLine) {
        skipNextLine = false;
        continue;
      }

      if (skipKeywords.test(lowerLine)) {
        skipNextLine = true;
        continue;
      }

      if (
        priceRegex.test(line) &&
        !/^\d{3,}$/.test(line.trim()) && // skip zip codes like 02111
        !/\d{5}(-\d{4})?/.test(line) // skip zip+4 formats
      ) {
        const priceMatch = line.match(priceRegex);
        if (priceMatch) {
          const match = priceMatch[0];
          const price = parseFloat(match.replace("$", "").replace(",", "."));
          const name = line.replace(priceRegex, "").trim();

          items.push({
            name: name || "Unnamed Item",
            price,
            quantity: 1,
          });
        }
      }
    }

    // ✅ Basic category
    const groceryKeywords = [
      "market",
      "grocery",
      "food",
      "store",
      "target",
      "walmart",
      "costco",
    ];
    const category = groceryKeywords.some((word) =>
      rawText.toLowerCase().includes(word)
    )
      ? "groceries"
      : "Uncategorized";

    const result: ParsedReceipt = {
      merchant,
      address,
      date,
      total,
      items,
      tax,
      category,
    };

    console.log("🧾 Final parsed result:", result);
    return result;
  } catch (err: any) {
    return {
      merchant: "Unknown",
      address: "",
      date: new Date().toISOString(),
      total: 0,
      items: [],
      tax: 0,
      category: "Uncategorized",
      rawText,
      parseError: err.message || "Unknown parsing error",
    };
  }
}
