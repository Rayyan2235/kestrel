/** Aurora DSQL commits optimistically: a conflicting transaction fails with 40001 and is safe to retry. */
export async function retrying<T>(run: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (error) {
      if ((error as { code?: string }).code !== "40001" || i >= tries) throw error;
    }
  }
}
