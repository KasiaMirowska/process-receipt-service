import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });

interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

interface ParsedReceipt {
  merchant: string;
  date: string;
  total: number;
  items: ReceiptItem[];
  tax: number;
  category: string;
  rawText?: string;
  parseError?: string;
}

interface BedrockResponse {
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
Parse this receipt text and extract the following information in JSON format:
- merchant: string (store name)
- date: string (transaction date in YYYY-MM-DD format)
- total: number (total amount)
- items: array of objects with {name: string, price: number, quantity: number}
- tax: number (tax amount if available)
- category: string (infer category like "groceries", "restaurant", "gas", etc.)

Receipt text:
${fullText}

Return only valid JSON, no additional text.
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

    // Validate the parsed data
    if (!parsed.merchant || typeof parsed.total !== "number") {
      throw new Error("Invalid parsed receipt data structure");
    }

    console.log("Successfully parsed receipt:", parsed);
    return parsed;
  } catch (error) {
    console.error("Error parsing receipt text:", error);

    // Fallback parsing if AI fails
    const fallback: ParsedReceipt = {
      merchant: "Unknown",
      date: new Date().toISOString().split("T")[0],
      total: 0,
      items: [],
      tax: 0,
      category: "unknown",
      rawText: fullText,
      parseError: (error as Error).message,
    };

    return fallback;
  }
}
