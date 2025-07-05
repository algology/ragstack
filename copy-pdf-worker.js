const fs = require('fs');
const path = require('path');

// Copy PDF.js worker to public directory
const workerSrc = path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const workerDest = path.join(__dirname, 'public/pdf.worker.min.mjs');

try {
  if (fs.existsSync(workerSrc)) {
    fs.copyFileSync(workerSrc, workerDest);
    console.log('PDF.js worker copied to public directory');
  } else {
    console.warn('PDF.js worker not found in node_modules');
  }
} catch (error) {
  console.error('Error copying PDF.js worker:', error);
} 