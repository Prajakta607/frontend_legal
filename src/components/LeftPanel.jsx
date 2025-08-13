import React, { useState } from "react";
import { PaperClipIcon, DocumentIcon, CalendarIcon, UserIcon } from "@heroicons/react/24/outline";

export default function LeftPanel({
  answer,
  citedPagesMetadata,
  message,
  setMessage,
  onSend,
  onUpload,
  onCitationClick,
  isLoading,
}) {
  const [showMetadataDetails, setShowMetadataDetails] = useState(false);

  // Assign a consistent color for each page
  const colors = [
    "bg-yellow-300",
    "bg-green-300",
    "bg-blue-300",
    "bg-purple-300",
    "bg-pink-300",
    "bg-orange-300",
    "bg-red-300",
    "bg-indigo-300",
    "bg-teal-300",
    "bg-gray-300",
  ];

  const getColorForPage = (page) => colors[(page - 1) % colors.length];

  // Get unique pages from citations
  const uniquePages = [...new Set(citedPagesMetadata.map(c => c.page))].sort((a, b) => a - b);

  // Handle pressing Enter key in input to send the message
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && message.trim() && !isLoading) {
      onSend();
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  // Format file size for display
  const formatFileSize = (size) => {
    if (!size || size === 0) return null;
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  // Get document metadata (from first citation if available)
  const documentMetadata = citedPagesMetadata.length > 0 ? citedPagesMetadata[0] : null;

  return (
    <div className="w-[35%] flex flex-col border-l bg-white">
      {/* Answer display area */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-blue-600">Processing your question...</span>
            </div>
          </div>
        )}

        {answer && (
          <div className="mb-4 p-3 rounded-lg bg-gray-100 border break-words whitespace-pre-wrap">
            {answer}
          </div>
        )}

        {/* Document metadata section */}
        {documentMetadata && (
          <div className="mb-4 p-3 rounded-lg bg-slate-50 border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center">
                <DocumentIcon className="w-4 h-4 mr-1" />
                Document Information
              </h3>
              <button
                onClick={() => setShowMetadataDetails(!showMetadataDetails)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showMetadataDetails ? 'Hide' : 'Show'} Details
              </button>
            </div>
            
            <div className="text-xs text-gray-600">
              <div className="font-medium">{documentMetadata.document_title || documentMetadata.file_name}</div>
              
              {showMetadataDetails && (
                <div className="mt-2 space-y-1">
                  {documentMetadata.author && (
                    <div className="flex items-center">
                      <UserIcon className="w-3 h-3 mr-1" />
                      <span>Author: {documentMetadata.author}</span>
                    </div>
                  )}
                  {documentMetadata.creation_date && (
                    <div className="flex items-center">
                      <CalendarIcon className="w-3 h-3 mr-1" />
                      <span>Created: {formatDate(documentMetadata.creation_date)}</span>
                    </div>
                  )}
                  {documentMetadata.total_pages && (
                    <div>Total Pages: {documentMetadata.total_pages}</div>
                  )}
                  {documentMetadata.file_size && (
                    <div>File Size: {formatFileSize(documentMetadata.file_size)}</div>
                  )}
                  {documentMetadata.document_type && (
                    <div>Type: {documentMetadata.document_type}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Citation page buttons */}
        {uniquePages.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Referenced Pages:</h4>
            <div className="flex flex-wrap gap-2 mb-2">
              {uniquePages.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => {
                    // Find first citation for this page
                    const citationForPage = citedPagesMetadata.find(c => c.page === pageNum);
                    if (citationForPage) {
                      onCitationClick(citationForPage);
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-sm font-semibold text-gray-800 ${getColorForPage(
                    pageNum
                  )} hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-400`}
                  aria-label={`Go to page ${pageNum} citation`}
                  title={`Go to page ${pageNum}`}
                >
                  Page {pageNum}
                </button>
              ))}
            </div>

            {/* Individual citations with preview */}
            <div className="space-y-2">
              {citedPagesMetadata.map((citation, idx) => (
                <button
                  key={`${citation.source_id}-${citation.page}-${idx}`}
                  onClick={() => onCitationClick(citation)}
                  className="w-full text-left p-2 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                  title="Click to view in document"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium text-gray-800 ${getColorForPage(citation.page)}`}>
                          Page {citation.page}
                        </span>
                        {citation.file_name && citation.file_name !== citation.document_title && (
                          <span className="text-xs text-gray-500 truncate">
                            {citation.file_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 line-clamp-2">
                        {citation.content_preview || citation.quote}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input area for question and file upload */}
      <div className="p-3 border-t bg-white flex items-center space-x-2">
        <label
          htmlFor="file-upload"
          className="cursor-pointer p-1 rounded hover:bg-gray-200"
          aria-label="Upload PDF"
          title="Upload PDF"
        >
          <PaperClipIcon className="w-6 h-6 text-gray-500" />
        </label>
        <input
          id="file-upload"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files.length > 0) onUpload(e.target.files[0]);
            e.target.value = null;
          }}
          disabled={isLoading}
        />
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a legal question..."
          className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring focus:ring-blue-200 disabled:bg-gray-100"
          aria-label="Type your legal question"
          disabled={isLoading}
        />
        <button
          onClick={onSend}
          disabled={!message.trim() || isLoading}
          className={`px-4 py-2 rounded-lg text-white ${
            message.trim() && !isLoading
              ? "bg-blue-500 hover:bg-blue-600"
              : "bg-blue-300 cursor-not-allowed"
          }`}
          aria-disabled={!message.trim() || isLoading}
        >
          {isLoading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}