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
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Render PDF page WITHOUT text (text will be rendered separately)
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        // Disable text rendering completely on canvas
        intent: 'display'
      };
      
      const renderTask = page.render(renderContext);
      await renderTask.promise;

      // Render actual selectable text layer
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
      if (highlightLayerRef.current) {
        highlightLayerRef.current.innerHTML = "";
      }

      // Set container dimensions
      textLayerRef.current.style.width = viewport.width + "px";
      textLayerRef.current.style.height = viewport.height + "px";

      // Use PDF.js TextLayerBuilder approach for accurate text positioning
      const textLayerDiv = textLayerRef.current;
      
      // Clear and prepare the text layer
      textLayerDiv.innerHTML = '';
      
      // Create text layer elements with PDF.js standard positioning
      textContent.items.forEach((textItem, index) => {
        const textElement = document.createElement('span');
        textElement.textContent = textItem.str;
        textElement.dataset.textIndex = index;
        
        // Get transformation matrix from PDF.js
        const transform = textItem.transform;
        const [scaleX, skewX, skewY, scaleY, translateX, translateY] = transform;
        
        // Calculate proper positioning
        const fontSize = Math.sqrt(scaleY * scaleY + skewY * skewY);
        const fontWidth = Math.sqrt(scaleX * scaleX + skewX * skewX);
        
        // Position text element
        textElement.style.position = 'absolute';
        textElement.style.left = translateX + 'px';
        textElement.style.top = (viewport.height - translateY - fontSize) + 'px';
        textElement.style.fontSize = fontSize + 'px';
        textElement.style.fontFamily = textItem.fontName || 'sans-serif';
        textElement.style.color = '#000';
        textElement.style.whiteSpace = 'pre';
        textElement.style.transformOrigin = '0% 0%';
        
        // Apply transformation if needed (for rotated or skewed text)
        if (scaleX !== fontWidth || skewX !== 0 || skewY !== 0 || scaleY !== -fontSize) {
          const normalizedScaleX = scaleX / fontWidth;
          const normalizedSkewX = skewX / fontWidth;
          const normalizedSkewY = -skewY / fontSize;
          const normalizedScaleY = -scaleY / fontSize;
          
          textElement.style.transform = `matrix(${normalizedScaleX}, ${-normalizedSkewX}, ${normalizedSkewY}, ${normalizedScaleY}, 0, 0)`;
        }
        
        // Make text selectable
        textElement.style.userSelect = 'text';
        textElement.style.cursor = 'text';
        textElement.style.pointerEvents = 'auto';
        
        textElement.className = 'pdf-text-item';
        textLayerDiv.appendChild(textElement);
      });

    } catch (err) {
      console.error("Error rendering text layer:", err);
    }
  };

  const clearHighlights = () => {
    if (!textLayerRef.current) return;
    
    const textElements = textLayerRef.current.querySelectorAll('.pdf-text-item');
    textElements.forEach(el => {
      el.classList.remove('citation-highlight');
      el.style.backgroundColor = '';
      el.style.boxShadow = '';
      el.style.borderRadius = '';
      el.style.padding = '';
      el.style.margin = '';
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

    const textElements = Array.from(textLayerRef.current.querySelectorAll('.pdf-text-item'));
    
    // Clean and normalize search text
    const cleanSearchText = searchText.replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Build full text from elements
    const fullText = textElements.map(el => el.textContent).join(' ').toLowerCase();
    const searchIndex = fullText.indexOf(cleanSearchText);
    
    if (searchIndex !== -1) {
      // Exact match found
      highlightExactMatch(textElements, cleanSearchText, fullText, searchIndex);
    } else {
      // Try word-based matching
      highlightWordBasedMatch(textElements, cleanSearchText);
    }
  };

  const highlightExactMatch = (textElements, searchText, fullText, searchStartIndex) => {
    const searchEndIndex = searchStartIndex + searchText.length;
    let currentPosition = 0;
    
    textElements.forEach((element) => {
      const elementText = element.textContent;
      const elementStart = currentPosition;
      const elementEnd = currentPosition + elementText.length;
      
      // Check if this element intersects with the search text
      if (elementStart < searchEndIndex && elementEnd > searchStartIndex) {
        highlightElement(element);
      }
      
      currentPosition = elementEnd + 1; // +1 for space
    });
  };

  const highlightWordBasedMatch = (textElements, searchText) => {
    const searchWords = searchText.split(/\s+/).filter(word => word.length > 2);
    
    textElements.forEach((element) => {
      const elementText = element.textContent.toLowerCase();
      const matchCount = searchWords.filter(word => 
        elementText.includes(word) || word.includes(elementText.trim())
      ).length;
      
      // Highlight if significant portion of search words match
      if (matchCount > 0 && (matchCount / searchWords.length) >= 0.3) {
        highlightElement(element);
      }
    });
  };

  const highlightElement = (element) => {
    element.classList.add('citation-highlight');
    element.style.backgroundColor = 'rgba(255, 235, 59, 0.7)';
    element.style.boxShadow = '0 0 0 2px rgba(255, 193, 7, 0.4)';
    element.style.borderRadius = '2px';
    element.style.padding = '1px 2px';
    element.style.margin = '-1px -2px';
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

  const showCopyFeedback = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      const feedback = document.createElement('div');
      feedback.textContent = '✓ Copied!';
      feedback.style.cssText = `
        position: fixed;
        top: ${rect.top - 35}px;
        left: ${rect.left + rect.width / 2 - 35}px;
        background: #4CAF50;
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 10000;
        pointer-events: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;
      
      document.body.appendChild(feedback);
      setTimeout(() => {
        if (document.body.contains(feedback)) {
          document.body.removeChild(feedback);
        }
      }, 2000);
    }
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          e.preventDefault();
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
            📋 Copy Text
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
                {/* PDF Canvas (without text) */}
                <canvas ref={canvasRef} className="block max-w-full" />
                
                {/* Actual PDF Text Layer */}
                <div
                  ref={textLayerRef}
                  className="absolute top-0 left-0 pdf-text-layer"
                />
                
                {/* Highlight Layer */}
                <div
                  ref={highlightLayerRef}
                  className="absolute top-0 left-0 highlight-layer pointer-events-none"
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

      {/* Styles for actual PDF text highlighting */}
      <style jsx>{`
        .pdf-text-layer {
          user-select: text;
          pointer-events: auto;
        }
        
        .pdf-text-item {
          position: absolute;
          color: #000000;
          white-space: pre;
          cursor: text;
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          pointer-events: auto;
        }
        
        .pdf-text-item.citation-highlight {
          background-color: rgba(255, 235, 59, 0.7) !important;
          box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.4) !important;
          border-radius: 2px !important;
          padding: 1px 2px !important;
          margin: -1px -2px !important;
        }
        
        .pdf-text-item.citation-highlight:hover {
          background-color: rgba(255, 193, 7, 0.8) !important;
          box-shadow: 0 0 0 2px rgba(255, 152, 0, 0.6) !important;
        }
        
        .pdf-text-item::selection {
          background-color: rgba(0, 123, 255, 0.3);
        }
        
        .citation-highlight::selection {
          background-color: rgba(0, 123, 255, 0.5);
        }
        
        .highlight-layer {
          pointer-events: none;
          z-index: 1;
        }
      `}</style>
    </div>
  );
});

export default RightPanel;