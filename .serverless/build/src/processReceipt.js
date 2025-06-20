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
var bedrock = new import_client_bedrock_runtime.BedrockRuntimeClient({ region: "us-east-1" });
async function parseReceiptText(fullText, key) {
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
    if (!parsed.merchant || typeof parsed.total !== "number") {
      throw new Error("Invalid parsed receipt data structure");
    }
    console.log("Successfully parsed receipt:", parsed);
    return parsed;
  } catch (error) {
    console.error("Error parsing receipt text:", error);
    const fallback = {
      merchant: "Unknown",
      date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      total: 0,
      items: [],
      tax: 0,
      category: "unknown",
      rawText: fullText,
      parseError: error.message
    };
    return fallback;
  }
}
__name(parseReceiptText, "parseReceiptText");

// src/processReceipt.ts
var s3 = new import_client_s3.S3Client({ region: "us-east-1" });
var handler = /* @__PURE__ */ __name(async (event) => {
  console.log("Lambda started, initializing services...");
  try {
    const firestore = await initializeFirestore();
    const visionClient = await initializeGCPvision();
    console.log("Firestore and Vision clients initialized successfully");
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      console.log(`Processing file: ${key} from bucket: ${bucket}`);
      const cmd = new import_client_s3.GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await s3.send(cmd);
      if (!response.Body || !(response.Body instanceof import_stream.Readable)) {
        console.error("Missing or invalid response.Body for key:", key);
        continue;
      }
      console.log("Retrieved object from S3");
      const imageBuffer = await bufferFromStream(response.Body);
      console.log("Calling Vision API for text detection...");
      const [visionResult] = await visionClient.textDetection({
        image: { content: imageBuffer }
      });
      console.log("Vision API response received");
      const fullText = visionResult.fullTextAnnotation?.text;
      if (!fullText?.trim()) {
        console.warn(`No OCR text found for ${key}`);
        continue;
      }
      try {
        console.log("Parsing receipt text...");
        const parsed = await parseReceiptText(fullText, key);
        const receiptId = key.split("/")[1]?.split("_")[0];
        await firestore.collection("receiptTransactions").doc(receiptId).set({
          ...parsed,
          imageUrl: `https://${bucket}.s3.amazonaws.com/${key}`,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          receiptId
        });
        console.log("\u2705 Receipt parsed and stored with ID:", receiptId, parsed);
      } catch (err) {
        console.error("\u274C Failed to parse or store receipt:", err);
        console.error("Error details:", err.stack);
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Processing completed" })
    };
  } catch (error) {
    console.error("\u274C Lambda execution error:", error);
    console.error("Error stack:", error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
}, "handler");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=processReceipt.js.map
