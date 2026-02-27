export function validateCoworkApiKey(req: Request): boolean {
  const apiKey = req.headers.get('x-cowork-api-key')
  const validKey = process.env.COWORK_API_KEY
  if (!validKey) return false
  return apiKey === validKey
}
