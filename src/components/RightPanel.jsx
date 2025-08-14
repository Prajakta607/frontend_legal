import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from "@heroicons/react/24/outline";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

const RightPanel = forwardRef(function RightPanel({ pdfFile, citedPagesMetadata, docId }, ref) {
  const [pdf, setPdf] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pageTextContent, setPageTextContent] = useState(null);
  const [highlightedCitation, setHighlightedCitation] = useState(null);

  const canvasRef = useRef();
  const containerRef = useRef();
  const textLayerRef = useRef();

  // Load PDF when file changes
  useEffect(() => {
    if (pdfFile) {
      loadPDF(pdfFile);
    } else {
      setPdf(null);
      setCurrentPage(1);
      setTotalPages(0);
      setError(null);
    }
  }, [pdfFile]);

  // Render page when PDF, currentPage, or scale changes
  useEffect(() => {
    if (pdf) {
      renderPage(currentPage);
    }
  }, [pdf, currentPage, scale]);

  // Apply highlights when citations change or page changes
  useEffect(() => {
    if (pageTextContent) {
      setTimeout(() => {
        applyHighlights();
      }, 200);
    }
  }, [citedPagesMetadata, currentPage, pageTextContent]);

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

  const renderPage = async (pageNum) => {
    if (!pdf || !canvasRef.current) return;

    setLoading(true);
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Clear previous content
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Render PDF page
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      await page.render(renderContext).promise;

      // Render text layer for text selection and highlighting
      await renderTextLayer(page, viewport);
      
    } catch (err) {
      console.error("Error rendering page:", err);
      setError("Failed to render page");
    } finally {
      setLoading(false);
    }
  };

  const renderTextLayer = async (page, viewport) => {
    if (!textLayerRef.current) return;

    try {
      const textContent = await page.getTextContent();
      setPageTextContent(textContent);

      // Clear existing text layer
      textLayerRef.current.innerHTML = "";
      textLayerRef.current.style.width = viewport.width + "px";
      textLayerRef.current.style.height = viewport.height + "px";

      // Create text layer elements using PDF.js text layer rendering
      textContent.items.forEach((textItem, index) => {
        const textElement = document.createElement("span");
        textElement.textContent = textItem.str;
        textElement.className = "text-layer-item";
        textElement.dataset.textIndex = index;
        
        // Calculate position and transformation
        const tx = textItem.transform;
        const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
        const fontWidth = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
        const fontAscent = fontHeight;
        
        const left = tx[4];
        const top = viewport.height - tx[5] - fontAscent;
        
        // Apply transformation matrix for proper text positioning
        const transform = `matrix(${tx[0] / fontWidth}, ${tx[1] / fontWidth}, ${-tx[2] / fontHeight}, ${-tx[3] / fontHeight}, ${left}, ${top})`;
        
        // Apply styles for proper positioning and visibility
        Object.assign(textElement.style, {
          position: 'absolute',
          left: '0px',
          top: '0px',
          fontSize: fontHeight + 'px',
          fontFamily: textItem.fontName || 'sans-serif',
          transform: transform,
          transformOrigin: '0 0',
          // Make text black and visible for actual highlighting
          color: 'rgba(0, 0, 0, 0.2)', // Semi-transparent black
          userSelect: 'text',
          cursor: 'text',
          whiteSpace: 'pre',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text',
          zIndex: '10',
          pointerEvents: 'auto',
          // Blend mode to work well with PDF background
          mixBlendMode: 'multiply'
        });

        textLayerRef.current.appendChild(textElement);
      });

    } catch (err) {
      console.error("Error rendering text layer:", err);
    }
  };

  const clearHighlights = () => {
    if (!textLayerRef.current) return;
    
    const highlightedElements = textLayerRef.current.querySelectorAll(".citation-highlight");
    highlightedElements.forEach(el => {
      el.classList.remove("citation-highlight");
      // Reset to original semi-transparent style
      Object.assign(el.style, {
        backgroundColor: 'transparent',
        color: 'rgba(0, 0, 0, 0.2)',
        padding: '0',
        borderRadius: '0',
        boxShadow: 'none',
        zIndex: '10',
        mixBlendMode: 'multiply'
      });
    });
  };

  const applyHighlights = () => {
    if (!pageTextContent || !textLayerRef.current) return;

    clearHighlights();

    // Get citations for current page
    const currentPageCitations = citedPagesMetadata.filter(citation => citation.page === currentPage);
    
    currentPageCitations.forEach(citation => {
      highlightTextInPage(citation);
    });
  };

  const highlightTextInPage = (citation) => {
    if (!pageTextContent || !textLayerRef.current) return;

    const searchText = citation.quote || citation.content_preview;
    if (!searchText || searchText.length < 3) return;

    const textElements = Array.from(textLayerRef.current.querySelectorAll('.text-layer-item'));
    
    // Create a text mapping for better matching
    const textMapping = textElements.map((el, index) => ({
      element: el,
      text: el.textContent,
      index: index
    }));

    // Clean search text
    const cleanSearchText = searchText.replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Try to find exact phrase matches first
    const fullText = textMapping.map(item => item.text).join(' ').toLowerCase();
    const searchIndex = fullText.indexOf(cleanSearchText);
    
    if (searchIndex !== -1) {
      // Found exact match - highlight the relevant elements
      highlightExactTextMatch(textMapping, cleanSearchText, fullText, searchIndex);
    } else {
      // Fallback to word-based matching
      highlightWordBasedMatch(textMapping, cleanSearchText);
    }
  };

  const highlightExactTextMatch = (textMapping, searchText, fullText, searchIndex) => {
    let currentIndex = 0;
    const searchEnd = searchIndex + searchText.length;
    
    textMapping.forEach(({ element, text }) => {
      const textStart = currentIndex;
      const textEnd = currentIndex + text.length;
      
      // Check if this text element overlaps with the search match
      if (textStart < searchEnd && textEnd > searchIndex) {
        highlightElement(element);
      }
      
      // Account for space between elements
      currentIndex = textEnd + 1;
    });
  };

  const highlightWordBasedMatch = (textMapping, searchText) => {
    const searchWords = searchText.split(/\s+/).filter(word => word.length > 2);
    
    textMapping.forEach(({ element, text }) => {
      const elementText = text.toLowerCase();
      const matchingWords = searchWords.filter(word => 
        elementText.includes(word) || word.includes(elementText.trim())
      );
      
      // Highlight if element contains significant portion of search words
      if (matchingWords.length > 0 && (matchingWords.length / searchWords.length) >= 0.4) {
        highlightElement(element);
      }
    });
  };

  const highlightElement = (element) => {
    element.classList.add("citation-highlight");
    Object.assign(element.style, {
      backgroundColor: 'rgba(255, 235, 59, 0.8)', // Semi-transparent yellow
      color: 'rgba(0, 0, 0, 0.9)', // More opaque black text
      padding: '2px 3px',
      borderRadius: '2px',
      boxShadow: '0 1px 2px rgba(255, 235, 59, 0.4)',
      zIndex: '100',
      mixBlendMode: 'normal', // Reset blend mode for highlights
      border: '1px solid rgba(255, 193, 7, 0.6)'
    });
  };

  // Enhanced text copying function
  const copySelectedText = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const selectedText = selection.toString();
      if (selectedText.trim()) {
        navigator.clipboard.writeText(selectedText).then(() => {
          console.log('Text copied to clipboard:', selectedText);
          // Show brief visual feedback
          showCopyFeedback();
        }).catch(err => {
          console.error('Failed to copy text: ', err);
          // Fallback for older browsers
          fallbackCopyText(selectedText);
        });
      }
    }
  };

  const showCopyFeedback = () => {
    // You can implement a toast notification here
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Create temporary feedback element
      const feedback = document.createElement('div');
      feedback.textContent = 'Copied!';
      feedback.style.cssText = `
        position: fixed;
        top: ${rect.top - 30}px;
        left: ${rect.left + rect.width / 2 - 25}px;
        background: #4CAF50;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 10000;
        pointer-events: none;
      `;
      
      document.body.appendChild(feedback);
      setTimeout(() => {
        document.body.removeChild(feedback);
      }, 1500);
    }
  };

  const fallbackCopyText = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          copySelectedText();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const scrollToCitation = (citation) => {
    if (citation.page !== currentPage) {
      setCurrentPage(citation.page);
    }
    
    setHighlightedCitation(citation);
    
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollIntoView({ 
          behavior: "smooth", 
          block: "center" 
        });
      }
    }, 300);
  };

  useImperativeHandle(ref, () => ({
    scrollToCitation,
    copySelectedText,
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

  const handleZoomIn = () => {
    setScale(Math.min(scale + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setScale(Math.max(scale - 0.2, 0.5));
  };

  if (!pdfFile) {
    return (
      <div className="w-[65%] flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="text-lg mb-2">No PDF loaded</div>
          <div className="text-sm">Upload a PDF file to get started</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[65%] flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="bg-white border-b p-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || loading}
            className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          
          <span className="text-sm text-gray-600 min-w-[120px] text-center">
            {loading ? "Loading..." : `Page ${currentPage} of ${totalPages}`}
          </span>
          
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || loading}
            className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={copySelectedText}
            className="px-3 py-1 rounded hover:bg-gray-200 text-sm text-gray-600 border"
            title="Copy selected text (Ctrl+C)"
          >
            📋 Copy
          </button>
          
          <div className="border-l h-6 mx-2"></div>
          
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Zoom out"
          >
            <MagnifyingGlassMinusIcon className="w-5 h-5" />
          </button>
          
          <span className="text-sm text-gray-600 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          
          <button
            onClick={handleZoomIn}
            disabled={scale >= 3.0}
            className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Zoom in"
          >
            <MagnifyingGlassPlusIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            <div className="text-center">
              <div className="text-lg mb-2">Error loading PDF</div>
              <div className="text-sm">{error}</div>
            </div>
          </div>
        ) : (
          <div className="min-h-full py-4">
            <div ref={containerRef} className="flex justify-center">
              <div className="relative shadow-lg bg-white">
                <canvas ref={canvasRef} className="block max-w-full" />
                
                {/* Text layer positioned over the canvas */}
                <div
                  ref={textLayerRef}
                  className="absolute top-0 left-0 text-layer"
                  style={{ 
                    pointerEvents: 'auto',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                    MozUserSelect: 'text',
                    msUserSelect: 'text'
                  }}
                />
                
                {loading && (
                  <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="text-lg text-gray-700">Loading page...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CSS for actual text highlighting */}
      <style jsx>{`
        .text-layer {
          font-size: 1px;
          line-height: 1;
          user-select: text;
        }
        
        .text-layer-item {
          position: absolute;
          color: rgba(0, 0, 0, 0.2);
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          cursor: text;
          white-space: pre;
          transform-origin: 0 0;
          z-index: 10;
          pointer-events: auto;
          mix-blend-mode: multiply;
          font-weight: inherit;
        }
        
        .citation-highlight {
          background-color: rgba(255, 235, 59, 0.8) !important;
          color: rgba(0, 0, 0, 0.9) !important;
          padding: 2px 3px !important;
          border-radius: 2px !important;
          box-shadow: 0 1px 2px rgba(255, 235, 59, 0.4) !important;
          z-index: 100 !important;
          mix-blend-mode: normal !important;
          border: 1px solid rgba(255, 193, 7, 0.6) !important;
        }
        
        .citation-highlight:hover {
          background-color: rgba(255, 193, 7, 0.9) !important;
          box-shadow: 0 2px 4px rgba(255, 193, 7, 0.6) !important;
        }
        
        .text-layer-item::selection {
          background-color: rgba(0, 123, 255, 0.3) !important;
          color: rgba(0, 0, 0, 0.9) !important;
        }
        
        .citation-highlight::selection {
          background-color: rgba(0, 123, 255, 0.5) !important;
          color: rgba(0, 0, 0, 1) !important;
        }
        
        /* Ensure all text elements are selectable */
        .text-layer * {
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