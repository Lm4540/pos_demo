const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\admin\\.gemini\\antigravity-ide\\brain\\8e535a6d-b9ea-4a88-9e8e-2e36f8947f55\\app_logo_1783618055718.png';
const publicDir = 'c:\\Users\\admin\\Desktop\\pos_demo\\public';
const imgDir = path.join(publicDir, 'img');

try {
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
    console.log('Created directory:', imgDir);
  }

  // Copy to favicon.ico
  const favPath = path.join(publicDir, 'favicon.ico');
  fs.copyFileSync(srcPath, favPath);
  console.log('Copied to:', favPath);

  // Copy to icon-192.png
  const icon192 = path.join(imgDir, 'icon-192.png');
  fs.copyFileSync(srcPath, icon192);
  console.log('Copied to:', icon192);

  // Copy to icon-512.png
  const icon512 = path.join(imgDir, 'icon-512.png');
  fs.copyFileSync(srcPath, icon512);
  console.log('Copied to:', icon512);

} catch (err) {
  console.error('Error during file copies:', err);
}
process.exit();
