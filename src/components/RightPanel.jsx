import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";

// Load PDF.js from CDN
let pdfjsLib = null;

// Initialize PDF.js when component mounts
const initPdfJs = async () => {
  if (typeof window !== 'undefined' && !pdfjsLib) {
    // Load PDF.js from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    
    return new Promise((resolve, reject) => {
      script.onload = () => {
        if (window.pdfjsLib) {
          pdfjsLib = window.pdfjsLib;
          // Set up PDF.js worker
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve();
        } else {
          reject(new Error('PDF.js failed to load'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load PDF.js script'));
      document.head.appendChild(script);
    });
  }
};

// Fallback icons if heroicons is not available
const ChevronLeftIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const DocumentTextIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const RightPanel = forwardRef(function RightPanel({ pdfFile, citedPagesMetadata = [], docId }, ref) {
  const [pdf, setPdf] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pageText, setPageText] = useState('');
  const [highlightedText, setHighlightedText] = useState('');
  const [pdfJsReady, setPdfJsReady] = useState(false);

  const containerRef = useRef();
  const textContainerRef = useRef();
  const pdfRef = useRef(null);

  // Cleanup function
  const cleanup = () => {
    if (pdfRef.current) {
      try {
        pdfRef.current.destroy();
      } catch (err) {
        console.warn("PDF cleanup warning:", err);
      }
      pdfRef.current = null;
    }
  };

  // Initialize PDF.js on component mount
  useEffect(() => {
    initPdfJs().then(() => {
      setPdfJsReady(true);
    }).catch(err => {
      console.error('Failed to initialize PDF.js:', err);
      setError('Failed to load PDF.js library');
    });
  }, []);

  // Load PDF when file changes
  useEffect(() => {
    if (pdfFile && pdfJsReady) {
      loadPDF(pdfFile);
    } else if (!pdfFile) {
      cleanup();
      setPdf(null);
      setCurrentPage(1);
      setTotalPages(0);
      setError(null);
      setPageText('');
    }

    return cleanup; // Cleanup on unmount
  }, [pdfFile, pdfJsReady]);

  // Extract text when PDF or page changes
  useEffect(() => {
    if (pdf && currentPage) {
      extractPageText(currentPage);
    }
  }, [pdf, currentPage]);

  // Apply highlights when citations or page text changes
  useEffect(() => {
    if (pageText) {
      applyHighlights();
    }
  }, [citedPagesMetadata, currentPage, pageText]);

  const loadPDF = async (file) => {
    if (!pdfjsLib) {
      setError('PDF.js library not loaded');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Cleanup previous PDF
      cleanup();
      
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ 
        data: new Uint8Array(arrayBuffer),
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
      });
      
      const pdfDoc = await loadingTask.promise;
      pdfRef.current = pdfDoc;
      setPdf(pdfDoc);
      setTotalPages(pdfDoc.numPages);
      setCurrentPage(1);
    } catch (err) {
      console.error("Error loading PDF:", err);
      setError(`Failed to load PDF file: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const extractPageText = async (pageNum) => {
    if (!pdf) return;

    setLoading(true);
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      if (!textContent.items || textContent.items.length === 0) {
        setPageText('');
        setLoading(false);
        return;
      }
      
      // Extract text with proper spacing
      let extractedText = '';
      let lastY = null;
      
      textContent.items.forEach((item, index) => {
        if (!item.str) return;
        
        const currentY = item.transform ? item.transform[5] : 0;
        
        // Add line breaks for significant vertical position changes
        if (lastY !== null && Math.abs(lastY - currentY) > 5) {
          extractedText += '\n';
        }
        
        // Add the text
        extractedText += item.str;
        
        // Add space if next item is far horizontally or this item doesn't end with space
        const nextItem = textContent.items[index + 1];
        if (nextItem && nextItem.transform) {
          const currentX = (item.transform ? item.transform[4] : 0) + (item.width || 0);
          const nextX = nextItem.transform[4];
          const sameY = Math.abs(currentY - nextItem.transform[5]) < 2;
          
          if (sameY && nextX - currentX > 5 && !item.str.endsWith(' ')) {
            extractedText += ' ';
          }
        }
        
        lastY = currentY;
      });

      setPageText(extractedText.trim());
      
    } catch (err) {
      console.error("Error extracting text:", err);
      setError(`Failed to extract text from page ${pageNum}: ${err.message || 'Unknown error'}`);
      setPageText('');
    } finally {
      setLoading(false);
    }
  };

  // const escapeRegExp = (string) => {
  //   return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // };
// Replace your applyHighlights function with this robust version
const applyHighlights = () => {
  
  if (!pageText) {
    setHighlightedText('');
    return;
  }

  const currentPageCitations = Array.isArray(citedPagesMetadata) 
    ? citedPagesMetadata.filter(citation => citation && citation.page === currentPage)
    : [];
  
  if (currentPageCitations.length === 0) {
    setHighlightedText(pageText);
    return;
  }

  let highlightedContent = pageText;
  
  currentPageCitations.forEach((citation, index) => {
    const searchText = citation.quote || citation.content_preview;
    if (!searchText || searchText.length < 10) return; // Increased minimum length

    try {
      console.log('=== Processing Citation ===');
      console.log('Original citation:', searchText.substring(0, 100) + '...');

      // Advanced text normalization
      const advancedNormalize = (text) => {
        return text
          // Normalize whitespace
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, ' ')
          .replace(/\r+/g, ' ')
          .replace(/\t+/g, ' ')
          
          // Normalize quotes and dashes
          .replace(/[''`]/g, "'")
          .replace(/[""]/g, '"')
          .replace(/[–—−]/g, '-')
          
          // Normalize hyphens and punctuation spacing
          .replace(/\s*-\s*/g, '- ')
          .replace(/\s*—\s*/g, '- ')
          
          // Remove extra spaces around punctuation
          .replace(/\s*([,.;:!?])\s*/g, '$1 ')
          .replace(/\s*([()[\]{}])\s*/g, ' $1 ')
          
          // Normalize common PDF extraction issues
          .replace(/(\w)-\s+(\w)/g, '$1$2') // Remove hyphenated line breaks
          .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
          
          .trim()
          .replace(/\s+/g, ' '); // Final whitespace cleanup
      };

      const normalizedCitation = advancedNormalize(searchText);
      const normalizedPageText = advancedNormalize(pageText);
      
      console.log('Normalized citation:', normalizedCitation.substring(0, 100) + '...');

      // Method 1: Try exact match with normalized text
      let matches = [];
      
      // Create a mapping between normalized and original text positions
      const createPositionMap = (original, normalized) => {
        const map = [];
        let origIndex = 0;
        let normIndex = 0;
        
        while (origIndex < original.length && normIndex < normalized.length) {
          if (original[origIndex].toLowerCase() === normalized[normIndex].toLowerCase()) {
            map[normIndex] = origIndex;
            origIndex++;
            normIndex++;
          } else {
            // Skip whitespace or special chars in original
            origIndex++;
          }
        }
        return map;
      };

      const positionMap = createPositionMap(pageText, normalizedPageText);
      
      // Try exact normalized match
      const escapedNormalized = escapeRegExp(normalizedCitation);
      const normalizedRegex = new RegExp(escapedNormalized, 'gi');
      const normalizedMatches = [...normalizedPageText.matchAll(normalizedRegex)];
      
      if (normalizedMatches.length > 0) {
        console.log('✅ Found exact normalized match');
        
        // Map back to original positions
        matches = normalizedMatches.map(match => {
          const normStart = match.index;
          const normEnd = normStart + match[0].length;
          
          // Find original positions
          const origStart = positionMap[normStart] || 0;
          let origEnd = origStart;
          
          // Find the end position in original text
          for (let i = normStart; i < normEnd && i < positionMap.length; i++) {
            if (positionMap[i] !== undefined) {
              origEnd = positionMap[i] + 1;
            }
          }
          
          return {
            index: origStart,
            0: pageText.substring(origStart, origEnd),
            length: origEnd - origStart
          };
        });
      }

      // Method 2: Fuzzy matching with word sequence
      if (matches.length === 0) {
        console.log('Trying fuzzy word sequence matching...');
        
        const citationWords = normalizedCitation.split(/\s+/).filter(w => w.length > 2);
        const pageWords = normalizedPageText.split(/\s+/);
        
        // Find word sequences that match with some tolerance
        for (let i = 0; i <= pageWords.length - citationWords.length; i++) {
          const pageSequence = pageWords.slice(i, i + citationWords.length);
          
          // Check if sequences match with some word flexibility
          let matchScore = 0;
          for (let j = 0; j < citationWords.length; j++) {
            if (pageSequence[j] && citationWords[j]) {
              const citationWord = citationWords[j].toLowerCase().replace(/[^\w]/g, '');
              const pageWord = pageSequence[j].toLowerCase().replace(/[^\w]/g, '');
              
              if (citationWord === pageWord) {
                matchScore++;
              } else if (pageWord.includes(citationWord) || citationWord.includes(pageWord)) {
                matchScore += 0.7; // Partial match
              }
            }
          }
          
          // If we have a good match (80% or better)
          if (matchScore / citationWords.length >= 0.8) {
            console.log(`✅ Found fuzzy sequence match with score: ${matchScore / citationWords.length}`);
            
            // Find this sequence in the original text
            const sequenceStart = pageWords.slice(0, i).join(' ').length;
            const sequenceEnd = sequenceStart + pageSequence.join(' ').length;
            
            // Adjust for original text positions
            const beforeText = normalizedPageText.substring(0, sequenceStart).trim();
            const matchText = normalizedPageText.substring(sequenceStart, sequenceEnd).trim();
            
            // Find approximate position in original text
            const originalStart = pageText.toLowerCase().indexOf(beforeText.toLowerCase()) + beforeText.length;
            const searchArea = pageText.substring(Math.max(0, originalStart - 50), originalStart + matchText.length + 100);
            
            // Look for the best match in this area
            const flexibleRegex = new RegExp(
              citationWords.slice(0, Math.min(5, citationWords.length))
                .map(word => escapeRegExp(word.replace(/[^\w]/g, '')))
                .join('\\W+\\w*\\W*'), 
              'gi'
            );
            
            const areaMatch = searchArea.match(flexibleRegex);
            if (areaMatch) {
              const areaStart = searchArea.indexOf(areaMatch[0]);
              const finalStart = Math.max(0, originalStart - 50) + areaStart;
              const finalEnd = Math.min(pageText.length, finalStart + areaMatch[0].length);
              
              matches = [{
                index: finalStart,
                0: pageText.substring(finalStart, finalEnd),
                length: finalEnd - finalStart
              }];
            }
            break;
          }
        }
      }

      // Method 3: Sentence-based matching (for longer citations)
      if (matches.length === 0 && normalizedCitation.length > 100) {
        console.log('Trying sentence-based matching...');
        
        const citationSentences = normalizedCitation.split(/[.!?]+/).filter(s => s.trim().length > 20);
        
        for (const sentence of citationSentences.slice(0, 2)) { // Try first 2 sentences
          const sentenceWords = sentence.trim().split(/\s+/).filter(w => w.length > 3).slice(0, 8);
          if (sentenceWords.length > 4) {
            const sentencePattern = sentenceWords
              .map(word => escapeRegExp(word.replace(/[^\w]/g, '')))
              .join('\\W+\\w*\\W*');
            
            const sentenceRegex = new RegExp(sentencePattern, 'gi');
            const sentenceMatches = [...pageText.matchAll(sentenceRegex)];
            
            if (sentenceMatches.length > 0) {
              console.log('✅ Found sentence-based match');
              matches = sentenceMatches.map(match => ({
                index: match.index,
                0: match[0],
                length: match[0].length
              }));
              break;
            }
          }
        }
      }

      // Apply highlighting if we found matches
      if (matches.length > 0) {
        console.log(`Applying ${matches.length} highlights`);
        
        matches.reverse().forEach((match, matchIndex) => {
          const start = match.index;
          const end = start + match[0].length;
          const originalText = match[0];
          const highlightId = `highlight-${index}-${matchIndex}`;
          
          highlightedContent = 
            highlightedContent.slice(0, start) +
            `<mark class="citation-highlight" data-citation-id="${index}" id="${highlightId}">${originalText}</mark>` +
            highlightedContent.slice(end);
        });
      } else {
        console.log('❌ All methods failed, falling back to word highlighting');
        
        // Enhanced word-by-word as final fallback
        const words = normalizedCitation.split(/\s+/)
          .filter(word => word.length > 3)
          .slice(0, 15); // Limit to first 15 words to avoid over-highlighting
        
        words.forEach(word => {
          const cleanWord = word.replace(/[^\w]/g, '');
          if (cleanWord.length > 3) {
            const wordRegex = new RegExp(`\\b(${escapeRegExp(cleanWord)})\\b`, 'gi');
            highlightedContent = highlightedContent.replace(wordRegex, 
              `<mark class="citation-highlight-word" data-citation-id="${index}">$1</mark>`
            );
          }
        });
      }

    } catch (error) {
      console.error('Error in highlighting:', error);
      console.log('Falling back to basic word highlighting');
      
      // Safe fallback
      const words = searchText.split(/\s+/).filter(w => w.length > 3).slice(0, 10);
      words.forEach(word => {
        const cleanWord = word.replace(/[^\w]/g, '');
        if (cleanWord.length > 3) {
          try {
            const wordRegex = new RegExp(`\\b(${escapeRegExp(cleanWord)})\\b`, 'gi');
            highlightedContent = highlightedContent.replace(wordRegex, 
              `<mark class="citation-highlight-word" data-citation-id="${index}">$1</mark>`
            );
          } catch (regexError) {
            console.warn('Word regex failed:', regexError);
          }
        }
      });
    }
  });

  setHighlightedText(highlightedContent);
};

