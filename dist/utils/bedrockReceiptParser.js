import { BedrockRuntimeClient, InvokeModelCommand, } from "@aws-sdk/client-bedrock-runtime";
import { ReceiptTransactionSchema } from "./schema";
const client = new BedrockRuntimeClient({ region: "us-east-1" });
export async function parseReceiptWithClaude(ocrText) {
    const prompt = `
  You are a receipt parser. Given the OCR text below, extract:
  - merchant name
  - purchase date
  - total amount
  - list of line items (with name and price)
  
  Return this as JSON in the format:
  {
    "merchant": string,
    "amount": number,
    "date": string,
    "source": "receipt",
    "lineItems": [{ "name": string, "amount": number }]
  }
  
  Only return JSON. Do not include explanations.
  
  Receipt OCR:
  """
  ${ocrText}
  """
  `;
    const payload = {
        prompt,
        max_tokens_to_sample: 1024,
        temperature: 0.2,
        stop_sequences: [],
    };
    const command = new InvokeModelCommand({
        modelId: "anthropic.claude-3-sonnet-20240229",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload),
    });
    const response = await client.send(command);
    const jsonString = new TextDecoder().decode(response.body);
    // Claude returns a JSON string inside the "completion" field
    const parsedResponse = JSON.parse(jsonString);
    if (!parsedResponse.completion.trimStart().startsWith("{")) {
        throw new Error("Claude returned non-JSON output");
    }
    const extractedJSON = JSON.parse(parsedResponse.completion);
    const validatedTransaction = ReceiptTransactionSchema.parse({
        ...extractedJSON,
        source: "receipt",
    });
    return validatedTransaction;
}
