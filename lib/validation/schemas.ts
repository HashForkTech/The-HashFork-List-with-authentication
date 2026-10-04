import { z } from 'zod';
import { LIMITS, normalizeUrl } from '@/lib/validation/url';

export { LIMITS, normalizeUrl } from '@/lib/validation/url';

/**
 * All user input is validated server-side with Zod — the client-side checks in
 * the admin UI are only a convenience layer and are never trusted.
 */

const emptyToNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Maximum ${max} characters.`).nullish());

const optionalUrlField = () =>
  z
    .preprocess(emptyToNull, z.string().trim().max(LIMITS.url, 'URL too long.').nullish())
    .superRefine((value, ctx) => {
      if (value == null) return;
      if (!normalizeUrl(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid URL (e.g. https://example.com).',
        });
      }
    });

/** Star notation: an integer from 0 to 5 (0 = not rated). */
const ratingField = () =>
  z.preprocess(
    emptyToNull,
    z
      .number()
      .int('Rating must be a whole number of stars.')
      .min(0, 'Rating must be between 0 and 5 stars.')
      .max(5, 'Rating must be between 0 and 5 stars.')
      .nullish(),
  );

/** "Tested" flag: a boolean (null = not provided = false). */
const testedField = () => z.preprocess(emptyToNull, z.boolean().nullish());

/** ISO timestamp fields (e.g. the date of a "Tested" check in backups). */
const optionalTimestamp = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(40)
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Invalid date (ISO format expected).',
    })
    .nullish(),
);

export const itemInputSchema = z.object({
  categoryId: z.preprocess(emptyToNull, z.string().trim().min(1).max(LIMITS.id).nullish()),
  name: optionalText(LIMITS.name),
  description: optionalText(LIMITS.description),
  githubUrl: optionalUrlField(),
  websiteUrl: optionalUrlField(),
  huggingFaceUrl: optionalUrlField(),
  youtubeUrl: optionalUrlField(),
  tested: testedField(),
  testedAt: optionalTimestamp,
  rating: ratingField(),
  comment: optionalText(LIMITS.comment),
});

export type ItemInput = z.infer<typeof itemInputSchema>;

export const categoryInputSchema = z.object({
  name: z
    .string({ required_error: 'This field is required.' })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, 'This field is required.')
        .max(LIMITS.category, `Maximum ${LIMITS.category} characters.`),
    ),
});

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

/** Site settings (main page title, …). Every value is trimmed. */
export const settingsInputSchema = z.object({
  siteTitle: z
    .string({ required_error: 'This field is required.' })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, 'This field is required.')
        .max(LIMITS.siteTitle, `Maximum ${LIMITS.siteTitle} characters.`),
    ),
});

export type SettingsInput = z.infer<typeof settingsInputSchema>;

/* -------------------------------------------------------------------------- */
/*                                 Backups                                    */
/* -------------------------------------------------------------------------- */

export const backupCategorySchema = z.object({
  id: z.string().trim().min(1).max(LIMITS.id).nullish(),
  name: z
    .string({ required_error: 'Every category must have a name.' })
    .transform((value) => value.trim())
    .pipe(z.string().min(1, 'Every category must have a name.').max(LIMITS.category)),
  createdAt: optionalTimestamp,
});

export const backupItemSchema = z.object({
  id: z.string().trim().min(1).max(LIMITS.id).nullish(),
  categoryId: z.string().trim().min(1).max(LIMITS.id).nullish(),
  name: optionalText(LIMITS.name),
  description: optionalText(LIMITS.description),
  githubUrl: optionalUrlField(),
  websiteUrl: optionalUrlField(),
  huggingFaceUrl: optionalUrlField(),
  youtubeUrl: optionalUrlField(),
  tested: testedField(),
  testedAt: optionalTimestamp,
  rating: ratingField(),
  comment: optionalText(LIMITS.comment),
  createdAt: optionalTimestamp,
  updatedAt: optionalTimestamp,
});

export const backupPayloadSchema = z.object({
  categories: z
    .array(backupCategorySchema)
    .max(LIMITS.backupCategories, 'Too many categories in the file.'),
  items: z.array(backupItemSchema).max(LIMITS.backupItems, 'Too many resources in the file.'),
});

export type BackupCategoryInput = z.infer<typeof backupCategorySchema>;
export type BackupItemInput = z.infer<typeof backupItemSchema>;
export type BackupPayloadInput = z.infer<typeof backupPayloadSchema>;

export const importRequestSchema = z.object({
  mode: z.enum(['merge', 'replace'], {
    errorMap: () => ({ message: 'Invalid import mode ("merge" or "replace").' }),
  }),
  confirm: z.boolean().nullish(),
  data: backupPayloadSchema,
});

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  categoryId: 'Category',
  githubUrl: 'GitHub link',
  websiteUrl: 'Website',
  huggingFaceUrl: 'Hugging Face link',
  youtubeUrl: 'YouTube link',
  tested: 'Tested',
  testedAt: 'Tested at',
  rating: 'Rating',
  comment: 'Comment',
  siteTitle: 'Page title',
  createdAt: 'Created at',
  updatedAt: 'Updated at',
};

/** Turns a ZodError into a flat list of user-facing English messages. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const segments = issue.path.map(String);
    const leaf = segments[segments.length - 1] ?? '';
    const label = FIELD_LABELS[leaf] ?? (/^\d*$/.test(leaf) ? '' : leaf);
    return label ? `${label}: ${issue.message}` : issue.message;
  });
}