// Helper function to escape regex special characters (keep your existing one)
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
  const copySelectedText = async () => {
    try {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const selectedText = selection.toString().trim();
        if (selectedText) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(selectedText);
            showCopyFeedback();
          } else {
            fallbackCopyText(selectedText);
          }
        }
      }
    } catch (err) {
      console.error('Copy failed:', err);
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        fallbackCopyText(selection.toString().trim());
      }
    }
  };

  const copyAllText = async () => {
    if (pageText) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(pageText);
          showCopyFeedback('All text copied!');
        } else {
          fallbackCopyText(pageText);
        }
      } catch (err) {
        console.error('Copy failed:', err);
        fallbackCopyText(pageText);
      }
    }
  };

  const showCopyFeedback = (message = '✓ Copied!') => {
    const selection = window.getSelection();
    let rect = { top: 100, left: 100, width: 0 };
    
    if (selection.rangeCount > 0) {
      rect = selection.getRangeAt(0).getBoundingClientRect();
    }
    
    const feedback = document.createElement('div');
    feedback.textContent = message;
    feedback.style.cssText = `
      position: fixed;
      top: ${Math.max(10, rect.top - 35)}px;
      left: ${Math.max(10, Math.min(window.innerWidth - 110, rect.left + rect.width / 2 - 50))}px;
      background: #4CAF50;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: system-ui, -apple-system, sans-serif;
    `;
    
    document.body.appendChild(feedback);
    setTimeout(() => {
      if (document.body.contains(feedback)) {
        document.body.removeChild(feedback);
      }
    }, 2500);
  };

  const fallbackCopyText = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showCopyFeedback();
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 'c') {
          const selection = window.getSelection();
          if (selection && selection.toString().trim()) {
            e.preventDefault();
            copySelectedText();
          }
        } else if (e.key === 'a' && e.shiftKey) {
          e.preventDefault();
          copyAllText();
        }
      }
      
      // Page navigation shortcuts
      if (e.key === 'ArrowLeft' && e.altKey) {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'ArrowRight' && e.altKey) {
        e.preventDefault();
        handleNextPage();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pageText, currentPage, totalPages]);

  const scrollToCitation = (citation) => {
    if (!citation) return;
    
    if (citation.page !== currentPage) {
      setCurrentPage(citation.page);
    }
    
    setTimeout(() => {
      const citationIndex = Array.isArray(citedPagesMetadata) 
        ? citedPagesMetadata.indexOf(citation) 
        : -1;
        
      if (citationIndex >= 0) {
        const highlightElements = document.querySelectorAll(`[data-citation-id="${citationIndex}"]`);
        if (highlightElements.length > 0) {
          highlightElements[0].scrollIntoView({ 
            behavior: "smooth", 
            block: "center" 
          });
        }
      }
    }, 300);
  };

  useImperativeHandle(ref, () => ({
    scrollToCitation,
    copySelectedText,
    copyAllText,
    goToPage: (pageNum) => {
      if (pageNum >= 1 && pageNum <= totalPages) {
        setCurrentPage(pageNum);
      }
    }
  }));

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (!pdfFile) {
    return (
      <div className="w-[65%] flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <DocumentTextIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <div className="text-lg mb-2">No PDF loaded</div>
          <div className="text-sm">Upload a PDF file to extract and view text</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[65%] flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="bg-white border-b p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || loading}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous page (Alt + ←)"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          
          <span className="text-sm text-gray-600 min-w-[120px] text-center font-medium">
            {loading ? "Loading..." : `Page ${currentPage} of ${totalPages}`}
          </span>
          
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || loading}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next page (Alt + →)"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={copySelectedText}
            disabled={loading}
            className="px-4 py-2 rounded-lg hover:bg-gray-100 text-sm text-gray-700 border border-gray-300 transition-colors disabled:opacity-50"
            title="Copy selected text (Ctrl/Cmd + C)"
          >
            📋 Copy Selection
          </button>
          
          <button
            onClick={copyAllText}
            disabled={loading || !pageText}
            className="px-4 py-2 rounded-lg hover:bg-blue-50 text-sm text-blue-700 border border-blue-300 transition-colors disabled:opacity-50"
            title="Copy all page text (Ctrl/Cmd + Shift + A)"
          >
            📄 Copy All
          </button>
        </div>
      </div>

      {/* Text Content */}
      <div className="flex-1 overflow-auto">
        {!pdfJsReady ? (
          <div className="flex items-center justify-center h-full text-blue-500 p-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <div className="text-lg">Loading PDF.js library...</div>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500 p-6">
            <div className="text-center max-w-md">
              <div className="text-lg mb-2">Error loading PDF</div>
              <div className="text-sm bg-red-50 p-3 rounded-lg border border-red-200">
                {error}
              </div>
              <button 
                onClick={() => pdfFile && loadPDF(pdfFile)}
                className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-full p-6">
            <div ref={containerRef} className="max-w-4xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm border p-8 min-h-[600px]">
                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="flex items-center space-x-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="text-lg text-gray-700">Extracting text...</span>
                    </div>
                  </div>
                ) : pageText ? (
                  <div 
                    ref={textContainerRef}
                    className="prose prose-gray max-w-none text-content"
                    style={{ lineHeight: '1.6', fontSize: '16px' }}
                    dangerouslySetInnerHTML={{ __html: highlightedText.replace(/\n/g, '<br>') }}
                  />
                ) : (
                  <div className="text-center text-gray-500 py-16">
                    <DocumentTextIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <div>No text found on this page</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Styles for consistent text highlighting */}
      <style jsx>{`
        .text-content {
          user-select: text;
          -webkit-user-select: text;
          -moz-user-select: text;
          -ms-user-select: text;
          word-spacing: normal;
          letter-spacing: normal;
        }
        
        .citation-highlight {
          background-color: #FFEB3B !important;
          padding: 1px 2px !important;
          border-radius: 2px !important;
          box-shadow: none !important;
          border: none !important;
          color: inherit !important;
          font-weight: inherit !important;
          display: inline !important;
          line-height: inherit !important;
          word-spacing: inherit !important;
          letter-spacing: inherit !important;
          white-space: inherit !important;
          transition: none !important;
          margin: 0 !important;
          font-size: inherit !important;
          font-family: inherit !important;
        }
        
        .citation-highlight:hover {
          background-color: #FFC107 !important;
        }
        
        .citation-highlight-word {
          background-color: rgba(255, 235, 59, 0.7) !important;
          padding: 0px 1px !important;
          border-radius: 1px !important;
          color: inherit !important;
          display: inline !important;
          line-height: inherit !important;
          word-spacing: inherit !important;
          letter-spacing: inherit !important;
          transition: none !important;
          margin: 0 !important;
          font-size: inherit !important;
          font-family: inherit !important;
        }
        
        .citation-highlight-word:hover {
          background-color: rgba(255, 193, 7, 0.8) !important;
        }
        
        /* Remove all possible spacing modifications */
        .citation-highlight,
        .citation-highlight-word {
          text-indent: 0 !important;
          text-decoration: none !important;
          box-sizing: content-box !important;
        }
        
        .citation-highlight *,
        .citation-highlight-word * {
          background-color: inherit !important;
          color: inherit !important;
          word-spacing: inherit !important;
          letter-spacing: inherit !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        
        .text-content::selection {
          background-color: rgba(0, 123, 255, 0.3);
        }
        
        .citation-highlight::selection {
          background-color: rgba(0, 123, 255, 0.5);
        }
        
        .text-content mark {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          word-spacing: inherit !important;
          letter-spacing: inherit !important;
        }
        
        /* Prevent any spacing issues */
        .text-content .citation-highlight,
        .text-content .citation-highlight-word {
          font-family: inherit !important;
          font-size: inherit !important;
          font-style: inherit !important;
          text-decoration: none !important;
        }
        
        /* Ensure proper spacing preservation */
        .text-content br + .citation-highlight,
        .text-content .citation-highlight + br,
        .citation-highlight + .citation-highlight {
          word-spacing: inherit !important;
        }
        
        @media (max-width: 768px) {
          .citation-highlight {
            padding: 1px 2px !important;
            font-size: 14px !important;
          }
        }
      `}</style>
    </div>
  );
});

export default RightPanel;