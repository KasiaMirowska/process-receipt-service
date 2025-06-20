import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { bufferFromStream, initializeFirestore } from "../utils/utilFuncs";
import { parseReceiptText } from "../utils/parseReceiptText";
const s3 = new S3Client({ region: "us-east-1" });
export const handler = async (event) => {
    console.log("in lambda before firestore and vision initiated");
    const firestore = await initializeFirestore();
    const visionClient = new ImageAnnotatorClient();
    console.log("in lambda after firestore and vision initiated");
    for (const record of event.Records) {
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
        const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
        const response = await s3.send(cmd);
        if (!response.Body || !(response.Body instanceof Readable)) {
            console.error("Missing or invalid response.Body for key:", key);
            continue;
        }
        console.log("got to s3");
        const imageBuffer = await bufferFromStream(response.Body);
        const [visionResult] = await visionClient.textDetection({
            image: { content: imageBuffer },
        });
        console.log("IMAGE VBUTTER visionResult", visionResult);
        const fullText = visionResult.fullTextAnnotation?.text;
        if (!fullText?.trim()) {
            console.warn(`No OCR text found for ${key}`);
            continue;
        }
        try {
            const parsed = await parseReceiptText(fullText, key);
            await firestore.collection("receiptTransactions").add({
                ...parsed,
                imageUrl: `https://${bucket}.s3.amazonaws.com/${key}`,
                createdAt: new Date().toISOString(),
                receiptId: key.split("/")[1]?.split("_")[0], // timestamp from file name
            });
            console.log("✅ Receipt parsed and stored:", parsed);
        }
        catch (err) {
            console.error("❌ Failed to parse or store receipt:", err);
        }
    }
    return { statusCode: 200 };
};
