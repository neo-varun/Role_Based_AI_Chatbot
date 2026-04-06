import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const STORAGE_KEY = "role-based-ai-chatbot.conversations";
const ROLE_PROMPTS_STORAGE_KEY = "role-based-ai-chatbot.role-prompts";

const createNewChat = (title = "New Chat") => ({
  id: crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`,
  title,
  messages: [],
  modeName: "General",
});

const loadChats = () => {
  const savedChats = localStorage.getItem(STORAGE_KEY);

  if (!savedChats) {
    return [];
  }

  try {
    const parsedChats = JSON.parse(savedChats);
    if (!Array.isArray(parsedChats) || parsedChats.length === 0) {
      return [];
    }

    return parsedChats.map((chat) => ({
      ...chat,
      modeName: chat.modeName || "General",
    }));
  } catch {
    return [];
  }
};

const loadRolePrompts = () => {
  const savedRolePrompts = localStorage.getItem(ROLE_PROMPTS_STORAGE_KEY);

  if (!savedRolePrompts) {
    return [];
  }

  try {
    const parsedRolePrompts = JSON.parse(savedRolePrompts);
    return parsedRolePrompts.length > 0 ? parsedRolePrompts : [];
  } catch {
    return [];
  }
};

function App() {
  const [chats, setChats] = useState(loadChats);
  const [activeChatId, setActiveChatId] = useState(() => chats[0]?.id ?? null);
  const [input, setInput] = useState("");
  const [isDevPromptOpen, setIsDevPromptOpen] = useState(false);
  const [rolePrompts, setRolePrompts] = useState(loadRolePrompts);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [roleNameInput, setRoleNameInput] = useState("");
  const [rolePromptInput, setRolePromptInput] = useState("");
  const [expandedRoleIds, setExpandedRoleIds] = useState([]);
  const [activeModeName, setActiveModeName] = useState("General");
  const [openChatMenuId, setOpenChatMenuId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem(ROLE_PROMPTS_STORAGE_KEY, JSON.stringify(rolePrompts));
  }, [rolePrompts]);

  useEffect(() => {
    if (activeChatId && !chats.some((chat) => chat.id === activeChatId)) {
      setActiveChatId(chats[0]?.id ?? null);
    }
  }, [activeChatId, chats]);

  useEffect(() => {
    setActiveModeName(activeChat?.modeName || "General");
  }, [activeChat]);

  useEffect(() => {
    const handleDocumentClick = () => {
      setOpenChatMenuId(null);
    };

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages.length, activeChatId]);

  const updateChatById = (chatId, updater) => {
    setChats((currentChats) =>
      currentChats.map((chat) => (chat.id === chatId ? updater(chat) : chat)),
    );
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", text: input };
    const messageText = input;
    const currentChat = activeChat ?? createNewChat("New Chat");
    const shouldCreateNewChat = !activeChat;
    const currentChatId = currentChat.id;
    const conversationMessages = [...currentChat.messages, userMessage];

    setInput("");
    setSelectedFile(null);

    if (shouldCreateNewChat) {
      setChats((currentChats) => [currentChat, ...currentChats]);
      setActiveChatId(currentChatId);
    }

    updateChatById(currentChatId, (chat) => {
      const updatedMessages = [...chat.messages, userMessage];
      return {
        ...chat,
        title:
          chat.messages.length === 0 ? messageText.slice(0, 28) : chat.title,
        messages: updatedMessages,
      };
    });

    try {
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: conversationMessages,
          role_prompts: rolePrompts,
        }),
      });

      const data = await res.json();
      const selectedRoleName = data.selected_role_name || "General";
      setActiveModeName(selectedRoleName);

      const botMessage = { role: "bot", text: data.reply };

      updateChatById(currentChatId, (chat) => ({
        ...chat,
        messages: [...chat.messages, botMessage],
        modeName: selectedRoleName,
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const isAllowedType =
      allowedTypes.includes(file.type) || /\.(pdf|doc|docx)$/i.test(file.name);

    if (!isAllowedType) {
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    event.target.value = "";
  };

  const handleInputKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setActiveModeName("General");
    setOpenChatMenuId(null);
  };

  const handleRenameChat = (chatId) => {
    const targetChat = chats.find((chat) => chat.id === chatId);
    if (!targetChat) return;

    const nextTitle = window.prompt("Rename chat", targetChat.title || "");
    if (nextTitle === null) {
      return;
    }

    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      return;
    }

    updateChatById(chatId, (chat) => ({
      ...chat,
      title: trimmedTitle,
    }));
  };

  const handleDeleteChat = (chatId) => {
    const updatedChats = chats.filter((chat) => chat.id !== chatId);
    setChats(updatedChats);

    if (activeChatId === chatId) {
      setActiveChatId(updatedChats[0]?.id ?? null);
    }
  };

  const resetRoleForm = () => {
    setEditingRoleId(null);
    setRoleNameInput("");
    setRolePromptInput("");
  };

  const handleSaveRolePrompt = () => {
    const trimmedRoleName = roleNameInput.trim();
    const trimmedRolePrompt = rolePromptInput.trim();

    if (!trimmedRoleName || !trimmedRolePrompt) {
      return;
    }

    if (editingRoleId) {
      setRolePrompts((currentPrompts) =>
        currentPrompts.map((role) =>
          role.id === editingRoleId
            ? {
                ...role,
                name: trimmedRoleName,
                prompt: trimmedRolePrompt,
              }
            : role,
        ),
      );
    } else {
      const newRole = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
        name: trimmedRoleName,
        prompt: trimmedRolePrompt,
      };

      setRolePrompts((currentPrompts) => [newRole, ...currentPrompts]);
    }

    resetRoleForm();
  };

  const handleEditRolePrompt = (role) => {
    setEditingRoleId(role.id);
    setRoleNameInput(role.name);
    setRolePromptInput(role.prompt);
  };

  const handleDeleteRolePrompt = (roleId) => {
    setRolePrompts((currentPrompts) =>
      currentPrompts.filter((role) => role.id !== roleId),
    );
    setExpandedRoleIds((currentIds) =>
      currentIds.filter((currentId) => currentId !== roleId),
    );

    if (editingRoleId === roleId) {
      resetRoleForm();
    }
  };

  const isPromptLong = (prompt) =>
    prompt.length > 220 || (prompt.match(/\n/g)?.length ?? 0) >= 4;

  const toggleRolePromptPreview = (roleId) => {
    setExpandedRoleIds((currentIds) =>
      currentIds.includes(roleId)
        ? currentIds.filter((id) => id !== roleId)
        : [...currentIds, roleId],
    );
  };

  return (
    <div className="app">
      <div className="sidebar">
        <button className="new-chat" onClick={handleNewChat}>
          + New Chat
        </button>

        <div className="chat-history">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === activeChat?.id ? "active" : ""}`}
            >
              <button
                className="chat-main"
                type="button"
                onClick={() => setActiveChatId(chat.id)}
              >
                <span
                  className="chat-title"
                  title={chat.title || "Untitled chat"}
                >
                  {chat.title || "Untitled chat"}
                </span>
                <span className="chat-count">{chat.messages.length} msgs</span>
              </button>

              <div className="chat-menu-container">
                <button
                  type="button"
                  className="chat-menu-trigger"
                  aria-label="Chat options"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenChatMenuId((currentId) =>
                      currentId === chat.id ? null : chat.id,
                    );
                  }}
                >
                  ⋮
                </button>

                {openChatMenuId === chat.id && (
                  <div
                    className="chat-menu"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        handleRenameChat(chat.id);
                        setOpenChatMenuId(null);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="delete-chat-action"
                      onClick={() => {
                        handleDeleteChat(chat.id);
                        setOpenChatMenuId(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="main">
        <div className="header">
          <h2>AI Chatbot</h2>
          <div className="active-mode-badge">Mode: {activeModeName}</div>
          <div className="header-buttons">
            <button onClick={() => setIsDevPromptOpen(true)}>Dev Prompt</button>
          </div>
        </div>

        <div className="chat-box">
          {(activeChat?.messages ?? []).map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <div className="message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="input-area">
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
          />

          <button
            className="icon-btn"
            type="button"
            onClick={handleFileButtonClick}
          >
            +
          </button>

          {selectedFile && (
            <div className="attachment-chip" title={selectedFile.name}>
              {selectedFile.name}
            </div>
          )}

          <input
            type="text"
            placeholder=""
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
          />

          <button className="send-btn" onClick={sendMessage}>
            ➤
          </button>
        </div>
      </div>

      {isDevPromptOpen && (
        <div
          className="dev-prompt-overlay"
          onClick={() => setIsDevPromptOpen(false)}
        >
          <div
            className="dev-prompt-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dev-prompt-header">
              <div>
                <h3>Dev Prompt Management</h3>
              </div>
              <button
                className="close-dev-prompt"
                type="button"
                onClick={() => {
                  setIsDevPromptOpen(false);
                  resetRoleForm();
                }}
              >
                x
              </button>
            </div>

            <div className="dev-prompt-content">
              <div className="role-form-panel">
                <h4>{editingRoleId ? "Edit Role" : "Create New Role"}</h4>

                <label htmlFor="role-name">Role Name</label>
                <input
                  id="role-name"
                  type="text"
                  placeholder="Example: Sales AI"
                  value={roleNameInput}
                  onChange={(e) => setRoleNameInput(e.target.value)}
                />

                <label htmlFor="role-prompt">Role Prompt</label>
                <textarea
                  id="role-prompt"
                  rows="8"
                  placeholder="Write the complete system prompt for this role"
                  value={rolePromptInput}
                  onChange={(e) => setRolePromptInput(e.target.value)}
                />

                <div className="role-form-actions">
                  <button
                    type="button"
                    className="save-role-btn"
                    onClick={handleSaveRolePrompt}
                  >
                    {editingRoleId ? "Update Prompt" : "Create Role"}
                  </button>
                  <button
                    type="button"
                    className="cancel-role-btn"
                    onClick={resetRoleForm}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="existing-roles-panel">
                <h4>Existing Roles & Prompts</h4>

                <div className="roles-list">
                  {rolePrompts.length === 0 ? (
                    <div className="empty-roles">No roles created yet</div>
                  ) : (
                    rolePrompts.map((role) => (
                      <div className="role-card" key={role.id}>
                        {(() => {
                          const isExpanded = expandedRoleIds.includes(role.id);
                          const showToggle = isPromptLong(role.prompt);

                          return (
                            <>
                              <div className="role-card-header">
                                <h5>{role.name}</h5>
                                <div className="role-card-actions">
                                  <button
                                    type="button"
                                    className="edit-role-btn"
                                    onClick={() => handleEditRolePrompt(role)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="delete-role-btn"
                                    onClick={() =>
                                      handleDeleteRolePrompt(role.id)
                                    }
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                              <p
                                className={`role-prompt-text ${isExpanded ? "expanded" : ""}`}
                              >
                                {role.prompt}
                              </p>
                              {showToggle && (
                                <button
                                  type="button"
                                  className="prompt-toggle-btn"
                                  onClick={() =>
                                    toggleRolePromptPreview(role.id)
                                  }
                                >
                                  {isExpanded ? "Show less" : "Show more"}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
