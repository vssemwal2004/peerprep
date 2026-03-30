import 'express-async-errors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Robust env loading so running from backend/ or backend/src works the same
// 1) Load from current working directory (if any .env there)
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 2) Load from backend/.env (one level up from src) if not already set
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });
// 3) Also load from backend/src/.env as a fallback (do not override)
dotenv.config({ path: path.join(__dirname, '.env'), override: false });
