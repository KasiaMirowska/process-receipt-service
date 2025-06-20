import { SecretsManagerClient, GetSecretValueCommand, } from "@aws-sdk/client-secrets-manager";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Firestore } from "@google-cloud/firestore";
//Node.js streams emit chunks of data.
// bufferFromStream listens to those chunks and assembles them into a complete Buffer.
export async function bufferFromStream(stream) {
    const chunks = [];
    for await (const chunk of stream)
        chunks.push(chunk);
    return Buffer.concat(chunks);
}
const secretsClient = new SecretsManagerClient();
export const extractSecret = async (secretId) => {
    console.log("RESPONSE before SECRET CLIENT", secretId);
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await secretsClient.send(command);
    console.log("RESPONSE FROM SECRET CLIENT", response);
    if (!response.SecretString) {
        throw new Error("Secret not found");
    }
    // ✅ parse raw service account JSON directly
    const keyJson = response.SecretString;
    let keyObject;
    try {
        keyObject = JSON.parse(keyJson);
    }
    catch (e) {
        console.error("Invalid JSON in secret:", e);
        throw new Error("Failed to parse service account JSON");
    }
    console.log("Retrieved secret:", keyObject.project_id);
    const projectId = keyObject.project_id;
    const keyPath = join(tmpdir(), `${secretId}.json`);
    writeFileSync(keyPath, keyJson);
    return { keyJson, keyPath, projectId };
};
export const initializeFirestore = async () => {
    try {
        const { projectId, keyPath: keyFilename } = await extractSecret("firestore-key");
        return new Firestore({
            projectId,
            keyFilename,
        });
    }
    catch (e) {
        console.error("❌ Error initializing Firestore or retrieving secret:", e);
        throw new Error("Failed to initialize Firestore");
    }
};
