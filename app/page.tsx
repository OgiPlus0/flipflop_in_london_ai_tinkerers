"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  Menu, 
  MoreHorizontal, 
  GripVertical, 
  Type,
  Heading1,
  Heading2,
  Quote,
  X,
  FileJson,
  Zap,
  ChevronDown
} from "lucide-react";

// --- 1. Types ---

type BlockType = "text" | "h1" | "h2" | "blockquote" | "code";

type Block = {
  id: string;
  type: BlockType;
  content: string;
};

type Doc = {
  id: string;
  emoji: string;
  title: string;
  blocks: Block[];
  updatedAt: number;
};

type Toast = {
  id: string;
  docId: string;
  latestChange: string;
  fullPayloadSnippet: string;
};

// --- 2. Utils ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const serializeDoc = (doc: Doc) => {
  const blocksText = doc.blocks.map(b => {
    if (b.type === 'h1') return `# ${b.content}`;
    if (b.type === 'h2') return `## ${b.content}`;
    if (b.type === 'blockquote') return `> ${b.content}`;
    return b.content;
  }).join('\n');
  return `TITLE: ${doc.title}\n\n${blocksText}`;
};

// --- 3. Initial Data (ProtoColAi Specs) ---

const initialDocs: Doc[] = [
  {
    id: "doc_first",
    emoji: "🧙🏻‍♂️",
    title: "Welcome to ProtoColAi",
    blocks: [
      { id: "b1", type: "h1", content: "Editor Specifications" },
      { id: "b2", type: "text", content: "ProtoColAi is a block-based, dynamic editor. Every paragraph, heading, or list item is a distinct 'chunk' of data." },
      
      { id: "b3", type: "h2", content: "1. Block Management" },
      { id: "b4", type: "text", content: "Hover over any block to reveal controls:" },
      { id: "b5", type: "blockquote", content: "Left Side: Six-dot drag handle to reorder content.\nRight Side: Menu to switch between Text, H1, H2, and Quote." },
      
      { id: "b6", type: "h2", content: "2. Invisible Spacers" },
      { id: "b7", type: "text", content: "We support 'Ghost Blocks'. The space below this line contains an empty block. It is invisible until you click it." },
      { id: "b8", type: "text", content: "" }, // Hidden placeholder
      { id: "b9", type: "text", content: "See? Keeps the UI clean while allowing vertical whitespace." },

      { id: "b10", type: "h1", content: "Navigation & Data" },
      { id: "b11", type: "h2", content: "Sidebar TOC" },
      { id: "b12", type: "text", content: "Look at the sidebar on the left. It automatically generates a Table of Contents based on the H1 and H2 headers in this document." },
      
      { id: "b13", type: "h2", content: "Smart API Sync" },
      { id: "b14", type: "text", content: "Try editing this text and clicking away. If you change the text, a Toast appears. If you don't change anything, no request is sent." },
    ],
    updatedAt: Date.now(),
  },
];

