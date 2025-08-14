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
      }, 100);
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

      // Clear existing layers
      textLayerRef.current.innerHTML = "";
      textLayerRef.current.style.width = viewport.width + "px";
      textLayerRef.current.style.height = viewport.height + "px";

      // Create invisible text selection layer
      textContent.items.forEach((textItem, index) => {
        const textElement = document.createElement("div");
        textElement.textContent = textItem.str;
        textElement.className = "text-selection-item";
        textElement.dataset.textIndex = index;
        
        // Calculate position and size
        const tx = textItem.transform;
        const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
        const fontAscent = fontHeight;
        
        const left = tx[4];
        const top = viewport.height - tx[5] - fontAscent;
        const fontSize = fontHeight;
        const width = textItem.width || fontSize * textItem.str.length * 0.6;
        const height = fontHeight;
        
        // Apply styles - invisible but selectable overlay
        Object.assign(textElement.style, {
          position: 'absolute',
          left: left + 'px',
          top: top + 'px',
          width: width + 'px',
          height: height + 'px',
          fontSize: fontSize + 'px',
          fontFamily: textItem.fontName || 'sans-serif',
          color: 'transparent',
          backgroundColor: 'transparent',
          userSelect: 'text',
          cursor: 'text',
          whiteSpace: 'pre',
          transformOrigin: '0 0',
          overflow: 'hidden',
          // Store original text data for highlighting
          '--text-content': `"${textItem.str}"`,
          '--left': left + 'px',
          '--top': top + 'px',
          '--width': width + 'px',
          '--height': height + 'px'
        });

        textLayerRef.current.appendChild(textElement);
      });

    } catch (err) {
      console.error("Error rendering text layer:", err);
    }
  };

  const clearHighlights = () => {
    if (!textLayerRef.current) return;
    
    // Remove all highlight overlays
    const highlights = textLayerRef.current.querySelectorAll(".highlight-overlay");
    highlights.forEach(highlight => highlight.remove());
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

    const textElements = textLayerRef.current.querySelectorAll('.text-selection-item');
    const fullPageText = Array.from(textElements).map(el => el.textContent).join(' ');
    
    // Clean and normalize text for better matching
    const cleanSearchText = searchText.replace(/\s+/g, ' ').trim();
    const cleanPageText = fullPageText.replace(/\s+/g, ' ').trim();
    
    // Find the text in the page
    const searchIndex = cleanPageText.toLowerCase().indexOf(cleanSearchText.toLowerCase());
    
    if (searchIndex !== -1) {
      // Highlight exact match
      highlightExactMatch(textElements, searchIndex, cleanSearchText.length);
    } else {
      // Try word-based matching as fallback
      highlightWordMatch(textElements, cleanSearchText);
    }
  };

  const highlightExactMatch = (textElements, startIndex, searchLength) => {
    let currentIndex = 0;
    const elementsToHighlight = [];
    
    textElements.forEach(element => {
      const textLength = element.textContent.length;
      const elementStart = currentIndex;
      const elementEnd = currentIndex + textLength;
      
      // Check if this element overlaps with our search text
      if (elementStart < startIndex + searchLength && elementEnd > startIndex) {
        elementsToHighlight.push(element);
      }
      
      currentIndex = elementEnd + 1; // +1 for space between elements
    });

    // Create highlight overlays for matched elements
    elementsToHighlight.forEach(element => {
      createHighlightOverlay(element);
    });
  };

  const highlightWordMatch = (textElements, searchText) => {
    const words = searchText.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    
    textElements.forEach(element => {
      const elementText = element.textContent.toLowerCase();
      const matchingWords = words.filter(word => elementText.includes(word));
      
      // Highlight if element contains significant words from the search text
      if (matchingWords.length > 0 && matchingWords.length / words.length > 0.3) {
        createHighlightOverlay(element);
      }
    });
  };

  const createHighlightOverlay = (textElement) => {
    // Create a highlight overlay div positioned exactly over the original PDF text
    const highlight = document.createElement("div");
    highlight.className = "highlight-overlay";
    
    // Get the position and size from the text element
    const rect = textElement.getBoundingClientRect();
    const containerRect = textLayerRef.current.getBoundingClientRect();
    
    Object.assign(highlight.style, {
      position: 'absolute',
      left: textElement.style.left,
      top: textElement.style.top,
      width: textElement.style.width,
      height: textElement.style.height,
      backgroundColor: 'rgba(255, 235, 59, 0.4)', // Semi-transparent yellow
      borderRadius: '2px',
      pointerEvents: 'none',
      zIndex: '50',
      mixBlendMode: 'multiply', // Blend with underlying PDF content
      border: '1px solid rgba(255, 235, 59, 0.8)'
    });
    
    textLayerRef.current.appendChild(highlight);
  };

  const scrollToCitation = (citation) => {
    // Navigate to the page of the citation
    if (citation.page !== currentPage) {
      setCurrentPage(citation.page);
    }
    
    // Set this citation as highlighted
    setHighlightedCitation(citation);
    
    // Scroll container into view
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollIntoView({ 
          behavior: "smooth", 
          block: "center" 
        });
      }
    }, 200);
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    scrollToCitation,
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
                
                {/* Text layer for selection and highlighting */}
                <div
                  ref={textLayerRef}
                  className="absolute top-0 left-0 text-layer"
                  style={{ 
                    pointerEvents: 'auto',
                    userSelect: 'text',
                  }}
                />
                
                {/* Loading overlay */}
                {loading && (
                  <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center">
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

      {/* Enhanced CSS for text selection and highlight overlays */}
      <style jsx>{`
        .text-layer {
          pointer-events: auto;
          user-select: text;
        }
        
        .text-selection-item {
          position: absolute;
          color: transparent;
          user-select: text;
          cursor: text;
          white-space: pre;
          transform-origin: 0 0;
          background-color: transparent;
        }
        
        .text-selection-item::selection {
          background-color: rgba(0, 123, 255, 0.3);
        }
        
        .highlight-overlay {
          position: absolute;
          background-color: rgba(255, 235, 59, 0.4) !important;
          border-radius: 2px !important;
          pointer-events: none !important;
          z-index: 50 !important;
          mix-blend-mode: multiply !important;
          border: 1px solid rgba(255, 235, 59, 0.8) !important;
        }
        
        .highlight-overlay:hover {
          background-color: rgba(255, 193, 7, 0.5) !important;
        }
      `}</style>
    </div>
  );
});

export default RightPanel;