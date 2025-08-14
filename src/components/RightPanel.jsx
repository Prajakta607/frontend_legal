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

      // Clear existing text layer
      textLayerRef.current.innerHTML = "";
      textLayerRef.current.style.width = viewport.width + "px";
      textLayerRef.current.style.height = viewport.height + "px";

      // Create text layer elements
      textContent.items.forEach((textItem, index) => {
        const textElement = document.createElement("span");
        textElement.textContent = textItem.str;
        textElement.className = "text-layer-item";
        textElement.dataset.textIndex = index;
        
        // Calculate position and size
        const tx = textItem.transform;
        const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
        const fontAscent = fontHeight;
        
        const left = tx[4];
        const top = viewport.height - tx[5] - fontAscent;
        const fontSize = fontHeight;
        
        // Apply styles for proper positioning and selectability
        Object.assign(textElement.style, {
          position: 'absolute',
          left: left + 'px',
          top: top + 'px',
          fontSize: fontSize + 'px',
          fontFamily: textItem.fontName || 'sans-serif',
          // Make text selectable with very low opacity instead of transparent
          color: 'rgba(0, 0, 0, 0.01)',
          userSelect: 'text',
          cursor: 'text',
          whiteSpace: 'pre',
          transformOrigin: '0 0',
          // Enhanced selectability
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text',
          // Ensure text is above canvas but below highlights
          zIndex: '10',
          pointerEvents: 'auto'
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
      Object.assign(el.style, {
        backgroundColor: '',
        // Reset to low opacity instead of transparent for selectability
        color: 'rgba(0, 0, 0, 0.01)',
        padding: '',
        borderRadius: '',
        boxShadow: '',
        zIndex: '10'
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

    const textElements = textLayerRef.current.querySelectorAll('.text-layer-item');
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
    
    textElements.forEach(element => {
      const textLength = element.textContent.length;
      const elementStart = currentIndex;
      const elementEnd = currentIndex + textLength;
      
      // Check if this element overlaps with our search text
      if (elementStart < startIndex + searchLength && elementEnd > startIndex) {
        highlightElement(element);
      }
      
      currentIndex = elementEnd + 1; // +1 for space between elements
    });
  };

  const highlightWordMatch = (textElements, searchText) => {
    const words = searchText.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    
    textElements.forEach(element => {
      const elementText = element.textContent.toLowerCase();
      const matchingWords = words.filter(word => elementText.includes(word));
      
      // Highlight if element contains significant words from the search text
      if (matchingWords.length > 0 && matchingWords.length / words.length > 0.3) {
        highlightElement(element);
      }
    });
  };

  const highlightElement = (element) => {
    element.classList.add("citation-highlight");
    Object.assign(element.style, {
      backgroundColor: '#ffeb3b',
      color: '#000000', // Full opacity for highlighted text
      padding: '2px 4px',
      borderRadius: '3px',
      boxShadow: '0 1px 3px rgba(255, 235, 59, 0.5)',
      zIndex: '100', // Higher z-index for highlighted text
      position: 'relative'
    });
  };

  // Add function to copy selected text
  const copySelectedText = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const selectedText = selection.toString();
      if (selectedText) {
        navigator.clipboard.writeText(selectedText).then(() => {
          console.log('Text copied to clipboard');
          // You can add a toast notification here if needed
        }).catch(err => {
          console.error('Failed to copy text: ', err);
        });
      }
    }
  };

  // Add keyboard shortcut for copying
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        copySelectedText();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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
            className="p-2 rounded hover:bg-gray-200 text-sm text-gray-600"
            title="Copy selected text (Ctrl+C)"
          >
            Copy Text
          </button>
          
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
                    WebkitUserSelect: 'text',
                    MozUserSelect: 'text',
                    msUserSelect: 'text'
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

      {/* Enhanced CSS for text layer and highlights */}
      <style jsx>{`
        .text-layer {
          font-size: 1px;
          line-height: 1;
          user-select: text;
        }
        
        .text-layer-item {
          position: absolute;
          color: rgba(0, 0, 0, 0.01);
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          cursor: text;
          white-space: pre;
          transform-origin: 0 0;
          z-index: 10;
          pointer-events: auto;
        }
        
        .citation-highlight {
          background-color: #ffeb3b !important;
          color: #000000 !important;
          padding: 2px 4px !important;
          border-radius: 3px !important;
          box-shadow: 0 1px 3px rgba(255, 235, 59, 0.5) !important;
          z-index: 100 !important;
          position: relative !important;
        }
        
        .citation-highlight:hover {
          background-color: #ffc107 !important;
          box-shadow: 0 2px 6px rgba(255, 193, 7, 0.6) !important;
        }
        
        .text-layer-item::selection {
          background-color: rgba(0, 123, 255, 0.3) !important;
          color: #000000 !important;
        }
        
        .citation-highlight::selection {
          background-color: rgba(0, 123, 255, 0.5) !important;
          color: #000000 !important;
        }
        
        /* Ensure text selection works properly */
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