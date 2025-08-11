import React from "react";
import { PaperClipIcon } from "@heroicons/react/24/outline";

export default function LeftPanel({
  answer,
  citations,
  message,
  setMessage,
  onSend,
  onUpload,
  onCitationClick,
}) {
  // Assign a consistent color for each page
  const colors = [
    "bg-yellow-300",
    "bg-green-300",
    "bg-blue-300",
    "bg-purple-300",
    "bg-pink-300",
    "bg-orange-300",
  ];
  const getColorForPage = (page) => colors[(page - 1) % colors.length];

  // Handle pressing Enter key in input to send the message
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && message.trim()) {
      onSend();
    }
  };

  return (
    <div className="w-[35%] flex flex-col border-l bg-white">
      {/* Answer display area */}
      <div className="flex-1 overflow-y-auto p-4">
        {answer && (
          <div className="mb-4 p-3 rounded-lg bg-gray-100 border break-words whitespace-pre-wrap">
            {answer}
          </div>
        )}

        {/* Citation page buttons */}
        {citations.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {citations.map((c, idx) => (
              <button
                key={idx}
                onClick={() => onCitationClick(c)}
                className={`px-3 py-1 rounded-full text-sm font-semibold text-gray-800 ${getColorForPage(
                  c.page
                )} hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-400`}
                aria-label={`Go to page ${c.page} citation`}
                title={`Go to page ${c.page}`}
              >
                Page {c.page}
              </button>
            ))}
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
            e.target.value = null; // Reset input so same file can be uploaded again if needed
          }}
        />
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a legal question..."
          className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring focus:ring-blue-200"
          aria-label="Type your legal question"
        />
        <button
          onClick={onSend}
          disabled={!message.trim()}
          className={`px-4 py-2 rounded-lg text-white ${
            message.trim()
              ? "bg-blue-500 hover:bg-blue-600"
              : "bg-blue-300 cursor-not-allowed"
          }`}
          aria-disabled={!message.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
