import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { parseRawText } from "./textParser";
import { parseArgs } from "util";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

export interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

export interface ParsedReceipt {
  merchant: string;
  address?: string;
  date: string;
  total: number;
  items: ReceiptItem[];
  tax: number;
  category: string;
  parseError?: string;
  rawText?: string;
}

export interface BedrockResponse {
  content: Array<{
    text: string;
  }>;
}

export async function parseReceiptText(
  fullText: string,
  key: string
): Promise<ParsedReceipt> {
  try {
    console.log("Parsing receipt text with AWS Bedrock...");

    const prompt = `
You are a receipt-parsing assistant.

Your task is to extract structured data from unstructured receipt text.

Return a **valid JSON object** matching this schema:
{
  "merchant": string, // e.g. "Target", "Walmart", "Chipotle"
  "address": string,  // if available, full street address
  "date": string,     // format: YYYY-MM-DD
  "total": number,    // final total paid
  "tax": number,      // if present
  "items": [ { "name": string, "price": number, "quantity": number } ],
  "category": string  // one of: groceries, restaurant, gas, clothing, household, electronics, other
}

### Instructions:
- The **merchant** is usually in the header — the first branded line (e.g., "Target", "Trader Joe's", "Shell").
  - If unclear, guess based on context.
  - Do NOT return "Unknown" — return the most likely name.
- Try to extract **address** if it follows the merchant line or is a street format.
- Ensure all numeric fields are numbers (not strings).
- If **items** are present, extract their names, prices, and quantity if visible.
- Guess a **category** based on items or merchant type.

### Receipt Text:
\`\`\`
${fullText}
\`\`\`

Return only the JSON object. No explanation or extra text.
`;

    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const response = await bedrock.send(command);

    if (!response.body) {
      throw new Error("No response body from Bedrock");
    }

    const responseBody: BedrockResponse = JSON.parse(
      new TextDecoder().decode(response.body)
    );

    // Extract the content from Claude's response
    const content = responseBody.content[0].text;

    // Parse the JSON response
    const parsed: ParsedReceipt = JSON.parse(content);
    console.log("PPPPPPP", parsed.merchant, parsed);
    // Validate the parsed data
    if (!parsed.merchant || typeof parsed.total !== "number") {
      throw new Error("Invalid parsed receipt data structure");
    }
    const firstLine = fullText.split("\n")[0];
    if (parsed.merchant === "Unknown" && /[A-Za-z]{3,}/.test(firstLine)) {
      parsed.merchant = firstLine.trim();
    }

    console.log("Successfully parsed receipt:", parsed);
    return parsed;
  } catch (error) {
    console.error("Error parsing receipt text:", error);

    // Fallback parsing if AI fails
    const fallback: ParsedReceipt = parseRawText(fullText);

    return fallback;
  }
}
