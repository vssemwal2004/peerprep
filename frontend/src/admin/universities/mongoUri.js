export const MONGO_URI_HINT = 'Paste the full connection string starting with mongodb:// or mongodb+srv://. Do not include MONGODB_URI= or surrounding quotes.';

export function mongoUriProblem(value) {
  return /^mongodb(?:\+srv)?:\/\//.test(String(value || '').trim()) ? '' : MONGO_URI_HINT;
}
