import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import { ChevronLeftIcon, ChevronRightIcon, DocumentTextIcon } from "@heroicons/react/24/outline";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

const RightPanel = forwardRef(function RightPanel({ pdfFile, citedPagesMetadata, docId }, ref) {
  const [pdf, setPdf] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pageText, setPageText] = useState('');
  const [highlightedText, setHighlightedText] = useState('');

  const containerRef = useRef();
  const textContainerRef = useRef();

  // Load PDF when file changes
  useEffect(() => {
    if (pdfFile) {
      loadPDF(pdfFile);
    } else {
      setPdf(null);
      setCurrentPage(1);
      setTotalPages(0);
      setError(null);
      setPageText('');
    }
  }, [pdfFile]);

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
    setLoading(true);
    setError(null);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      setPdf(pdfDoc);
      setTotalPages(pdfDoc.numPages);
      setCurrentPage(1);
    } catch (err) {
      console.error("Error loading PDF:", err);
      setError("Failed to load PDF file");
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
      
      // Extract text with proper spacing
      let extractedText = '';
      let lastY = null;
      
      textContent.items.forEach((item, index) => {
        const currentY = item.transform[5];
        
        // Add line breaks for significant vertical position changes
        if (lastY !== null && Math.abs(lastY - currentY) > 5) {
          extractedText += '\n';
        }
        
        // Add the text
        extractedText += item.str;
        
        // Add space if next item is far horizontally or this item doesn't end with space
        const nextItem = textContent.items[index + 1];
        if (nextItem) {
          const currentX = item.transform[4] + (item.width || 0);
          const nextX = nextItem.transform[4];
          const sameY = Math.abs(currentY - nextItem.transform[5]) < 2;
          
          if (sameY && nextX - currentX > 5) {
            extractedText += ' ';
          }
        }
        
        lastY = currentY;
      });

      setPageText(extractedText.trim());
      
    } catch (err) {
      console.error("Error extracting text:", err);
      setError("Failed to extract text from page");
    } finally {
      setLoading(false);
    }
  };

  const applyHighlights = () => {
    if (!pageText) {
      setHighlightedText('');
      return;
    }

    // Get citations for current page
    const currentPageCitations = citedPagesMetadata.filter(citation => citation.page === currentPage);
    
    if (currentPageCitations.length === 0) {
      setHighlightedText(pageText);
      return;
    }

    let highlightedContent = pageText;
    
    // Apply highlights for each citation
    currentPageCitations.forEach((citation, index) => {
      const searchText = citation.quote || citation.content_preview;
      if (!searchText || searchText.length < 3) return;

      // Clean and normalize search text
      const cleanSearchText = searchText.replace(/\s+/g, ' ').trim();
      
      // Find exact matches first
      const regex = new RegExp(escapeRegExp(cleanSearchText), 'gi');
      const matches = [...highlightedContent.matchAll(regex)];
      
      if (matches.length > 0) {
        // Replace matches with highlighted versions
        matches.reverse().forEach(match => {
          const start = match.index;
          const end = start + match[0].length;
          const highlightId = `highlight-${index}-${start}`;
          
          highlightedContent = 
            highlightedContent.slice(0, start) +
            `<mark class="citation-highlight" data-citation-id="${index}" id="${highlightId}">${match[0]}</mark>` +
            highlightedContent.slice(end);
        });
      } else {
        // Fallback: highlight individual words if exact match not found
        const words = cleanSearchText.split(/\s+/).filter(word => word.length > 3);
        words.forEach(word => {
          const wordRegex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
          highlightedContent = highlightedContent.replace(wordRegex, 
            `<mark class="citation-highlight-word" data-citation-id="${index}">$&</mark>`
          );
        });
      }
    });

    setHighlightedText(highlightedContent);
  };

  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const copySelectedText = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const selectedText = selection.toString().trim();
      if (selectedText) {
        navigator.clipboard.writeText(selectedText).then(() => {
          showCopyFeedback();
        }).catch(err => {
          console.error('Copy failed:', err);
          fallbackCopyText(selectedText);
        });
      }
    }
  };

  const copyAllText = () => {
    if (pageText) {
      navigator.clipboard.writeText(pageText).then(() => {
        showCopyFeedback('All text copied!');
      }).catch(err => {
        console.error('Copy failed:', err);
        fallbackCopyText(pageText);
      });
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
      top: ${rect.top - 35}px;
      left: ${rect.left + rect.width / 2 - 50}px;
      background: #4CAF50;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: system-ui;
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
      document.execCommand('copy');
      showCopyFeedback();
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
  };

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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pageText]);

  const scrollToCitation = (citation) => {
    if (citation.page !== currentPage) {
      setCurrentPage(citation.page);
    }
    
    setTimeout(() => {
      const highlightElements = document.querySelectorAll(`[data-citation-id="${citedPagesMetadata.indexOf(citation)}"]`);
      if (highlightElements.length > 0) {
        highlightElements[0].scrollIntoView({ 
          behavior: "smooth", 
          block: "center" 
        });
      }
    }, 300);
  };

  useImperativeHandle(ref, () => ({
    scrollToCitation,
    copySelectedText,
    copyAllText
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
            title="Previous page"
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
            title="Next page"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={copySelectedText}
            className="px-4 py-2 rounded-lg hover:bg-gray-100 text-sm text-gray-700 border border-gray-300 transition-colors"
            title="Copy selected text (Ctrl+C)"
          >
            📋 Copy Selection
          </button>
          
          <button
            onClick={copyAllText}
            className="px-4 py-2 rounded-lg hover:bg-blue-50 text-sm text-blue-700 border border-blue-300 transition-colors"
            title="Copy all page text (Ctrl+Shift+A)"
          >
            📄 Copy All
          </button>
        </div>
      </div>

      {/* Text Content */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            <div className="text-center">
              <div className="text-lg mb-2">Error loading PDF</div>
              <div className="text-sm">{error}</div>
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

      {/* Styles for text highlighting */}
      <style jsx>{`
        .text-content {
          user-select: text;
          -webkit-user-select: text;
          -moz-user-select: text;
          -ms-user-select: text;
        }
        
        .citation-highlight {
          background-color: #FFEB3B !important;
          padding: 2px 4px !important;
          border-radius: 3px !important;
          box-shadow: 0 1px 3px rgba(255, 235, 59, 0.4) !important;
          border: 1px solid #FFC107 !important;
          color: #000 !important;
          font-weight: 500 !important;
        }
        
        .citation-highlight:hover {
          background-color: #FFC107 !important;
          box-shadow: 0 2px 6px rgba(255, 193, 7, 0.6) !important;
        }
        
        .citation-highlight-word {
          background-color: rgba(255, 235, 59, 0.6) !important;
          padding: 1px 2px !important;
          border-radius: 2px !important;
          color: #000 !important;
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
        }
      `}</style>
    </div>
  );
});

export default RightPanel;