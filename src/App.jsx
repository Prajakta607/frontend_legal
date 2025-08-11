import React, { useState, useRef } from "react";
import LeftPanel from "./components/LeftPanel";
import RightPanel from "./components/RightPanel";

export default function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [citations, setCitations] = useState([]);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [docId, setDocId] = useState(null);
  const viewerRef = useRef();

 

  // Ask backend a question
  const handleSend = async () => {
  if (!message.trim()) return;

  const formData = new FormData();
  if (pdfFile) {
    formData.append("file", pdfFile);
  }
  formData.append("question", message);
  formData.append("question_type", "general_question"); // or "summary", "chronology" as needed

  try {
    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL
    const res = await fetch(`${BACKEND_URL}/ask`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setAnswer(data.answer || "");
    setCitations(data.citations || []);
  } catch (err) {
    console.error("Ask failed:", err);
  }
  setMessage("");
};

  // Scroll & highlight citation in RightPanel
  const handleCitationClick = (citation) => {
    if (viewerRef.current) {
      viewerRef.current.scrollToCitation(citation);
    }
  };

  return (
    <div className="h-screen flex bg-gray-100">
      {/* PDF Viewer on LEFT */}
      <RightPanel ref={viewerRef} pdfFile={pdfFile} citations={citations} />

      {/* ChatGPT-style QA + citations on RIGHT */}
      <LeftPanel
        answer={answer}
        citations={citations}
        message={message}
        setMessage={setMessage}
        onSend={handleSend}
        onCitationClick={handleCitationClick}
      />
    </div>
  );
}

