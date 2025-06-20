import { parseReceiptWithClaude } from "./bedrockReceiptParser";
import { parseRawText } from "./textParser";
import crypto from "crypto";
// Simple in-memory cache (replace with Firestore or Redis for prod)
const receiptCache = new Map();
/**
 * Parses receipt OCR using LLM with a fallback to NLP.
 * @param ocrText Full OCR text from Google Vision or similar
 * @param cacheKey Optional: unique key (e.g. file path or hash)
 */
export async function parseReceiptText(ocrText, cacheKey) {
    const key = cacheKey || crypto.createHash("sha256").update(ocrText).digest("hex");
    if (receiptCache.has(key)) {
        const value = receiptCache.get(key);
        if (value !== undefined) {
            return value;
        }
    }
    let result;
    try {
        // 🧠 2. Try LLM
        result = await parseReceiptWithClaude(ocrText);
        console.log("RESULT FROM CLUADE", result);
    }
    catch (e) {
        console.warn("LLM parsing failed, falling back to NLP:", e);
        result = await parseRawText(ocrText);
    }
    // 💾 3. Cache result
    receiptCache.set(key, result);
    return result;
}
