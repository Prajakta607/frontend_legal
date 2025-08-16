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
  const [caseId, setCaseId] = useState(() => {
    // Initialize case_id from localStorage on component mount
    return localStorage.getItem("case_id") || null;
  });
  const viewerRef = useRef();

  // Ask backend a question
  const handleSend = async () => {
    if (!message.trim()) return;

    // Prevent sending if no file and no case_id
    if (!pdfFile && !caseId) {
      console.error("No file uploaded and no active session");
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    
    // Add question and question_type
    formData.append("question", message);
    formData.append("question_type", "general_question");
    
    // Logic: Send case_id if we have one, otherwise send file
    if (caseId) {
      formData.append("case_id", caseId);
      console.log("🔄 SUBSEQUENT REQUEST - Sending with case_id:", caseId);
    } else if (pdfFile) {
      formData.append("file", pdfFile);
      console.log("🆕 FIRST REQUEST - Sending with new file:", pdfFile.name);
    }

    // Debug: Log what we're sending
    console.log("📤 FormData contents:");
    for (let pair of formData.entries()) {
      console.log(`  ${pair[0]}:`, pair[1]);
    }

    try {
      const BACKEND_URL = 'http://localhost:8000';
      const res = await fetch(`${BACKEND_URL}/ask`, {
        method: "POST",
        body: formData,
      });
      
      console.log("📡 Response status:", res.status);
      console.log("📡 Response ok:", res.ok);
      
      if (!res.ok) {
        // Handle case where case_id might be invalid/expired
        if ((res.status === 404 || res.status === 400) && caseId) {
          console.warn("⚠️ Case ID invalid/expired, clearing session");
          localStorage.removeItem("case_id");
          setCaseId(null);
          setAnswer("Your session has expired. Please upload the PDF file again to continue.");
          setIsLoading(false);
          return;
        }
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      // Get raw response text first
      const responseText = await res.text();
      console.log("📥 Raw response text:", responseText);
      
      // Parse JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("❌ JSON parse error:", parseError);
        console.error("📄 Response text that failed to parse:", responseText);
        throw new Error("Invalid JSON response from server");
      }
      
      // Enhanced debug logging
      console.log("=== 📋 FULL BACKEND RESPONSE ===");
      console.log("Raw response object:", data);
      console.log("Response keys:", Object.keys(data));
      console.log("✅ answer:", data.answer ? "Present" : "Missing");
      console.log("✅ cited_pages_metadata:", data.cited_pages_metadata ? "Present" : "Missing"); 
      console.log("✅ case_id:", data.case_id ? `Present: ${data.case_id}` : "Missing");
      console.log("✅ case_id type:", typeof data.case_id);
      console.log("Current stored case_id:", caseId);
      console.log("================================");
      
      // Store case_id if it's new (from first upload)
      if (data.case_id) {
        if (data.case_id !== caseId) {
          console.log("💾 Storing NEW case_id:", data.case_id);
          localStorage.setItem("case_id", data.case_id);
          setCaseId(data.case_id);
        } else {
          console.log("ℹ️ Same case_id returned:", data.case_id);
        }
      } else {
        console.warn("⚠️ No case_id in response!");
      }
      
      setAnswer(data.answer || "");
      setCitedPagesMetadata(data.cited_pages_metadata || []);
      
      // Set docId if provided
      if (data.doc_id) {
        setDocId(data.doc_id);
      }
      
      console.log("✅ State updated successfully");
      
    } catch (err) {
      console.error("❌ Ask failed:", err);
      setAnswer("Sorry, there was an error processing your request.");
      setCitedPagesMetadata([]);
      
      // Clear invalid case_id on certain errors
      if (err.message.includes('404') || err.message.includes('400')) {
        localStorage.removeItem("case_id");
        setCaseId(null);
      }
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
    
    // Clear case_id when new file is uploaded to start fresh session
    localStorage.removeItem("case_id");
    setCaseId(null);
    
    console.log("🆕 New file uploaded, starting fresh session");
  };

  // Clear session function
  const handleNewSession = () => {
    setPdfFile(null);
    setAnswer("");
    setCitedPagesMetadata([]);
    setDocId(null);
    setMessage("");
    localStorage.removeItem("case_id");
    setCaseId(null);
    console.log("🔄 Session cleared");
  };

  // Function to check if we have an active session
  // Changed: Only need case_id OR file to have a session
  const hasActiveSession = () => {
    return !!(caseId || pdfFile);
  };

  // Function to check if we can send messages
  const canSendMessage = () => {
    return !!(caseId || pdfFile) && message.trim() && !isLoading;
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
        hasActiveSession={hasActiveSession()}
        canSendMessage={canSendMessage()}
        onNewSession={handleNewSession}
        caseId={caseId}
      />
    </div>
  );
}