import { S3Event } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import {
  bufferFromStream,
  initializeFirestore,
  initializeGCPvision,
} from "../utils/utilFuncs";
import { parseReceiptText } from "../utils/parseReceiptText";

const s3 = new S3Client({ region: "us-east-1" });
const BUCKET_NAME = "your-s3-bucket-name"; // replace this

export const handler = async (event: S3Event) => {
  try {
    const record = event.Records[0];
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const bucket = record.s3.bucket.name;

    console.log(`🔔 Lambda triggered by: ${key}`);

    // Ignore non-manifest uploads
    if (!key.endsWith("manifest.json")) {
      console.log("❌ Not a manifest file. Skipping...");
      return { statusCode: 200, body: "Not a manifest file. Ignored." };
    }

    // 1. Download the manifest.json
    const manifestResponse = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );

    if (
      !manifestResponse.Body ||
      !(manifestResponse.Body instanceof Readable)
    ) {
      throw new Error("Failed to read manifest file stream");
    }

    const manifestBuffer = await bufferFromStream(manifestResponse.Body);
    const manifestText = manifestBuffer.toString("utf-8");
    const manifest = JSON.parse(manifestText) as {
      receiptId: string;
      imageKeys: string[];
    };

    const { receiptId, imageKeys } = manifest;

    console.log(`📦 Manifest for receiptId: ${receiptId}`);
    console.log(`🖼️ Images to process:`, imageKeys);

    // 2. Init clients
    const firestore = await initializeFirestore();
    const visionClient = await initializeGCPvision();

    let combinedText = "";

    for (const imageKey of imageKeys) {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: imageKey });
      const response = await s3.send(cmd);

      if (!response.Body || !(response.Body instanceof Readable)) {
        console.warn(`⚠️ Skipping invalid image file: ${imageKey}`);
        continue;
      }

      const imageBuffer = await bufferFromStream(response.Body);

      const [visionResult] = await visionClient.textDetection({
        image: { content: imageBuffer },
      });

      const text = visionResult.fullTextAnnotation?.text ?? "";
      console.log(`✅ OCR text from ${imageKey} length:`, text.length);

      combinedText += `\n${text}`;
    }

    if (!combinedText.trim()) {
      throw new Error("❌ No OCR text extracted from any image.");
    }

    // 3. Parse the combined receipt text
    const parsed = await parseReceiptText(combinedText, receiptId);

    // 4. Save parsed result to Firestore
    await firestore
      .collection("receiptTransactions")
      .doc(receiptId)
      .set({
        ...parsed,
        receiptId,
        createdAt: new Date().toISOString(),
        imageUrls: imageKeys.map(
          (key) => `https://${bucket}.s3.amazonaws.com/${key}`
        ),
      });

    console.log("🎉 Receipt parsed and saved:", receiptId);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Receipt processed", receiptId }),
    };
  } catch (error) {
    console.error("❌ Error processing manifest-based receipt:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process receipt",
        detail: (error as Error).message,
      }),
    };
  }
};
