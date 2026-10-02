import { z } from "zod";

/**
 * Placeholder schema so the end-to-end type flow can be exercised.
 * The real Paper / StudyCard model will replace this during feature analysis.
 */
export const paperInputSchema = z.object({
  pmid: z.string().min(1),
  title: z.string().min(1),
  abstract: z.string().optional(),
});

export type PaperInput = z.infer<typeof paperInputSchema>;
