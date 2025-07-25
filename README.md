📑 receiptProcessor/
Lambda triggered by new file uploads to S3. It:

• Parses receipt images using Textract
• Uses Claude 3 via Bedrock to extract structured fields
• Stores a transaction in Firestore (using service account)

---

##DEPLOY:
```bash
cd receiptProcessor
npm install
sls deploy
```

---
 Workflow Summary: 

• User uploads receipt via client (drag & drop box).

• Client dispatches uploadReceiptImages():

• Calls generate-url-service for presigned S3 URL.

• Uploads the image + a manifest.json with metadata.

• S3 triggers receiptProcessor Lambda:

• Reads receipt image and manifest.json

• Parses it using Textract + Claude 3

• Writes the structured transaction to Firestore

• Client displays receipt preview and parsed data (with loading state)

---
👩‍💻 Author
Built by Kasia Mirowska – blending creative design sensibility with modern serverless architecture 💡
