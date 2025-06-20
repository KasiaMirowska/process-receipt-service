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

export const handler = async (event: S3Event) => {
  console.log("Lambda started, initializing services...");

  try {
    const firestore = await initializeFirestore();
    const visionClient = await initializeGCPvision();
    console.log("Firestore and Vision clients initialized successfully");

    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

      console.log(`Processing file: ${key} from bucket: ${bucket}`);

      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await s3.send(cmd);

      if (!response.Body || !(response.Body instanceof Readable)) {
        console.error("Missing or invalid response.Body for key:", key);
        continue;
      }

      console.log("Retrieved object from S3");
      const imageBuffer = await bufferFromStream(response.Body);

      console.log("Calling Vision API for text detection...");
      const [visionResult] = await visionClient.textDetection({
        image: { content: imageBuffer },
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

        const receiptId = key.split("/")[1]?.split("_")[0]; // timestamp from file name

        // Use .doc(receiptId).set() instead of .add()
        await firestore
          .collection("receiptTransactions")
          .doc(receiptId)
          .set({
            ...parsed,
            imageUrl: `https://${bucket}.s3.amazonaws.com/${key}`,
            createdAt: new Date().toISOString(),
            receiptId: receiptId,
          });

        console.log("✅ Receipt parsed and stored with ID:", receiptId, parsed);
      } catch (err) {
        console.error("❌ Failed to parse or store receipt:", err);
        console.error("Error details:", (err as Error).stack);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Processing completed" }),
    };
  } catch (error) {
    console.error("❌ Lambda execution error:", error);
    console.error("Error stack:", (error as Error).stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
