"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserTodoClient } from "@/types";
import { FileText, FolderGit2, Search, Plus, Trash2, Check } from "lucide-react";

interface WelcomeNavigatorProps {
  userName?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(fullName?: string): string {
  if (!fullName) return "there";
  return fullName.split(" ")[0];
}

export function WelcomeNavigator({ userName }: WelcomeNavigatorProps) {
  const router = useRouter();
  const [todos, setTodos] = useState<UserTodoClient[]>([]);
  const [newTodoContent, setNewTodoContent] = useState("");
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to clear focus completely (no element should have focus)
  const clearFocus = () => {
    // Blur immediately, don't wait for animation frame
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // Load todos on mount
  useEffect(() => {
    loadTodos();
  }, []);

  // Get user's timezone
  const getTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  };

  const loadTodos = async () => {
    try {
      const tz = getTimezone();
      const url = tz ? `/api/todos?tz=${encodeURIComponent(tz)}` : "/api/todos";
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setTodos(
          data.todos.map((todo: any) => ({
            ...todo,
            date: todo.date,
            created_at: new Date(todo.created_at),
            updated_at: new Date(todo.updated_at),
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load todos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const addTodo = async () => {
    if (!newTodoContent.trim()) return;

    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newTodoContent.trim(),
          timezone: getTimezone(),
        }),
      });

      if (response.ok) {
        const newTodo = await response.json();
        setTodos((prev) => [
          {
            ...newTodo,
            date: newTodo.date,
            created_at: new Date(newTodo.created_at),
            updated_at: new Date(newTodo.updated_at),
          },
          ...prev,
        ]);
        setNewTodoContent("");
        setIsAddingTodo(false);
        clearFocus();
      }
    } catch (error) {
      console.error("Failed to add todo:", error);
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    // Optimistic update
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !completed } : todo
      )
    );

    try {
      const response = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      });

      if (!response.ok) {
        // Revert on failure
        setTodos((prev) =>
          prev.map((todo) =>
            todo.id === id ? { ...todo, completed } : todo
          )
        );
      }
    } catch (error) {
      console.error("Failed to toggle todo:", error);
      // Revert on failure
      setTodos((prev) =>
        prev.map((todo) =>
          todo.id === id ? { ...todo, completed } : todo
        )
      );
    }
  };

  const deleteTodo = async (id: string) => {
    // Optimistic update
    const todoToDelete = todos.find((t) => t.id === id);
    setTodos((prev) => prev.filter((todo) => todo.id !== id));

    try {
      const response = await fetch(`/api/todos/${id}`, {
        method: "DELETE",
      });

      if (!response.ok && todoToDelete) {
        // Revert on failure
        setTodos((prev) => [...prev, todoToDelete]);
      }
    } catch (error) {
      console.error("Failed to delete todo:", error);
      if (todoToDelete) {
        setTodos((prev) => [...prev, todoToDelete]);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addTodo();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsAddingTodo(false);
      setNewTodoContent("");
      clearFocus();
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-2xl px-6 py-8 space-y-8 select-none">
        {/* Greeting */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-400">
            {getGreeting()}
          </h1>
          <p className="mt-2 text-slate-500 italic">
            Welcome to <span className="text-blue-500">Whim</span>Craft. What would you like to do today?
          </p>
        </div>

        {/* Today's Focus - subtle, no box */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-base font-medium text-slate-400">Today&apos;s Focus</h2>
            {!isAddingTodo && (
              <button
                onClick={() => setIsAddingTodo(true)}
                className="p-1 text-slate-300 hover:text-slate-500 transition-colors"
                title="Add task"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Add Todo Input */}
          {isAddingTodo && (
            <div className="flex justify-center">
              <input
                type="text"
                value={newTodoContent}
                onChange={(e) => setNewTodoContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  // Cancel on blur (clicking elsewhere)
                  setIsAddingTodo(false);
                  setNewTodoContent("");
                }}
                placeholder="What do you want to focus on?"
                className="w-80 px-4 py-2.5 text-base text-center bg-white/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
                autoFocus
              />
            </div>
          )}

          {/* Todo List - centered, minimal */}
          <div className={`space-y-2 ${todos.length >= 4 ? "max-h-44 overflow-y-auto" : ""}`}>
            {isLoading ? (
              <p className="text-base text-slate-300 text-center">Loading...</p>
            ) : todos.length === 0 && !isAddingTodo ? (
              <p className="text-base text-slate-300 text-center">
                Click + to add a focus
              </p>
            ) : (
              todos.map((todo) => (
                <div
                  key={todo.id}
                  className="group flex items-center justify-center gap-3"
                >
                  <button
                    onClick={() => toggleTodo(todo.id, todo.completed)}
                    className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      todo.completed
                        ? "bg-slate-400 border-slate-400 text-white"
                        : "border-slate-300 hover:border-slate-400"
                    }`}
                  >
                    {todo.completed && <Check className="w-3 h-3" />}
                  </button>
                  <span
                    className={`text-base ${
                      todo.completed ? "text-slate-300 line-through" : "text-slate-500"
                    }`}
                  >
                    {todo.content}
                  </span>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Feature Cards */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => router.push("/paper")}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-slate-50 transition-all text-sm text-slate-600 hover:text-slate-800"
          >
            <FileText className="w-4 h-4 text-blue-500" />
            Paper Reader
          </button>

          <button
            onClick={() => router.push("/repo")}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-slate-50 transition-all text-sm text-slate-600 hover:text-slate-800"
          >
            <FolderGit2 className="w-4 h-4 text-purple-500" />
            Repo Reader
          </button>

          <button
            onClick={() => router.push("/research")}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-slate-50 transition-all text-sm text-slate-600 hover:text-slate-800"
          >
            <Search className="w-4 h-4 text-teal-500" />
            Deep Research
          </button>
        </div>
      </div>
    </div>
  );
}
