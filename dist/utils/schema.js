import { z } from "zod";
export const LineItemSchema = z.object({
    name: z.string(),
    amount: z.number(),
});
export const ReceiptTransactionSchema = z.object({
    merchant: z.string(),
    amount: z.number(),
    date: z.string(),
    source: z.literal("receipt"),
    lineItems: z.array(LineItemSchema),
});
