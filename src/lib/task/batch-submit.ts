export async function collectBatchSubmissions<T extends { id: string }, R>(
  items: T[], submit: (item: T) => Promise<R>,
) {
  const settled = await Promise.allSettled(items.map(submit))
  const accepted: R[] = []
  const rejected: Array<{ id: string; message: string }> = []
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') accepted.push(result.value)
    else rejected.push({ id: items[index].id, message: result.reason instanceof Error ? result.reason.message : String(result.reason) })
  })
  return { accepted, rejected, total: items.length }
}