export default function ProtoColAiApp() {
  // --- State ---
  const [docs, setDocs] = useState<Doc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>("");
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Refs
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const blockRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
  
  // Ref to track content before edit to prevent useless API calls
  const initialContentRef = useRef<string>("");

  // --- Effects ---

  useEffect(() => {
    const saved = localStorage.getItem("protocolai-final-data");
    if (saved) {
      const parsed = JSON.parse(saved);
      setDocs(parsed);
      if (parsed.length > 0) setActiveDocId(parsed[0].id);
    } else {
      setDocs(initialDocs);
      setActiveDocId(initialDocs[0].id);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("protocolai-final-data", JSON.stringify(docs));
    }
  }, [docs, isLoaded]);

  // --- Toast Logic ---

  const showToast = (docId: string, latestChange: string, fullPayload: string) => {
    const id = generateId();
    const payloadSnippet = fullPayload.length > 100 ? fullPayload.substring(0, 100) + "..." : fullPayload;
    const changeSnippet = latestChange.length > 40 ? latestChange.substring(0, 40) + "..." : latestChange;

    setToasts((prev) => [...prev, { id, docId, latestChange: changeSnippet, fullPayloadSnippet: payloadSnippet }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  // --- Actions ---

  const activeDoc = docs.find((d) => d.id === activeDocId);

  const createDoc = () => {
    const newDoc: Doc = {
      id: `doc_${generateId()}`,
      emoji: "📄",
      title: "",
      blocks: [{ id: generateId(), type: "text", content: "" }],
      updatedAt: Date.now(),
    };
    setDocs([...docs, newDoc]);
    setActiveDocId(newDoc.id);
  };

  const updateDoc = (field: keyof Doc, value: any) => {
    setDocs(docs.map(d => d.id === activeDocId ? { ...d, [field]: value } : d));
  };

  // --- SMART SYNC HANDLER ---
  const handleFocus = (content: string) => {
    initialContentRef.current = content;
  };

  const handleBlur = (currentContent: string) => {
    if (!activeDoc) return;
    
    // 1. Check if content actually changed
    if (currentContent.trim() === initialContentRef.current.trim()) {
      return; // Do nothing
    }

    // 2. If changed, Trigger Sync
    const fullPayload = serializeDoc(activeDoc);
    console.log("API SYNC (Changed):", { changed: currentContent, full: fullPayload });
    showToast(activeDoc.id, currentContent, fullPayload);
  };

  // --- Block Operations ---

  const updateBlock = (id: string, content: string) => {
    if (!activeDoc) return;
    const newBlocks = activeDoc.blocks.map(b => b.id === id ? { ...b, content } : b);
    updateDoc("blocks", newBlocks);
  };

  const changeBlockType = (id: string, type: BlockType) => {
    if (!activeDoc) return;
    const newBlocks = activeDoc.blocks.map(b => b.id === id ? { ...b, type } : b);
    updateDoc("blocks", newBlocks);
  };

  const addBlock = (index: number) => {
    if (!activeDoc) return;
    const newBlock: Block = { id: generateId(), type: "text", content: "" };
    const newBlocks = [...activeDoc.blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    updateDoc("blocks", newBlocks);
    setTimeout(() => blockRefs.current[newBlock.id]?.focus(), 0);
  };

  const removeBlock = (id: string) => {
    if (!activeDoc) return;
    if (activeDoc.blocks.length <= 1) return;
    const newBlocks = activeDoc.blocks.filter(b => b.id !== id);
    updateDoc("blocks", newBlocks);
  };

  const handleSort = () => {
    if (!activeDoc || dragItem.current === null || dragOverItem.current === null) return;
    const _blocks = [...activeDoc.blocks];
    const draggedBlock = _blocks[dragItem.current];
    _blocks.splice(dragItem.current, 1);
    _blocks.splice(dragOverItem.current, 0, draggedBlock);
    updateDoc("blocks", _blocks);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const scrollToBlock = (blockId: string) => {
    const element = blockRefs.current[blockId];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("bg-yellow-100/50"); 
      setTimeout(() => element.classList.remove("bg-yellow-100/50"), 1000);
    }
  };

  const adjustHeight = (e: any) => {
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  if (!isLoaded) return null;

  return (
    <div className="flex h-screen w-full bg-white text-[#37352f] font-sans overflow-hidden">
      
      {/* --- Sidebar --- */}
      <aside className={`${isSidebarOpen ? "w-80" : "w-0"} bg-[#F7F7F5] border-r border-gray-200 transition-all duration-300 flex flex-col flex-shrink-0 overflow-hidden`}>
        <div className="p-3 h-full flex flex-col">
          <div className="flex items-center gap-2 px-2 py-3 mb-2 hover:bg-gray-200 rounded cursor-pointer text-gray-700 font-medium transition-colors">
             <div className="w-5 h-5 bg-blue-600 rounded text-xs text-white flex items-center justify-center font-bold">P</div>
             <span>ProtoColAi</span>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {docs.map(doc => {
              const isActive = activeDocId === doc.id;
              const headings = doc.blocks.filter(b => b.type === 'h1' || b.type === 'h2');
              const firstContentBlock = doc.blocks.find(b => b.content.trim().length > 0);
              const hint = firstContentBlock ? firstContentBlock.content : "Empty";

              return (
                <div key={doc.id} className="group">
                  <div 
                    onClick={() => setActiveDocId(doc.id)} 
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors
                      ${isActive ? "bg-[#E0EFFF] text-blue-700" : "hover:bg-gray-200 text-gray-700"}
                    `}
                  >
                    <div className="flex-shrink-0">
                      {isActive && headings.length > 0 ? <ChevronDown size={14} className="text-blue-500"/> : <span className="w-3.5 block"/>}
                    </div>
                    <span className="text-lg leading-none">{doc.emoji}</span>
                    <div className="flex-1 overflow-hidden">
                        <div className={`truncate text-sm ${isActive ? "font-medium" : ""}`}>{doc.title || "Untitled"}</div>
                        <div className="text-[10px] text-gray-400 truncate opacity-80">{hint}</div>
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); if(window.confirm("Delete?")) { const n = docs.filter(d=>d.id!==doc.id); setDocs(n); if(activeDocId===doc.id && n.length) setActiveDocId(n[0].id); }}} 
                      className="opacity-0 group-hover:opacity-100 hover:text-red-600 ml-auto"
                    >
                      <X size={14}/>
                    </button>
                  </div>

                  {isActive && headings.length > 0 && (
                    <div className="relative ml-4 pl-4 border-l border-gray-200 space-y-0.5 my-1 animate-in slide-in-from-left-2 fade-in duration-200">
                      {headings.map(h => (
                        <div 
                          key={h.id}
                          onClick={(e) => { e.stopPropagation(); scrollToBlock(h.id); }}
                          className={`
                            cursor-pointer text-xs truncate py-1 px-2 rounded hover:bg-gray-200/50 transition-colors
                            ${h.type === 'h1' ? 'text-gray-600 font-medium' : 'text-gray-400 pl-3'}
                          `}
                        >
                          {h.content || "Untitled Section"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={createDoc} className="mt-4 flex items-center gap-2 px-3 py-1 text-sm text-gray-500 hover:bg-gray-200 w-full rounded transition-colors">
            <Plus size={14} /> New Page
          </button>
        </div>
      </aside>

      {/* --- Main Area --- */}
      <main className="flex-1 flex flex-col relative h-full">
        {/* Top Navbar */}
        <div className="h-12 flex items-center justify-between px-4 sticky top-0 bg-white/80 backdrop-blur z-20 border-b border-transparent">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Menu size={20}/></button>
            {activeDoc && <span className="text-sm font-medium ml-2">{activeDoc.emoji} {activeDoc.title || "Untitled"}</span>}
          </div>
          <button className="p-1 text-gray-400 hover:text-gray-600"><MoreHorizontal size={20}/></button>
        </div>

        {/* --- Editor --- */}
        {activeDoc ? (
          <div 
            className="flex-1 overflow-y-auto px-4 sm:px-12 md:px-24 pb-40 scroll-smooth"
            style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          >
            <div className="max-w-3xl mx-auto pt-12">
              <div className="w-16 h-16 mb-4 flex items-center justify-center text-5xl hover:bg-gray-100 rounded-lg cursor-pointer select-none transition-colors" 
                   onClick={() => updateDoc("emoji", "🧙🏻‍♂️")}>
                {activeDoc.emoji}
              </div>
              
              <input 
                className="w-full text-4xl font-bold text-gray-900 placeholder:text-gray-300 border-none focus:ring-0 p-0 mb-8 bg-transparent" 
                placeholder="Untitled" 
                value={activeDoc.title} 
                onChange={(e) => updateDoc("title", e.target.value)}
                onFocus={(e) => handleFocus(e.target.value)}
                onBlur={(e) => handleBlur(e.target.value)}
              />

              <div className="space-y-1">
                {activeDoc.blocks.map((block, index) => (
                  <div 
                    key={block.id}
                    className="group relative flex items-start -ml-10 pl-10 py-0.5"
                    draggable
                    onDragStart={() => (dragItem.current = index)}
                    onDragEnter={() => (dragOverItem.current = index)}
                    onDragEnd={handleSort}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    {/* Drag Handle */}
                    <div className="absolute left-0 top-1.5 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:bg-gray-200 rounded transition-all">
                      <GripVertical size={16} />
                    </div>

                    <div className="flex-1 relative">
                       <textarea
                         ref={el => { blockRefs.current[block.id] = el }}
                         value={block.content}
                         placeholder="Type something..."
                         className={`
                           w-full resize-none bg-transparent border-none focus:ring-0 p-0 leading-relaxed overflow-hidden block
                           placeholder:text-transparent focus:placeholder:text-gray-300
                           ${block.type === 'h1' ? 'text-3xl font-bold mt-4 mb-2' : ''}
                           ${block.type === 'h2' ? 'text-2xl font-semibold mt-3 mb-1' : ''}
                           ${block.type === 'blockquote' ? 'border-l-4 border-gray-800 pl-4 italic text-gray-600' : ''}
                           ${block.type === 'text' ? 'text-base text-gray-800 min-h-[24px]' : ''} 
                         `}
                         rows={1}
                         onFocus={(e) => handleFocus(e.target.value)}
                         onBlur={(e) => handleBlur(e.target.value)}
                         onChange={(e) => { updateBlock(block.id, e.target.value); adjustHeight(e); }}
                         onKeyDown={(e) => {
                           if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) {
                             e.preventDefault();
                             addBlock(index);
                           }
                           if (e.key === "Backspace" && block.content === "" && activeDoc.blocks.length > 1) {
                             e.preventDefault();
                             removeBlock(block.id);
                             if (index > 0) blockRefs.current[activeDoc.blocks[index-1].id]?.focus();
                           }
                         }}
                         style={{ height: 'auto' }}
                       />
                       
                       {/* Block Menu */}
                       <div className="absolute -right-24 top-0 hidden group-hover:flex gap-1 bg-white shadow-sm border rounded p-1 z-10">
                          <button onClick={() => changeBlockType(block.id, "text")} className="p-1 hover:bg-gray-100 rounded" title="Text"><Type size={14}/></button>
                          <button onClick={() => changeBlockType(block.id, "h1")} className="p-1 hover:bg-gray-100 rounded" title="H1"><Heading1 size={14}/></button>
                          <button onClick={() => changeBlockType(block.id, "h2")} className="p-1 hover:bg-gray-100 rounded" title="H2"><Heading2 size={14}/></button>
                          <button onClick={() => changeBlockType(block.id, "blockquote")} className="p-1 hover:bg-gray-100 rounded" title="Quote"><Quote size={14}/></button>
                       </div>
                    </div>
                  </div>
                ))}
              </div>

              <div 
                className="mt-4 opacity-0 hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-2 text-gray-400" 
                onClick={() => addBlock(activeDoc.blocks.length - 1)}
              >
                <Plus size={18} /> <span>Click to add block</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400" 
               style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
             <p>Select a page</p>
          </div>
        )}

        {/* --- DETAILED TOAST --- */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
          {toasts.map((toast) => (
            <div key={toast.id} className="bg-[#1f1f1f] text-white p-3 rounded-lg shadow-xl border border-gray-700 animate-in slide-in-from-bottom-5 fade-in duration-300">
              <div className="flex items-center gap-2 mb-2 border-b border-gray-700 pb-2">
                <FileJson className="text-green-400" size={16} />
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Sync Request • {toast.docId}</span>
              </div>
              <div className="mb-2">
                <div className="flex items-center gap-1.5 text-xs text-yellow-500 font-semibold mb-1">
                  <Zap size={12} /> Latest Change
                </div>
                <div className="text-sm bg-yellow-500/10 text-yellow-200 px-2 py-1 rounded truncate">"{toast.latestChange}"</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold mb-1">Full Document Payload</div>
                <div className="text-[10px] font-mono text-gray-400 bg-black/40 px-2 py-1.5 rounded leading-relaxed whitespace-pre-wrap">{toast.fullPayloadSnippet}</div>
              </div>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}