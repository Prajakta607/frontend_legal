import React, { useState, useRef } from "react";
import LeftPanel from "./components/LeftPanel";
import RightPanel from "./components/RightPanel";

export default function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [citedPagesMetadata, setCitedPagesMetadata] = useState([]);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [docId, setDocId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const viewerRef = useRef();

  // Ask backend a question
  const handleSend = async () => {
    if (!message.trim()) return;

    setIsLoading(true);
    const formData = new FormData();
    if (pdfFile) {
      formData.append("file", pdfFile);
    }
    formData.append("question", message);
    formData.append("question_type", "general_question");

    try {
      const BACKEND_URL ='http://localhost:8000';
      const res = await fetch(`${BACKEND_URL}/ask`, {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      setAnswer(data.answer || "");
      setCitedPagesMetadata(data.cited_pages_metadata || []);
      
      // Set docId if provided
      if (data.doc_id) {
        setDocId(data.doc_id);
      }
    } catch (err) {
      console.error("Ask failed:", err);
      setAnswer("Sorry, there was an error processing your request.");
      setCitedPagesMetadata([]);
    } finally {
      setIsLoading(false);
      setMessage("");
    }
  };

  // Scroll & highlight citation in RightPanel
  const handleCitationClick = (citationMetadata) => {
    if (viewerRef.current) {
      viewerRef.current.scrollToCitation(citationMetadata);
    }
  };

  const handleUpload = (file) => {
    setPdfFile(file);
    // Reset previous results when new file is uploaded
    setAnswer("");
    setCitedPagesMetadata([]);
    setDocId(null);
  };

  return (
    <div className="h-screen flex bg-gray-100">
      {/* PDF Viewer on LEFT */}
      <RightPanel 
        ref={viewerRef} 
        pdfFile={pdfFile} 
        citedPagesMetadata={citedPagesMetadata}
        docId={docId}
      />

      {/* ChatGPT-style QA + citations on RIGHT */}
      <LeftPanel
        answer={answer}
        citedPagesMetadata={citedPagesMetadata}
        message={message}
        setMessage={setMessage}
        onSend={handleSend}
        onCitationClick={handleCitationClick}
        onUpload={handleUpload}
        isLoading={isLoading}
      />
    </div>
  );
}