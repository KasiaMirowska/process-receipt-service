"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/processReceipt.ts
var processReceipt_exports = {};
__export(processReceipt_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(processReceipt_exports);
var import_client_s3 = require("@aws-sdk/client-s3");
var import_stream = require("stream");

// utils/utilFuncs.ts
var import_firestore = require("@google-cloud/firestore");
var import_client_secrets_manager = require("@aws-sdk/client-secrets-manager");
var import_vision = require("@google-cloud/vision");
var secretsManager = new import_client_secrets_manager.SecretsManagerClient({ region: "us-east-1" });
var initializeGCPvision = /* @__PURE__ */ __name(async () => {
  try {
    console.log("Retrieving vision secret credentials from Secrets Manager...");
    const command = new import_client_secrets_manager.GetSecretValueCommand({
      SecretId: "gcp/service-account-key"
    });
    const response = await secretsManager.send(command);
    if (!response.SecretString) {
      throw new Error("No secret string found in Secrets Manager response");
    }
    const outerCredentials = JSON.parse(response.SecretString);
    const gcpKey = JSON.parse(outerCredentials.gcpKey);
    if (!gcpKey.client_email || !gcpKey.private_key) {
      throw new Error(
        "Invalid service account credentials: missing client_email or private_key"
      );
    }
    const visionClient = new import_vision.ImageAnnotatorClient({
      credentials: gcpKey
      // Pass the parsed gcpKey object
    });
    return visionClient;
  } catch (error) {
    console.error("Failed to initialize GCP vision:", error);
    throw error;
  }
}, "initializeGCPvision");
async function initializeFirestore() {
  try {
    console.log("Retrieving Firestore credentials from Secrets Manager...");
    const command = new import_client_secrets_manager.GetSecretValueCommand({
      SecretId: "firestore-key"
    });
    const response = await secretsManager.send(command);
    if (!response.SecretString) {
      throw new Error("No secret string found in Secrets Manager response");
    }
    console.log("BEFORE PARSING", response.SecretString);
    const outerCredentials = JSON.parse(response.SecretString);
    console.log("AFTER FIRST PARSING", outerCredentials);
    const gcpKey = JSON.parse(outerCredentials.gcpKey);
    console.log("AFTER SECOND PARSING", gcpKey);
    if (!gcpKey.client_email || !gcpKey.private_key || !gcpKey.project_id) {
      console.log(
        "Missing fields:",
        "client_email:",
        !!gcpKey.client_email,
        "private_key:",
        !!gcpKey.private_key,
        "project_id:",
        !!gcpKey.project_id
      );
      throw new Error("Invalid Firestore credentials: missing required fields");
    }
    const firestore = new import_firestore.Firestore({
      projectId: gcpKey.project_id,
      // Use the parsed gcpKey
      credentials: gcpKey
      // Pass the parsed gcpKey object
    });
    console.log("Firestore initialized successfully");
    return firestore;
  } catch (error) {
    console.error("Failed to initialize Firestore:", error);
    throw error;
  }
}
__name(initializeFirestore, "initializeFirestore");
async function bufferFromStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
__name(bufferFromStream, "bufferFromStream");

// utils/parseReceiptText.ts
var import_client_bedrock_runtime = require("@aws-sdk/client-bedrock-runtime");

// utils/textParser.ts
function parseRawText(rawText) {
  try {
    const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
    console.log("\u{1F4AC} Raw lines to be parsed:", lines);
    const merchantIndex = lines.findIndex(
      (line) => /target|walmart|costco|whole\s?foods|aldi|trader joe's/i.test(line)
    );
    const merchant = merchantIndex !== -1 ? lines[merchantIndex] : "Unknown";
    const dateRegex = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](\d{2,4}))\b/;
    const dateIndex = lines.findIndex((line) => dateRegex.test(line));
    const dateMatch = dateIndex !== -1 ? lines[dateIndex].match(dateRegex) : null;
    const date = dateMatch?.[0] || (/* @__PURE__ */ new Date()).toISOString();
    let address = "";
    if (merchantIndex !== -1 && dateIndex !== -1 && merchantIndex < dateIndex) {
      const addressLines = lines.slice(merchantIndex + 1, dateIndex).filter(
        (line) => !dateRegex.test(line) && !/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(line)
      );
      address = addressLines.join(", ");
    }
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
    const priceRegex = /\$?\d+[\.,]?\d{0,2}/;
    const skipKeywords = /total|tax|change|subtotal/i;
    const linesAfterDate = dateIndex !== -1 ? lines.slice(dateIndex + 1) : lines;
    const items = [];
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
      if (priceRegex.test(line) && !/^\d{3,}$/.test(line.trim()) && // skip zip codes like 02111
      !/\d{5}(-\d{4})?/.test(line)) {
        const priceMatch = line.match(priceRegex);
        if (priceMatch) {
          const match = priceMatch[0];
          const price = parseFloat(match.replace("$", "").replace(",", "."));
          const name = line.replace(priceRegex, "").trim();
          items.push({
            name: name || "Unnamed Item",
            price,
            quantity: 1
          });
        }
      }
    }
    const groceryKeywords = [
      "market",
      "grocery",
      "food",
      "store",
      "target",
      "walmart",
      "costco"
    ];
    const category = groceryKeywords.some(
      (word) => rawText.toLowerCase().includes(word)
    ) ? "groceries" : "Uncategorized";
    const result = {
      merchant,
      address,
      date,
      total,
      items,
      tax,
      category
    };
    console.log("\u{1F9FE} Final parsed result:", result);
    return result;
  } catch (err) {
    return {
      merchant: "Unknown",
      address: "",
      date: (/* @__PURE__ */ new Date()).toISOString(),
      total: 0,
      items: [],
      tax: 0,
      category: "Uncategorized",
      rawText,
      parseError: err.message || "Unknown parsing error"
    };
  }
}
__name(parseRawText, "parseRawText");

