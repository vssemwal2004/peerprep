import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.join(__dirname, '..', 'public', 'images');

async function compressImages() {
  // Compress logo.png -> logo.png (optimized PNG, max 200px width for logo)
  const logoPath = path.join(imagesDir, 'logo.png');
  if (fs.existsSync(logoPath)) {
    const originalSize = fs.statSync(logoPath).size;
    
    // First create an optimized version
    const optimizedLogo = await sharp(logoPath)
      .resize(400, null, { withoutEnlargement: true })
      .png({ quality: 80, compressionLevel: 9, effort: 10 })
      .toBuffer();
    
    // Backup original
    fs.copyFileSync(logoPath, path.join(imagesDir, 'logo.original.png'));
    
    // Write optimized
    fs.writeFileSync(logoPath, optimizedLogo);
    
    const newSize = fs.statSync(logoPath).size;
    console.log(`logo.png: ${(originalSize/1024).toFixed(1)}KB -> ${(newSize/1024).toFixed(1)}KB (${((1-newSize/originalSize)*100).toFixed(1)}% smaller)`);
  }

  // Compress loginimg.webp -> loginimg.webp (optimized, max 1920px width)
  const loginPath = path.join(imagesDir, 'loginimg.webp');
  if (fs.existsSync(loginPath)) {
    const originalSize = fs.statSync(loginPath).size;
    
    const optimizedLogin = await sharp(loginPath)
      .resize(1920, null, { withoutEnlargement: true })
      .webp({ quality: 75, effort: 6 })
      .toBuffer();
    
    // Backup original
    fs.copyFileSync(loginPath, path.join(imagesDir, 'loginimg.original.webp'));
    
    // Write optimized
    fs.writeFileSync(loginPath, optimizedLogin);
    
    const newSize = fs.statSync(loginPath).size;
    console.log(`loginimg.webp: ${(originalSize/1024).toFixed(1)}KB -> ${(newSize/1024).toFixed(1)}KB (${((1-newSize/originalSize)*100).toFixed(1)}% smaller)`);
  }

  console.log('\nDone! Original images backed up with .original extension.');
}

compressImages().catch(console.error);
