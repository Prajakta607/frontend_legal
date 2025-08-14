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
  const highlightLayerRef = useRef();

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
      context.clearRect(0, 0, canvas.width, canvas.width);

      // Render PDF page
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      await page.render(renderContext).promise;

      // Render text layer for text selection
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
      highlightLayerRef.current.innerHTML = "";
      
      textLayerRef.current.style.width = viewport.width + "px";
      textLayerRef.current.style.height = viewport.height + "px";
      highlightLayerRef.current.style.width = viewport.width + "px";
      highlightLayerRef.current.style.height = viewport.height + "px";

      // Create text selection layer with proper positioning
      textContent.items.forEach((textItem, index) => {
        const textDiv = document.createElement("div");
        textDiv.textContent = textItem.str;
        textDiv.className = "pdf-text-item";
        textDiv.setAttribute('data-text-index', index);
        
        // Get transformation matrix for positioning
        const transform = textItem.transform;
        const x = transform[4];
        const y = transform[5];
        const scaleX = transform[0];
        const scaleY = transform[3];
        
        // Calculate font size and positioning
        const fontSize = Math.sqrt(transform[2] * transform[2] + transform[3] * transform[3]);
        const rotation = Math.atan2(transform[1], transform[0]);
        
        // Position the text element to match PDF text exactly
        textDiv.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: ${viewport.height - y}px;
          font-size: ${fontSize}px;
          font-family: sans-serif;
          transform-origin: 0 0;
          transform: translateY(-100%) rotate(${rotation}rad) scaleX(${Math.sign(scaleX)});
          white-space: nowrap;
          color: transparent;
          user-select: text;
          cursor: text;
          pointer-events: auto;
          line-height: 1;
          padding: 0;
          margin: 0;
          border: none;
          background: transparent;
          z-index: 1;
        `;

        // Store original text data for highlighting purposes
        textDiv.setAttribute('data-original-text', textItem.str);
        textDiv.setAttribute('data-left', x);
        textDiv.setAttribute('data-top', viewport.height - y);
        textDiv.setAttribute('data-width', textItem.width || fontSize * textItem.str.length * 0.6);
        textDiv.setAttribute('data-height', fontSize);

        textLayerRef.current.appendChild(textDiv);
      });

    } catch (err) {
      console.error("Error rendering text layer:", err);
    }
  };

  const clearHighlights = () => {
    if (!highlightLayerRef.current) return;
    highlightLayerRef.current.innerHTML = "";
  };

  const applyHighlights = () => {
    if (!pageTextContent || !textLayerRef.current || !highlightLayerRef.current) return;

    clearHighlights();

    // Get citations for current page
    const currentPageCitations = citedPagesMetadata?.filter(citation => citation.page === currentPage) || [];
    
    currentPageCitations.forEach(citation => {
      highlightTextInPage(citation);
    });
  };

  const highlightTextInPage = (citation) => {
    if (!pageTextContent || !textLayerRef.current || !highlightLayerRef.current) return;

    const searchText = citation.quote || citation.content_preview;
    if (!searchText || searchText.length < 3) return;

    const textElements = textLayerRef.current.querySelectorAll('.pdf-text-item');
    const allText = Array.from(textElements).map(el => el.textContent).join(' ');
    
    // Normalize text for better matching
    const normalizedSearchText = searchText.replace(/\s+/g, ' ').trim().toLowerCase();
    const normalizedAllText = allText.replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Find exact match
    const matchIndex = normalizedAllText.indexOf(normalizedSearchText);
    
    if (matchIndex !== -1) {
      highlightExactMatch(textElements, matchIndex, normalizedSearchText.length, citation);
    } else {
      // Fallback to word-based matching
      highlightWordBasedMatch(textElements, normalizedSearchText, citation);
    }
  };

  const highlightExactMatch = (textElements, startIndex, matchLength, citation) => {
    let currentIndex = 0;
    const elementsToHighlight = [];
    
    Array.from(textElements).forEach((element, elementIndex) => {
      const text = element.textContent;
      const textLength = text.length;
      const elementStart = currentIndex;
      const elementEnd = currentIndex + textLength;
      
      // Check if this element overlaps with our search text
      if (elementStart < startIndex + matchLength && elementEnd > startIndex) {
        const overlapStart = Math.max(elementStart, startIndex);
        const overlapEnd = Math.min(elementEnd, startIndex + matchLength);
        
        if (overlapEnd > overlapStart) {
          elementsToHighlight.push({
            element,
            startOffset: overlapStart - elementStart,
            endOffset: overlapEnd - elementStart
          });
        }
      }
      
      currentIndex = elementEnd + 1; // +1 for space
    });

    // Create highlights for matched elements
    elementsToHighlight.forEach(({ element }) => {
      createHighlight(element, citation);
    });
  };

  const highlightWordBasedMatch = (textElements, searchText, citation) => {
    const searchWords = searchText.split(/\s+/).filter(word => word.length > 2);
    
    Array.from(textElements).forEach(element => {
      const elementText = element.textContent.toLowerCase();
      const matchingWords = searchWords.filter(word => elementText.includes(word));
      
      // Highlight if element contains significant portion of search words
      if (matchingWords.length > 0 && matchingWords.length / searchWords.length >= 0.4) {
        createHighlight(element, citation);
      }
    });
  };

  const createHighlight = (textElement, citation) => {
    const highlight = document.createElement("div");
    highlight.className = "pdf-highlight";
    
    // Get position data from text element
    const left = textElement.getAttribute('data-left') || textElement.style.left;
    const top = textElement.getAttribute('data-top') || textElement.style.top;
    const width = textElement.getAttribute('data-width') || textElement.offsetWidth;
    const height = textElement.getAttribute('data-height') || textElement.offsetHeight;
    
    highlight.style.cssText = `
      position: absolute;
      left: ${typeof left === 'string' ? left : left + 'px'};
      top: ${typeof top === 'string' ? top : (top - height) + 'px'};
      width: ${typeof width === 'string' ? width : width + 'px'};
      height: ${typeof height === 'string' ? height : height + 'px'};
      background-color: rgba(255, 235, 59, 0.3);
      border: 1px solid rgba(255, 193, 7, 0.6);
      border-radius: 2px;
      pointer-events: none;
      z-index: 0;
      mix-blend-mode: multiply;
      transition: background-color 0.2s ease;
    `;
    
    // Add citation data for potential interactions
    highlight.setAttribute('data-citation-id', citation.id || '');
    highlight.setAttribute('data-citation-page', citation.page || '');
    
    highlightLayerRef.current.appendChild(highlight);
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
                {/* PDF Canvas */}
                <canvas ref={canvasRef} className="block max-w-full" />
                
                {/* Highlight layer - Behind text for proper layering */}
                <div
                  ref={highlightLayerRef}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{ 
                    zIndex: 0,
                  }}
                />
                
                {/* Text layer - Above highlights for selection */}
                <div
                  ref={textLayerRef}
                  className="absolute top-0 left-0"
                  style={{ 
                    pointerEvents: 'auto',
                    userSelect: 'text',
                    zIndex: 1,
                  }}
                />
                
                {/* Loading overlay */}
                {loading && (
                  <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center" style={{ zIndex: 100 }}>
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

      {/* Enhanced CSS for better text selection and highlighting */}
      <style jsx>{`
        .pdf-text-item {
          position: absolute !important;
          color: transparent !important;
          user-select: text !important;
          cursor: text !important;
          white-space: nowrap !important;
          pointer-events: auto !important;
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          margin: 0 !important;
          line-height: 1 !important;
          z-index: 1 !important;
        }
        
        .pdf-text-item::selection {
          background-color: rgba(0, 123, 255, 0.3) !important;
          color: transparent !important;
        }
        
        .pdf-text-item::-moz-selection {
          background-color: rgba(0, 123, 255, 0.3) !important;
          color: transparent !important;
        }
        
        .pdf-highlight {
          position: absolute !important;
          background-color: rgba(255, 235, 59, 0.3) !important;
          border: 1px solid rgba(255, 193, 7, 0.6) !important;
          border-radius: 2px !important;
          pointer-events: none !important;
          z-index: 0 !important;
          mix-blend-mode: multiply !important;
          transition: background-color 0.2s ease !important;
        }
        
        .pdf-highlight:hover {
          background-color: rgba(255, 193, 7, 0.4) !important;
        }
        
        /* Ensure proper layering */
        canvas {
          position: relative;
          z-index: -1;
        }
      `}</style>
    </div>
  );
});

export default RightPanel;