// utils/parseReceiptText.ts
var bedrock = new import_client_bedrock_runtime.BedrockRuntimeClient({ region: "us-east-1" });
async function parseReceiptText(fullText, key) {
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
- The **merchant** is usually in the header \u2014 the first branded line (e.g., "Target", "Trader Joe's", "Shell").
  - If unclear, guess based on context.
  - Do NOT return "Unknown" \u2014 return the most likely name.
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
    const command = new import_client_bedrock_runtime.InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1e3,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });
    const response = await bedrock.send(command);
    if (!response.body) {
      throw new Error("No response body from Bedrock");
    }
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    );
    const content = responseBody.content[0].text;
    const parsed = JSON.parse(content);
    console.log("PPPPPPP", parsed.merchant, parsed);
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
    const fallback = parseRawText(fullText);
    return fallback;
  }
}
__name(parseReceiptText, "parseReceiptText");

// src/processReceipt.ts
var s3 = new import_client_s3.S3Client({ region: "us-east-1" });
var handler = /* @__PURE__ */ __name(async (event) => {
  try {
    const record = event.Records[0];
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const bucket = record.s3.bucket.name;
    console.log(`\u{1F514} Lambda triggered by: ${key}`);
    if (!key.endsWith("manifest.json")) {
      console.log("\u274C Not a manifest file. Skipping...");
      return { statusCode: 200, body: "Not a manifest file. Ignored." };
    }
    const manifestResponse = await s3.send(
      new import_client_s3.GetObjectCommand({ Bucket: bucket, Key: key })
    );
    if (!manifestResponse.Body || !(manifestResponse.Body instanceof import_stream.Readable)) {
      throw new Error("Failed to read manifest file stream");
    }
    const manifestBuffer = await bufferFromStream(manifestResponse.Body);
    const manifestText = manifestBuffer.toString("utf-8");
    const manifest = JSON.parse(manifestText);
    const { receiptId, imageKeys } = manifest;
    console.log(`\u{1F4E6} Manifest for receiptId: ${receiptId}`);
    console.log(`\u{1F5BC}\uFE0F Images to process:`, imageKeys);
    const firestore = await initializeFirestore();
    const visionClient = await initializeGCPvision();
    let combinedText = "";
    for (const imageKey of imageKeys) {
      const cmd = new import_client_s3.GetObjectCommand({ Bucket: bucket, Key: imageKey });
      const response = await s3.send(cmd);
      if (!response.Body || !(response.Body instanceof import_stream.Readable)) {
        console.warn(`\u26A0\uFE0F Skipping invalid image file: ${imageKey}`);
        continue;
      }
      const imageBuffer = await bufferFromStream(response.Body);
      const [visionResult] = await visionClient.textDetection({
        image: { content: imageBuffer }
      });
      const text = visionResult.fullTextAnnotation?.text ?? "";
      console.log(`\u2705 OCR text from ${imageKey} length:`, text.length);
      combinedText += `
${text}`;
    }
    if (!combinedText.trim()) {
      throw new Error("\u274C No OCR text extracted from any image.");
    }
    const parsed = await parseReceiptText(combinedText, receiptId);
    await firestore.collection("receiptTransactions").doc(receiptId).set({
      ...parsed,
      receiptId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      imageUrls: imageKeys.map(
        (key2) => `https://${bucket}.s3.amazonaws.com/${key2}`
      )
    });
    console.log("\u{1F389} Receipt parsed and saved:", receiptId);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Receipt processed", receiptId })
    };
  } catch (error) {
    console.error("\u274C Error processing manifest-based receipt:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process receipt",
        detail: error.message
      })
    };
  }
}, "handler");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=processReceipt.js.map
