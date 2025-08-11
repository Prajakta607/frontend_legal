import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

// Extract text from entire PDF
export async function extractTextFromPDF(pdfFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function() {
      try {
        const arrayBuffer = this.result;
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        
        let fullText = '';
        const pages = [];
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          // Extract text items and join them
          const pageText = textContent.items
            .map(item => item.str)
            .join(' ')
            .replace(/\s+/g, ' ') // Clean up extra whitespace
            .trim();
          
          pages.push({
            pageNumber: pageNum,
            text: pageText
          });
          
          fullText += pageText + '\n\n';
        }
        
        resolve({
          fullText: fullText.trim(),
          pages: pages,
          totalPages: pdf.numPages
        });
        
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(pdfFile);
  });
}

// Extract text from specific page
export async function extractTextFromPage(pdfFile, pageNumber) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function() {
      try {
        const arrayBuffer = this.result;
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        
        if (pageNumber > pdf.numPages || pageNumber < 1) {
          throw new Error(`Page ${pageNumber} does not exist. PDF has ${pdf.numPages} pages.`);
        }
        
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        resolve({
          pageNumber: pageNumber,
          text: pageText,
          totalPages: pdf.numPages
        });
        
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(pdfFile);
  });
}

// Extract text with position information (useful for highlighting)
export async function extractTextWithPositions(pdfFile, pageNumber) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function() {
      try {
        const arrayBuffer = this.result;
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        
        const textItems = textContent.items.map(item => ({
          text: item.str,
          x: item.transform[4],
          y: viewport.height - item.transform[5], // Convert to top-left origin
          width: item.width,
          height: item.height,
          fontName: item.fontName,
          fontSize: Math.round(item.transform[0])
        }));
        
        resolve({
          pageNumber: pageNumber,
          textItems: textItems,
          fullText: textItems.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim()
        });
        
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read PDF file'));
    reader.readAsArrayBuffer(pdfFile);
  });
}

// Usage examples:

// Example 1: Extract all text
async function handleFileUpload(file) {
  try {
    const result = await extractTextFromPDF(file);
    console.log('Full text:', result.fullText);
    console.log('Pages:', result.pages);
  } catch (error) {
    console.error('Error extracting text:', error);
  }
}

// Example 2: Extract from specific page
async function getPageText(file, pageNum) {
  try {
    const result = await extractTextFromPage(file, pageNum);
    console.log(`Page ${pageNum} text:`, result.text);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Example 3: Search for text in PDF
export async function searchTextInPDF(pdfFile, searchTerm) {
  try {
    const result = await extractTextFromPDF(pdfFile);
    const matches = [];
    
    result.pages.forEach(page => {
      const regex = new RegExp(searchTerm, 'gi');
      let match;
      
      while ((match = regex.exec(page.text)) !== null) {
        matches.push({
          pageNumber: page.pageNumber,
          text: match[0],
          index: match.index,
          context: page.text.substring(
            Math.max(0, match.index - 50),
            Math.min(page.text.length, match.index + match[0].length + 50)
          )
        });
      }
    });
    
    return matches;
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}