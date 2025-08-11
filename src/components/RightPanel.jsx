import React, { useEffect, forwardRef, useImperativeHandle, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import "pdfjs-dist/web/pdf_viewer.css";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

const RightPanel = forwardRef(({ pdfFile, citations }, ref) => {
  const containerRef = useRef();
  const pageWrappers = useRef({}); // pageNum -> wrapper div

  // Match colors from LeftPanel
  const colors = [
    "rgba(253, 224, 71, 0.4)",  // yellow-300
    "rgba(134, 239, 172, 0.4)", // green-300
    "rgba(147, 197, 253, 0.4)", // blue-300
    "rgba(216, 180, 254, 0.4)", // purple-300
    "rgba(249, 168, 212, 0.4)", // pink-300
    "rgba(253, 186, 116, 0.4)", // orange-300
  ];
  const getColorForPage = (page) => colors[(page - 1) % colors.length];

  useImperativeHandle(ref, () => ({
    scrollToCitation(citation) {
      if (!citation) return;
      const pageElement = pageWrappers.current[citation.page];
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: "smooth" });
        drawHighlights(citation.page, [citation]);
      }
    },
  }));

  // Draw highlight overlays
 const SCALE = 1.2;

function drawHighlights(pageNum, citationList) {
  const wrapper = pageWrappers.current[pageNum];
  if (!wrapper) return;

  // Remove old highlights
  wrapper.querySelectorAll(".citation-highlight").forEach((el) => el.remove());

  // Get the viewport height from the wrapper style (assuming wrapper height matches viewport height)
  const viewportHeight = parseFloat(wrapper.style.height);

  citationList.forEach((cit) => {
    const color = cit.color || getColorForPage(cit.page);
    (cit.rects || []).forEach((r) => {
      const overlay = document.createElement("div");
      overlay.className = "citation-highlight";
      overlay.style.position = "absolute";
      overlay.style.left = `${r.x * SCALE}px`;
      // Flip Y axis for PDF -> HTML coordinate system
      overlay.style.top = `${(viewportHeight - r.y - r.height) * SCALE}px`;
      overlay.style.width = `${r.width * SCALE}px`;
      overlay.style.height = `${r.height * SCALE}px`;
      overlay.style.backgroundColor = color;
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "10";
      wrapper.appendChild(overlay);
    });
  });
}


  // Render PDF
  useEffect(() => {
    if (!pdfFile) {
      containerRef.current.innerHTML = "<div class='p-6'>No PDF loaded</div>";
      return;
    }

    const reader = new FileReader();
    reader.onload = async function () {
      const arrayBuffer = this.result;
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

      containerRef.current.innerHTML = "";
      pageWrappers.current = {};

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1.2 });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-page-number", p);
        wrapper.style.position = "relative";
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;
        wrapper.className = "mb-4";

        wrapper.appendChild(canvas);
        containerRef.current.appendChild(wrapper);

        pageWrappers.current[p] = wrapper;

        await page.render({ canvasContext: ctx, viewport }).promise;
      }

      // Draw all highlights after rendering
      const grouped = citations.reduce((acc, cit) => {
        acc[cit.page] = acc[cit.page] || [];
        acc[cit.page].push(cit);
        return acc;
      }, {});
      Object.keys(grouped).forEach((page) => {
        drawHighlights(parseInt(page), grouped[page]);
      });
    };
    reader.readAsArrayBuffer(pdfFile);
  }, [pdfFile, citations]);

  return (
    <div className="flex-1 overflow-y-auto p-4" ref={containerRef}>
      <h2 className="text-lg font-semibold mb-3">Document Viewer</h2>
    </div>
  );
});

export default RightPanel;
