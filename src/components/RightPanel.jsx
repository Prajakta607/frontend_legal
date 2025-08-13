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
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [textLayer, setTextLayer] = useState(null);
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

  // Clear highlights when citations change
  useEffect(() => {
    if (textLayerRef.current) {
      clearHighlights();
    }
  }, [citedPagesMetadata]);

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

      // Render PDF page
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      await page.render(renderContext).promise;

      // Render text layer for text selection and highlighting
      await renderTextLayer(page, viewport);
      
      // Apply highlights for current page
      highlightCurrentPageCitations();
      
    } catch (err) {
      console.error("Error rendering page:", err);
      setError("Failed to render page");
    } finally {
      setLoading(false);
    }
  };

  const renderTextLayer = async (page, viewport) => {
    if (!textLayerRef.current) return;

    // Clear existing text layer
    textLayerRef.current.innerHTML = "";
    textLayerRef.current.style.width = viewport.width + "px";
    textLayerRef.current.style.height = viewport.height + "px";

    try {
      const textContent = await page.getTextContent();
      setTextLayer(textContent);

      // Render text items
      textContent.items.forEach((textItem, index) => {
        const textDiv = document.createElement("div");
        textDiv.textContent = textItem.str;
        textDiv.style.position = "absolute";
        
        // Transform coordinates
        const transform = textItem.transform;
        const x = transform[4];
        const y = viewport.height - transform[5];
        
        textDiv.style.left = x + "px";
        textDiv.style.top = (y - textItem.height) + "px";
        textDiv.style.fontSize = (textItem.height * scale) + "px";
        textDiv.style.fontFamily = textItem.fontName || "sans-serif";
        textDiv.style.color = "transparent";
        textDiv.style.userSelect = "text";
        textDiv.dataset.textIndex = index;
        
        textLayerRef.current.appendChild(textDiv);
      });
    } catch (err) {
      console.error("Error rendering text layer:", err);
    }
  };

  const clearHighlights = () => {
    if (textLayerRef.current) {
      const highlightedElements = textLayerRef.current.querySelectorAll(".citation-highlight");
      highlightedElements.forEach(el => {
        el.classList.remove("citation-highlight");
        el.style.backgroundColor = "";
      });
    }
  };

  const highlightCurrentPageCitations = () => {
    if (!textLayer || !textLayerRef.current) return;

    // Get citations for current page
    const currentPageCitations = citedPagesMetadata.filter(citation => citation.page === currentPage);
    
    currentPageCitations.forEach(citation => {
      highlightTextInLayer(citation);
    });
  };

  const highlightTextInLayer = (citation) => {
    if (!textLayer || !textLayerRef.current) return;

    const searchText = citation.quote || citation.content_preview;
    if (!searchText) return;

    // Simple text highlighting - find matching text in the text layer
    const textItems = textLayerRef.current.querySelectorAll("div");
    const fullPageText = Array.from(textItems).map(el => el.textContent).join(" ");
    
    // Find the citation text in the page
    const searchIndex = fullPageText.toLowerCase().indexOf(searchText.toLowerCase());
    if (searchIndex === -1) return;

    // Highlight matching text divs
    let charCount = 0;
    textItems.forEach(textDiv => {
      const textLength = textDiv.textContent.length;
      const textStart = charCount;
      const textEnd = charCount + textLength;

      // Check if this text div overlaps with our search text
      if (textStart <= searchIndex + searchText.length && textEnd >= searchIndex) {
        textDiv.classList.add("citation-highlight");
        textDiv.style.backgroundColor = "yellow";
        textDiv.style.opacity = "0.7";
      }

      charCount = textEnd + 1; // +1 for space between text items
    });
  };

  const scrollToCitation = (citation) => {
    // Navigate to the page of the citation
    if (citation.page !== currentPage) {
      setCurrentPage(citation.page);
    }
    
    // Set this citation as highlighted
    setHighlightedCitation(citation);
    
    // Scroll citation into view after a short delay to ensure page is rendered
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollIntoView({ 
          behavior: "smooth", 
          block: "center" 
        });
      }
    }, 100);
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
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          
          <span className="text-sm text-gray-600">
            {loading ? "Loading..." : `Page ${currentPage} of ${totalPages}`}
          </span>
          
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || loading}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <MagnifyingGlassMinusIcon className="w-5 h-5" />
          </button>
          
          <span className="text-sm text-gray-600 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          
          <button
            onClick={handleZoomIn}
            disabled={scale >= 3.0}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <MagnifyingGlassPlusIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto p-4">
        {error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            <div className="text-center">
              <div className="text-lg mb-2">Error loading PDF</div>
              <div className="text-sm">{error}</div>
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="flex justify-center">
            <div className="relative shadow-lg">
              <canvas ref={canvasRef} className="block" />
              {/* Text layer for selection and highlighting */}
              <div
                ref={textLayerRef}
                className="absolute top-0 left-0 pointer-events-none"
                style={{ 
                  fontSize: "1px",
                  lineHeight: 1,
                }}
              />
              {/* Loading overlay */}
              {loading && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span>Loading...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add CSS for highlights */}
      <style jsx>{`
        .citation-highlight {
          background-color: yellow !important;
          opacity: 0.7 !important;
        }
      `}</style>
    </div>
  );
});

export default RightPanel;