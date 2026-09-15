import { TaskSchema, ProjectSchema, CostSchema } from './schemas';

/**
 * Validates data based on the Firestore collection path.
 * If the data fails Zod validation, it throws an Error.
 * @param docPath Full path to the document, e.g. "artifacts/APP_ID/public/data/taka_tasks/123"
 * @param data Data being saved
 * @param isUpdate If true, ignores required fields that might be missing in partial updates.
 */
export function validateFirestoreData(docPath: string, data: any, isUpdate = false) {
  try {
    if (docPath.includes('/taka_tasks/')) {
      isUpdate ? TaskSchema.partial().parse(data) : TaskSchema.parse(data);
    } else if (docPath.includes('/taka_projects/')) {
      isUpdate ? ProjectSchema.partial().parse(data) : ProjectSchema.parse(data);
    } else if (docPath.includes('/taka_costs/')) {
      isUpdate ? CostSchema.partial().parse(data) : CostSchema.parse(data);
    }
  } catch (err: any) {
    console.error(`Validation failed for path ${docPath}`, err);
    throw new Error(`Zod Runtime Validation Error: ${err.message || JSON.stringify(err)}`);
  }
}
