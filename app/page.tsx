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
  ChevronDown,
  Bot,
  Loader2,
  CheckCircle2, // Icon for success toast
  ListTodo // Icon for Todo
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
  title: string; // Changed for flexibility
  message: string;
  type: "sync" | "agent"; // To distinguish styles
};

// Type for Agent Recommendation Popup
type AgentRec = {
  agents: string[];
  docId: string;
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

// --- 3. Initial Data ---

const initialDocs: Doc[] = [
  {
    id: "doc_first",
    emoji: "🧙🏻‍♂️",
    title: "Welcome to ProtoColAi",
    blocks: [
      { id: "b1", type: "h1", content: "Agent Integration Specs" },
      { id: "b2", type: "text", content: "This demo shows two different agent behaviors:" },
      { id: "b3", type: "h2", content: "1. Task Agents (e.g., ToDo)" },
      { id: "b4", type: "text", content: "If you use a 'TodoAgent', the result is appended here as a new block." },
      { id: "b5", type: "h2", content: "2. Action Agents (e.g., Email)" },
      { id: "b6", type: "text", content: "If you use an 'EmailAgent', the result appears as a notification toast below." },
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
  
  // Interaction States
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [agentRec, setAgentRec] = useState<AgentRec | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);

  // Refs
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const blockRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
  const initialContentRef = useRef<string>("");

  // --- Effects ---

  useEffect(() => {
    const saved = localStorage.getItem("protocolai-final-v2");
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
      localStorage.setItem("protocolai-final-v2", JSON.stringify(docs));
    }
  }, [docs, isLoaded]);

  // --- Toast Logic (Generic) ---

  const addToast = (title: string, message: string, type: "sync" | "agent") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  // --- Actions & Helpers ---

  const activeDoc = docs.find((d) => d.id === activeDocId);

  const updateDoc = (field: keyof Doc, value: any) => {
    setDocs(docs.map(d => d.id === activeDocId ? { ...d, [field]: value } : d));
  };

  // Helper to append a block (Used by Todo Agent)
  const appendBlockToEnd = (content: string) => {
    if (!activeDoc) return;
    const newBlock: Block = { id: generateId(), type: "text", content: content };
    const newBlocks = [...activeDoc.blocks, newBlock];
    updateDoc("blocks", newBlocks);
    
    // Auto scroll to new block
    setTimeout(() => {
      blockRefs.current[newBlock.id]?.scrollIntoView({ behavior: 'smooth' });
      blockRefs.current[newBlock.id]?.focus();
    }, 100);
  };

  // --- API LOGIC ---

  // 1. SYNC (Type 1)
  const syncWithPythonServer = async (docId: string, fullContent: string) => {
    try {
      const response = await fetch('/api/agent-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "1", id: docId, data: fullContent })
      });
      const data = await response.json();
      
      if (data && data.data) {
        const recommendedAgents = data.data.split(','); 
        setAgentRec({ docId: docId, agents: recommendedAgents });
        setTimeout(() => setAgentRec(null), 10000);
      }
    } catch (error) {
      console.error("Sync failed:", error);
    }
  };

  // 2. INTERACT (Type 0)
  const interactWithAgent = async (agentName: string) => {
    if (!activeDoc) return;
    
    setIsLoadingAgent(true);
    setAgentRec(null); 
    
    const fullPayload = serializeDoc(activeDoc);

    try {
      const response = await fetch('/api/agent-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: "0",          
          id: agentName.trim(), 
          data: fullPayload   
        })
      });

      const res = await response.json();
      const resultText = res.data || "Action completed.";

      // --- LOGIC: Decide whether to Toast or Append Block ---
      const lowerAgent = agentName.toLowerCase();
      
      if (lowerAgent.includes("todo") || lowerAgent.includes("list") || lowerAgent.includes("write")) {
        // CASE A: Todo/Writing Agent -> Append to Document
        appendBlockToEnd(resultText);
        addToast("Agent", "New content added to document", "agent");
      } else {
        // CASE B: Email/Message/Search Agent -> Show Toast
        addToast(agentName, resultText, "agent");
      }

    } catch (error) {
      addToast("Error", "Agent connection failed", "agent");
    } finally {
      setIsLoadingAgent(false);
    }
  };

  // --- HANDLERS ---
  const handleFocus = (content: string) => {
    initialContentRef.current = content;
  };

  const handleBlur = (currentContent: string) => {
    if (!activeDoc) return;
    if (currentContent.trim() === initialContentRef.current.trim()) return; 

    const fullPayload = serializeDoc(activeDoc);
    
    // Show Sync Toast
    const snippet = currentContent.length > 40 ? currentContent.substring(0, 40) + "..." : currentContent;
    addToast("Sync Request", `Synced change: "${snippet}"`, "sync");
    
    syncWithPythonServer(activeDoc.id, fullPayload);
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

  const adjustHeight = (e: any) => {
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  if (!isLoaded) return null;

  return (
    <div className="flex h-screen w-full bg-white text-[#37352f] font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? "w-80" : "w-0"} bg-[#F7F7F5] border-r border-gray-200 transition-all duration-300 flex flex-col flex-shrink-0 overflow-hidden`}>
        <div className="p-3 h-full flex flex-col">
          <div className="flex items-center gap-2 px-2 py-3 mb-2 hover:bg-gray-200 rounded cursor-pointer text-gray-700 font-medium transition-colors">
             <span className="text-[30px] font-black">ProtoColAi</span>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {docs.map(doc => {
              const isActive = activeDocId === doc.id;
              const headings = doc.blocks.filter(b => b.type === 'h1' || b.type === 'h2');
              const firstContentBlock = doc.blocks.find(b => b.content.trim().length > 0);
              const hint = firstContentBlock ? firstContentBlock.content : "Empty";

              return (
                <div key={doc.id} className="group">
                  <div onClick={() => setActiveDocId(doc.id)} className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${isActive ? "bg-[#E0EFFF] text-blue-700" : "hover:bg-gray-200 text-gray-700"}`}>
                    <div className="flex-shrink-0">{isActive && headings.length > 0 ? <ChevronDown size={14} className="text-blue-500"/> : <span className="w-3.5 block"/>}</div>
                    <span className="text-lg leading-none">{doc.emoji}</span>
                    <div className="flex-1 overflow-hidden">
                        <div className={`truncate text-sm ${isActive ? "font-medium" : ""}`}>{doc.title || "Untitled"}</div>
                        <div className="text-[10px] text-gray-400 truncate opacity-80">{hint}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={() => {
            const newDoc: Doc = { id: `doc_${generateId()}`, emoji: "📄", title: "", blocks: [{ id: generateId(), type: "text", content: "" }], updatedAt: Date.now() };
            setDocs([...docs, newDoc]);
            setActiveDocId(newDoc.id);
          }} className="mt-4 flex items-center gap-2 px-3 py-1 text-sm text-gray-500 hover:bg-gray-200 w-full rounded transition-colors">
            <Plus size={14} /> New Page
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col relative h-full">
        <div className="h-12 flex items-center justify-between px-4 sticky top-0 bg-white/80 backdrop-blur z-20 border-b border-transparent">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Menu size={20}/></button>
            {activeDoc && <span className="text-sm font-medium ml-2">{activeDoc.emoji} {activeDoc.title || "Untitled"}</span>}
          </div>
          <button className="p-1 text-gray-400 hover:text-gray-600"><MoreHorizontal size={20}/></button>
        </div>

        {/* Editor */}
        {activeDoc ? (
          <div className="flex-1 overflow-y-auto px-4 sm:px-12 md:px-24 pb-40 scroll-smooth" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            <div className="max-w-3xl mx-auto pt-12">
              <div className="w-16 h-16 mb-4 flex items-center justify-center text-5xl hover:bg-gray-100 rounded-lg cursor-pointer select-none transition-colors" onClick={() => updateDoc("emoji", "🧙🏻‍♂️")}>{activeDoc.emoji}</div>
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
                  <div key={block.id} className="group relative flex items-start -ml-10 pl-10 py-0.5" draggable onDragStart={() => (dragItem.current = index)} onDragEnter={() => (dragOverItem.current = index)} onDragEnd={handleSort} onDragOver={(e) => e.preventDefault()}>
                    <div className="absolute left-0 top-1.5 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:bg-gray-200 rounded transition-all"><GripVertical size={16} /></div>
                    <div className="flex-1 relative">
                       <textarea
                         ref={el => { blockRefs.current[block.id] = el }}
                         value={block.content}
                         placeholder="Type something..."
                         className={`w-full resize-none bg-transparent border-none focus:ring-0 p-0 leading-relaxed overflow-hidden block placeholder:text-transparent focus:placeholder:text-gray-300 ${block.type === 'h1' ? 'text-3xl font-bold mt-4 mb-2' : ''} ${block.type === 'h2' ? 'text-2xl font-semibold mt-3 mb-1' : ''} ${block.type === 'blockquote' ? 'border-l-4 border-gray-800 pl-4 italic text-gray-600' : ''} ${block.type === 'text' ? 'text-base text-gray-800 min-h-[24px]' : ''}`}
                         rows={1}
                         onFocus={(e) => handleFocus(e.target.value)}
                         onBlur={(e) => handleBlur(e.target.value)}
                         onChange={(e) => { updateBlock(block.id, e.target.value); adjustHeight(e); }}
                         onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) { e.preventDefault(); addBlock(index); } if (e.key === "Backspace" && block.content === "" && activeDoc.blocks.length > 1) { e.preventDefault(); removeBlock(block.id); if (index > 0) blockRefs.current[activeDoc.blocks[index-1].id]?.focus(); } }}
                         style={{ height: 'auto' }}
                       />
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
              <div className="mt-4 opacity-0 hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-2 text-gray-400" onClick={() => addBlock(activeDoc.blocks.length - 1)}><Plus size={18} /> <span>Click to add block</span></div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400"><p>Select a page</p></div>
        )}

        {/* --- TOASTS (Bottom Right) --- */}
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2 pointer-events-none max-w-md w-full">
          {toasts.map((toast) => (
            <div 
              key={toast.id} 
              className={`
                p-3 rounded-lg shadow-xl border animate-in slide-in-from-bottom-5 fade-in duration-300
                ${toast.type === 'sync' ? 'bg-[#1f1f1f] text-white border-gray-700' : 'bg-white text-gray-900 border-indigo-100 ring-1 ring-indigo-50'}
              `}
            >
              <div className="flex items-center gap-2 mb-1">
                {toast.type === 'sync' ? <FileJson className="text-green-400" size={16} /> : <CheckCircle2 className="text-green-500" size={16} />}
                <span className={`text-[10px] uppercase font-bold tracking-wider ${toast.type === 'sync' ? 'text-gray-400' : 'text-indigo-600'}`}>
                  {toast.title}
                </span>
              </div>
              <div className={`text-xs ${toast.type === 'sync' ? 'font-mono text-gray-400' : 'text-gray-600'}`}>
                {toast.message}
              </div>
            </div>
          ))}
        </div>

        {/* --- AGENT RECOMMENDATION POPUP --- */}
        {agentRec && !isLoadingAgent && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white border border-indigo-100 shadow-2xl rounded-xl p-4 flex items-start gap-4 max-w-md w-full ring-1 ring-indigo-50">
              <div className="bg-indigo-600 rounded-lg p-2 text-white shadow-md"><Bot size={24} /></div>
              <div className="flex-1">
                <h4 className="font-bold text-gray-900 text-sm mb-1">Choice Agent Suggestion</h4>
                <p className="text-xs text-gray-500 mb-3">Click an agent to analyze the current document:</p>
                <div className="flex flex-wrap gap-2">
                  {agentRec.agents.map((agent, i) => (
                    <button 
                      key={i}
                      onClick={() => interactWithAgent(agent)}
                      className={`
                        px-3 py-1.5 rounded text-xs font-semibold border transition-all hover:scale-105 active:scale-95
                        ${i === 0 ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}
                      `}
                    >
                      {agent.trim()} {i === 0 && "★"}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setAgentRec(null)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
            </div>
          </div>
        )}

        {/* --- LOADING INDICATOR --- */}
        {isLoadingAgent && (
           <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-black text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-xl">
             <Loader2 size={16} className="animate-spin"/>
             <span className="text-sm font-medium">Consulting Agent...</span>
           </div>
        )}
      </main>
    </div>
  );
}