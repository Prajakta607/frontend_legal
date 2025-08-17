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

  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };
// Replace your applyHighlights function with this improved version
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
    if (!searchText || searchText.length < 3) return;

    try {
      // More aggressive text normalization
      const normalizeText = (text) => {
        return text
          .replace(/\s+/g, ' ')  // Multiple spaces to single space
          .replace(/[\u2018\u2019]/g, "'")  // Smart quotes to regular quotes
          .replace(/[\u201C\u201D]/g, '"')  // Smart double quotes
          .replace(/[\u2013\u2014]/g, '-')  // En/em dashes to hyphens
          .replace(/[\u00A0]/g, ' ')  // Non-breaking spaces
          .replace(/[^\x20-\x7E]/g, c => {  // Replace other non-ASCII chars
            // Keep common chars, replace others with space
            const code = c.charCodeAt(0);
            if (code < 127) return c;
            return ' ';
          })
          .trim();
      };

      const cleanSearchText = normalizeText(searchText);
      const cleanPageText = normalizeText(highlightedContent);
      
      // Try exact match first with normalized text
      const escapedText = escapeRegExp(cleanSearchText);
      const exactRegex = new RegExp(escapedText, 'gi');
      
      // Search in normalized text but get positions for original text
      const normalizedMatches = [...cleanPageText.matchAll(exactRegex)];
      
      if (normalizedMatches.length > 0) {
        // Find corresponding positions in original text
        const matches = normalizedMatches.map(match => {
          const normalizedStart = match.index;
          const normalizedEnd = normalizedStart + match[0].length;
          
          // Map back to original text position (approximate)
          // This is complex, so let's use a simpler approach
          const beforeNormalized = cleanPageText.substring(0, normalizedStart);
          const matchNormalized = cleanPageText.substring(normalizedStart, normalizedEnd);
          
          // Find this text in original
          const beforeOriginal = highlightedContent.substring(0, beforeNormalized.length + 50);
          const searchInOriginal = new RegExp(escapeRegExp(matchNormalized).replace(/\s+/g, '\\s+'), 'gi');
          const originalMatch = beforeOriginal.match(searchInOriginal);
          
          if (originalMatch) {
            const originalStart = beforeOriginal.lastIndexOf(originalMatch[originalMatch.length - 1]);
            const originalText = highlightedContent.substring(originalStart, originalStart + matchNormalized.length + 20);
            const finalMatch = originalText.match(new RegExp(escapeRegExp(matchNormalized).replace(/\s+/g, '\\s+'), 'i'));
            
            if (finalMatch) {
              return {
                index: originalStart + finalMatch.index,
                0: finalMatch[0]
              };
            }
          }
          return null;
        }).filter(Boolean);

        if (matches.length > 0) {
          // Apply exact highlighting
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
          return; // Success, skip fallback methods
        }
      }

      // Fallback: Simple case-insensitive search with flexible spacing
      const words = cleanSearchText.split(/\s+/).filter(word => word.length > 2);
      
      if (words.length > 1) {
        // Create pattern that allows flexible spacing
        const flexiblePattern = words.map(word => escapeRegExp(word)).join('\\s+');
        const flexibleRegex = new RegExp(flexiblePattern, 'gi');
        const flexibleMatches = [...highlightedContent.matchAll(flexibleRegex)];
        
        if (flexibleMatches.length > 0) {
          // Apply flexible highlighting (same as exact)
          flexibleMatches.reverse().forEach((match, matchIndex) => {
            const start = match.index;
            const end = start + match[0].length;
            const originalText = match[0];
            const highlightId = `highlight-${index}-${matchIndex}`;
            
            highlightedContent = 
              highlightedContent.slice(0, start) +
              `<mark class="citation-highlight" data-citation-id="${index}" id="${highlightId}">${originalText}</mark>` +
              highlightedContent.slice(end);
          });
          return; // Success, skip word-by-word
        }
      }

      // Final fallback: word-by-word (only if above methods fail)
      words.forEach(word => {
        const cleanWord = word.replace(/[,.\-&()!?;:]/g, '');
        if (cleanWord.length > 2) {
          const wordRegex = new RegExp(`\\b(${escapeRegExp(cleanWord)})\\b`, 'gi');
          highlightedContent = highlightedContent.replace(wordRegex, 
            `<mark class="citation-highlight-word" data-citation-id="${index}">$1</mark>`
          );
        }
      });

    } catch (regexError) {
      console.warn("Regex error in highlighting:", regexError);
    }
  });

  setHighlightedText(highlightedContent);
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