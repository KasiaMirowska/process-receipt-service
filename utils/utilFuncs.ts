import { Firestore } from "@google-cloud/firestore";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { Readable } from "stream";
import { ImageAnnotatorClient } from "@google-cloud/vision";

const secretsManager = new SecretsManagerClient({ region: "us-east-1" });

export interface GcpKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface GCPCredentials {
  gcpKey: GcpKey;
}

export const initializeGCPvision = async () => {
  try {
    console.log("Retrieving vision secret credentials from Secrets Manager...");
    const command = new GetSecretValueCommand({
      SecretId: "gcp/service-account-key",
    });
    const response = await secretsManager.send(command);

    if (!response.SecretString) {
      throw new Error("No secret string found in Secrets Manager response");
    }

    const outerCredentials = JSON.parse(response.SecretString);

    // Parse the nested gcpKey string into an object
    const gcpKey: GcpKey = JSON.parse(outerCredentials.gcpKey);

    // Validate required fields
    if (!gcpKey.client_email || !gcpKey.private_key) {
      throw new Error(
        "Invalid service account credentials: missing client_email or private_key"
      );
    }

    const visionClient = new ImageAnnotatorClient({
      credentials: gcpKey, // Pass the parsed gcpKey object
    });
    return visionClient;
  } catch (error) {
    console.error("Failed to initialize GCP vision:", error);
    throw error;
  }
};

export async function initializeFirestore(): Promise<Firestore> {
  try {
    console.log("Retrieving Firestore credentials from Secrets Manager...");

    const command = new GetSecretValueCommand({
      SecretId: "firestore-key",
    });

    const response = await secretsManager.send(command);

    if (!response.SecretString) {
      throw new Error("No secret string found in Secrets Manager response");
    }

    console.log("BEFORE PARSING", response.SecretString);
    const outerCredentials = JSON.parse(response.SecretString);
    console.log("AFTER FIRST PARSING", outerCredentials);

    // Parse the nested gcpKey string into an object
    const gcpKey: GcpKey = JSON.parse(outerCredentials.gcpKey);
    console.log("AFTER SECOND PARSING", gcpKey);

    // Check the parsed gcpKey object
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

    const firestore = new Firestore({
      projectId: gcpKey.project_id, // Use the parsed gcpKey
      credentials: gcpKey, // Pass the parsed gcpKey object
    });

    console.log("Firestore initialized successfully");
    return firestore;
  } catch (error) {
    console.error("Failed to initialize Firestore:", error);
    throw error;
  }
}

export async function bufferFromStream(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
